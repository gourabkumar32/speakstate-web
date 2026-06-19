const express = require('express');
const router = express.Router();
const Mla = require('../models/Mla');
const Mp = require('../models/Mp');
const Tweet = require('../models/Tweet');
const fs = require('fs');
const path = require('path');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const User = require('../models/User');
const upload = require('../middleware/workImageUpload');

// Import work routes
// Mount work routes removed - integrating directly
// router.use('/:mlaId/work', workRoutes);

// Explicitly set routes as public by adding a middleware that just calls next()
const publicRoute = (req, res, next) => next();

// Autocomplete search route
router.get('/search/json', async (req, res) => {
    try {
        const query = req.query.q;
        console.log('Autocomplete Search Query:', query);
        if (!query) return res.json([]);

        // Create a regex that allows for spaces between characters
        // e.g. "himanta" -> /h\s*i\s*m\s*a\s*n\s*t\s*a/i
        const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fuzzyQuery = safeQuery.split('').join('\\s*');
        const regex = new RegExp(fuzzyQuery, 'i');

        const [mlas, mps] = await Promise.all([
            Mla.find({ name: regex }).select('name image party state constituency').limit(10),
            Mp.find({ name: regex }).select('name image party state constituency').limit(10)
        ]);

        const results = [
            ...mlas.map(m => ({
                _id: m._id,
                name: m.name,
                type: 'MLA',
                image: m.image,
                subtext: `${m.constituency}, ${m.state}`
            })),
            ...mps.map(m => ({
                _id: m._id,
                name: m.name,
                type: 'MP',
                image: m.image,
                subtext: `${m.constituency}, ${m.state}`
            }))
        ].sort((a, b) => a.name.localeCompare(b.name));

        res.json(results);
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json([]);
    }
});


