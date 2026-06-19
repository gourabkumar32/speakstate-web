const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const profileController = require('../controllers/profileController');
const User = require('../models/User');
const upload = require('../middleware/workImageUpload');
const { generateAnonName } = require('../utils/anonNames');

// Apply authentication middleware to all profile routes
router.use(isAuthenticated);

// Profile routes
// Work detail operations - Helper to get model
const getModelByType = (type) => {
    if (type === 'mla') return require('../models/Mla');
    if (type === 'mp') return require('../models/Mp');
    return null;
};

// Get work detail
router.get('/work/:type/:leaderId/:workId', async (req, res) => {
    try {
        const { type, leaderId, workId } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, error: 'Invalid leader type' });
        }

        const leader = await Model.findById(leaderId);

        if (!leader) {
            return res.status(404).json({ success: false, error: 'Leader not found' });
        }

        const work = leader.workDetails.id(workId);
        if (!work) {
            return res.status(404).json({ success: false, error: 'Work detail not found' });
        }

        // Check if the user is authorized to edit this work
        if (work.createdBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        res.json({ success: true, work });
    } catch (error) {
        console.error('Error fetching work details:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Update work detail
// Accept multipart/form-data so clients can send images via FormData
router.put('/work/:type/:leaderId/:workId', upload.array('images', 5), async (req, res) => {
    try {
        const { type, leaderId, workId } = req.params;

        // Debug logging to help diagnose failing edit requests
        console.log('PUT /profile/work/ update called', {
            pathParams: req.params,
            filesCount: req.files ? req.files.length : 0,
            sessionUser: req.session && req.session.user ? req.session.user._id : null
        });

        // If multer reported a file validation error, return it as JSON
        if (req.fileValidationError) {
            console.warn('File validation error:', req.fileValidationError);
            return res.status(400).json({ success: false, error: req.fileValidationError });
        }

        const Model = getModelByType(type);
        if (!Model) {
            return res.status(400).json({ success: false, error: 'Invalid leader type' });
        }

        const leader = await Model.findById(leaderId);

        if (!leader) {
            return res.status(404).json({ success: false, error: 'Leader not found' });
        }

        const work = leader.workDetails.id(workId);
        if (!work) {
            return res.status(404).json({ success: false, error: 'Work detail not found' });
        }

        // Check if the user is authorized to edit this work
        if (work.createdBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        // Normalize incoming fields (multer places text fields on req.body)
        const { title, description, location, status, removeImages } = req.body;

        work.title = title || work.title;
        work.description = description || work.description;
        work.location = location || work.location;
        work.status = status || work.status;
        work.updatedAt = new Date();

        // Handle image removals if specified
        if (removeImages) {
            const imagesToRemove = Array.isArray(removeImages) ? removeImages : [removeImages];
            work.images = (work.images || []).filter(img => !imagesToRemove.includes(img));
        }

        // Add any newly uploaded images
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => file.filename);
            work.images = [...(work.images || []), ...newImages];
        }

        await leader.save();
        res.json({ success: true, work });
    } catch (error) {
        console.error('Error updating work detail:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Delete work detail
// Delete work detail
router.delete('/work/:type/:leaderId/:workId', async (req, res) => {
    try {
        const { type, leaderId, workId } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, error: 'Invalid leader type' });
        }

        const leader = await Model.findById(leaderId);

        if (!leader) {
            return res.status(404).json({ success: false, error: 'Leader not found' });
        }

        const work = leader.workDetails.id(workId);
        if (!work) {
            return res.status(404).json({ success: false, error: 'Work detail not found' });
        }

        // Check if the user is authorized to delete this work
        if (work.createdBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        // Remove the work detail
        leader.workDetails.pull(workId);
        await leader.save();
        res.json({ success: true, message: 'Work detail deleted successfully' });
    } catch (error) {
        console.error('Error deleting work detail:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

router.get('/', async (req, res) => {
    try {
        console.log('Profile Route - Session User:', req.session.user);

        if (!req.session.user || !req.session.user._id) {
            console.log('No user in session, redirecting to login');
            req.flash('error', 'Please log in to access your profile');
            return res.redirect('/auth/login');
        }

        const user = await User.findById(req.session.user._id)
            .populate('votingHistory.election')
            .populate('votingHistory.candidate');

        if (!user) {
            console.log('User not found:', req.session.user);
            return res.redirect('/auth/login');
        }

        // Fetch work details posted by this user
        // Fetch work details posted by this user (MLA)
        const Mla = require('../models/Mla');
        const mlaWorkDetails = await Mla.aggregate([
            { $unwind: "$workDetails" },
            { $match: { "workDetails.createdBy": user._id } },
            {
                $project: {
                    leaderId: "$_id",
                    leaderName: "$name",
                    leaderType: "mla",
                    workDetail: "$workDetails"
                }
            }
        ]);

        // Fetch work details posted by this user (MP)
        const Mp = require('../models/Mp');
        const mpWorkDetails = await Mp.aggregate([
            { $unwind: "$workDetails" },
            { $match: { "workDetails.createdBy": user._id } },
            {
                $project: {
                    leaderId: "$_id",
                    leaderName: "$name",
                    leaderType: "mp",
                    workDetail: "$workDetails"
                }
            }
        ]);

        // Fetch reviews posted by this user (MLA) - ADDED
        const mongoose = require('mongoose');
        const searchUserId = new mongoose.Types.ObjectId(user._id);

        const mlaReviews = await Mla.aggregate([
            { $unwind: "$reviews" },
            { $match: { "reviews.user": searchUserId } },
            {
                $project: {
                    leaderId: "$_id",
                    leaderName: "$name",
                    leaderType: "mla",
                    review: "$reviews"
                }
            }
        ]);

        // Fetch reviews posted by this user (MP) - ADDED
        const mpReviews = await Mp.aggregate([
            { $unwind: "$reviews" },
            { $match: { "reviews.user": searchUserId } },
            {
                $project: {
                    leaderId: "$_id",
                    leaderName: "$name",
                    leaderType: "mp",
                    review: "$reviews"
                }
            }
        ]);

        // Combine and sort reviews by date (newest first)
        const userReviews = [...mlaReviews, ...mpReviews].sort((a, b) =>
            new Date(b.review.createdAt) - new Date(a.review.createdAt)
        );

        // Combine and sort by date (newest first)
        const workDetails = [...mlaWorkDetails, ...mpWorkDetails].sort((a, b) =>
            new Date(b.workDetail.date) - new Date(a.workDetail.date)
        );

        // Fetch tweets for this user
        const Tweet = require('../models/Tweet');
        const tweets = await Tweet.find({ user: user._id })
            .populate('user', 'anonName name profilePicture state institution')
            .populate('comments.user', 'anonName name profilePicture')
            .populate('taggedMlas', 'name _id')
            .populate('taggedMps', 'name _id')
            .sort({ createdAt: -1 });

        // Check if tweets have isLiked property and compute display fields
        const tweetsWithLikes = tweets.map(tweet => {
            const t = tweet.toObject();
            // Compute current user id safely
            const currentUserId = req.session && req.session.user && req.session.user._id ? req.session.user._id.toString() : null;
            // Robust isLiked check: likes may be array of ObjectIds or objects with { user }
            t.isLiked = false;
            if (currentUserId && Array.isArray(tweet.likes)) {
                t.isLiked = tweet.likes.some(like => {
                    try {
                        if (!like) return false;
                        if (like.user) return like.user.toString() === currentUserId;
                        return like.toString() === currentUserId;
                    } catch (e) {
                        return false;
                    }
                });
            }
            // Set displayName based on whether post is anonymous or not
            if (t.anonymous) {
                t.displayName = t.anonymousName || (t.user && t.user.anonName) || 'Anonymous';
                t.isAnonymous = true;
            } else {
                t.displayName = t.user && t.user.name ? t.user.name : 'Unknown';
                t.isAnonymous = false;
            }

            // For all posts (anonymous or not), use profile picture if available
            t.displayProfilePicture = t.user && t.user.profilePicture ? `/uploads/profiles/${t.user.profilePicture}` : null;
            // Map comments for anonymous display
            if (Array.isArray(t.comments)) {
                t.comments = t.comments.map(c => {
                    const comment = { ...c };
                    const isAnon = !!comment.anonymous;
                    comment.displayName = isAnon ? (comment.anonymousName || (comment.user && comment.user.anonName) || 'Anonymous') : ((comment.user && comment.user.anonName) || (comment.user && comment.user.name) || 'Anonymous');
                    comment.displayProfilePicture = isAnon ? '/img/anonymous-avatar.svg' : (comment.user && comment.user.profilePicture ? `/uploads/profiles/${comment.user.profilePicture}` : null);
                    return comment;
                });
            }

            // Create Enriched Content with Links
            let enriched = t.content;
            // Escape HTML first to prevent XSS
            enriched = enriched.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

            // Linkify MLAs
            if (t.taggedMlas && t.taggedMlas.length > 0) {
                t.taggedMlas.forEach(mla => {
                    // Case insensitive replace of @Name
                    const regex = new RegExp(`@${mla.name}`, 'gi');
                    enriched = enriched.replace(regex, `<a href="/mlas/${mla._id}/details" class="text-blue-600 hover:underline font-semibold">@${mla.name}</a>`);
                });
            }
            // Linkify MPs
            if (t.taggedMps && t.taggedMps.length > 0) {
                t.taggedMps.forEach(mp => {
                    const regex = new RegExp(`@${mp.name}`, 'gi');
                    enriched = enriched.replace(regex, `<a href="/mps/${mp._id}" class="text-blue-600 hover:underline font-semibold">@${mp.name}</a>`);
                });
            }
            t.enrichedContent = enriched;

            return t;
        });

        // Development-only debug: log first few tweet avatar values and check file existence to diagnose missing images
        if (process.env.NODE_ENV !== 'production') {
            try {
                const fs = require('fs');
                const path = require('path');
                const preview = tweetsWithLikes.slice(0, 10).map(t => {
                    const userPic = t.user && t.user.profilePicture ? t.user.profilePicture : null;
                    const uploadPath = userPic ? `/uploads/profiles/${userPic}` : null;
                    const absFile = userPic ? path.join(__dirname, '..', 'public', 'uploads', 'profiles', userPic) : null;
                    const exists = absFile ? fs.existsSync(absFile) : false;
                    return { id: t._id, displayProfilePicture: t.displayProfilePicture || null, userProfilePicture: userPic, uploadPath, fileExists: exists };
                });
                console.log('Profile route - tweets avatar preview:', JSON.stringify(preview, null, 2));
            } catch (e) { console.warn('Failed to log tweets preview', e); }
        }

        res.render('profile/index', {
            user,
            currentUser: req.session.user,
            votingHistory: user.votingHistory || [],
            tweets: tweetsWithLikes,
            workDetails: workDetails,
            userReviews: userReviews
        });
    } catch (error) {
        console.error('Profile error:', error);
        req.flash('error', 'Error loading profile');
        res.redirect('/');
    }
});

router.post('/update', profileController.uploadProfilePicture, profileController.updateProfile);

// Update anonymous name directly
router.post('/anon/update', async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            req.flash('error', 'Please log in to manage anonymous handle');
            return res.redirect('/auth/login');
        }

        const { anonName } = req.body;
        if (!anonName || !anonName.trim()) {
            req.flash('error', 'Anonymous handle cannot be empty');
            return res.redirect('/profile');
        }

        const trimmedName = anonName.trim();
        // Validate format
        if (!/^[A-Za-z0-9_\-]+$/.test(trimmedName)) {
            req.flash('error', 'Anonymous handle can only contain letters, numbers, underscores and hyphens');
            return res.redirect('/profile');
        }

        // Check uniqueness
        const existing = await User.findOne({
            anonName: trimmedName,
            _id: { $ne: req.session.user._id }
        });
        if (existing) {
            req.flash('error', 'This anonymous handle is already taken');
            return res.redirect('/profile');
        }

        // Update user
        await User.findByIdAndUpdate(req.session.user._id, {
            $set: { anonName: trimmedName }
        });
        // Update session
        req.session.user.anonName = trimmedName;
        req.flash('success', `Your anonymous handle has been updated to ${trimmedName}`);
        return res.redirect('/profile');
    } catch (error) {
        console.error('Error updating anonName:', error);
        req.flash('error', 'Could not update anonymous handle. Please try again.');
        return res.redirect('/profile');
    }
});

// Generate or regenerate a persistent anonymous handle for the logged-in user
router.post('/anon/generate', async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            req.flash('error', 'Please log in to manage anonymous handle');
            return res.redirect('/auth/login');
        }

        const anonName = generateAnonName();
        await User.findByIdAndUpdate(req.session.user._id, { $set: { anonName } });
        // update session
        req.session.user.anonName = anonName;
        req.flash('success', `Your anonymous handle has been set to ${anonName}`);
        return res.redirect('/profile');
    } catch (error) {
        console.error('Error generating anonName:', error);
        req.flash('error', 'Could not generate anonymous handle. Please try again.');
        return res.redirect('/profile');
    }
});

module.exports = router;