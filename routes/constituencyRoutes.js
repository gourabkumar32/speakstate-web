const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const State = require('../models/State');
const Constituency = require('../models/Constituency');
const Candidate = require('../models/Candidate');

// Route to render the form for bulk constituency creation
router.get('/bulk-create', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const states = await State.find({});
        res.render('admin/bulk-constituency', { states });
    } catch (error) {
        req.flash('error', 'Error loading states');
        res.redirect('/admin/dashboard');
    }
});

// Route to handle bulk constituency creation
router.post('/bulk-create', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { stateId, constituencies } = req.body;
        
        // Validate state exists
        const state = await State.findById(stateId);
        if (!state) {
            return res.status(400).json({ success: false, message: 'State not found' });
        }

        // Create constituencies
        const constituencyPromises = constituencies.map(async (constituencyData) => {
            const constituency = new Constituency({
                name: constituencyData.name,
                state: stateId,
                candidates: []
            });

            // Create candidates if provided
            if (constituencyData.candidates && constituencyData.candidates.length > 0) {
                const candidatePromises = constituencyData.candidates.map(async (candidateData) => {
                    const candidate = new Candidate({
                        name: candidateData.name,
                        party: candidateData.party,
                        constituency: constituency._id
                    });
                    await candidate.save();
                    return candidate._id;
                });
                
                constituency.candidates = await Promise.all(candidatePromises);
            }

            await constituency.save();
            return constituency;
        });

        await Promise.all(constituencyPromises);

        res.status(200).json({ 
            success: true, 
            message: 'Constituencies and candidates created successfully' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Error creating constituencies and candidates' 
        });
    }
});

module.exports = router; 