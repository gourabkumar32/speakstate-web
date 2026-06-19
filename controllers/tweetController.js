const Tweet = require('../models/Tweet');
const User = require('../models/User');
const Mla = require('../models/Mla');
const Mp = require('../models/Mp');
const { generateAnonName } = require('../utils/anonNames');

function buildDisplayForTweet(tweetDoc, currentUserId) {
    const t = tweetDoc.toObject();

    // Handle likes (support both raw ObjectId entries and subdocument shapes)
    t.isLiked = false;
    if (currentUserId && Array.isArray(tweetDoc.likes)) {
        t.isLiked = tweetDoc.likes.some(like => {
            if (!like) return false;
            if (like.user && typeof like.user.equals === 'function') {
                try { return like.user.equals(currentUserId); } catch (e) { /* ignore */ }
            }
            if (typeof like.equals === 'function') {
                try { return like.equals(currentUserId); } catch (e) { /* ignore */ }
            }
            return String(like.user || like) === String(currentUserId);
        });
    }

    // Set display name based on anonymous status
    if (t.anonymous) {
        t.displayName = t.anonymousName || (t.user && t.user.anonName) || 'Anonymous';
        t.isAnonymous = true;
    } else {
        t.displayName = (t.user && t.user.name) || 'Unknown';
        t.isAnonymous = false;
    }

    // For all posts (anonymous or not), use profile picture if available
    t.displayProfilePicture = (t.user && t.user.profilePicture) ? `/uploads/profiles/${t.user.profilePicture}` : null;

    // Set display info for likes
    if (Array.isArray(t.likes)) {
        t.likes = t.likes.map(like => {
            const isAnon = !!like.anonymous;
            return {
                ...like,
                displayName: isAnon ? (like.anonymousName || (like.user && like.user.anonName) || 'Anonymous') : ((like.user && like.user.name) || 'Unknown'),
                displayProfilePicture: (like.user && like.user.profilePicture) ? `/uploads/profiles/${like.user.profilePicture}` : null,
                isAnonymous: isAnon
            };
        });
    }

    // Handle comments
    if (Array.isArray(t.comments)) {
        t.comments = t.comments.map(comment => {
            const isAnon = !!comment.anonymous;
            return {
                ...comment,
                displayName: isAnon ? (comment.anonymousName || (comment.user && comment.user.anonName) || 'Anonymous') : ((comment.user && comment.user.name) || 'Unknown'),
                displayProfilePicture: (comment.user && comment.user.profilePicture) ? `/uploads/profiles/${comment.user.profilePicture}` : null,
                isAnonymous: isAnon
            };
        });
    }

    return t;
}

