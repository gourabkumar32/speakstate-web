const mongoose = require('mongoose');
const Tweet = require('../models/Tweet');
const User = require('../models/User');
const { generateAnonName } = require('../utils/anonNames');

async function toggleLike(req, res) {
    try {
        const tweetId = req.params.id;
        const userId = req.session.user._id;
        const { anonymous } = req.body;

        const tweet = await Tweet.findById(tweetId);
        if (!tweet) {
            return res.status(404).json({ success: false, error: 'Tweet not found' });
        }

    // Check if user has already liked the tweet
    const existingLike = tweet.likes.find(like => like.user && like.user.equals ? like.user.equals(userId) : false);
        
        if (existingLike) {
            // Unlike the tweet
            tweet.likes = tweet.likes.filter(like => !like.user.equals(userId));
            await tweet.save();
            return res.json({
                success: true,
                liked: false,
                likeCount: tweet.likes.length
            });
        }

    // Like the tweet - default to anonymous unless explicitly turned off
    const isAnonymous = !(anonymous === 'off' || anonymous === false || anonymous === 'false' || anonymous === '0');
        
        // Get or generate anonymous name if needed
        let anonymousName = null;
        if (isAnonymous) {
            const user = await User.findById(userId);
            anonymousName = user.anonName;
            if (!anonymousName) {
                anonymousName = generateAnonName();
                user.anonName = anonymousName;
                await user.save();
                req.session.user.anonName = anonymousName;
            }
        }

        // Add new like (ensure user ObjectId set correctly)
        tweet.likes.push({
            user: mongoose.Types.ObjectId(userId),
            anonymous: isAnonymous,
            anonymousName,
            createdAt: new Date()
        });

        await tweet.save();

        return res.json({
            success: true,
            liked: true,
            likeCount: tweet.likes.length,
            displayName: isAnonymous ? anonymousName : ((req.session.user && req.session.user.anonName) || (req.session.user && req.session.user.name))
        });
    } catch (error) {
        console.error('Error toggling like:', error);
        return res.status(500).json({
            success: false,
            error: 'Error processing like'
        });
    }
}

module.exports = {
    toggleLike
};