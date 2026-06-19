const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { isAuthenticated } = require('../middleware/auth');
const likeController = require('../controllers/likeController');

// Toggle like on a tweet
router.post('/:id/like', isAuthenticated, likeController.toggleLike);

module.exports = router;