module.exports = {
    list: async (req, res) => {
        try {
            const tweets = await Tweet.aggregate([
                // First look up to populate user fields
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                // Unwind the user array (from lookup)
                { $unwind: '$user' },
                // Look up to populate comments.user fields
                {
                    $lookup: {
                        from: 'users',
                        localField: 'comments.user',
                        foreignField: '_id',
                        as: 'commentUsers'
                    }
                },
                // Sort comments array in reverse chronological order
                {
                    $addFields: {
                        'comments': {
                            $sortArray: {
                                input: '$comments',
                                sortBy: { createdAt: -1 }
                            }
                        }
                    }
                },
                // Sort tweets by creation date
                { $sort: { createdAt: -1 } },
                // Project only needed fields
                {
                    $project: {
                        content: 1,
                        user: { name: 1, email: 1, profilePicture: 1, anonName: 1 },
                        comments: 1,
                        likes: 1,
                        media: 1,
                        anonymous: 1,
                        anonymousName: 1,
                        location: 1,
                        institution: 1,
                        representative: 1,
                        constituency: 1,
                        createdAt: 1
                    }
                }
            ]);

            const result = tweets.map(t => buildDisplayForTweet(t, req.session.user && req.session.user._id));

            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                return res.json({ success: true, tweets: result, currentUser: req.session.user || null });
            }

            return res.render('tweets/index', { tweets: result, currentUser: req.session.user || null });
        } catch (err) {
            console.error('Error listing tweets', err);
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                return res.status(500).json({ success: false, error: 'Error fetching tweets' });
            }
            req.flash('error', 'Error fetching tweets');
            return res.redirect('/');
        }
    },

    create: async (req, res) => {
        try {
            const { content, representative, constituency, location, institution, anonymous } = req.body;
            if (!content || !content.trim()) {
                req.flash('error', 'Tweet content cannot be empty');
                return res.redirect('back');
            }

            const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
            if (wordCount > 300) {
                const msg = 'Tweet is too long. Maximum allowed is 300 words.';
                req.flash('error', msg);
                return res.redirect('back');
            }

            const mediaFiles = req.files ? req.files.map(f => f.filename) : [];

            // Default to anonymous unless explicitly turned off
            const isAnonymous = !(anonymous === 'off' || anonymous === false || anonymous === 'false' || anonymous === '0');

            // Parse @mentions
            const taggedMlas = [];
            const taggedMps = [];
            const mentionRegex = /@(\w+)/g;
            let match;
            while ((match = mentionRegex.exec(content)) !== null) {
                const name = match[1];
                // Search for MLA
                const mla = await Mla.findOne({ name: new RegExp(`^${name}$`, 'i') });
                if (mla) {
                    taggedMlas.push(mla._id);
                } else {
                    // Search for MP
                    const mp = await Mp.findOne({ name: new RegExp(`^${name}$`, 'i') });
                    if (mp) {
                        taggedMps.push(mp._id);
                    }
                }
            }

            const tweetData = {
                content: content.trim(),
                user: req.session.user._id,
                representative, constituency, location, institution,
                media: mediaFiles,
                anonymous: isAnonymous,
                taggedMlas,
                taggedMps
            };

            if (isAnonymous) {
                let anonName = req.body.anonymousName || req.session.user?.anonName;
                if (!anonName) {
                    anonName = generateAnonName();
                    try {
                        await User.findByIdAndUpdate(req.session.user._id, { $set: { anonName } });
                        req.session.user.anonName = anonName;
                    } catch (e) { console.error('Failed to persist anonName for user', e); }
                }
                tweetData.anonymousName = anonName;
            }

            const tweet = new Tweet(tweetData);
            await tweet.save();
            await tweet.populate('user', 'name profilePicture anonName');

            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                return res.json({ success: true, message: 'Tweet created successfully', tweet: buildDisplayForTweet(tweet, req.session.user && req.session.user._id) });
            }

            req.flash('success', 'Tweet posted successfully!');
            return res.redirect('/tweets');
        } catch (err) {
            console.error('Error creating tweet', err);
            req.flash('error', 'An error occurred while creating the tweet');
            return res.redirect('back');
        }
    },

    addComment: async (req, res) => {
        try {
            const tweet = await Tweet.findById(req.params.id);
            if (!tweet) return res.status(404).json({ success: false, error: 'Tweet not found' });

            const { content, anonymous } = req.body;
            if (!content || !content.trim()) return res.status(400).json({ success: false, error: 'Comment content cannot be empty' });

            // Default to anonymous unless explicitly turned off
            const isAnonymous = !(anonymous === 'off' || anonymous === false || anonymous === 'false' || anonymous === '0');

            // Generate or get anonymous name
            let anonymousName = null;
            if (isAnonymous) {
                anonymousName = await User.findById(req.session.user._id).then(user => user.anonName);
                if (!anonymousName) {
                    anonymousName = generateAnonName();
                    await User.findByIdAndUpdate(req.session.user._id, { $set: { anonName: anonymousName } });
                    if (req.session.user) {
                        req.session.user.anonName = anonymousName;
                    }
                }
            }

            const newComment = {
                content: content.trim(),
                user: req.session.user._id,
                createdAt: new Date(),
                anonymous: isAnonymous,
                anonymousName: anonymousName
            };

            if (isAnonymous) {
                let anonName = req.body.anonymousName || req.session.user?.anonName;
                if (!anonName) {
                    anonName = generateAnonName();
                    try { await User.findByIdAndUpdate(req.session.user._id, { $set: { anonName } }); req.session.user.anonName = anonName; } catch (e) { console.error('Failed to persist anonName for user when commenting', e); }
                }
                newComment.anonymousName = anonName;
            }

            // Add the comment at the beginning of the array
            tweet.comments.unshift(newComment);
            await tweet.save();

            // Get the populated comment data
            const populated = await Tweet.findById(tweet._id)
                .populate('comments.user', 'name profilePicture anonName');
            const addedComment = populated.comments[0]; // Get the latest comment (now at index 0)

            const commentObj = {
                _id: addedComment._id,
                content: addedComment.content,
                createdAt: addedComment.createdAt,
                anonymous: !!addedComment.anonymous,
                anonymousName: addedComment.anonymousName || (addedComment.user && addedComment.user.anonName) || null,
                displayName: addedComment.anonymous ?
                    (addedComment.anonymousName || (addedComment.user && addedComment.user.anonName) || 'Anonymous') :
                    ((addedComment.user && addedComment.user.name) || 'Unknown'),
                displayProfilePicture: addedComment.user && addedComment.user.profilePicture ?
                    `/uploads/profiles/${addedComment.user.profilePicture}` : null,
                isAnonymous: !!addedComment.anonymous,
                user: addedComment.user ? { _id: addedComment.user._id } : null
            };

            return res.json({ success: true, comment: commentObj, commentCount: tweet.comments.length });
        } catch (err) {
            console.error('Error adding comment', err);
            return res.status(500).json({ success: false, error: 'An error occurred while adding the comment' });
        }
    }
};
