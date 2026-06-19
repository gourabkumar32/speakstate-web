const State = require('../models/State');

// Public: list all states
exports.listStates = async (req, res) => {
    try {
        const states = await State.find().sort('name');
        // Render the SPA view. Use session user if present so we don't
        // accidentally override `res.locals.user` with an undefined `req.user`.
        return res.render('states/index', { states, user: (req.session && req.session.user) ? req.session.user : (req.user || null) });
    } catch (err) {
        console.error('Error loading states:', err);
        res.status(500).render('error', { message: 'Error loading states', error: err.message });
    }
};

// Public: show topics for a given state
exports.showState = async (req, res) => {
    // Redirect to single-page states view with query param for client-side selection
    try {
        return res.redirect(`/states/single?state=${req.params.stateId}`);
    } catch (err) {
        console.error('Redirect error:', err);
        return res.status(500).render('error', { message: 'Error redirecting to states page', error: err.message });
    }
};

// Public: show topic details/news items
exports.showTopic = async (req, res) => {
    // Redirect to SPA with both state and topic identifiers so client selects them
    try {
        const { stateId, topicId } = req.params;
        return res.redirect(`/states/single?state=${stateId}&topic=${topicId}`);
    } catch (err) {
        console.error('Redirect error:', err);
        return res.status(500).render('error', { message: 'Error redirecting to topic', error: err.message });
    }
};

module.exports = exports;

// Toggle like for a news item (public)
exports.toggleNewsLike = async (req, res) => {
    try {
        const { stateId, topicId, newsId } = req.params;
        const state = await State.findById(stateId);
        if (!state) return res.status(404).json({ success: false, message: 'State not found' });

        const topic = state.topics.id(topicId);
        if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

        const news = topic.infos.id(newsId);
        if (!news) return res.status(404).json({ success: false, message: 'News not found' });

        // Use session id or user id to identify liker
        const identifier = (req.session && req.session.user && req.session.user._id) ? `user_${req.session.user._id}` : `sess_${req.sessionID}`;
        const likedIndex = (news.likedBy || []).indexOf(identifier);
        if (likedIndex === -1) {
            // add like
            news.likedBy.push(identifier);
            news.likes = (news.likes || 0) + 1;
        } else {
            // remove like (toggle)
            news.likedBy.splice(likedIndex, 1);
            news.likes = Math.max(0, (news.likes || 1) - 1);
        }

        await state.save();

        // Emit via Socket.IO
        try { req.app.locals.io.emit('news:like', { stateId, topicId, newsId, likes: news.likes }); } catch (e) { console.warn('Socket emit failed', e); }

        res.json({ success: true, likes: news.likes, liked: likedIndex === -1 });
    } catch (err) {
        console.error('toggleNewsLike error:', err);
        res.status(500).json({ success: false, message: 'Error toggling like' });
    }
};

// Add a comment to a news item (public)
exports.addNewsComment = async (req, res) => {
    try {
        const { stateId, topicId, newsId } = req.params;
        const { text, userName } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ success: false, message: 'Comment text required' });

        const state = await State.findById(stateId);
        if (!state) return res.status(404).json({ success: false, message: 'State not found' });

        const topic = state.topics.id(topicId);
        if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

        const news = topic.infos.id(newsId);
        if (!news) return res.status(404).json({ success: false, message: 'News not found' });

        const commenter = userName || (req.session && req.session.user && (req.session.user.anonName || req.session.user.name)) || 'Anonymous';
        const commentObj = { user: commenter, text: text.trim(), createdAt: new Date() };
        news.comments = news.comments || [];
        news.comments.push(commentObj);

        await state.save();

        // Emit via Socket.IO
        try { req.app.locals.io.emit('news:comment', { stateId, topicId, newsId, comment: commentObj }); } catch (e) { console.warn('Socket emit failed', e); }

        res.json({ success: true, comment: commentObj });
    } catch (err) {
        console.error('addNewsComment error:', err);
        res.status(500).json({ success: false, message: 'Error adding comment' });
    }
};
