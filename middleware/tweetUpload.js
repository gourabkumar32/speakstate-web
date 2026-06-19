const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'public/uploads/tweets';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const fileFilter = function (req, file, cb) {
    // Accept images and videos
    const isImageMime = file.mimetype && file.mimetype.toLowerCase().startsWith('image/');
    const isVideoMime = file.mimetype && file.mimetype.toLowerCase().startsWith('video/');

    // Fallback extensions
    const ext = path.extname(file.originalname || '').toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.heic', '.heif', '.bmp', '.tiff'];
    const videoExts = ['.mp4', '.webm', '.ogg', '.mov', '.qt', '.avi', '.mkv'];

    const hasImageExt = ext && imageExts.includes(ext);
    const hasVideoExt = ext && videoExts.includes(ext);

    if (isImageMime || isVideoMime || hasImageExt || hasVideoExt) {
        return cb(null, true);
    }

    // Friendly validation message
    req.fileValidationError = 'Only image and video files are allowed.';
    return cb(null, false);
};

const uploadMiddleware = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
        files: 10 // Maximum 10 files
    },
    fileFilter: fileFilter
});

module.exports = uploadMiddleware.array('media', 10); // Using 'media' field name to match the form
