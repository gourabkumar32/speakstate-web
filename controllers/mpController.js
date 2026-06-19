const mongoose = require('mongoose');
const Mp = require('../models/Mp');
const User = require('../models/User');
const Tweet = require('../models/Tweet');

// Get all MPs
exports.getAllMps = async (req, res) => {
    try {
        const { search, state, party } = req.query;
        let query = {};

        if (search) {
            const searchRegex = new RegExp(search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
            query.$or = [
                { name: searchRegex },
                { constituency: searchRegex },
                { state: searchRegex },
                { party: searchRegex }
            ];
        }
        if (state) query.state = state;
        if (party) query.party = party;

        // Get states and parties for filters
        const [states, parties] = await Promise.all([
            Mp.distinct('state'),
            Mp.distinct('party')
        ]);

        // Get all MPs with ratings
        const mps = await Mp.find(query)
            .populate('reviews.user', 'name anonName profilePicture')
            .sort({ name: 1 })
            .lean();

        // Calculate ratings for each MP
        const safeMps = mps.map(mp => ({
            ...mp,
            rating: mp.reviews && mp.reviews.length > 0
                ? Number((mp.reviews.reduce((sum, r) => sum + r.rating, 0) / mp.reviews.length).toFixed(1))
                : 0,
            reviewCount: mp.reviews ? mp.reviews.length : 0
        }));

        // Compute imageUrl and thumbnail for each MP to match where admin stores images
        const processedMps = safeMps.map(mp => {
            try {
                let stored = mp.image || '';

                // If it's an absolute uploads path or external URL, use as-is
                if (typeof stored === 'string' && (stored.indexOf('/uploads/') === 0 || stored.indexOf('http') === 0)) {
                    mp.imageUrl = stored;
                    mp.thumb = stored;
                    return mp;
                }

                if (!stored) {
                    mp.imageUrl = '/uploads/candidates/default-mp.png';
                    mp.thumb = mp.imageUrl;
                    return mp;
                }

                const filename = stored;
                const base = filename.slice(0, -require('path').extname(filename).length);
                const thumbFilename = base + '-thumb.webp';
                const thumbFullPath = require('path').join(__dirname, '..', 'public', 'uploads', 'candidates', thumbFilename);

                if (require('fs').existsSync(thumbFullPath)) {
                    mp.thumb = '/uploads/candidates/' + thumbFilename;
                } else {
                    mp.thumb = '/uploads/candidates/' + filename;
                }

                mp.imageUrl = '/uploads/candidates/' + filename;
                return mp;
            } catch (err) {
                console.error('Error computing MP image paths:', err);
                mp.imageUrl = mp.image || '/uploads/candidates/default-mp.png';
                mp.thumb = mp.imageUrl;
                return mp;
            }
        });

        // Group by state
        const mpsByState = {};
        states.forEach(s => { mpsByState[s] = []; });
        processedMps.forEach(mp => {
            if (mpsByState[mp.state]) {
                mpsByState[mp.state].push(mp);
            } else {
                console.log('Warning: MP state mismatch:', mp.state);
            }
        });

        console.log('MP Debug:', {
            totalMPs: processedMps.length,
            statesFound: states.length,
            groupedStates: Object.keys(mpsByState).length,
            sampleState: states[0]
        });

        res.render('mps/index', {
            title: 'MP Tracker',
            mpsByState,
            states,
            parties,
            currentFilters: { search, state, party },
            user: req.session.user || null,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Error fetching MPs');
        res.redirect('/');
    }
};

// Get single MP data (JSON)
exports.getMpJson = async (req, res) => {
    try {
        const mp = await Mp.findById(req.params.id);
        if (!mp) {
            return res.status(404).json({
                success: false,
                message: 'MP not found'
            });
        }
        return res.json({
            success: true,
            mp: mp
        });
    } catch (error) {
        console.error('Error fetching MP:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching MP data'
        });
    }
};

// Get MP details page
// Get MP details page - Redirects to complaints
exports.getMpDetails = async (req, res) => {
    res.redirect(`/mps/${req.params.id}/complaints`);
};

// Get MP Reviews
exports.getMpReviews = async (req, res) => {
    try {
        const mp = await Mp.findById(req.params.id)
            .select('name constituency state party image rating reviews')
            .populate({
                path: 'reviews.user',
                select: 'name anonName profilePicture'
            })
            .lean();

        if (!mp) {
            req.flash('error', 'MP not found');
            return res.redirect('/mps');
        }

        // Image processing
        // Image processing
        try {
            let stored = mp.image || '';
            let filename = stored.startsWith('/uploads/') ? require('path').basename(stored) : stored;

            if (stored.startsWith('http')) {
                mp.imageUrl = stored;
            } else {
                const mlasDir = require('path').join(__dirname, '..', 'public', 'uploads', 'mlas');
                const candidatesDir = require('path').join(__dirname, '..', 'public', 'uploads', 'candidates');
                const checkFile = (fname) => {
                    // Check candidates first for MPs
                    if (require('fs').existsSync(require('path').join(candidatesDir, fname))) return '/uploads/candidates/' + fname;
                    if (require('fs').existsSync(require('path').join(mlasDir, fname))) return '/uploads/mlas/' + fname;
                    return null;
                };
                mp.imageUrl = checkFile(filename) || '/uploads/candidates/default-mp.png';
            }
        } catch (e) { mp.imageUrl = '/uploads/candidates/default-mp.png'; }

        // Process Reviews
        const displayReviews = (mp.reviews || []).map(r => ({
            ...r,
            displayName: r.anonymous ? (r.anonymousName || (r.user && r.user.anonName) || 'Anonymous') : ((r.user && r.user.name) || 'Unknown'),
            displayProfilePicture: r.anonymous ? null : (r.user && r.user.profilePicture ? `/uploads/profiles/${r.user.profilePicture}` : null)
        }));

        displayReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        mp.reviews = displayReviews;

        res.render('mps/reviews', {
            mp: mp,
            activeTab: 'reviews',
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Error in MP reviews:', error);
        req.flash('error', error.message);
        res.redirect('/mps');
    }
};

// Get MP Complaints
exports.getMpComplaints = async (req, res) => {
    try {
        const mp = await Mp.findById(req.params.id)
            .select('name constituency state party image rating')
            .lean();

        if (!mp) {
            req.flash('error', 'MP not found');
            return res.redirect('/mps');
        }

        // Image processing
        try {
            let stored = mp.image || '';
            let filename = stored.startsWith('/uploads/') ? require('path').basename(stored) : stored;
            const checkFile = (fname) => require('fs').existsSync(require('path').join(__dirname, '..', 'public', 'uploads', 'candidates', fname)) ? '/uploads/candidates/' + fname : null;
            mp.imageUrl = (stored.startsWith('http') ? stored : checkFile(filename)) || '/uploads/candidates/default-mp.png';
        } catch (e) { mp.imageUrl = '/uploads/candidates/default-mp.png'; }

        // Fetch complaints
        const complaints = await Tweet.find({ taggedMps: req.params.id })
            .populate('user', 'name profilePicture anonName')
            .sort({ createdAt: -1 })
            .lean();

        const displayComplaints = complaints.map(c => ({
            ...c,
            displayName: c.anonymous ? (c.anonymousName || (c.user && c.user.anonName) || 'Anonymous') : ((c.user && c.user.name) || 'Unknown'),
            displayProfilePicture: c.anonymous ? null : (c.user && c.user.profilePicture ? `/uploads/profiles/${c.user.profilePicture}` : null)
        }));

        res.render('mps/complaints', {
            mp: { ...mp, complaints: displayComplaints },
            activeTab: 'complaints',
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Error in MP complaints:', error);
        req.flash('error', error.message);
        res.redirect('/mps');
    }
};

// Get MP Work
exports.getMpWork = async (req, res) => {
    try {
        const mp = await Mp.findById(req.params.id)
            .select('name constituency state party image rating workDetails')
            .populate({
                path: 'workDetails.createdBy',
                select: 'name email anonName profilePicture',
                options: { lean: true }
            })
            .lean();

        if (!mp) {
            req.flash('error', 'MP not found');
            return res.redirect('/mps');
        }

        // Image
        try {
            let stored = mp.image || '';
            let filename = stored.startsWith('/uploads/') ? require('path').basename(stored) : stored;
            const checkFile = (fname) => require('fs').existsSync(require('path').join(__dirname, '..', 'public', 'uploads', 'candidates', fname)) ? '/uploads/candidates/' + fname : null;
            mp.imageUrl = (stored.startsWith('http') ? stored : checkFile(filename)) || '/uploads/candidates/default-mp.png';
        } catch (e) { mp.imageUrl = '/uploads/candidates/default-mp.png'; }

        if (mp.workDetails && mp.workDetails.length > 0) {
            mp.workDetails.sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        res.render('mps/work', {
            mp: mp,
            activeTab: 'work',
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Error in MP work:', error);
        req.flash('error', error.message);
        res.redirect('/mps');
    }
};

// Add review to MP
exports.addMpReview = async (req, res) => {
    try {
        const mp = await Mp.findById(req.params.id);
        if (!mp) {
            return res.status(404).json({ error: 'MP not found' });
        }

        // Check if user exists in session
        if (!req.session.user || !req.session.user.id) {
            return res.status(401).json({ error: 'Please login to add a review' });
        }

        // Validate review data
        if (!req.body.rating || !req.body.comment) {
            return res.status(400).json({
                error: 'Rating and comment are required'
            });
        }

        // Check if user has already reviewed this MP
        const hasReviewed = mp.reviews.some(review =>
            review.user.toString() === req.session.user.id
        );

        if (hasReviewed) {
            return res.status(400).json({
                error: 'You have already reviewed this MP'
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

        mp.reviews.push(newReview);
        await mp.save();

        // Calculate new average rating
        const averageRating = mp.reviews.reduce((acc, r) => acc + r.rating, 0) / mp.reviews.length;

        return res.status(200).json({
            success: true,
            message: 'Review added successfully',
            review: {
                ...newReview,
                displayName: req.session.user.name || 'Unknown',
                displayProfilePicture: req.session.user.profilePicture ? `/uploads/profiles/${req.session.user.profilePicture}` : null
            },
            newRating: Number(averageRating.toFixed(1)),
            reviewCount: mp.reviews.length
        });

    } catch (error) {
        console.error('Error adding review:', error);
        return res.status(500).json({
            error: 'Error adding review',
            details: error.message
        });
    }
};

// Add work details to MP
exports.addMpWork = async (req, res) => {
    try {
        const { id } = req.params;
        let { title, description, date, location, status } = req.body;

        console.log('Add Work Request:', {
            id,
            body: req.body,
            files: req.files ? req.files.length : 0,
            user: req.session.user
        });

        const mp = await Mp.findById(id);
        if (!mp) {
            console.log('MP not found for add work:', id);
            return res.status(404).json({ success: false, message: 'MP not found' });
        }

        const userId = req.user?._id || req.session?.user?._id;
        if (!userId) {
            console.log('User not authenticated for add work');
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        // Validate Status against Enum
        const validStatuses = ['', 'Needed', 'Planned', 'In Progress', 'Completed', 'Delayed', 'Cancelled', 'On Hold'];
        let workStatus = status || '';
        if (!validStatuses.includes(workStatus)) {
            workStatus = 'Planned'; // Default to Planned if invalid
        }

        const newWork = {
            title,
            description,
            date: date ? new Date(date) : new Date(),
            location,
            status: workStatus,
            images: [],
            createdBy: new mongoose.Types.ObjectId(userId),
            lastUpdated: new Date()
        };

        // Handle uploaded images
        if (req.files && Array.isArray(req.files)) {
            newWork.images = req.files.map(file => file.filename);
        }

        mp.workDetails.push(newWork);
        await mp.save();

        res.json({
            success: true,
            message: 'Work detail added',
            work: newWork
        });
    } catch (error) {
        console.error('Add work error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update work details for MP
exports.updateMpWork = async (req, res) => {
    try {
        const { id, workId } = req.params;
        let { title, description, status, location, removeImages } = req.body;

        const mp = await Mp.findById(id);
        if (!mp) {
            return res.status(404).json({ success: false, message: 'MP not found' });
        }

        const userId = req.user?._id || req.session?.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const workDetail = mp.workDetails.id(workId);
        if (!workDetail) {
            return res.status(404).json({ success: false, message: 'Work detail not found' });
        }

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

        await mp.save();
        res.json({ success: true, message: 'Work detail updated successfully' });
    } catch (error) {
        console.error('Update work error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete work details from MP
exports.deleteMpWork = async (req, res) => {
    try {
        const { id, workId } = req.params;
        const mp = await Mp.findById(id);

        if (!mp) {
            return res.status(404).json({ success: false, message: 'MP not found' });
        }

        const userId = req.user?._id || req.session?.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const work = mp.workDetails.id(workId);
        if (!work) {
            return res.status(404).json({ success: false, message: 'Work not found' });
        }

        work.remove();
        await mp.save();

        res.json({ success: true, message: 'Work deleted' });
    } catch (error) {
        console.error('Delete work error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete image from MP work detail
exports.deleteMpWorkImage = async (req, res) => {
    try {
        const { id, workId, imageName } = req.params;
        const mp = await Mp.findById(id);

        if (!mp) {
            return res.status(404).json({ success: false, message: 'MP not found' });
        }

        const userId = req.user?._id || req.session?.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const workDetail = mp.workDetails.id(workId);
        if (!workDetail) {
            return res.status(404).json({ success: false, message: 'Work detail not found' });
        }

        // Authorization check
        if (workDetail.createdBy.toString() !== req.session.user._id.toString() && !req.session.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Remove image
        const index = workDetail.images.indexOf(imageName);
        if (index > -1) {
            workDetail.images.splice(index, 1);
            await mp.save();

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
        console.error('Delete image error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete MP Review
exports.deleteMpReview = async (req, res) => {
    try {
        const mp = await Mp.findById(req.params.id);

        if (!mp) {
            return res.status(404).json({ success: false, message: 'MP not found' });
        }

        const review = mp.reviews.id(req.params.reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        // Check ownership
        if ((!review.user || review.user.toString() !== req.session.user.id) && !req.session.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Remove review using pull
        mp.reviews.pull(req.params.reviewId);
        await mp.save();

        res.json({ success: true, message: 'Review deleted successfully' });

    } catch (error) {
        console.error('Error deleting MP review:', error);
        res.status(500).json({ success: false, message: 'Error deleting review: ' + error.message });
    }
};