// Get MLA review statistics
router.get('/:id/review-stats', async (req, res) => {
    try {
        const mla = await Mla.findById(req.params.id);
        if (!mla) {
            return res.status(404).json({ error: 'MLA not found' });
        }

        // Calculate review statistics
        const reviews = mla.reviews || [];
        const reviewCount = reviews.length;
        const averageRating = reviewCount > 0
            ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
            : 0;

        res.json({
            reviewCount,
            averageRating
        });
    } catch (error) {
        console.error('Error fetching review stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all MLAs with filters
router.get('/', async (req, res) => {
    try {
        const { search, state, party } = req.query;
        let query = {};

        // Log the query parameters
        console.log('Query params:', { search, state, party });

        if (search) {
            // Ensure search term is properly escaped for regex
            const searchRegex = new RegExp(search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
            query.$or = [
                { name: searchRegex },
                { constituency: searchRegex },
                { state: searchRegex },
                { party: searchRegex }
            ];
            console.log('Searching with regex:', searchRegex);
        }
        if (state) {
            query.state = state;  // Simple exact match
            console.log('Filtering by state:', state);
        }
        if (party) {
            query.party = party;  // Simple exact match
        }

        // Log the final query
        console.log('Final MongoDB query:', JSON.stringify(query, null, 2));

        // First, let's check what states are in the database
        const allStates = await Mla.distinct('state');
        console.log('All states in database:', allStates);

        // Get states and parties for filters
        const [states, parties] = await Promise.all([
            Mla.distinct('state'),
            Mla.distinct('party')
        ]);

        console.log('Found states:', states);
        console.log('Found parties:', parties);

        // First count total MLAs
        const totalCount = await Mla.countDocuments(query);
        console.log('Total MLAs matching query:', totalCount);

        // First get MLAs without aggregation to debug
        const rawMlas = await Mla.find(query).lean();
        console.log('Raw MLAs found:', rawMlas.length);
        if (rawMlas.length === 0) {
            console.log('No MLAs found for query:', query);
        } else {
            console.log('Sample MLA:', rawMlas[0]);
        }

        // Get all MLAs with ratings
        const mlas = await Mla.aggregate([
            { $match: query },
            {
                $addFields: {
                    rating: {
                        $cond: [
                            { $gt: [{ $size: { $ifNull: ["$reviews", []] } }, 0] },
                            { $round: [{ $avg: "$reviews.rating" }, 1] },
                            0
                        ]
                    },
                    reviewCount: { $size: { $ifNull: ["$reviews", []] } }
                }
            },
            { $sort: { state: 1, name: 1 } },
            {
                $project: {
                    name: 1,
                    state: 1,
                    constituency: 1,
                    party: 1,
                    image: 1,
                    rating: 1,
                    reviewCount: 1
                }
            }
        ]).exec();  // Explicitly execute the query

        // Default to empty array if no results
        const mlasArray = mlas || [];

        // Initialize mlasByState with empty arrays for all states
        const mlasByState = states.reduce((acc, state) => {
            acc[state] = [];
            return acc;
        }, {});

        // Organize MLAs by state
        mlasArray.forEach(mla => {
            if (mla && mla.state) {
                if (Array.isArray(mlasByState[mla.state])) {
                    mlasByState[mla.state].push(mla);
                } else {
                    console.log('WARNING: MLA skipped because state not found in keys:', {
                        mlaName: mla.name,
                        state: mla.state,
                        availableStates: Object.keys(mlasByState)
                    });
                }
            }
        });

        // Sort MLAs within each state by name
        Object.keys(mlasByState).forEach(state => {
            mlasByState[state].sort((a, b) => a.name.localeCompare(b.name));
        });

        // Log the results
        console.log('Total MLAs being sent to view:', mlasArray.length);
        console.log('States distribution:', Object.entries(mlasByState).reduce((acc, [state, mlas]) => {
            acc[state] = mlas.length;
            return acc;
        }, {}));

        // Ensure we have valid data
        const safeStates = states || [];
        const safeParties = parties || [];
        const safeMlasByState = mlasByState || {};

        // Helper to find file in mlas or candidates
        const mlasDir = path.join(__dirname, '../public/uploads/mlas');
        const candidatesDir = path.join(__dirname, '../public/uploads/candidates');

        const checkFile = (fname) => {
            if (fs.existsSync(path.join(mlasDir, fname))) return '/uploads/mlas/' + fname;
            if (fs.existsSync(path.join(candidatesDir, fname))) return '/uploads/candidates/' + fname;
            return null;
        };

        // For each MLA, compute a thumb path if available; otherwise fall back to the main image.
        // This prevents pages from referencing thumbnails that don't exist on disk.
        Object.keys(safeMlasByState).forEach(stateKey => {
            safeMlasByState[stateKey] = safeMlasByState[stateKey].map(mla => {
                try {
                    // mla.image from aggregation is the stored value (filename or path)
                    let stored = mla.image || '';
                    let filename = stored;

                    if (stored.startsWith('/uploads/')) {
                        filename = path.basename(stored);
                    } else if (stored.startsWith('http')) {
                        // external URL - use as-is
                        mla.imagePath = stored;
                        mla.thumb = stored;
                        return mla;
                    }

                    // Ensure default fallback if no filename
                    if (!filename) {
                        mla.imagePath = '/uploads/mlas/default-mla.png';
                        mla.thumb = '/uploads/mlas/default-mla.png';
                        return mla;
                    }

                    // Remove -opt suffix if present to find the base name for thumbnail
                    let base = filename;
                    const ext = path.extname(filename);
                    if (base.endsWith('-opt' + ext)) {
                        base = base.slice(0, -('-opt' + ext).length);
                    } else {
                        base = base.slice(0, -ext.length);
                    }

                    const thumbFilename = base + '-thumb.webp';

                    // Resolve thumbnail
                    let thumbPath = checkFile(thumbFilename);
                    if (!thumbPath) {
                        // Fallback to main image as thumbnail if specific thumb not found
                        thumbPath = checkFile(filename);
                    }

                    // Resolve main image
                    let mainPath = checkFile(filename);

                    // Final fallback
                    if (!thumbPath) thumbPath = '/uploads/mlas/default-mla.png';
                    if (!mainPath) mainPath = '/uploads/mlas/default-mla.png';

                    // Assign all possible properties for view compatibility
                    mla.thumbnail = thumbPath;
                    mla.thumb = thumbPath;
                    mla.image = mainPath;
                    mla.imagePath = mainPath;
                    return mla;
                } catch (err) {
                    console.error('Error computing thumbnail for MLA:', err);
                    const fallback = mla.image || '/uploads/mlas/default-mla.png';
                    mla.thumb = fallback;
                    mla.thumbnail = fallback;
                    mla.imagePath = fallback;
                    mla.image = fallback;
                    return mla;
                }
            });
        });

        console.log('States available:', safeStates);
        console.log('MLA data:', {
            totalStates: Object.keys(safeMlasByState).length,
            totalMLAs: Object.values(safeMlasByState).reduce((acc, mlas) => acc + mlas.length, 0)
        });

        res.render('mlas/index', {
            title: 'MLA Tracker',
            mlasByState: safeMlasByState,
            states: safeStates,
            parties: safeParties,
            currentFilters: { search, state, party },
            user: req.session.user || null,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Error fetching MLAs');
        res.redirect('/');
    }
});

// Get single MLA data
router.get('/:id', async (req, res) => {
    try {
        const mla = await Mla.findById(req.params.id);

        if (!mla) {
            return res.status(404).json({
                success: false,
                message: 'MLA not found'
            });
        }

        return res.json({
            success: true,
            mla: mla
        });
    } catch (error) {
        console.error('Error fetching MLA:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching MLA data'
        });
    }
});

// Get MLA reviews
router.get('/:id/reviews', isAuthenticated, async (req, res) => {
    try {
        const mla = await Mla.findById(req.params.id)
            .populate({
                path: 'reviews.user',
                select: 'name email anonName'
            })
            .lean();

        if (!mla) {
            req.flash('error', 'MLA not found');
            return res.redirect('/mlas');
        }

        // Image processing
        try {
            let stored = mla.image || '';
            let filename = stored.startsWith('/uploads/') ? require('path').basename(stored) : stored;

            if (stored.startsWith('http')) {
                mla.imageUrl = stored;
            } else {
                const mlasDir = require('path').join(__dirname, '..', 'public', 'uploads', 'mlas');
                const candidatesDir = require('path').join(__dirname, '..', 'public', 'uploads', 'candidates');
                const checkFile = (fname) => {
                    if (require('fs').existsSync(require('path').join(mlasDir, fname))) return '/uploads/mlas/' + fname;
                    if (require('fs').existsSync(require('path').join(candidatesDir, fname))) return '/uploads/candidates/' + fname;
                    return null;
                };
                mla.imageUrl = checkFile(filename) || '/uploads/mlas/default-mla.png';
            }
        } catch (e) { mla.imageUrl = '/uploads/mlas/default-mla.png'; }

        // Transform reviews into display-friendly objects
        const displayReviews = (mla.reviews || []).map(r => {
            const review = r;
            review.displayName = review.anonymous ? (review.anonymousName || (review.user && review.user.anonName) || 'Anonymous') : ((review.user && (review.user.anonName || review.user.name)) || 'Unknown');
            review.displayProfilePicture = review.anonymous ? null : (review.user ? review.user.profilePicture : null);
            return review;
        });

        // Sort reviews by date (newest first)
        displayReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Check if it's an AJAX request
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({ success: true, reviews: displayReviews });
        }

        // Render the template for regular requests
        res.render('mlas/reviews', {
            mla: { ...mla, reviews: displayReviews },
            activeTab: 'reviews',
            user: req.session.user,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });

    } catch (error) {
        console.error('Error loading reviews:', error);
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(500).json({ error: 'Error loading reviews' });
        }
        req.flash('error', 'Error loading reviews');
        res.redirect('/mlas');
    }
});


// Add review - checks authentication but doesn't redirect
router.post('/:id/reviews', async (req, res) => {
    try {
        console.log('Review submission body:', req.body);

        const mla = await Mla.findById(req.params.id);
        if (!mla) {
            return res.status(404).json({ error: 'MLA not found' });
        }

        // Check if user exists in session
        if (!req.session.user || !req.session.user.id) {
            return res.status(401).json({ success: false, message: 'Please login to add a review' });
        }

        // Validate review data
        if (!req.body.rating || !req.body.comment) {
            return res.status(400).json({
                success: false,
                message: 'Rating and comment are required',
                received: req.body
            });
        }

        // Add the review
        const newReview = {
            user: req.session.user.id,
            rating: Number(req.body.rating),
            comment: req.body.comment,
            anonymous: false,
            anonymousName: null,
            createdAt: new Date()
        };

        console.log('Adding review:', newReview);

        // Check if user has already reviewed this MLA
        const hasReviewed = mla.reviews.some(review =>
            review.user.toString() === req.session.user.id
        );

        if (hasReviewed) {
            return res.status(400).json({
                success: false,
                message: 'You have already reviewed this MLA'
            });
        }

        // Add review and save
        mla.reviews.push(newReview);
        await mla.save();

        // Calculate new average rating
        const averageRating = mla.reviews.reduce((acc, r) => acc + r.rating, 0) / mla.reviews.length;

        // Send back success response with display data
        return res.status(200).json({
            success: true,
            message: 'Review added successfully',
            review: {
                ...newReview,
                displayName: newReview.anonymous ? (newReview.anonymousName || (req.session.user && req.session.user.anonName) || 'Anonymous') : (req.session.user && req.session.user.name) || 'Unknown',
                displayProfilePicture: newReview.anonymous ? '/img/anonymous-avatar.svg' : (req.session.user && req.session.user.profilePicture ? `/uploads/profiles/${req.session.user.profilePicture}` : null)
            },
            newRating: Number(averageRating.toFixed(1)),
            reviewCount: mla.reviews.length
        });

    } catch (error) {
        console.error('Error adding review:', error);
        return res.status(500).json({
            success: false,
            message: 'Error adding review',
            details: error.message
        });
    }
});

// Update Review
router.put('/:id/reviews/:reviewId', isAuthenticated, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const mla = await Mla.findById(req.params.id);

        if (!mla) {
            return res.status(404).json({ success: false, message: 'MLA not found' });
        }

        const review = mla.reviews.id(req.params.reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        // Check ownership
        if (review.user.toString() !== req.session.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Update fields
        review.rating = Number(rating);
        review.comment = comment;

        await mla.save();

        // Calculate new average
        const averageRating = mla.reviews.reduce((acc, r) => acc + r.rating, 0) / mla.reviews.length;

        res.json({
            success: true,
            message: 'Review updated successfully',
            newRating: Number(averageRating.toFixed(1)),
            review: {
                ...review.toObject(),
                displayName: review.anonymous ? (review.anonymousName || (req.session.user && req.session.user.anonName) || 'Anonymous') : (req.session.user && req.session.user.name) || 'Unknown',
                displayProfilePicture: review.anonymous ? '/img/anonymous-avatar.svg' : (req.session.user && req.session.user.profilePicture ? `/uploads/profiles/${req.session.user.profilePicture}` : null)
            }
        });
    } catch (error) {
        console.error('Error updating review:', error);
        res.status(500).json({ success: false, message: 'Error updating review' });
    }
});

// Delete Review
router.delete('/:id/reviews/:reviewId', isAuthenticated, async (req, res) => {
    try {
        const mla = await Mla.findById(req.params.id);

        if (!mla) {
            return res.status(404).json({ success: false, message: 'MLA not found' });
        }

        const review = mla.reviews.id(req.params.reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        // Check ownership (allow admin too if needed, but strict owner for now)
        if ((!review.user || review.user.toString() !== req.session.user.id) && !req.session.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Remove review using pull
        mla.reviews.pull(req.params.reviewId);
        await mla.save();

        res.json({ success: true, message: 'Review deleted successfully' });

    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ success: false, message: 'Error deleting review: ' + error.message });
    }
});

// Get MLA details (About page)
router.get('/:id/details', isAuthenticated, async (req, res) => {
    try {
        const mla = await Mla.findById(req.params.id)
            .select('name constituency state party image rating')
            .lean();

        if (!mla) {
            req.flash('error', 'MLA not found');
            return res.redirect('/mlas');
        }

        // Image processing (concise)
        try {
            let stored = mla.image || '';
            let filename = stored.startsWith('/uploads/') ? path.basename(stored) : stored;
            if (stored.startsWith('http')) mla.imageUrl = stored;
            else {
                const mlasDir = path.join(__dirname, '../public/uploads/mlas');
                const candidatesDir = path.join(__dirname, '../public/uploads/candidates');
                const checkFile = (fname) => (fs.existsSync(path.join(mlasDir, fname)) ? '/uploads/mlas/' + fname : (fs.existsSync(path.join(candidatesDir, fname)) ? '/uploads/candidates/' + fname : null));
                mla.imageUrl = checkFile(filename) || '/uploads/mlas/default-mla.png';
            }
        } catch (e) { mla.imageUrl = '/uploads/mlas/default-mla.png'; }


        // Fetch complaints
        const complaints = await Tweet.find({ taggedMlas: req.params.id })
            .populate('user', 'name profilePicture anonName')
            .sort({ createdAt: -1 })
            .lean();

        const displayComplaints = complaints.map(c => ({
            ...c,
            displayName: c.anonymous ? (c.anonymousName || (c.user && c.user.anonName) || 'Anonymous') : ((c.user && c.user.name) || 'Unknown'),
            displayProfilePicture: c.anonymous ? null : (c.user && c.user.profilePicture ? `/uploads/profiles/${c.user.profilePicture}` : null)
        }));

        res.render('mlas/details', {
            mla: { ...mla, complaints: displayComplaints },
            activeTab: 'complaints',
            user: req.session.user || null
        });

    } catch (error) {
        console.error('Error in MLA details route:', error);
        req.flash('error', error.message);
        res.redirect('/mlas/' + req.params.id + '/complaints');
    }
});

// Get MLA Complaints
router.get('/:id/complaints', isAuthenticated, async (req, res) => {
    try {
        const mla = await Mla.findById(req.params.id)
            .select('name constituency state party image rating')
            .lean();

        if (!mla) {
            req.flash('error', 'MLA not found');
            return res.redirect('/mlas');
        }

        // Image processing (concise)
        try {
            let stored = mla.image || '';
            let filename = stored.startsWith('/uploads/') ? path.basename(stored) : stored;
            if (stored.startsWith('http')) mla.imageUrl = stored;
            else {
                const mlasDir = path.join(__dirname, '../public/uploads/mlas');
                const candidatesDir = path.join(__dirname, '../public/uploads/candidates');
                const checkFile = (fname) => (fs.existsSync(path.join(mlasDir, fname)) ? '/uploads/mlas/' + fname : (fs.existsSync(path.join(candidatesDir, fname)) ? '/uploads/candidates/' + fname : null));
                mla.imageUrl = checkFile(filename) || '/uploads/mlas/default-mla.png';
            }
        } catch (e) { mla.imageUrl = '/uploads/mlas/default-mla.png'; }


        // Fetch complaints
        const complaints = await Tweet.find({ taggedMlas: req.params.id })
            .populate('user', 'name profilePicture anonName')
            .sort({ createdAt: -1 })
            .lean();

        const displayComplaints = complaints.map(c => ({
            ...c,
            displayName: c.anonymous ? (c.anonymousName || (c.user && c.user.anonName) || 'Anonymous') : ((c.user && c.user.name) || 'Unknown'),
            displayProfilePicture: c.anonymous ? null : (c.user && c.user.profilePicture ? `/uploads/profiles/${c.user.profilePicture}` : null)
        }));

        res.render('mlas/complaints', {
            mla: { ...mla, complaints: displayComplaints },
            activeTab: 'complaints',
            user: req.session.user || null
        });

    } catch (error) {
        console.error('Error in MLA complaints route:', error);
        req.flash('error', error.message);
        res.redirect('/mlas/' + req.params.id + '/details');
    }
});

// Get MLA Work
/*
router.get('/:id/work', isAuthenticated, async (req, res) => {
    try {
        const mla = await Mla.findById(req.params.id)
            .select('name constituency state party image rating workDetails')
            .populate({
                path: 'workDetails.createdBy',
                select: 'name email anonName profilePicture',
                options: { lean: true }
            })
            .lean();

        if (!mla) {
            req.flash('error', 'MLA not found');
            return res.redirect('/mlas');
        }

        // Image processing
        try {
            let stored = mla.image || '';
            let filename = stored.startsWith('/uploads/') ? path.basename(stored) : stored;
            if (stored.startsWith('http')) mla.imageUrl = stored;
            else {
                const mlasDir = path.join(__dirname, '../public/uploads/mlas');
                const candidatesDir = path.join(__dirname, '../public/uploads/candidates');
                const checkFile = (fname) => (fs.existsSync(path.join(mlasDir, fname)) ? '/uploads/mlas/' + fname : (fs.existsSync(path.join(candidatesDir, fname)) ? '/uploads/candidates/' + fname : null));
                mla.imageUrl = checkFile(filename) || '/uploads/mlas/default-mla.png';
            }
        } catch (e) { mla.imageUrl = '/uploads/mlas/default-mla.png'; }

        if (mla.workDetails && mla.workDetails.length > 0) {
            mla.workDetails.sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        res.render('mlas/work', {
            mla: mla,
            activeTab: 'work',
            user: req.session.user || null
        });

    } catch (error) {
        console.error('Error in MLA work route:', error);
        req.flash('error', error.message);
        res.redirect('/mlas/' + req.params.id + '/details');
    }
});
*/

// Add work detail
/*
router.post('/:id/work', isAuthenticated, upload.array('images', 5), async (req, res) => {
    try {
        console.log('Received work detail request:', {
            body: req.body,
            files: req.files,
            user: req.session?.user
        });

        // Validate input
        let { title, description, status, location } = req.body;

        title = title ? title.trim() : '';
        description = description ? description.trim() : '';
        status = status ? status.trim() : 'Planned';
        location = location ? location.trim() : '';

        if (!title) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }

        const userId = req.user?._id || req.session?.user?._id;
        if (!userId) {
            return res.status(403).json({ success: false, message: 'Please log in to add work details' });
        }

        const mla = await Mla.findById(req.params.id);

        if (!mla) {
            return res.status(404).json({ success: false, message: 'MLA not found' });
        }

        const workDetail = {
            title,
            description,
            status,
            location,
            date: new Date(),
            createdBy: mongoose.Types.ObjectId(userId),
            lastUpdated: new Date(),
            images: []
        };

        if (req.fileValidationError) {
            return res.status(400).json({ success: false, message: req.fileValidationError });
        }

        // Handle multiple image uploads
        if (req.files && Array.isArray(req.files)) {
            workDetail.images = req.files.map(file => file.filename);
        }

        // Create work detail and save it
        mla.workDetails.push(workDetail);
        await mla.save();

        res.json({ success: true, message: 'Work detail added successfully' });
    } catch (error) {
        console.error('Error creating work detail:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
*/

// Update work detail
/*
router.put('/:id/work/:workId', isAuthenticated, upload.array('images', 5), async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
        const userId = req.user?._id || req.session?.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please log in' });
        }

        let { title, description, status, location, removeImages } = req.body;

        const mla = await Mla.findById(req.params.id);
        if (!mla) return res.status(404).json({ success: false, message: 'MLA not found' });

        const workDetail = mla.workDetails.id(req.params.workId);
        if (!workDetail) return res.status(404).json({ success: false, message: 'Work detail not found' });

        // Authorization check
        if (workDetail.createdBy.toString() !== req.session.user._id.toString() && !req.session.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Update fields
        if (title) workDetail.title = title.trim();
        if (description !== undefined) workDetail.description = description.trim();
        if (status) workDetail.status = status.trim();
        if (location !== undefined) workDetail.location = location.trim();
        workDetail.lastUpdated = new Date();

        // Handle image removals
        if (removeImages) {
            const imagesToRemove = Array.isArray(removeImages) ? removeImages : [removeImages];
            workDetail.images = (workDetail.images || []).filter(img => !imagesToRemove.includes(img));
        }

        // Add new images
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => file.filename);
            workDetail.images = [...(workDetail.images || []), ...newImages];
        }

        await mla.save();
        return res.status(200).json({ success: true, message: 'Work detail updated successfully' });

    } catch (error) {
        console.error('Error updating work detail:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});
*/

// Delete work detail
/*
router.delete('/:id/work/:workId', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user?._id || req.session?.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const mla = await Mla.findById(req.params.id);
        if (!mla) return res.status(404).json({ success: false, message: 'MLA not found' });

        const workDetail = mla.workDetails.id(req.params.workId);
        if (!workDetail) return res.status(404).json({ success: false, message: 'Work detail not found' });

        // Authorization check
        if (workDetail.createdBy.toString() !== req.session.user._id.toString() && !req.session.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Remove work detail
        mla.workDetails.pull(req.params.workId);
        await mla.save();

        res.json({ success: true, message: 'Work detail deleted successfully' });
    } catch (error) {
        console.error('Error deleting work detail:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
*/

// Delete image from work detail
/*
router.delete('/:id/work/:workId/image/:imageName', isAuthenticated, async (req, res) => {
    try {
        const { id, workId, imageName } = req.params;
        const mla = await Mla.findById(id);
        if (!mla) return res.status(404).json({ success: false, message: 'MLA not found' });

        const workDetail = mla.workDetails.id(workId);
        if (!workDetail) return res.status(404).json({ success: false, message: 'Work detail not found' });

        if (workDetail.createdBy.toString() !== req.session.user._id.toString() && !req.session.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Remove image
        const index = workDetail.images.indexOf(imageName);
        if (index > -1) {
            workDetail.images.splice(index, 1);
            await mla.save();

            // Try to delete file
            const fs = require('fs');
            const path = require('path');
            const imagePath = path.join(__dirname, '../public/uploads/work', imageName);
            fs.unlink(imagePath, (err) => {
                if (err) console.error('Error deleting image file:', err);
            });

            res.json({ success: true, message: 'Image deleted' });
        } else {
            res.status(404).json({ success: false, message: 'Image not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
*/

// Mount work routes at the end to avoid conflicts
// Mount work routes at the end to avoid conflicts - REMOVED redundant line
// router.use('/', workRoutes);

module.exports = router;