const express = require('express');
const router = express.Router();
const Tweet = require('../models/Tweet');
const { isAuthenticated } = require('../middleware/auth');
const tweetUpload = require('../middleware/tweetUpload');
const path = require('path');
const fs = require('fs');
const { generateAnonName } = require('../utils/anonNames');
const mongoose = require('mongoose');
const User = require('../models/User');
const Mla = require('../models/Mla');
const Mp = require('../models/Mp');

// Middleware to wrap async route handlers
const asyncHandler = fn => (req, res, next) => fn(req, res, next).catch(next);

// Helper to check if request wants JSON
const wantsJson = (req) => {
    return req.xhr ||
        req.get('accept')?.includes('json') ||
        req.get('content-type')?.includes('json') ||
        req.path.includes('/api/');
};

// Helper: Parse @mentions to find MLAs and MPs
// Handles multi-word names by looking ahead
const parseMentions = async (content) => {
    const taggedMlas = [];
    const taggedMps = [];
    if (!content) return { taggedMlas, taggedMps };

    console.log('Parsing content for mentions:', content);

    // 1. Find all potential name strings starting with @
    // We look for @Name and up to 3 following words to form candidates like "Himanta Biswa Sarma"
    const words = content.replace(/\n/g, ' ').split(/\s+/);
    const candidates = new Set();

    for (let i = 0; i < words.length; i++) {
        // Case 1: Word starts with @ (e.g. "@Name")
        if (words[i].startsWith('@') && words[i].length > 1) {
            let tempName = words[i].substring(1);
            candidates.add(tempName.replace(/[.,!?]+$/, '')); // Add single word

            for (let j = 1; j <= 3; j++) {
                if (i + j < words.length) {
                    tempName += ' ' + words[i + j];
                    candidates.add(tempName.replace(/[.,!?]+$/, ''));
                }
            }
        }
        // Case 2: Standalone @ (e.g. "@ Name") - user typed space after @
        else if (words[i] === '@' && i + 1 < words.length) {
            let tempName = words[i + 1];
            candidates.add(tempName.replace(/[.,!?]+$/, ''));

            for (let j = 1; j <= 3; j++) { // Look ahead from the NEXT word
                if (i + 1 + j < words.length) {
                    tempName += ' ' + words[i + 1 + j];
                    candidates.add(tempName.replace(/[.,!?]+$/, ''));
                }
            }
        }
    }

    if (candidates.size > 0) {
        const uniqueCandidates = Array.from(candidates);
        console.log('Candidate names:', uniqueCandidates);

        // DB Query - Case insensitive exact match, but allow for trailing/leading whitespace in DB
        const regexConditions = uniqueCandidates.map(name => new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'));

        const [mlas, mps] = await Promise.all([
            Mla.find({ name: { $in: regexConditions } }).select('_id name'),
            Mp.find({ name: { $in: regexConditions } }).select('_id name')
        ]);

        console.log(`Found ${mlas.length} MLAs and ${mps.length} MPs`);
        if (mlas.length > 0) console.log('MLAs:', mlas.map(m => m.name));

        taggedMlas.push(...mlas.map(m => m._id));
        taggedMps.push(...mps.map(m => m._id));
    }

    return {
        taggedMlas: [...new Set(taggedMlas)],
        taggedMps: [...new Set(taggedMps)]
    };
};

// List all tweets
router.get('/', asyncHandler(async (req, res) => {
    const tweets = await Tweet.find({})
        .populate('user', 'name email profilePicture anonName')
        .populate('taggedMlas', 'name _id') // Populate for linking
        .populate('taggedMps', 'name _id') // Populate for linking
        .populate({
            path: 'comments.user',
            select: 'name profilePicture anonName'
        })
        .sort({ createdAt: -1 });

    const tweetsWithDisplayData = tweets.map(tweet => {
        const tweetObj = tweet.toObject();

        // Set like status for the current user (handle legacy shapes and subdocs)
        if (req.session.user) {
            const currentUserId = req.session.user._id;
            tweetObj.isLiked = tweet.likes.some(like => {
                if (!like) return false;
                // If like is an ObjectId-like
                if (typeof like.equals === 'function') {
                    try { return like.equals(currentUserId); } catch (e) { /* ignore */ }
                }
                // If like is a subdocument with user field
                if (like.user && typeof like.user.equals === 'function') {
                    try { return like.user.equals(currentUserId); } catch (e) { /* ignore */ }
                }
                // Fallback compare stringified ids
                return String(like.user || like) === String(currentUserId);
            });
        }

        // Set display name based on anonymous status
        if (tweetObj.anonymous) {
            tweetObj.displayName = tweetObj.anonymousName || (tweetObj.user && tweetObj.user.anonName) || 'Anonymous';
            tweetObj.isAnonymous = true;
        } else {
            tweetObj.displayName = (tweetObj.user && tweetObj.user.name) || 'Unknown';
            tweetObj.isAnonymous = false;
        }

        // For all posts (anonymous or not), use profile picture if available
        tweetObj.displayProfilePicture = tweetObj.user && tweetObj.user.profilePicture
            ? `/uploads/profiles/${tweetObj.user.profilePicture}`
            : null;

        // Set display data for each comment and sort by createdAt
        if (Array.isArray(tweetObj.comments)) {
            // First map the comments to add display data
            tweetObj.comments = tweetObj.comments.map(comment => {
                const isAnon = !!comment.anonymous;
                const updatedComment = {
                    ...comment,
                    displayName: isAnon ?
                        (comment.anonymousName || (comment.user && comment.user.anonName) || 'Anonymous') :
                        ((comment.user && comment.user.name) || 'Unknown'),
                    displayProfilePicture: comment.user && comment.user.profilePicture ?
                        `/uploads/profiles/${comment.user.profilePicture}` : null,
                    isAnonymous: isAnon
                };
                return updatedComment;
            });

            // Then sort comments by createdAt in descending order (newest first)
            tweetObj.comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        // Create Enriched Content with Links
        let enriched = tweetObj.content;
        // Escape HTML first to prevent XSS
        enriched = enriched.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

        // Linkify MLAs
        if (tweetObj.taggedMlas && tweetObj.taggedMlas.length > 0) {
            tweetObj.taggedMlas.forEach(mla => {
                // Case insensitive replace of @Name
                const regex = new RegExp(`@${mla.name}`, 'gi');
                enriched = enriched.replace(regex, `<a href="/mlas/${mla._id}/details" class="text-blue-600 hover:underline font-semibold">@${mla.name}</a>`);
            });
        }
        // Linkify MPs
        if (tweetObj.taggedMps && tweetObj.taggedMps.length > 0) {
            tweetObj.taggedMps.forEach(mp => {
                const regex = new RegExp(`@${mp.name}`, 'gi');
                enriched = enriched.replace(regex, `<a href="/mps/${mp._id}" class="text-blue-600 hover:underline font-semibold">@${mp.name}</a>`);
            });
        }

        tweetObj.enrichedContent = enriched;

        return tweetObj;
    });

    if (wantsJson(req)) {
        return res.json(tweetsWithDisplayData);
    }

    res.render('tweets/index', {
        tweets: tweetsWithDisplayData,
        title: 'Live Feed',
        currentUser: req.session.user || null
    });
}));

// Show create new tweet form
router.get('/new', isAuthenticated, asyncHandler(async (req, res) => {
    try {
        res.render('tweets/new', { error: req.flash('error') });
    } catch (err) {
        console.error('Error rendering new tweet form:', err);
        req.flash('error', 'Unable to open the new post form');
        return res.redirect('/profile');
    }
}));

// Show edit form
router.get('/:id/edit', isAuthenticated, asyncHandler(async (req, res) => {
    const tweet = await Tweet.findOne({
        _id: req.params.id,
        user: req.session.user._id
    });

    if (!tweet) {
        req.flash('error', 'Tweet not found or unauthorized');
        return res.redirect('/tweets');
    }

    res.render('tweets/edit', {
        tweet,
        error: req.flash('error')
    });
}));

// Provide tweet JSON for AJAX editing
router.get('/:id/json', isAuthenticated, asyncHandler(async (req, res) => {
    const tweet = await Tweet.findOne({ _id: req.params.id, user: req.session.user._id })
        .populate('user', 'name profilePicture')
        .populate('comments.user', 'name profilePicture');

    if (!tweet) {
        return res.status(404).json({ success: false, error: 'Tweet not found or unauthorized' });
    }

    return res.json({ success: true, tweet });
}));

// Handle edit tweet submission
router.post('/:id', isAuthenticated, tweetUpload, asyncHandler(async (req, res) => {
    try {
        // Handle file validation errors from multer fileFilter
        if (req.fileValidationError) {
            req.flash('error', req.fileValidationError);
            if (wantsJson(req)) return res.status(400).json({ success: false, error: req.fileValidationError });
            return res.redirect('back');
        }
        const { content, representative, constituency, location, institution, anonymous } = req.body;

        if (!content || content.trim() === '') {
            req.flash('error', 'Tweet content cannot be empty');
            return res.redirect('back');
        }

        // Enforce a maximum word count (300 words)
        const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
        if (wordCount > 300) {
            const msg = 'Tweet is too long. Maximum allowed is 300 words.';
            req.flash('error', msg);
            if (wantsJson(req)) return res.status(400).json({ success: false, error: msg });
            return res.redirect('back');
        }

        // Treat posts as anonymous by default unless explicitly disabled (e.g., anonymous='off' or 'false')
        const tweet = await Tweet.findOneAndUpdate(
            {
                _id: req.params.id,
                user: req.session.user._id
            },
            {
                $set: {
                    content: content.trim(),
                    representative: representative || '',
                    constituency: constituency || '',
                    location: location || '',
                    institution: institution || '',
                    // Default to anonymous unless explicitly turned off
                    anonymous: !(anonymous === 'off' || anonymous === false || anonymous === 'false' || anonymous === '0'),
                    // If anonymous is true and tweet has no anonymousName, generate one
                    anonymousName: !(anonymous === 'off' || anonymous === false || anonymous === 'false' || anonymous === '0') ? (req.body.anonymousName || generateAnonName()) : null,
                    updatedAt: new Date(),
                    // Re-parse tags on edit
                    ...(await parseMentions(content))
                }
            },
            { new: true }
        );

        if (!tweet) {
            req.flash('error', 'Tweet not found or unauthorized');
            if (wantsJson(req)) return res.status(404).json({ success: false, error: 'Tweet not found or unauthorized' });
            return res.redirect('/tweets');
        }

        // If client expects JSON (AJAX), return JSON; otherwise redirect
        if (wantsJson(req)) {
            return res.json({ success: true, message: 'Tweet updated successfully', tweet });
        }

        // No flash on successful update to avoid showing transient messages
        return res.redirect('/profile');
    } catch (error) {
        console.error('Error updating tweet:', error);
        req.flash('error', 'An error occurred while updating the tweet');
        if (wantsJson(req)) return res.status(500).json({ success: false, error: 'An error occurred while updating the tweet' });
        return res.redirect('back');
    }
}));

// Delete tweet (support AJAX DELETE)
router.delete('/:id', isAuthenticated, asyncHandler(async (req, res) => {
    try {
        const tweet = await Tweet.findOne({ _id: req.params.id, user: req.session.user._id });
        if (!tweet) {
            if (wantsJson(req)) return res.status(404).json({ success: false, error: 'Tweet not found or unauthorized' });
            req.flash('error', 'Tweet not found or unauthorized');
            return res.redirect('/tweets');
        }

        // remove media files if any
        if (tweet.media && tweet.media.length > 0) {
            const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'tweets');
            tweet.media.forEach(filename => {
                const filepath = path.join(uploadDir, filename);
                try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch (e) { console.error('Failed to delete file', filepath, e); }
            });
        }

        await tweet.remove();

        if (wantsJson(req)) return res.json({ success: true, message: 'Tweet deleted' });

        req.flash('success', 'Tweet deleted');
        return res.redirect('/tweets');
    } catch (err) {
        console.error('Error deleting tweet:', err);
        if (wantsJson(req)) return res.status(500).json({ success: false, error: 'Server error' });
        req.flash('error', 'An error occurred while deleting the tweet');
        return res.redirect('back');
    }
}));

// Create new tweet
router.post('/', isAuthenticated, tweetUpload, asyncHandler(async (req, res) => {
    try {
        // Handle file validation errors from multer fileFilter
        if (req.fileValidationError) {
            req.flash('error', req.fileValidationError);
            if (wantsJson(req)) return res.status(400).json({ success: false, error: req.fileValidationError });
            return res.redirect('back');
        }
        const { content, representative, constituency, location, institution, anonymous } = req.body;

        if (!content || content.trim() === '') {
            req.flash('error', 'Tweet content cannot be empty');
            return res.redirect('back');
        }

        // Enforce a maximum word count (300 words)
        const updatedWordCount = content.trim().split(/\s+/).filter(Boolean).length;
        if (updatedWordCount > 300) {
            const msg = 'Tweet is too long. Maximum allowed is 300 words.';
            req.flash('error', msg);
            if (wantsJson(req)) return res.status(400).json({ success: false, error: msg });
            return res.redirect('back');
        }



        // Logic to parse tags and find MLAs/MPs
        const { taggedMlas, taggedMps } = await parseMentions(content);

        const mediaFiles = req.files ? req.files.map(file => file.filename) : [];

        // Default to anonymous unless explicitly turned off by the client
        const tweetData = {
            content: content.trim(),
            user: req.session.user._id,
            representative,
            constituency,
            location,
            institution,
            media: mediaFiles,
            taggedMlas,
            taggedMps,
            anonymous: !(anonymous === 'off' || anonymous === false || anonymous === 'false' || anonymous === '0')
        };

        if (tweetData.anonymous) {
            // Prefer per-user anon handle if available
            let anonName = req.body.anonymousName || req.session.user?.anonName;
            if (!anonName) {
                anonName = generateAnonName();
                // persist to user for future posts
                try {
                    await User.findByIdAndUpdate(req.session.user._id, { $set: { anonName } });
                    // update session copy
                    req.session.user.anonName = anonName;
                } catch (e) {
                    console.error('Failed to persist anonName for user', e);
                }
            }
            tweetData.anonymousName = anonName;
        }

        const tweet = new Tweet(tweetData);

        await tweet.save();
        await tweet.populate('user', 'name email profilePicture');

        if (wantsJson(req)) {
            return res.json({
                success: true,
                message: 'Tweet created successfully',
                tweet
            });
        }

        // No flash on successful creation
        return res.redirect('/tweets');
    } catch (error) {
        console.error('Error creating tweet:', error);
        req.flash('error', 'An error occurred while creating the tweet');
        return res.redirect('back');
    }
}));

// Like/Unlike tweet
router.get('/:id/like', isAuthenticated, (req, res) => {
    res.redirect('/tweets');
});

router.post('/:id/like', isAuthenticated, asyncHandler(async (req, res) => {
    const tweet = await Tweet.findById(req.params.id);
    if (!tweet) {
        return res.status(404).json({ success: false, error: 'Tweet not found' });
    }

    const userId = req.session.user._id;
    const userIdStr = userId.toString();

    // Normalize older like entries: if likes array contains raw ObjectIds (or strings), convert them to subdocs
    tweet.likes = tweet.likes.map(likeEntry => {
        // If it's an ObjectId or string, wrap it into an object { user: ObjectId }
        if (!likeEntry) return likeEntry;
        if (typeof likeEntry === 'string' || (likeEntry._bsontype && likeEntry._bsontype === 'ObjectID')) {
            return { user: mongoose.Types.ObjectId(likeEntry) };
        }
        // If it's already an object but missing 'user' and has a value, try to fix
        if (typeof likeEntry === 'object' && !likeEntry.user && likeEntry.toString) {
            try {
                return { user: mongoose.Types.ObjectId(likeEntry.toString()) };
            } catch (e) {
                return likeEntry;
            }
        }
        return likeEntry;
    });

    // Determine if the user already liked the tweet.
    const existingLike = tweet.likes.find(like => {
        if (!like) return false;
        if (like.user && typeof like.user.equals === 'function') {
            try { return like.user.equals(userId); } catch (e) { /* ignore */ }
        }
        if (like.user) return String(like.user) === userIdStr;
        return false;
    });

    const { anonymous } = req.body || {};
    // Default to anonymous unless explicitly turned off
    const isAnonymous = !(anonymous === 'off' || anonymous === false || anonymous === 'false' || anonymous === '0');

    if (existingLike) {
        // Unlike: remove any like objects that belong to this user
        tweet.likes = tweet.likes.filter(like => {
            if (!like) return true;
            if (like.user) return String(like.user) !== userIdStr;
            if (typeof like.equals === 'function') {
                try { return !like.equals(userId); } catch (e) { return true; }
            }
            return true;
        });

        await tweet.save();

        return res.json({ success: true, liked: false, likeCount: tweet.likes.length });
    }

    // Add new like object with proper schema
    let anonymousName = null;
    if (isAnonymous) {
        // ensure user has anonName persisted
        const user = await User.findById(userId);
        anonymousName = user && user.anonName;
        if (!anonymousName) {
            anonymousName = generateAnonName();
            try {
                if (user) { user.anonName = anonymousName; await user.save(); }
                if (req.session.user) req.session.user.anonName = anonymousName;
            } catch (e) {
                console.error('Failed to persist anonName for like', e);
            }
        }
    }

    tweet.likes.push({
        user: mongoose.Types.ObjectId(userId),
        anonymous: isAnonymous,
        anonymousName: anonymousName,
        createdAt: new Date()
    });

    await tweet.save();

    return res.json({
        success: true,
        liked: true,
        likeCount: tweet.likes.length,
        displayName: isAnonymous ? anonymousName : ((req.session.user && req.session.user.anonName) || (req.session.user && req.session.user.name))
    });
}));

// Add comment to tweet
router.post('/:id/comments', isAuthenticated, asyncHandler(async (req, res) => {
    try {
        const { content, anonymous } = req.body;

        if (!content || content.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Comment content cannot be empty'
            });
        }

        const tweet = await Tweet.findById(req.params.id);
        if (!tweet) {
            return res.status(404).json({
                success: false,
                error: 'Tweet not found'
            });
        }

        // Default to anonymous unless explicitly turned off
        const isAnonymous = !(anonymous === 'off' || anonymous === false || anonymous === 'false' || anonymous === '0');

        const newComment = {
            content: content.trim(),
            user: req.session.user._id,
            createdAt: new Date(),
            anonymous: isAnonymous,
            anonymousName: null
        };

        // If comment is anonymous, prefer per-user anonName or generate one and persist
        if (isAnonymous) {
            let anonName = req.body.anonymousName || req.session.user?.anonName;
            if (!anonName) {
                anonName = generateAnonName();
                try {
                    await User.findByIdAndUpdate(req.session.user._id, { $set: { anonName } });
                    req.session.user.anonName = anonName;
                } catch (e) {
                    console.error('Failed to persist anonName for user when commenting', e);
                }
            }
            newComment.anonymousName = anonName;
        }

        tweet.comments.push(newComment);
        await tweet.save();

        // Populate the user details for the new comment
        const populatedTweet = await Tweet.findById(tweet._id)
            .populate('comments.user', 'name profilePicture anonName');

        const addedComment = populatedTweet.comments[populatedTweet.comments.length - 1];

        // Build a display-friendly comment object so client doesn't need to compute anon logic
        const commentObj = {
            _id: addedComment._id,
            content: addedComment.content,
            createdAt: addedComment.createdAt,
            anonymous: !!addedComment.anonymous,
            anonymousName: addedComment.anonymousName || (addedComment.user && addedComment.user.anonName) || null,
            user: addedComment.user ? {
                _id: addedComment.user._id,
                name: addedComment.anonymous ? (addedComment.anonymousName || addedComment.user.anonName || 'Anonymous') : addedComment.user.name,
                profilePicture: addedComment.anonymous ? null : (addedComment.user.profilePicture || null)
            } : null
        };

        return res.json({
            success: true,
            comment: commentObj,
            commentCount: tweet.comments.length
        });
    } catch (error) {
        console.error('Error adding comment:', error);
        return res.status(500).json({
            success: false,
            error: 'An error occurred while adding the comment'
        });
    }
}));

module.exports = router;