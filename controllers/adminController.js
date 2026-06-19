const Election = require('../models/Election');
const Candidate = require('../models/Candidate');
const Constituency = require('../models/Constituency');
const State = require('../models/State');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads/candidates');
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

// Create multer instance with error handling
const fileFilter = function (req, file, cb) {
    // Accept images only
    // Allow common image extensions including webp, avif and svg (case-insensitive)
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i)) {
        return cb(new Error('Only image files are allowed!'));
    }
    cb(null, true);
};

const uploadConfig = {
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: fileFilter
};

// Create separate multer instances for different upload types
const multipleUpload = multer(uploadConfig).any(); // Allow any field names for multiple uploads

const singleUpload = multer(uploadConfig).single('image');

// Separate storage for news images (keeps candidates and news separate)
const newsStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads/news');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'news-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const newsUploadConfig = Object.assign({}, uploadConfig, { storage: newsStorage });
const singleNewsUpload = multer(newsUploadConfig).single('image');

exports.uploadNewsSingle = (req, res, next) => {
    singleNewsUpload(req, res, function(err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ success: false, message: err.message });
        } else if (err) {
            return res.status(400).json({ success: false, message: 'Error uploading file: ' + err.message });
        }
        next();
    });
};

// Wrap multer middleware with error handling
exports.uploadMultiple = (req, res, next) => {
    multipleUpload(req, res, function(err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: 'Error uploading file: ' + err.message
            });
        }

        // Filter files to only accept those matching our pattern
        if (req.files) {
            req.files = req.files.filter(file => 
                file.fieldname.match(/^candidate_image_\d+_\d+$/)
            );
        }

        next();
    });
};

exports.uploadSingle = (req, res, next) => {
    singleUpload(req, res, function(err) {
        if (err instanceof multer.MulterError) {
            // Return JSON error for AJAX requests
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(400).json({
                    success: false,
                    message: err.message
                });
            }
            req.flash('error', err.message);
            return res.redirect(req.get('Referrer') || '/');
        } else if (err) {
            // Return JSON error for AJAX requests
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(400).json({
                    success: false,
                    message: 'Error uploading file: ' + err.message
                });
            }
            req.flash('error', 'Error uploading file: ' + err.message);
            return res.redirect(req.get('Referrer') || '/');
        }
        next();
    });
};

