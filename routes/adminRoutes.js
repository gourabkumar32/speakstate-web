const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const State = require('../models/State');
const Candidate = require('../models/Candidate');
const Constituency = require('../models/Constituency');
const multer = require('multer');
const sharp = require('sharp');
const Mla = require('../models/Mla');
const Mp = require('../models/Mp');
const path = require('path');
const fs = require('fs');

// Configure multer storage for candidate/MP/MLA images (default)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads/candidates');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'candidate-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Dedicated storage for MLA images (stored under public/uploads/mlas)
const mlaStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads/mlas');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'mla-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Apply authentication middleware to all routes
router.use(isAuthenticated);
router.use(isAdmin);

// Admin routes
router.get('/dashboard', adminController.getDashboard);

// DEBUG: render admin state-topics view with a sample state (unprotected) to verify template
router.get('/__debug/state-topics', async (req, res) => {
    try {
        // try to find any state, fallback to a dummy
        const state = await State.findOne() || { _id: 'debug-state', name: 'Debug State', topics: [] };
        res.render('admin/state-topics', { state, user: req.user, messages: { success: [], error: [] } });
    } catch (err) {
        console.error('Debug route error:', err);
        res.status(500).send('Error rendering debug page');
    }
});

// DEBUG: return on-disk source of the admin state-topics template for verification
router.get('/__view-source/state-topics', (req, res) => {
    try {
        const viewPath = path.join(__dirname, '../views/admin/state-topics.ejs');
        if (!fs.existsSync(viewPath)) return res.status(404).send('Template not found on disk: ' + viewPath);
        const contents = fs.readFileSync(viewPath, 'utf8');
        res.set('Content-Type', 'text/plain; charset=utf-8');
        return res.send(contents);
    } catch (err) {
        console.error('Error reading template source:', err);
        return res.status(500).send('Error reading template source');
    }
});

// Get all states
router.get('/states', async (req, res) => {
    try {
        const states = await State.find().sort('name');
        res.json({ success: true, states });
    } catch (error) {
        console.error('Error fetching states:', error);
        res.status(500).json({ success: false, message: 'Error fetching states' });
    }
});

// Use the upload middleware from the controller
router.post('/elections', adminController.uploadMultiple, adminController.createElection);
router.post('/candidates', adminController.uploadSingle, adminController.addCandidate);
router.post('/constituencies', adminController.createConstituency);
router.post('/states', adminController.addState);

// Delete a state and its related data
router.delete('/states/:stateId', adminController.deleteState);

// Admin JSON for a single state (for admin UI)
router.get('/states/:stateId/json', adminController.getStateJson);

// Admin full-page editor for a state's topics/news
router.get('/states/:stateId/topics', adminController.renderStateTopicsAdmin);

// Topics and topic news management (admin)
// Allow topic creation with optional image (field name: 'image')
router.post('/states/:stateId/topics', adminController.uploadNewsSingle, adminController.addTopic);
router.put('/states/:stateId/topics/:topicId', adminController.updateTopic);
router.delete('/states/:stateId/topics/:topicId', adminController.deleteTopic);

// News endpoints accept an optional image upload (field name: 'image')
router.post('/states/:stateId/topics/:topicId/news', adminController.uploadNewsSingle, adminController.addTopicNews);
router.put('/states/:stateId/topics/:topicId/news/:newsId', adminController.uploadNewsSingle, adminController.updateTopicNews);
router.delete('/states/:stateId/topics/:topicId/news/:newsId', adminController.deleteTopicNews);

router.post('/elections/:id/toggle', adminController.toggleElectionStatus);
router.delete('/elections/:id', adminController.deleteElection);
router.get('/candidates/:id', adminController.getCandidate);
router.put('/candidates/:id', adminController.uploadSingle, adminController.updateCandidate);
router.delete('/candidates/:id', adminController.deleteCandidate);
router.delete('/elections/:electionId/constituencies/:constituencyId', adminController.deleteConstituency);

