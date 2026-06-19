const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateAnonName } = require('../utils/anonNames');

const authController = {
    // Login handler
    login: async (req, res) => {
        try {
            const { email, password } = req.body;

            // Save returnTo from form if present
            if (req.body.returnTo) {
                req.session.returnTo = req.body.returnTo;
            }

            // Find user and log details for debugging
            const user = await User.findOne({ email });
            console.log('Login attempt:', { email, userFound: !!user });

            if (!user) {
                req.flash('error', 'Invalid email or password');
                return req.session.save(() => {
                    res.redirect('/auth/login');
                });
            }

            // Check password and log result
            const isMatch = await bcrypt.compare(password, user.password);
            console.log('Password match:', isMatch);

            if (!isMatch) {
                req.flash('error', 'Invalid email or password');
                return req.session.save(() => {
                    res.redirect('/auth/login');
                });
            }


            // Set session with proper _id field and ensure anonName is set
            req.session.user = {
                _id: user._id,
                id: user._id.toString(), // for compatibility if some parts use .id
                name: user.name,
                email: user.email,
                state: user.state,
                isAdmin: user.isAdmin,
                username: user.username,
                anonName: user.anonName || null
            };

            console.log('Session user:', req.session.user);

            // Get the return URL from body (form), session, or use default
            let redirectPath = req.body.returnTo || req.session.returnTo || (user.isAdmin ? '/admin/dashboard' : '/tweets');

            // If returnTo points to an API endpoint (like /like or /comment) convert it
            // to the nearest user-facing page to avoid "Cannot GET" on POST-only routes.
            try {
                if (typeof redirectPath === 'string') {
                    const apiMatch = redirectPath.match(/^(\/states\/([^\/]+)\/topics\/([^\/]+)\/news\/([^\/]+)\/)\b(?:comment|like)\b/i);
                    if (apiMatch) {
                        const stateId = apiMatch[2];
                        const topicId = apiMatch[3];
                        const newsId = apiMatch[4];
                        // Redirect to the state page (user will see topics); include a hash to help client scroll
                        redirectPath = `/states/${stateId}#news-${newsId}`;
                    }
                }
            } catch (e) {
                console.error('Error normalizing returnTo path:', e);
            }

            // Security check: ensure redirectPath is a valid internal URL
            const finalRedirectPath = (typeof redirectPath === 'string' && (redirectPath.startsWith('//') || redirectPath.includes('://'))) ?
                '/' : // Reset to home if it's an external URL
                redirectPath;

            // Clear the returnTo from session and redirect without flashing welcome message
            delete req.session.returnTo;
            return req.session.save(() => {
                res.redirect(finalRedirectPath);
            });




        } catch (error) {
            console.error('Login error:', error);
            req.flash('error', 'Login failed');
            return req.session.save(() => {
                res.redirect('/auth/login');
            });
        }
    },

    // Register handler
    register: async (req, res) => {
        try {
            const { name, email, password, state } = req.body;

            // Validate required fields
            if (!name || !email || !password || !state) {
                req.flash('error', 'All fields are required');
                return res.redirect('/auth/register');
            }

            // Check if user already exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                console.log('Registration failed: Email already exists -', email);
                // Set flash message
                req.flash('error', 'This email is already registered. Please try logging in or use a different email.');

                // Save session before redirect to ensure flash message persists
                return new Promise((resolve, reject) => {
                    req.session.save(err => {
                        if (err) {
                            console.error('Session save error:', err);
                            reject(err);
                            return;
                        }
                        console.log('Session saved, flash message should persist');
                        res.redirect('/auth/register');
                        resolve();
                    });
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            // Generate a persistent anonymous handle for the new user
            const anonName = generateAnonName();
            const user = new User({
                name,
                email,
                password: hashedPassword,
                state,
                anonName
            });

            try {
                await user.save();
                console.log('New user registered successfully:', email);

                // Set user in session after successful registration (include anonName)
                req.session.user = {
                    _id: user._id,
                    id: user._id.toString(),
                    name: user.name,
                    email: user.email,
                    state: user.state,
                    isAdmin: user.isAdmin,
                    username: user.username,
                    anonName: user.anonName
                };

                // Add success flash message
                req.flash('success', 'Registration successful! Welcome to the platform.');

                // Save session and redirect
                return req.session.save(() => {
                    // Check for returnTo in body (from form) or session
                    let redirectPath = req.body.returnTo || req.session.returnTo || '/profile';
                    delete req.session.returnTo; // Clean up session

                    // Normalize path and ensure it's internal
                    try {
                        if (redirectPath.startsWith('//') || redirectPath.includes('://')) {
                            redirectPath = '/profile';
                        }
                    } catch (e) {
                        redirectPath = '/profile';
                    }

                    res.redirect(redirectPath);
                });
            } catch (saveError) {
                console.error('Error saving new user:', saveError);
                req.flash('error', 'Registration failed. Please try again.');
                return req.session.save(() => {
                    res.redirect('/auth/register');
                });
            }

            // (Older fallback path removed; session already set above after save)

        } catch (error) {
            console.error('Registration error:', error);
            let errorMessage = 'Registration failed. ';

            // Add specific error messages based on the error type
            if (error.name === 'ValidationError') {
                errorMessage += 'Please check all required fields.';
            } else if (error.code === 11000) { // Duplicate key error
                errorMessage += 'This email is already registered.';
            } else {
                errorMessage += 'Please try again.';
            }

            req.flash('error', errorMessage);
            return req.session.save(() => {
                res.redirect('/auth/register');
            });
        }
    },

    // Logout handler
    logout: (req, res) => {
        req.session.destroy(err => {
            if (err) console.error('Logout error:', err);
            res.redirect('/auth/login');
        });
    }
};

module.exports = authController;