exports.getDashboard = async (req, res) => {
    try {
        const elections = await Election.find()
            .populate({
                path: 'constituencies.candidates',
                model: 'Candidate'
            })
            .sort('-createdAt');
            
        const states = await State.find().sort('name');

        res.render('admin/dashboard', {
            elections,
            states,
            success: req.flash('success'),
            error: req.flash('error')
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        req.flash('error', 'Error loading dashboard');
        res.redirect('/');
    }
};

exports.createElection = async (req, res) => {
    try {
        console.log('Request body:', req.body);
        console.log('Files received:', req.files);

        if (!req.body.constituencies) {
            throw new Error('No constituencies data provided');
        }

        const { title, state, startDate, endDate } = req.body;
        const constituencies = JSON.parse(req.body.constituencies);

        // Validate required fields
        if (!title || !state || !startDate || !endDate) {
            throw new Error('Missing required fields');
        }

        // Create the election
        const election = new Election({
            title,
            state,
            startDate,
            endDate,
            isActive: true,
            constituencies: constituencies.map(c => ({ 
                name: c.name, 
                candidates: [] 
            }))
        });

        await election.save();

        // Process each constituency and its candidates
        for (let i = 0; i < constituencies.length; i++) {
            const constituencyData = constituencies[i];
            
            for (let j = 0; j < constituencyData.candidates.length; j++) {
                const candidateData = constituencyData.candidates[j];
                
                // Create new candidate
                const candidate = new Candidate({
                    name: candidateData.name,
                    party: candidateData.party,
                    constituency: constituencyData.name,
                    election: election._id,
                    image: 'default-candidate.jpg',
                    manifesto: candidateData.manifesto || [],
                    achievements: candidateData.achievements || [],
                    corruption: candidateData.corruption || []
                });

                // Handle image upload
                const imageFieldName = `candidate_image_${i}_${j}`;
                const candidateImage = req.files?.find(file => file.fieldname === imageFieldName);
                if (candidateImage) {
                    candidate.image = candidateImage.filename;
                }

                await candidate.save();
                election.constituencies[i].candidates.push(candidate._id);
            }
        }

        await election.save();

        res.json({
            success: true,
            message: 'Election created successfully'
        });
    } catch (error) {
        console.error('Create election error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error creating election'
        });
    }
};

exports.addCandidate = async (req, res) => {
    try {
        const { 
            name, party, electionId, constituency, manifesto, achievements, corruption
        } = req.body;
        
        // Process all text arrays
        let manifestoArray = [];
        let achievementsArray = [];
        let corruptionArray = [];
        
        // Parse manifesto
        if (manifesto) {
            try {
                manifestoArray = JSON.parse(manifesto);
            } catch (e) {
                manifestoArray = manifesto.split('\n').filter(item => item.trim() !== '');
            }
        }
        
        // Parse achievements
        if (achievements) {
            try {
                achievementsArray = JSON.parse(achievements);
            } catch (e) {
                achievementsArray = achievements.split('\n').filter(item => item.trim() !== '');
            }
        }
        
        // Parse corruption
        if (corruption) {
            try {
                corruptionArray = JSON.parse(corruption);
            } catch (e) {
                corruptionArray = corruption.split('\n').filter(item => item.trim() !== '');
            }
        }

        // Validate required fields
        if (!name || !party || !electionId || !constituency) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }
        
        const candidate = new Candidate({
            name,
            party,
            constituency,
            election: electionId,
            image: req.file ? req.file.filename : 'default-candidate.jpg',
            manifesto: manifestoArray,
            achievements: achievementsArray,
            corruption: corruptionArray
        });

        await candidate.save();

        // Update election with new candidate in the correct constituency
        await Election.findOneAndUpdate(
            { 
                _id: electionId,
                'constituencies.name': constituency
            },
            {
                $push: { 'constituencies.$.candidates': candidate._id }
            }
        );

        res.json({
            success: true,
            message: 'Candidate added successfully',
            candidate: candidate
        });
    } catch (error) {
        console.error('Add candidate error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error adding candidate'
        });
    }
};

exports.toggleElectionStatus = async (req, res) => {
    try {
        const election = await Election.findById(req.params.id);
        election.isActive = !election.isActive;
        await election.save();

        res.json({
            success: true,
            message: 'Election status updated successfully'
        });
    } catch (error) {
        console.error('Toggle status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating election status'
        });
    }
};

exports.createConstituency = async (req, res) => {
    try {
        const { name, electionId, totalVoters } = req.body;
        
        // Validate required fields
        if (!name || !electionId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name and electionId are required'
            });
        }
        
        // Find the election
        const election = await Election.findById(electionId);
        if (!election) {
            return res.status(400).json({
                success: false,
                message: 'Election not found'
            });
        }
        
        // Create or find state
        let stateObj = await State.findOne({ name: election.state });
        if (!stateObj) {
            // If state doesn't exist, create it
            stateObj = new State({
                name: election.state,
                constituencies: []
            });
            await stateObj.save();
        }
        
        // Check if constituency with same name already exists in this election
        const existingConstituency = election.constituencies.find(c => c.name === name);
        if (existingConstituency) {
            return res.status(400).json({
                success: false,
                message: 'A constituency with this name already exists in this election'
            });
        }
        
        // Create new constituency
        const constituency = new Constituency({
            name,
            state: stateObj._id,
            totalVoters: totalVoters || 0,
            candidates: []
        });
        
        await constituency.save();
        
        // Update the election with a reference to the constituency
        await Election.findByIdAndUpdate(electionId, {
            $push: { 
                constituencies: {
                    _id: constituency._id,
                    name: name,
                    candidates: []
                }
            }
        });

        // Add constituency to state's constituencies array
        await State.findByIdAndUpdate(stateObj._id, {
            $push: { constituencies: constituency._id }
        });
        
        res.json({
            success: true,
            message: 'Constituency added successfully'
        });
    } catch (error) {
        console.error('Create constituency error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating constituency: ' + error.message
        });
    }
};

