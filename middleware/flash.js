module.exports = (req, res, next) => {
    // Only process flash messages for non-static asset requests
    if (req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path.startsWith('/uploads/') || req.path.startsWith('/google.png') || req.path.startsWith('/twitter.png') || req.path.startsWith('/favicon.jpg') || req.path.startsWith('/abt.png')) {
        return next();
    }
    
    const successMessages = req.flash('success');
    const errorMessages = req.flash('error');
    const infoMessages = req.flash('info');
    
    console.log('Flash Middleware - Setting res.locals:', {
        path: req.path,
        success: successMessages,
        error: errorMessages,
        info: infoMessages
    });
    
    res.locals.success = successMessages;
    res.locals.error = errorMessages;
    res.locals.info = infoMessages;
    
    next();
}; 