// Add new route for bulk constituency form
router.get('/bulk-constituency', async (req, res) => {
    try {
        const states = await State.find({});
        res.render('admin/bulk-constituency', {
            states,
            user: req.user,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        req.flash('error', 'Error loading states');
        res.redirect('/admin/dashboard');
    }
});

// Handle bulk constituency creation
router.post('/bulk-constituency', async (req, res) => {
    try {
        const { stateId, constituencies } = req.body;

        // Validate state exists
        const state = await State.findById(stateId);
        if (!state) {
            return res.status(400).json({ success: false, message: 'State not found' });
        }

        // Create constituencies
        for (const constituencyData of constituencies) {
            const constituency = new Constituency({
                name: constituencyData.name,
                state: stateId,
                election: constituencyData.election // Add election ID from your existing system
            });

            // Create candidates if provided
            if (constituencyData.candidates && constituencyData.candidates.length > 0) {
                for (const candidateData of constituencyData.candidates) {
                    const candidate = new Candidate({
                        name: candidateData.name,
                        party: candidateData.party,
                        constituency: constituency._id,
                        election: constituencyData.election, // Add election ID
                        image: '/images/default-candidate.jpg' // Add default image or handle image upload
                    });
                    await candidate.save();
                    constituency.candidates.push(candidate._id);
                }
            }

            await constituency.save();
            state.constituencies.push(constituency._id);
        }

        await state.save();

        res.status(200).json({
            success: true,
            message: 'Constituencies and candidates created successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error creating constituencies and candidates'
        });
    }
});

// Configure multer upload using the storage configuration defined above
const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Accept images only — allow webp, avif, svg and common image extensions
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// MLA-specific upload instance
const mlaUpload = multer({
    storage: mlaStorage,
    fileFilter: function (req, file, cb) {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

router.get('/mlas', async (req, res) => {
    const mlas = await Mla.find();

    // Compute thumbnail and image path for each MLA (server-side) to avoid broken thumbs
    const processedMlas = mlas.map(doc => {
        const mla = doc.toObject();
        try {
            const raw = doc.get('image', null, { getters: false });
            let filename = raw || '';

            if (!filename) {
                mla.thumbnail = '/uploads/mlas/default-mla.png';
                mla.imagePath = '/uploads/mlas/default-mla.png';
                mla.image = '/uploads/mlas/default-mla.png'; // Override for template
                return mla;
            }

            // If filename is already a path, extract basename
            if (filename.startsWith('/uploads/')) {
                filename = path.basename(filename);
            }

            // Remove -opt suffix if present to find the base name for thumbnail
            let base = filename;
            const ext = path.extname(filename);
            if (base.endsWith('-opt' + ext)) {
                base = base.slice(0, -('-opt' + ext).length);
            } else {
                base = base.slice(0, -ext.length);
            }

            const thumbFilename = base + '-thumb.webp';

            // Check existence in both 'mlas' and 'candidates' folders
            const mlasDir = path.join(__dirname, '../public/uploads/mlas');
            const candidatesDir = path.join(__dirname, '../public/uploads/candidates');

            // helper to find file
            const checkFile = (fname) => {
                if (fs.existsSync(path.join(mlasDir, fname))) return '/uploads/mlas/' + fname;
                if (fs.existsSync(path.join(candidatesDir, fname))) return '/uploads/candidates/' + fname;
                return null;
            };

            // Resolve thumbnail
            let thumbPath = checkFile(thumbFilename);
            if (!thumbPath) {
                // Fallback to main image as thumbnail if specific thumb not found
                thumbPath = checkFile(filename);
            }

            // Resolve main image
            let mainPath = checkFile(filename);

            // Final fallback
            if (!thumbPath) thumbPath = '/uploads/mlas/default-mla.png';
            if (!mainPath) mainPath = '/uploads/mlas/default-mla.png';

            mla.thumbnail = thumbPath;
            mla.imagePath = mainPath;
            mla.image = mainPath;

            return mla;
        } catch (err) {
            console.error('Error computing MLA thumb in admin list:', err);
            mla.thumbnail = mla.image || '/uploads/mlas/default-mla.png';
            mla.imagePath = mla.thumbnail;
            return mla;
        }
    });

    res.render('admin/mlas', {
        mlas: processedMlas,
        user: req.session.user,
        success: req.flash('success'),
        error: req.flash('error')
    });
});

/*

router.post('/mlas', mlaUpload.single('image'), async (req, res) => {
    try {
        // Log detailed file information
        console.log('Creating new MLA with file:', {
            file: req.file,
            body: req.body
        });

        // Construct image path
        const imageName = req.file ? req.file.filename : 'default-mla.png';
        console.log('Image name to be saved:', imageName);

        const mla = new Mla({
            name: req.body.name,
            party: req.body.party,
            state: req.body.state,
            constituency: req.body.constituency,
            image: imageName, // Save just the filename
            description: req.body.description
        });
        
        // Log the image path that will be used
        console.log('MLA image path:', req.file ? `/uploads/mlas/${req.file.filename}` : '/uploads/mlas/default-mla.png');
        await mla.save();
        req.flash('success', 'MLA added successfully');
        res.redirect('/admin/mlas');
    } catch (error) {
        req.flash('error', 'Error adding MLA');
        res.redirect('/admin/mlas');
    }
});*/

router.post('/mlas', mlaUpload.single('image'), async (req, res) => {
    try {
        console.log('Creating new MLA with file:', {
            file: req.file,
            body: req.body
        });

        let storedImageName = 'default-mla.png';

        if (req.file) {
            try {
                const originalPath = req.file.path;
                const dir = path.dirname(originalPath);

                // create optimized filename with -opt suffix to avoid Sharp input/output conflict
                const baseName = path.basename(req.file.filename, path.extname(req.file.filename));
                const optimizedFilename = baseName + '-opt.webp';
                const optimizedPath = path.join(dir, optimizedFilename);

                // Aggressive optimization: resize, compress, and convert to WebP
                // Using -opt.webp ensures output filename differs from any uploaded .webp input
                await sharp(originalPath)
                    .rotate() // Auto-rotate based on EXIF
                    .resize(600, 800, {
                        fit: 'cover',
                        withoutEnlargement: true
                    })
                    .webp({ quality: 60, alphaQuality: 80 }) // More aggressive compression
                    .toFile(optimizedPath);

                // Also create a small thumbnail for listing pages
                const thumbFilename = baseName + '-thumb.webp';
                const thumbPath = path.join(dir, thumbFilename);
                await sharp(originalPath)
                    .rotate()
                    .resize(300, 400, { fit: 'cover', withoutEnlargement: true })
                    .webp({ quality: 50 })
                    .toFile(thumbPath);

                // Get file size for logging
                const stats = await fs.promises.stat(optimizedPath);
                console.log(`Optimized MLA image: ${optimizedFilename} (${Math.round(stats.size / 1024)}KB)`);

                // Remove original file
                await fs.promises.unlink(originalPath).catch(err => {
                    console.error('Error deleting original MLA image:', err);
                });

                storedImageName = (optimizedFilename && typeof optimizedFilename === 'string' ? optimizedFilename.trim() : optimizedFilename);
            } catch (imgError) {
                console.error('Error processing MLA image:', imgError);
                req.flash('error', 'Error processing image. Please try again.');
                return res.redirect('/admin/mlas');
            }
        }

        const mla = new Mla({
            name: req.body.name,
            party: req.body.party,
            state: req.body.state,
            constituency: req.body.constituency,
            image: storedImageName,
            description: req.body.description
        });

        await mla.save();
        req.flash('success', 'MLA added successfully');
        res.redirect('/admin/mlas');
    } catch (error) {
        console.error('Error adding MLA:', error);
        req.flash('error', 'Error adding MLA');
        res.redirect('/admin/mlas');
    }
});


// Delete MLA
/*
router.delete('/mlas/:id', async (req, res) => {
    try {
        const mla = await Mla.findByIdAndDelete(req.params.id);
        if (!mla) {
            return res.status(404).json({ success: false, message: 'MLA not found' });
        }
        
        // Delete the image file
        const imagePath = path.join(__dirname, '../public', mla.image);
        fs.unlink(imagePath, (err) => {
            if (err) console.error('Error deleting image:', err);
        });
        
        res.json({ success: true, message: 'MLA deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting MLA' });
    }
});
*/
router.delete('/mlas/:id', async (req, res) => {
    try {
        const mla = await Mla.findByIdAndDelete(req.params.id);
        if (!mla) {
            return res.status(404).json({ success: false, message: 'MLA not found' });
        }

        // Delete MLA image and thumbnail if not default
        const rawImage = mla.get('image', null, { getters: false });
        if (rawImage && rawImage !== 'default-mla.png') {
            const imagePath = path.join(__dirname, '../public/uploads/mlas', rawImage);
            const thumbPath = path.join(__dirname, '../public/uploads/mlas', rawImage.replace(path.extname(rawImage), '') + '-thumb.webp');
            await fs.promises.unlink(imagePath).catch(err => {
                console.error('Error deleting MLA image:', err);
            });
            await fs.promises.unlink(thumbPath).catch(err => {
                // ignore if thumb not present
            });
        }

        res.json({ success: true, message: 'MLA deleted successfully' });
    } catch (error) {
        console.error('Error deleting MLA:', error);
        res.status(500).json({ success: false, message: 'Error deleting MLA' });
    }
});


// Get MLA edit form
router.get('/mlas/:id/edit', async (req, res) => {
    try {
        const mla = await Mla.findById(req.params.id);
        if (!mla) {
            req.flash('error', 'MLA not found');
            return res.redirect('/admin/mlas');
        }

        res.render('admin/editMla', {
            mla,
            user: req.session.user,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        console.error('Error fetching MLA:', error);
        req.flash('error', 'Error fetching MLA details');
        res.redirect('/admin/mlas');
    }
});

// Update MLA
/*
router.post('/mlas/:id/edit', mlaUpload.single('image'), async (req, res) => {
    try {
        const mla = await Mla.findById(req.params.id);
        if (!mla) {
            req.flash('error', 'MLA not found');
            return res.redirect('/admin/mlas');
        }

        // Update fields
        mla.name = req.body.name;
        mla.party = req.body.party;
        mla.state = req.body.state;
        mla.constituency = req.body.constituency;
        mla.description = req.body.description;

        // Update image if new one is uploaded
        if (req.file) {
            // Delete old image if it's not the default image
            if (mla.image !== 'default-mla.png') {
                const oldImagePath = path.join(__dirname, '../public/uploads/candidates', mla.image);
                fs.unlink(oldImagePath, err => {
                    if (err) console.error('Error deleting old image:', err);
                });
            }
            
            mla.image = req.file.filename; // Store just the filename
        }

        await mla.save();
        req.flash('success', 'MLA updated successfully');
        res.redirect('/admin/mlas');
    } catch (error) {
        console.error('Error updating MLA:', error);
        req.flash('error', 'Error updating MLA');
        res.redirect(`/admin/mlas/${req.params.id}/edit`);
    }
});
*/

router.post('/mlas/:id/edit', upload.single('image'), async (req, res) => {
    try {
        const mla = await Mla.findById(req.params.id);
        if (!mla) {
            req.flash('error', 'MLA not found');
            return res.redirect('/admin/mlas');
        }

        mla.name = req.body.name;
        mla.party = req.body.party;
        mla.state = req.body.state;
        mla.constituency = req.body.constituency;
        mla.description = req.body.description;

        if (req.file) {
            try {
                // Delete old image + thumbnail if not default
                const rawOld = mla.get('image', null, { getters: false });
                if (rawOld && rawOld !== 'default-mla.png') {
                    const oldImagePath = path.join(__dirname, '../public/uploads/mlas', rawOld);
                    const oldThumbPath = path.join(__dirname, '../public/uploads/mlas', rawOld.replace(path.extname(rawOld), '') + '-thumb.webp');
                    await fs.promises.unlink(oldImagePath).catch(err => {
                        console.error('Error deleting old MLA image:', err);
                    });
                    await fs.promises.unlink(oldThumbPath).catch(err => {
                        // it's okay if thumb doesn't exist
                    });
                }

                const originalPath = req.file.path;
                const dir = path.dirname(originalPath);
                const baseName = path.basename(req.file.filename, path.extname(req.file.filename));
                const optimizedFilename = baseName + '-opt.webp';
                const optimizedPath = path.join(dir, optimizedFilename);

                // Aggressive optimization: resize, compress, and convert to WebP
                // Using -opt.webp ensures output filename differs from any uploaded .webp input
                await sharp(originalPath)
                    .rotate() // Auto-rotate based on EXIF
                    .resize(600, 800, {
                        fit: 'cover',
                        withoutEnlargement: true
                    })
                    .webp({ quality: 60, alphaQuality: 80 }) // More aggressive compression
                    .toFile(optimizedPath);

                // Also create thumbnail
                const thumbFilename = baseName + '-thumb.webp';
                const thumbPath = path.join(dir, thumbFilename);
                await sharp(originalPath)
                    .rotate()
                    .resize(300, 400, { fit: 'cover', withoutEnlargement: true })
                    .webp({ quality: 50 })
                    .toFile(thumbPath);

                // Get file size for logging
                const stats = await fs.promises.stat(optimizedPath);
                console.log(`Optimized MLA image: ${optimizedFilename} (${Math.round(stats.size / 1024)}KB)`);

                // Remove original file
                await fs.promises.unlink(originalPath).catch(err => {
                    console.error('Error deleting original MLA image on update:', err);
                });

                mla.image = (optimizedFilename && typeof optimizedFilename === 'string' ? optimizedFilename.trim() : optimizedFilename);
            } catch (imgError) {
                console.error('Error processing MLA image:', imgError);
                req.flash('error', 'Error processing image. Please try again.');
                return res.redirect(`/admin/mlas/${req.params.id}/edit`);
            }
        }

        await mla.save();
        req.flash('success', 'MLA updated successfully');
        res.redirect('/admin/mlas');
    } catch (error) {
        console.error('Error updating MLA:', error);
        req.flash('error', 'Error updating MLA');
        res.redirect(`/admin/mlas/${req.params.id}/edit`);
    }
});

// ===== MP MANAGEMENT ROUTES =====

// List of Indian States
const INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
    "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

// Get all MPs
router.get('/mps', async (req, res) => {
    const mps = await Mp.find();
    res.render('admin/mps', {
        mps,
        states: INDIAN_STATES,
        user: req.session.user,
        success: req.flash('success'),
        error: req.flash('error')
    });
});

// Create new MP
router.post('/mps', upload.single('image'), async (req, res) => {
    try {
        console.log('Creating new MP with file:', {
            file: req.file,
            body: req.body
        });

        let storedImageName = 'default-mp.png';

        if (req.file) {
            try {
                const originalPath = req.file.path;
                const dir = path.dirname(originalPath);

                console.log('Processing MP image:', {
                    originalPath,
                    fileName: req.file.filename,
                    mimeType: req.file.mimetype
                });

                const baseName = path.basename(req.file.filename, path.extname(req.file.filename));
                const optimizedFilename = baseName + '-opt.webp';
                const optimizedPath = path.join(dir, optimizedFilename);

                // Aggressive optimization: resize, compress, and convert to WebP
                // Using -opt.webp ensures output filename differs from any uploaded .webp input
                await sharp(originalPath)
                    .rotate() // Auto-rotate based on EXIF
                    .resize(600, 800, {
                        fit: 'cover',
                        withoutEnlargement: true
                    })
                    .webp({ quality: 60, alphaQuality: 80 }) // More aggressive compression
                    .toFile(optimizedPath);

                // Also create a small thumbnail for listing pages
                const thumbFilename = baseName + '-thumb.webp';
                const thumbPath = path.join(dir, thumbFilename);
                await sharp(originalPath)
                    .rotate()
                    .resize(300, 400, { fit: 'cover', withoutEnlargement: true })
                    .webp({ quality: 50 })
                    .toFile(thumbPath);

                // Get file size for logging
                const stats = await fs.promises.stat(optimizedPath);
                console.log(`Optimized MP image: ${optimizedFilename} (${Math.round(stats.size / 1024)}KB)`);

                // Delete original file asynchronously
                await fs.promises.unlink(originalPath).catch(err => {
                    console.error('Error deleting original MP image:', err);
                });

                storedImageName = (optimizedFilename && typeof optimizedFilename === 'string' ? optimizedFilename.trim() : optimizedFilename);
                console.log('MP image processing complete. Stored as:', storedImageName);
            } catch (imgError) {
                console.error('Error processing MP image:', imgError);
                console.error('Error stack:', imgError.stack);
                req.flash('error', `Error processing image: ${imgError.message}. Please try again.`);
                return res.redirect('/admin/mps');
            }
        }

        const mp = new Mp({
            name: req.body.name,
            party: req.body.party,
            state: req.body.state,
            constituency: req.body.constituency,
            image: storedImageName,
            description: req.body.description
        });

        await mp.save();
        req.flash('success', 'MP added successfully');
        res.redirect('/admin/mps');
    } catch (error) {
        console.error('Error adding MP:', error);
        req.flash('error', 'Error adding MP');
        res.redirect('/admin/mps');
    }
});

// Delete MP
router.delete('/mps/:id', async (req, res) => {
    try {
        const mp = await Mp.findByIdAndDelete(req.params.id);
        if (!mp) {
            return res.status(404).json({ success: false, message: 'MP not found' });
        }

        if (mp.image && mp.image !== 'default-mp.png') {
            const imagePath = path.join(__dirname, '../public/uploads/candidates', mp.image);
            fs.unlink(imagePath, (err) => {
                if (err) console.error('Error deleting MP image:', err);
            });
        }

        res.json({ success: true, message: 'MP deleted successfully' });
    } catch (error) {
        console.error('Error deleting MP:', error);
        res.status(500).json({ success: false, message: 'Error deleting MP' });
    }
});

// Get MP edit form
router.get('/mps/:id/edit', async (req, res) => {
    try {
        const mp = await Mp.findById(req.params.id);
        if (!mp) {
            req.flash('error', 'MP not found');
            return res.redirect('/admin/mps');
        }

        res.render('admin/editMp', {
            mp,
            states: INDIAN_STATES,
            user: req.session.user,
            success: req.flash('success'),
            error: req.flash('error')
        });
    } catch (error) {
        console.error('Error fetching MP:', error);
        req.flash('error', 'Error fetching MP details');
        res.redirect('/admin/mps');
    }
});

// Update MP
router.post('/mps/:id/edit', upload.single('image'), async (req, res) => {
    try {
        const mp = await Mp.findById(req.params.id);
        if (!mp) {
            req.flash('error', 'MP not found');
            return res.redirect('/admin/mps');
        }

        mp.name = req.body.name;
        mp.party = req.body.party;
        mp.state = req.body.state;
        mp.constituency = req.body.constituency;
        mp.description = req.body.description;

        if (req.file) {
            try {
                // Delete old image + thumbnail if not default
                if (mp.image && mp.image !== 'default-mp.png') {
                    const oldImagePath = path.join(__dirname, '../public/uploads/candidates', mp.image);
                    const oldThumbPath = path.join(__dirname, '../public/uploads/candidates', mp.image.replace(path.extname(mp.image), '') + '-thumb.webp');
                    await fs.promises.unlink(oldImagePath).catch(err => {
                        console.error('Error deleting old MP image:', err);
                    });
                    await fs.promises.unlink(oldThumbPath).catch(err => {
                        // ignore if thumb doesn't exist
                    });
                }

                const originalPath = req.file.path;
                const dir = path.dirname(originalPath);

                const baseName = path.basename(req.file.filename, path.extname(req.file.filename));
                const optimizedFilename = baseName + '-opt.webp';
                const optimizedPath = path.join(dir, optimizedFilename);

                // Aggressive optimization: resize, compress, and convert to WebP
                // Using -opt.webp ensures output filename differs from any uploaded .webp input
                await sharp(originalPath)
                    .rotate() // Auto-rotate based on EXIF
                    .resize(600, 800, {
                        fit: 'cover',
                        withoutEnlargement: true
                    })
                    .webp({ quality: 60, alphaQuality: 80 }) // More aggressive compression
                    .toFile(optimizedPath);

                // Also create a small thumbnail for listing pages
                const thumbFilename = baseName + '-thumb.webp';
                const thumbPath = path.join(dir, thumbFilename);
                await sharp(originalPath)
                    .rotate()
                    .resize(300, 400, { fit: 'cover', withoutEnlargement: true })
                    .webp({ quality: 50 })
                    .toFile(thumbPath);

                // Get file size for logging
                const stats = await fs.promises.stat(optimizedPath);
                console.log(`Optimized MP image: ${optimizedFilename} (${Math.round(stats.size / 1024)}KB)`);

                // Delete original file asynchronously
                await fs.promises.unlink(originalPath).catch(err => {
                    console.error('Error deleting original MP image:', err);
                });

                mp.image = (optimizedFilename && typeof optimizedFilename === 'string' ? optimizedFilename.trim() : optimizedFilename);
            } catch (imgError) {
                console.error('Error processing MP image:', imgError);
                req.flash('error', 'Error processing image. Please try again.');
                return res.redirect(`/admin/mps/${req.params.id}/edit`);
            }
        }

        await mp.save();
        req.flash('success', 'MP updated successfully');
        res.redirect('/admin/mps');
    } catch (error) {
        console.error('Error updating MP:', error);
        req.flash('error', 'Error updating MP');
        res.redirect(`/admin/mps/${req.params.id}/edit`);
    }
});


module.exports = router;