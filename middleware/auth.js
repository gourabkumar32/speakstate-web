const jwt = require('jsonwebtoken');
const User = require('../models/User');

const isAuthenticated = async (req, res, next) => {
    console.log('Auth Check - Session:', {
        hasSession: !!req.session,
        sessionUser: req.session?.user,
        passportUser: req.user,
        path: req.path
    });

    // Paths that don’t require login
    const publicPaths = [
        '/auth/login',
        '/auth/register',
        '/',
        '/auth/google',
        '/auth/google/callback',
        '/favicon.ico',
        '/css',
        '/js',
        '/images'
    ];

    // Allow static/public files
    const isPublicPath = publicPaths.some(path =>
        req.originalUrl === path ||
        req.originalUrl.startsWith(`${path}/`) ||
        req.originalUrl.match(/\.(css|js|jpg|png|ico)$/)
    );

    if (isPublicPath) {
        return next();
    }

    // Protected routes
    const protectedPaths = ['/mlas', '/tweets', '/elections'];
    const needsAuth = protectedPaths.some(path => req.originalUrl.startsWith(path));

    if (!needsAuth && req.method === 'GET') {
        return next();
    }

    // Check if logged in
    const loggedInUser = req.session?.user || req.user;
    if (!loggedInUser) {
        console.log('User not authenticated, saving returnTo:', req.originalUrl);

        if (!req.xhr && !req.headers.accept?.includes('application/json')) {
            req.session.returnTo = req.originalUrl;
        }

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ success: false, message: 'Please log in to continue' });
        }

        req.flash('error', 'Please log in to continue');
        return res.redirect('/auth/login');
    }

    // If Passport user exists but no session user → sync
    if (req.user && !req.session.user) {
        req.session.user = {
            _id: req.user._id.toString(),
            id: req.user._id.toString(),
            name: req.user.name,
            email: req.user.email,
            state: req.user.state || 'unknown',
            isAdmin: req.user.isAdmin || false,
            profilePicture: req.user.profilePicture
        };
    }

    try {
        // Refresh user data from DB
        const user = await User.findById(req.session.user._id);
        if (!user) {
            req.session.destroy();

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({ success: false, message: 'Invalid session' });
            }

            req.flash('error', 'Please log in again');
            return res.redirect('/auth/login');
        }

        req.session.user = {
            _id: user._id,
            id: user._id.toString(), // Controllers expect .id (string)
            name: user.name,
            email: user.email,
            state: user.state,
            isAdmin: user.isAdmin,
            username: user.username,
            anonName: user.anonName || null,
            profilePicture: user.profilePicture || null // Consistency with authController
        };

        req.user = req.session.user;
        return next();
    } catch (error) {
        console.error('Error in auth middleware:', error);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: 'Authentication error' });
        }

        req.flash('error', 'An error occurred. Please try again.');
        return res.redirect('/auth/login');
    }
};

const isAdmin = (req, res, next) => {
    if (!req.session.user || !req.session.user.isAdmin) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        req.flash('error', 'Admin access required');
        return res.redirect('/');
    }
    next();
};

module.exports = {
    isAuthenticated,
    isAdmin
};
