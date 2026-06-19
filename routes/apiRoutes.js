const express = require('express');
const router = express.Router();
const Mla = require('../models/Mla');
const Mp = require('../models/Mp');

// Get all MLAs
router.get('/mlas', async (req, res) => {
    try {
        const mlas = await Mla.find({})
            .select('name party constituency state image reviews')
            .lean();

        const formattedMlas = mlas.map(mla => ({
            _id: mla._id,
            name: mla.name,
            party: mla.party,
            constituency: mla.constituency,
            state: mla.state,
            imageUrl: mla.image?.startsWith('http') ? mla.image : `/uploads/mlas/${mla.image}`, 
            rating: mla.reviews && mla.reviews.length > 0
                ? Number((mla.reviews.reduce((acc, r) => acc + r.rating, 0) / mla.reviews.length).toFixed(1))
                : 0.0,
            totalReviews: mla.reviews ? mla.reviews.length : 0
        }));

        res.json({ success: true, data: formattedMlas });
    } catch (error) {
        console.error('API Error fetching MLAs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all MPs
router.get('/mps', async (req, res) => {
    try {
        const mps = await Mp.find({})
            .select('name party constituency state image reviews')
            .lean();

        const formattedMps = mps.map(mp => ({
            _id: mp._id,
            name: mp.name,
            party: mp.party,
            constituency: mp.constituency,
            state: mp.state,
            imageUrl: mp.image?.startsWith('http') ? mp.image : `/uploads/candidates/${mp.image}`,
            rating: mp.reviews && mp.reviews.length > 0
                ? Number((mp.reviews.reduce((acc, r) => acc + r.rating, 0) / mp.reviews.length).toFixed(1))
                : 0.0,
            totalReviews: mp.reviews ? mp.reviews.length : 0
        }));

        res.json({ success: true, data: formattedMps });
    } catch (error) {
        console.error('API Error fetching MPs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Single MLA
router.get('/mla/:id', async (req, res) => {
    try {
        const mla = await Mla.findById(req.params.id);
        if(!mla) return res.status(404).json({success: false, message: "MLA not found"});
        res.json({ success: true, data: mla });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Single MP
router.get('/mp/:id', async (req, res) => {
    try {
        const mp = await Mp.findById(req.params.id);
        if(!mp) return res.status(404).json({success: false, message: "MP not found"});
        res.json({ success: true, data: mp });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