exports.addConstituency = async (req, res) => {
    try {
        const { name, electionId, state } = req.body;
        
        // Validate required fields
        if (!name || !electionId || !state) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }
        
        // Find the election
        const election = await Election.findById(electionId);
        if (!election) {
            return res.status(404).json({
                success: false,
                message: 'Election not found'
            });
        }
        
        // Check if constituency with same name already exists in this election
        const existingConstituency = election.constituencies.find(c => c.name === name);
        if (existingConstituency) {
            return res.status(400).json({
                success: false,
                message: 'A constituency with this name already exists in this election'
            });
        }
        
        // Add new constituency to the election
        election.constituencies.push({
            name: name,
            state: state,
            candidates: []
        });
        
        await election.save();
        
        return res.json({
            success: true,
            message: 'Constituency added successfully'
        });
    } catch (error) {
        console.error('Add constituency error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error adding constituency: ' + error.message
        });
    }
};

exports.addState = async (req, res) => {
    try {
        const { name } = req.body;
        
        // Validate required fields
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'State name is required'
            });
        }
        
        // Check if state with same name already exists
        const existingState = await State.findOne({ name: name });
        if (existingState) {
            return res.status(400).json({
                success: false,
                message: 'A state with this name already exists'
            });
        }
        
        // Create new state
        const state = new State({
            name: name,
            constituencies: []
        });
        
        await state.save();
        
        return res.json({
            success: true,
            message: 'State added successfully'
        });
    } catch (error) {
        console.error('Add state error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error adding state: ' + error.message
        });
    }
};

exports.deleteElection = async (req, res) => {
    try {
        const election = await Election.findById(req.params.id);
        if (!election) {
            return res.status(404).json({
                success: false,
                message: 'Election not found'
            });
        }

        // Get all constituency names from this election
        const constituencyNames = election.constituencies.map(c => c.name);
        
        // Clean up user voting history and constituencies
        await User.updateMany(
            { 
                $or: [
                    { 'votingHistory.election': election._id },
                    { votedConstituencies: { $in: constituencyNames } }
                ]
            },
            { 
                $pull: { 
                    votingHistory: { election: election._id },
                    votedConstituencies: { $in: constituencyNames }
                }
            }
        );

        // Delete all candidates associated with this election
        await Candidate.deleteMany({ election: election._id });
        
        // Delete the election
        await election.remove();

        res.json({
            success: true,
            message: 'Election and related data deleted successfully'
        });
    } catch (error) {
        console.error('Delete election error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting election'
        });
    }
};

exports.getCandidate = async (req, res) => {
    try {
        const candidate = await Candidate.findById(req.params.id);
        if (!candidate) {
            return res.status(404).json({
                success: false,
                message: 'Candidate not found'
            });
        }

        res.json({
            success: true,
            candidate
        });
    } catch (error) {
        console.error('Get candidate error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching candidate'
        });
    }
};

