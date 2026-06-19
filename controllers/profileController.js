const User = require('../models/User');
const Election = require('../models/Election');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for profile picture uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'public/uploads/profiles';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
    }
});

exports.uploadProfilePicture = upload.single('profilePicture');

exports.getProfile = async (req, res) => {
    try {
        // Get full user data from database using session user id
        const user = await User.findById(req.session.user._id)
            .populate({
                path: 'votingHistory.election',
                select: 'title state constituencies'
            })
            .populate({
                path: 'votingHistory.candidate',
                select: 'name party image'
            });

        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/auth/login');
        }

        // Sort voting history by date
        const votingHistory = user.votingHistory.sort((a, b) =>
            new Date(b.votedAt) - new Date(a.votedAt)
        );

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

        // Combine and sort by date (newest first)
        const workDetails = [...mlaWorkDetails, ...mpWorkDetails].sort((a, b) =>
            new Date(b.workDetail.date) - new Date(a.workDetail.date)
        );

        // Fetch tweets for this user
        const Tweet = require('../models/Tweet');
        const tweets = await Tweet.find({ user: user._id })
            .populate('user', 'anonName name profilePicture state institution')
            .populate('comments.user', 'anonName name profilePicture')
            .sort({ createdAt: -1 });

        // Check if tweets have isLiked property and compute display fields
        const tweetsWithLikes = tweets.map(tweet => {
            const t = tweet.toObject();
            const currentUserId = req.session && req.session.user && req.session.user._id ? req.session.user._id.toString() : null;

            t.isLiked = false;
            if (currentUserId && Array.isArray(tweet.likes)) {
                t.isLiked = tweet.likes.some(like => {
                    try {
                        if (!like) return false;
                        if (like.user) return like.user.toString() === currentUserId;
                        return like.toString() === currentUserId;
                    } catch (e) { return false; }
                });
            }

            if (t.anonymous) {
                t.displayName = t.anonymousName || (t.user && t.user.anonName) || 'Anonymous';
                t.isAnonymous = true;
            } else {
                t.displayName = t.user && t.user.name ? t.user.name : 'Unknown';
                t.isAnonymous = false;
            }

            t.displayProfilePicture = t.user && t.user.profilePicture ? `/uploads/profiles/${t.user.profilePicture}` : null;

            if (Array.isArray(t.comments)) {
                t.comments = t.comments.map(c => {
                    const comment = { ...c };
                    const isAnon = !!comment.anonymous;
                    comment.displayName = isAnon ? (comment.anonymousName || (comment.user && comment.user.anonName) || 'Anonymous') : ((comment.user && comment.user.anonName) || (comment.user && comment.user.name) || 'Anonymous');
                    comment.displayProfilePicture = isAnon ? '/img/anonymous-avatar.svg' : (comment.user && comment.user.profilePicture ? `/uploads/profiles/${comment.user.profilePicture}` : null);
                    return comment;
                });
            }
            return t;
        });

        // Fetch reviews posted by this user (MLA)
        const mongoose = require('mongoose');
        const searchUserId = new mongoose.Types.ObjectId(user._id);

        console.log('DEBUG: Session User ID:', user._id);
        console.log('DEBUG: Search User ID (ObjectId):', searchUserId);

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
        console.log('DEBUG: MLA Reviews found:', mlaReviews);

        // Fetch reviews posted by this user (MP)
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
        console.log('DEBUG: MP Reviews found:', mpReviews);

        // Combine and sort reviews by date (newest first)
        const userReviews = [...mlaReviews, ...mpReviews].sort((a, b) =>
            new Date(b.review.createdAt) - new Date(a.review.createdAt)
        );

        // Render profile with user data
        res.render('profile/index', {
            user: user,
            currentUser: req.session.user,
            votingHistory: votingHistory || [],
            tweets: tweetsWithLikes,
            workDetails: workDetails,
            userReviews: userReviews,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        req.flash('error', 'Error loading profile');
        res.redirect('/');
    }
};

exports.updateProfile = async (req, res) => {
    try {
        let { name, state, constituency, anonName } = req.body;
        const userId = req.session.user._id; // Fixed: use _id instead of id

        console.log('Profile update request:', { name, state, constituency, anonName, userId });

        // Prepare update object — only set fields if provided to avoid accidental unset
        const updateData = {};

        if (typeof name !== 'undefined' && name !== null) {
            const trimmedName = (name || '').toString().trim();
            if (trimmedName.length > 0) {
                // optional: enforce a reasonable length
                if (trimmedName.length > 100) {
                    req.flash('error', 'Name is too long (max 100 characters).');
                    return res.redirect('/profile');
                }
                updateData.name = trimmedName;
            }
        }

        if (typeof state !== 'undefined') {
            updateData.state = state;
        }

        // Add constituency if provided
        if (constituency && constituency.trim()) {
            updateData.constituency = constituency.trim();
        }

        // Add profile picture if uploaded
        if (req.file) {
            updateData.profilePicture = req.file.filename;
            console.log('Profile picture uploaded:', req.file.filename);
        }

        // If anonName provided, validate uniqueness and format
        if (typeof anonName !== 'undefined') {
            const trimmed = (anonName || '').toString().trim();
            if (trimmed.length > 0) {
                // Basic validation: alphanumeric, underscore, hyphen
                const valid = /^[A-Za-z0-9_\-]+$/.test(trimmed);
                if (!valid) {
                    req.flash('error', 'Anonymous handle can only contain letters, numbers, underscores and hyphens.');
                    return res.redirect('/profile');
                }

                // Check uniqueness (exclude current user)
                const existing = await User.findOne({ anonName: trimmed, _id: { $ne: userId } });
                if (existing) {
                    req.flash('error', 'This anonymous handle is already taken. Please choose another.');
                    return res.redirect('/profile');
                }

                updateData.anonName = trimmed;
            } else {
                // If blank, do not unset anonName here. Use explicit revoke if desired.
            }
        }

        console.log('Updating user with data:', updateData);

        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            throw new Error('User not found');
        }

        // Update session
        req.session.user = {
            ...req.session.user,
            name: updatedUser.name,
            state: updatedUser.state,
            constituency: updatedUser.constituency,
            profilePicture: updatedUser.profilePicture,
            anonName: updatedUser.anonName || req.session.user.anonName
        };

        console.log('Profile updated successfully:', updatedUser.name);
        req.flash('success', 'Profile updated successfully');
        res.redirect('/profile');
    } catch (error) {
        console.error('Profile update error:', error);
        req.flash('error', 'Error updating profile: ' + error.message);
        res.redirect('/profile');
    }
};