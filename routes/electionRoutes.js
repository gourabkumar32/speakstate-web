const express = require('express');
const router = express.Router();
const electionController = require('../controllers/electionController');
const { isAuthenticated } = require('../middleware/auth');

// Public election routes (no authentication required)
// Explicitly set these routes as public by adding a middleware that just calls next()
const publicRoute = (req, res, next) => next();

router.get('/', publicRoute, electionController.getHome);
router.get('/list', publicRoute, electionController.getAllElections);
router.get('/state/:state', publicRoute, electionController.getElectionsByState);
router.get('/candidate/:id', publicRoute, electionController.getCandidateDetails);
router.get('/:id', publicRoute, electionController.getElectionDetails);
router.get('/candidate/:id/reviews', publicRoute, electionController.getReviews);

// Protected routes (require authentication)
router.post('/vote', isAuthenticated, electionController.castVote);
router.post('/candidate/:id/reviews', isAuthenticated, electionController.addReview);

module.exports = router;