exports.updateCandidate = async (req, res) => {
    try {
        const { name, party, manifesto, achievements, corruption } = req.body;
        const updateData = {
            name,
            party
        };

        // Process manifesto and achievements if provided
        if (manifesto) {
            // Check if manifesto is already an array
            if (Array.isArray(manifesto)) {
                updateData.manifesto = manifesto;
            } else {
                try {
                    // Try to parse if it's a JSON string
                    const parsed = JSON.parse(manifesto);
                    // Ensure we have a flat array of strings
                    updateData.manifesto = Array.isArray(parsed) ? parsed.flat().map(String) : [String(parsed)];
                } catch (e) {
                    console.error('Error parsing manifesto:', e);
                    // If parsing fails, treat as a single string
                    updateData.manifesto = [String(manifesto)];
                }
            }
        }

        if (achievements) {
            // Check if achievements is already an array
            if (Array.isArray(achievements)) {
                updateData.achievements = achievements;
            } else {
                try {
                    // Try to parse if it's a JSON string
                    const parsed = JSON.parse(achievements);
                    // Ensure we have a flat array of strings
                    updateData.achievements = Array.isArray(parsed) ? parsed.flat().map(String) : [String(parsed)];
                } catch (e) {
                    console.error('Error parsing achievements:', e);
                    // If parsing fails, treat as a single string
                    updateData.achievements = [String(achievements)];
                }
            }
        }

        if (corruption) {
            // Check if corruption is already an array
            if (Array.isArray(corruption)) {
                updateData.corruption = corruption;
            } else {
                try {
                    // Try to parse if it's a JSON string
                    const parsed = JSON.parse(corruption);
                    // Ensure we have a flat array of strings
                    updateData.corruption = Array.isArray(parsed) ? parsed.flat().map(String) : [String(parsed)];
                } catch (e) {
                    console.error('Error parsing corruption:', e);
                    // If parsing fails, treat as a single string
                    updateData.corruption = [String(corruption)];
                }
            }
        }

        // Only update image if a new one is uploaded
        if (req.file) {
            updateData.image = req.file.filename;

            // Delete old image if it exists and is not the default
            const candidate = await Candidate.findById(req.params.id);
            if (candidate.image && candidate.image !== 'default-candidate.jpg') {
                const oldImagePath = path.join(__dirname, '../public/uploads/candidates', candidate.image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
        }

        const updatedCandidate = await Candidate.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );

        if (!updatedCandidate) {
            return res.status(404).json({
                success: false,
                message: 'Candidate not found'
            });
        }

        return res.json({
            success: true,
            message: 'Candidate updated successfully',
            candidate: updatedCandidate
        });
    } catch (error) {
        console.error('Update candidate error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error updating candidate: ' + error.message
        });
    }
};

exports.deleteCandidate = async (req, res) => {
    try {
        const candidateId = req.params.id;
        
        // Find the candidate to get the election and constituency info
        const candidate = await Candidate.findById(candidateId);
        
        if (!candidate) {
            return res.status(404).json({ success: false, message: 'Candidate not found' });
        }
        
        // Remove the candidate from the election's constituency
        await Election.updateOne(
            { 'constituencies.candidates': candidateId },
            { $pull: { 'constituencies.$.candidates': candidateId } }
        );
        
        // Delete the candidate's image if it exists
        if (candidate.image && candidate.image !== 'default-candidate.jpg') {
            const imagePath = path.join(__dirname, '../public/uploads/candidates', candidate.image);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }
        
        // Delete the candidate
        await Candidate.findByIdAndDelete(candidateId);
        
        res.json({ success: true, message: 'Candidate deleted successfully' });
    } catch (error) {
        console.error('Delete candidate error:', error);
        res.status(500).json({ success: false, message: 'Error deleting candidate' });
    }
};

