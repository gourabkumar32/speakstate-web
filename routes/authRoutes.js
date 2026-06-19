const express = require('express');
const passport = require('passport');
const router = express.Router();
const authController = require('../controllers/authController');
const User = require('../models/User');

// Helper to convert API-style returnTo paths to safe user-facing pages
function normalizeReturnToPath(redirectPath) {
    try {
        if (!redirectPath || typeof redirectPath !== 'string') return redirectPath;
        // If it's an absolute URL, ignore it
        if (redirectPath.startsWith('//') || redirectPath.includes('://')) return '/';

        // Match /states/:stateId/topics/:topicId/news/:newsId/(comment|like)
        const m = redirectPath.match(/\/states\/([^\/]+)\/topics\/([^\/]+)\/news\/([^\/]+)\/(?:comment|like)/i);
        if (m) {
            const stateId = m[1];
            const newsId = m[3];
            return `/states/${stateId}#news-${newsId}`;
        }
        return redirectPath;
    } catch (e) {
        console.error('normalizeReturnToPath error', e);
        return '/';
    }
}

// Login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        // If user is already logged in, redirect to returnTo or default page
        let returnTo = req.query.returnTo || req.session.returnTo || (req.session.user.isAdmin ? '/admin/dashboard' : '/');
        delete req.session.returnTo;
        returnTo = normalizeReturnToPath(returnTo);
        return res.redirect(returnTo);
    }

    // Save returnTo from query string if present
    if (req.query.returnTo) {
        req.session.returnTo = req.query.returnTo;
    }

    console.log('Login Route - Flash Messages:', {
        error: req.flash('error'),
        success: req.flash('success'),
        resLocals: {
            error: res.locals.error,
            success: res.locals.success
        }
    });

    res.render('auth/login', {
        user: null,
        returnTo: req.query.returnTo || req.session.returnTo || ''
    });
});




// Register page
router.get('/register', (req, res) => {
    // If user is already logged in, redirect to appropriate page
    if (req.session.user) {
        if (req.session.user.isAdmin) {
            return res.redirect('/admin/dashboard');
        }
        return res.redirect('/');
    }

    // Debug log for flash messages
    console.log('Register GET - Flash Messages:', {
        error: req.flash('error'),
        success: req.flash('success')
    });

    // Save returnTo from query string if present
    if (req.query.returnTo) {
        req.session.returnTo = req.query.returnTo;
    }

    // Render with any flash messages
    res.render('auth/register', {
        user: null,
        title: 'Register',
        returnTo: req.session.returnTo || ''
    });
});

// Login handler
router.post('/login', authController.login);


// Register handler
router.post('/register', authController.register);

// Logout handler
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/auth/login');
    });
});

// Google OAuth routes
router.get('/google', (req, res, next) => {
    // Store returnTo URL before redirecting to Google
    if (req.query.returnTo) {
        req.session.returnTo = req.query.returnTo;
        // Explicitly save session before redirecting to Google
        req.session.save((err) => {
            if (err) console.error('Session save error before Google auth:', err);
            passport.authenticate('google', {
                scope: ['profile', 'email'],
                prompt: 'select_account'
            })(req, res, next);
        });
    } else {
        passport.authenticate('google', {
            scope: ['profile', 'email'],
            prompt: 'select_account'
        })(req, res, next);
    }
});

router.get('/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/auth/login',
        failureFlash: true
    }),
    async (req, res) => {
        try {
            console.log('Google callback - User:', req.user);

            if (!req.user) {
                console.error('No user object in request');
                req.flash('error', 'Authentication failed');
                return res.redirect('/auth/login');
            }

            // Set session data with correct _id field
            req.session.user = {
                _id: req.user._id.toString(), // Ensure _id is a string
                name: req.user.name,
                email: req.user.email,
                state: req.user.state || 'unknown',
                isAdmin: req.user.isAdmin || false,
                profilePicture: req.user.profilePicture || null,
                anonName: req.user.anonName || null
            };

            console.log('Setting session user:', req.session.user);

            // Get the return URL from session or use default, normalize it
            let returnTo = req.session.returnTo || (req.session.user.isAdmin ? '/admin/dashboard' : '/tweets');
            delete req.session.returnTo;
            returnTo = normalizeReturnToPath(returnTo);

            // Save session explicitly and redirect
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    req.flash('error', 'Failed to complete login');
                    return res.redirect('/auth/login');
                }

                console.log('Session saved successfully, redirecting to:', returnTo);
                res.redirect(returnTo);
            });
        } catch (error) {
            console.error('Google callback error:', error);
            req.flash('error', 'Failed to login with Google');
            res.redirect('/auth/login');
        }
    }
);

module.exports = router;