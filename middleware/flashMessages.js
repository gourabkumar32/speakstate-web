module.exports = (req, res, next) => {
    // Clear previous flash messages
    res.locals.messages = {
        success: req.flash('success'),
        error: req.flash('error')
    };
    next();
}; 