// Delete a constituency
exports.deleteConstituency = async (req, res) => {
    try {
        const { electionId, constituencyId } = req.params;
        
        // Find the election
        const election = await Election.findById(electionId);
        
        if (!election) {
            return res.status(404).json({ success: false, message: 'Election not found' });
        }
        
        // Find the constituency in the election
        const constituency = election.constituencies.id(constituencyId);
        
        if (!constituency) {
            return res.status(404).json({ success: false, message: 'Constituency not found' });
        }
        
        // Get all candidate IDs in this constituency
        const candidateIds = constituency.candidates;
        
        // Delete all candidates in this constituency
        for (const candidateId of candidateIds) {
            const candidate = await Candidate.findById(candidateId);
            
            if (candidate && candidate.image) {
                // Delete the candidate's image if it exists
                const imagePath = path.join(__dirname, '../public/uploads/candidates', candidate.image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }
            
            // Delete the candidate
            await Candidate.findByIdAndDelete(candidateId);
        }
        
        // Remove the constituency from the election
        election.constituencies.pull(constituencyId);
        await election.save();
        
        // Remove the constituency from the state if it exists
        await State.updateMany(
            { constituencies: constituencyId },
            { $pull: { constituencies: constituencyId } }
        );
        
        res.json({ success: true, message: 'Constituency deleted successfully' });
    } catch (error) {
        console.error('Error deleting constituency:', error);
        res.status(500).json({ success: false, message: 'Error deleting constituency' });
    }
};

// Admin: Add a topic to a state
exports.addTopic = async (req, res) => {
    try {
        const { stateId } = req.params;
        // Accept form-data with optional image and description
        console.log('addTopic called. req.file=', req.file, 'body keys=', Object.keys(req.body));
        const name = req.body.name;
        const description = req.body.description || '';
        if (!name) return res.status(400).json({ success: false, message: 'Topic name required' });

        const state = await State.findById(stateId);
        if (!state) return res.status(404).json({ success: false, message: 'State not found' });

        const topicObj = { name, slug: name.toLowerCase().replace(/\s+/g, '-'), description, infos: [] };
        if (req.file && req.file.filename) {
            topicObj.image = req.file.filename;
        }

        state.topics.push(topicObj);
        await state.save();

        res.json({ success: true, message: 'Topic added', topic: state.topics[state.topics.length - 1] });
    } catch (err) {
        console.error('Add topic error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Admin: Update a topic name
exports.updateTopic = async (req, res) => {
    try {
        const { stateId, topicId } = req.params;
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Topic name required' });

        const state = await State.findById(stateId);
        if (!state) return res.status(404).json({ success: false, message: 'State not found' });

        const topic = state.topics.id(topicId);
        if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

        topic.name = name;
        topic.slug = name.toLowerCase().replace(/\s+/g, '-');
        await state.save();

        res.json({ success: true, message: 'Topic updated', topic });
    } catch (err) {
        console.error('Update topic error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Admin: Delete a topic
exports.deleteTopic = async (req, res) => {
    try {
        const { stateId, topicId } = req.params;
        const state = await State.findById(stateId);
        if (!state) return res.status(404).json({ success: false, message: 'State not found' });

        const topic = state.topics.id(topicId);
        if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

        topic.remove();
        await state.save();

        res.json({ success: true, message: 'Topic deleted' });
    } catch (err) {
        console.error('Delete topic error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Admin: Add news/info item to a topic
exports.addTopicNews = async (req, res) => {
    try {
        const { stateId, topicId } = req.params;
        const { title, content, url } = req.body;
        console.log('addTopicNews called. req.file=', req.file, 'req.body=', req.body);
        if (!title) return res.status(400).json({ success: false, message: 'Title required' });

        const state = await State.findById(stateId);
        if (!state) return res.status(404).json({ success: false, message: 'State not found' });

        const topic = state.topics.id(topicId);
        if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

        const newsObj = { title, content, url };
        if (req.file && req.file.filename) {
            newsObj.image = req.file.filename;
        }

        topic.infos.push(newsObj);
        await state.save();

        res.json({ success: true, message: 'News added', news: topic.infos[topic.infos.length - 1] });
    } catch (err) {
        console.error('Add topic news error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Admin: Update a news/info item
exports.updateTopicNews = async (req, res) => {
    try {
        const { stateId, topicId, newsId } = req.params;
        const { title, content, url } = req.body;
        console.log('updateTopicNews called. req.file=', req.file, 'req.body=', req.body);
        const state = await State.findById(stateId);
        if (!state) return res.status(404).json({ success: false, message: 'State not found' });

        const topic = state.topics.id(topicId);
        if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

        const news = topic.infos.id(newsId);
        if (!news) return res.status(404).json({ success: false, message: 'News not found' });

        if (title) news.title = title;
        if (content) news.content = content;
        if (url) news.url = url;

        // If an image file was uploaded, replace the old one
        if (req.file && req.file.filename) {
            // delete old image if exists
            if (news.image) {
                const oldPath = path.join(__dirname, '../public/uploads/news', news.image);
                if (fs.existsSync(oldPath)) {
                    try { fs.unlinkSync(oldPath); } catch (e) { console.error('Failed deleting old news image', e); }
                }
            }
            news.image = req.file.filename;
        }

        await state.save();
        res.json({ success: true, message: 'News updated', news });
    } catch (err) {
        console.error('Update topic news error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Admin: Delete a news/info item
exports.deleteTopicNews = async (req, res) => {
    try {
        const { stateId, topicId, newsId } = req.params;
        const state = await State.findById(stateId);
        if (!state) return res.status(404).json({ success: false, message: 'State not found' });

        const topic = state.topics.id(topicId);
        if (!topic) return res.status(404).json({ success: false, message: 'Topic not found' });

        const news = topic.infos.id(newsId);
        if (!news) return res.status(404).json({ success: false, message: 'News not found' });

        // Delete attached image if present
        if (news.image) {
            const imagePath = path.join(__dirname, '../public/uploads/news', news.image);
            if (fs.existsSync(imagePath)) {
                try { fs.unlinkSync(imagePath); } catch (e) { console.error('Failed deleting news image', e); }
            }
        }

        news.remove();
        await state.save();

        res.json({ success: true, message: 'News deleted' });
    } catch (err) {
        console.error('Delete topic news error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Admin: return a single state as JSON (for admin UI)
exports.getStateJson = async (req, res) => {
    try {
        const state = await State.findById(req.params.stateId);
        if (!state) return res.status(404).json({ success: false, message: 'State not found' });
        res.json({ success: true, state });
    } catch (err) {
        console.error('Get state json error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Admin: render full management page for a state's topics and news
exports.renderStateTopicsAdmin = async (req, res) => {
    try {
        console.log('renderStateTopicsAdmin called for stateId=', req.params.stateId, 'user=', req.user && req.user.email);
        const state = await State.findById(req.params.stateId);
        if (!state) {
            req.flash('error', 'State not found');
            return res.redirect('/admin/dashboard');
        }
        res.render('admin/state-topics', { state, user: req.user, messages: { success: req.flash('success'), error: req.flash('error') } });
    } catch (err) {
        console.error('Render state topics admin error:', err);
        req.flash('error', 'Error loading state topics');
        res.redirect('/admin/dashboard');
    }
};

// Admin: Delete a state (and its constituencies and candidates)
exports.deleteState = async (req, res) => {
    try {
        const stateId = req.params.stateId;
        console.log('deleteState called for:', stateId, 'by user:', req.user && req.user.email);
        const state = await State.findById(stateId);
        if (!state) {
            console.warn('deleteState: state not found', stateId);
            return res.status(404).json({ success: false, message: 'State not found' });
        }

        // Delete related constituencies and their candidates
        const Constituency = require('../models/Constituency');
        const Candidate = require('../models/Candidate');

        const constituencyIds = Array.isArray(state.constituencies) ? state.constituencies : [];
        console.log('deleteState: will delete constituencies:', constituencyIds.length);

        for (const cid of constituencyIds) {
            try {
                if (!cid) continue;
                const cons = await Constituency.findById(cid).lean();
                if (!cons) {
                    console.warn('deleteState: constituency not found', cid);
                    continue;
                }

                // Remove candidates referenced by this constituency
                const candidateIds = Array.isArray(cons.candidates) ? cons.candidates : [];
                for (const candId of candidateIds) {
                    try {
                        if (!candId) continue;
                        const cand = await Candidate.findByIdAndDelete(candId);
                        if (cand && cand.image && cand.image !== 'default-candidate.jpg') {
                            const imgPath = path.join(__dirname, '../public/uploads/candidates', cand.image);
                            if (fs.existsSync(imgPath)) {
                                try { fs.unlinkSync(imgPath); } catch (e) { console.error('Failed deleting candidate image', e); }
                            }
                        }
                    } catch (e) {
                        console.error('Failed deleting candidate', candId, e);
                    }
                }

                // Delete the constituency itself
                try { await Constituency.findByIdAndDelete(cid); } catch (e) { console.error('Failed deleting constituency', cid, e); }
            } catch (e) {
                console.error('Error processing constituency', cid, e);
            }
        }

        // Finally delete the state document
        await State.findByIdAndDelete(stateId);

        console.log('deleteState: completed for', stateId);
        res.json({ success: true, message: 'State and related data deleted' });
    } catch (err) {
        console.error('Delete state error:', err);
        res.status(500).json({ success: false, message: 'Error deleting state: ' + err.message });
    }
};