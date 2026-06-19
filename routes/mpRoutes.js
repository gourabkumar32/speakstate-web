const express = require('express');
const router = express.Router();
const Mp = require('../models/Mp');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const mpController = require('../controllers/mpController');
const upload = require('../middleware/workImageUpload');

// Public routes
router.get('/', mpController.getAllMps);
router.get('/:id/json', mpController.getMpJson);
router.get('/:id/details', isAuthenticated, mpController.getMpDetails);
router.get('/:id/complaints', isAuthenticated, mpController.getMpComplaints);
// router.get('/:id/work', isAuthenticated, mpController.getMpWork);
router.get('/:id/reviews', isAuthenticated, mpController.getMpReviews);
router.delete('/:id/reviews/:reviewId', isAuthenticated, mpController.deleteMpReview);

// Protected routes (user authenticated)
router.post('/:id/review', isAuthenticated, mpController.addMpReview);
// router.post('/:id/work', isAuthenticated, upload.array('images', 5), mpController.addMpWork);
// router.put('/:id/work/:workId', isAuthenticated, upload.array('images', 5), mpController.updateMpWork);
// router.delete('/:id/work/:workId', isAuthenticated, mpController.deleteMpWork);
// router.delete('/:id/work/:workId/image/:imageName', isAuthenticated, mpController.deleteMpWorkImage);

// Admin routes
router.post('/', isAdmin, async (req, res) => {
    try {
        const { name, party, state, constituency, description, image } = req.body;
        const mp = new Mp({
            name,
            party,
            state,
            constituency,
            description,
            image: image || 'default-mp.png'
        });
        await mp.save();
        res.json({ success: true, message: 'MP created', mp });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.put('/:id', isAdmin, async (req, res) => {
    try {
        const { name, party, state, constituency, description, image } = req.body;
        const mp = await Mp.findByIdAndUpdate(
            req.params.id,
            { name, party, state, constituency, description, image },
            { new: true }
        );
        res.json({ success: true, message: 'MP updated', mp });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.delete('/:id', isAdmin, async (req, res) => {
    try {
        await Mp.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'MP deleted' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

module.exports = router;
