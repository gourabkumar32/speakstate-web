const express = require('express');
const router = express.Router();
const stateController = require('../controllers/stateController');
const { isAuthenticated } = require('../middleware/auth');
const State = require('../models/State');

// GET /states - list of states
router.get('/', stateController.listStates);
// JSON endpoints for SPA usage
// GET /states/json - list states as JSON
router.get('/json', async (req, res) => {
	try {
		const states = await State.find().sort('name');
		res.json({ success: true, states });
	} catch (err) {
		console.error('Error fetching states JSON:', err);
		res.status(500).json({ success: false, message: 'Error fetching states' });
	}
});

// GET /states/:stateId/json - full state document as JSON
router.get('/:stateId/json', async (req, res) => {
	try {
		const state = await State.findById(req.params.stateId);
		if (!state) return res.status(404).json({ success: false, message: 'State not found' });
		res.json({ success: true, state });
	} catch (err) {
		console.error('Error fetching state JSON:', err);
		res.status(500).json({ success: false, message: 'Error fetching state' });
	}
});

// GET /states/:stateId/topics/:topicId - show topic details
router.get('/:stateId/topics/:topicId', stateController.showTopic);

// GET /states/:stateId - show topics for a state
router.get('/:stateId', stateController.showState);

// Single-page SPA view: /states/single
router.get('/single', (req, res) => {
	try {
		// Prefer the session user when available so the header partial
		// receives the authenticated user consistently.
		return res.render('states/index', { user: (req.session && req.session.user) ? req.session.user : (req.user || null) });
	} catch (err) {
		console.error('Error rendering singlepage:', err);
		return res.status(500).render('error', { message: 'Error loading page', error: err.message });
	}
});

// Public endpoints for likes and comments (used by realtime client)
router.post('/:stateId/topics/:topicId/news/:newsId/like', isAuthenticated, require('../controllers/stateController').toggleNewsLike);
router.post('/:stateId/topics/:topicId/news/:newsId/comment', isAuthenticated, require('../controllers/stateController').addNewsComment);

module.exports = router;
