const mongoose = require('mongoose');
const Election = require('../models/Election');
const Candidate = require('../models/Candidate');
const User = require('../models/User');


exports.getAllElections = async (req, res) => {
    try {
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Number of elections per page
        const skip = (page - 1) * limit;
        
        // Default user to null for unauthenticated users
        let user = null;
        
        // Get full user data from database if authenticated
        if (req.session.user) {
            user = await User.findById(req.session.user.id).select('votedConstituencies').lean();
            if (!user) {
                req.flash('error', 'User not found');
                return res.redirect('/');
            }
        }

        // Get total count for pagination
        const totalElections = await Election.countDocuments({ isActive: true });
        const totalPages = Math.ceil(totalElections / limit);

        // Optimized query with pagination and selective population
        const elections = await Election.find({ 
            isActive: true 
        })
        .select('title state date constituencies')  // Select only needed fields
        .populate({
            path: 'constituencies.candidates',
            model: 'Candidate',
            select: 'name party image' // Select only needed candidate fields
        })
        .sort({ date: -1 })  // Sort by date descending
        .skip(skip)
        .limit(limit)
        .lean();  // Convert to plain JavaScript objects
        
        res.render('elections/list', {
            elections,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            user: req.session.user ? {
                ...req.session.user,
                votedConstituencies: user ? user.votedConstituencies : []
            } : null,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        console.error('Error fetching elections:', error);
        req.flash('error', 'Error fetching elections');
        res.redirect('/');
    }
};

exports.getElectionDetails = async (req, res) => {
    try {
        const election = await Election.findById(req.params.id)
            .populate({
                path: 'constituencies.candidates',
                model: 'Candidate',
                populate: [{
                    path: 'reviews.user',
                    select: 'name'
                }],
                select: 'name party constituency image manifesto achievements corruption reviews votes yesVotes noVotes'
            });

        if (!election) {
            req.flash('error', 'Election not found');
            return res.redirect('/elections');
        }

        // Check if user is authenticated
        let user = null;
        if (req.session.user) {
            // Get user with populated votingHistory for ACTIVE elections only
            user = await User.findById(req.session.user.id)
                .populate({
                    path: 'votingHistory.election',
                    match: { isActive: true }, // Only consider active elections
                    select: 'state constituencies'
                });

            if (!user) {
                req.flash('error', 'User not found');
                return res.redirect('/elections');
            }
        }

        // Default values for unauthenticated users
        let hasVotedInAnyConstituency = false;
        let hasVotedInState = false;
        let userVote = null;
        
        // Check voting status only for authenticated users
        if (user) {
            // Check if user has voted in any constituency of this election
            hasVotedInAnyConstituency = election.constituencies.some(constituency => 
                user.votedConstituencies && user.votedConstituencies.includes(constituency.name)
            );

            // Check if user has voted in this state in any ACTIVE election
            hasVotedInState = user.votingHistory.some(vote => 
                vote.election && vote.election.state === election.state
            );

            // Find user's vote for this election
            userVote = user.votingHistory.find(vote => 
                vote.election && vote.election._id.toString() === election._id.toString()
            );
        }

        // Fetch MLAs for each constituency
        const Mla = require('../models/Mla');
        const constituenciesWithMlas = [];
        
        for (const constituency of election.constituencies) {
            // Find MLA for this constituency
            const mla = await Mla.findOne({ 
                constituency: constituency.name,
                state: election.state
            });
            
            constituenciesWithMlas.push({
                ...constituency.toObject(),
                mla: mla || null
            });
        }

        res.render('elections/details', {
            election: {
                ...election.toObject(),
                constituencies: constituenciesWithMlas
            },
            user: req.session.user ? {
                ...req.session.user,
                // Safely access votedConstituencies, ensuring it's an array even if user is null
                votedConstituencies: (user && user.votedConstituencies) ? user.votedConstituencies : []
            } : { votedConstituencies: [] }, // Provide default user object with empty votedConstituencies for non-authenticated users
            hasVoted: hasVotedInAnyConstituency,
            hasVotedInState,
            userVote: userVote || null,
            isAuthenticated: !!req.session.user,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        console.error('Error fetching election details:', error);
        req.flash('error', 'Error fetching election details');
        res.redirect('/elections');
    }
};

exports.getHome = async (req, res) => {
    try {
        const elections = await Election.find({ isActive: true });
        
        // Group elections by state
        const stateMap = new Map();
        elections.forEach(election => {
            if (!stateMap.has(election.state)) {
                stateMap.set(election.state, {
                    name: election.state,
                    activeElections: 0,
                    constituencies: new Set(),
                    electionId: election._id // Store the first election ID for this state
                });
            }
            const stateData = stateMap.get(election.state);
            stateData.activeElections++;
            election.constituencies.forEach(constituency => {
                stateData.constituencies.add(constituency.name);
            });
        });

        // Convert map to array and format for view
        const states = Array.from(stateMap.values()).map(state => ({
            name: state.name,
            activeElections: state.activeElections,
            constituencies: state.constituencies.size,
            electionId: state.electionId // Include the election ID for direct linking
        }));

        res.render('elections/home', {
            states,
            user: req.session.user,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        console.error('Error fetching states:', error);
        req.flash('error', 'Error fetching elections');
        res.redirect('/');
    }
};

exports.getElectionsByState = async (req, res) => {
    try {
        const state = req.params.state;
        const user = await User.findById(req.session.user.id);

        const elections = await Election.find({ 
            state: state,
            isActive: true 
        }).populate({
            path: 'constituencies.candidates',
            model: 'Candidate'
        });

        res.render('elections/state', {
            elections,
            state,
            user: {
                ...req.session.user,
                votedConstituencies: user.votedConstituencies || []
            }
        });
    } catch (error) {
        console.error('Error fetching state elections:', error);
        req.flash('error', 'Error fetching elections');
        res.redirect('/elections');
    }
};

exports.postVote = async (req, res) => {
    try {
        const { electionId, candidateId, constituencyName, voteType } = req.body;
        const userId = req.session.user.id;

        // Validate vote type
        if (!voteType || (voteType !== 'yes' && voteType !== 'no')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid vote type. Must be "yes" or "no"'
            });
        }

        const election = await Election.findById(electionId);
        if (!election) {
            return res.status(404).json({ success: false, message: 'Election not found' });
        }

        // Get user data
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has already voted in this constituency
        if (user.votedConstituencies && user.votedConstituencies.includes(constituencyName)) {
            return res.status(400).json({
                success: false,
                message: 'You have already voted in this constituency'
            });
        }

        // Check if user has already voted in this state
        const hasVotedInState = user.votingHistory.some(vote => 
            vote.election && vote.election.state === election.state
        );

        if (hasVotedInState) {
            return res.status(400).json({
                success: false,
                message: 'You have already voted in this state'
            });
        }

        // Update candidate votes based on vote type
        const updateFields = {
            $inc: { votes: 1 }
        };
        
        // Increment the specific vote type count
        if (voteType === 'yes') {
            updateFields.$inc.yesVotes = 1;
        } else {
            updateFields.$inc.noVotes = 1;
        }

        // Update candidate votes
        const updatedCandidate = await Candidate.findByIdAndUpdate(
            candidateId, 
            updateFields,
            { new: true }
        );

        // Update election total votes
        await Election.findByIdAndUpdate(electionId, {
            $inc: { totalVotes: 1 }
        });

        // Update user's voting record
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $push: {
                    votingHistory: {
                        election: electionId,
                        candidate: candidateId,
                        voteType: voteType,
                        votedAt: new Date()
                    },
                    votedConstituencies: constituencyName
                }
            },
            { new: true }
        );

        // Update session data
        req.session.user = {
            ...req.session.user,
            votedConstituencies: updatedUser.votedConstituencies
        };

        res.json({
            success: true,
            message: 'Vote recorded successfully',
            yesVotes: updatedCandidate.yesVotes,
            noVotes: updatedCandidate.noVotes
        });
    } catch (error) {
        console.error('Voting error:', error);
        res.status(500).json({ success: false, message: 'Error recording vote' });
    }
};

exports.getCandidateReviews = async (req, res) => {
    try {
        const candidate = await Candidate.findById(req.params.id)
            .populate({
                path: 'reviews.user',
                select: 'name email anonName',
                model: 'User'
            });
        
        if (!candidate) {
            return res.status(404).json({ success: false, message: 'Candidate not found' });
        }

        res.json(candidate.reviews);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ success: false, message: 'Error fetching reviews' });
    }
};

exports.castVote = async (req, res) => {
    try {
        const { electionId, candidateId, constituencyName, voteType } = req.body;
        const userId = req.session.user.id;

        // Validate vote type
        if (!voteType || (voteType !== 'yes' && voteType !== 'no')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid vote type. Must be "yes" or "no"'
            });
        }

        // Get the election
        const election = await Election.findById(electionId);
        if (!election || !election.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Election not found or inactive'
            });
        }

        // Check if user has already voted in this constituency
        const user = await User.findById(userId);
        
        // Check if user has voted in any active election in this state
        const hasVotedInState = await User.findOne({
            _id: userId,
            'votingHistory.election': {
                $in: await Election.find({ 
                    state: election.state, 
                    isActive: true,
                    _id: { $ne: election._id } 
                }).select('_id')
            }
        });

        if (hasVotedInState) {
            return res.status(400).json({
                success: false,
                message: 'You have already voted in an active election in this state'
            });
        }

        // Check if user has already voted in this constituency
        if (user.votedConstituencies.includes(constituencyName)) {
            return res.status(400).json({
                success: false,
                message: 'You have already voted in this constituency'
            });
        }

        // Update candidate votes based on vote type
        const updateFields = {
            $inc: { votes: 1 }
        };
        
        // Increment the specific vote type count
        if (voteType === 'yes') {
            updateFields.$inc.yesVotes = 1;
        } else {
            updateFields.$inc.noVotes = 1;
        }

        // Update candidate votes
        const updatedCandidate = await Candidate.findByIdAndUpdate(
            candidateId, 
            updateFields,
            { new: true }
        );

        // Update election total votes
        await Election.findByIdAndUpdate(electionId, {
            $inc: { totalVotes: 1 }
        });

        // Add constituency to user's voted list and voting history
        await User.findByIdAndUpdate(userId, {
            $push: { 
                votedConstituencies: constituencyName,
                votingHistory: {
                    election: electionId,
                    candidate: candidateId,
                    voteType: voteType,
                    votedAt: new Date()
                }
            }
        });

        res.json({
            success: true,
            message: 'Vote cast successfully',
            yesVotes: updatedCandidate.yesVotes,
            noVotes: updatedCandidate.noVotes
        });
    } catch (error) {
        console.error('Vote casting error:', error);
        res.status(500).json({
            success: false,
            message: 'Error casting vote'
        });
    }
};

exports.addReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const candidateId = req.params.id;
        
        // Check if user is authenticated
        if (!req.session || !req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'You must be logged in to add a review'
            });
        }
        
        const userId = req.session.user.id; // Use id from session

        // Check if user has already reviewed this candidate
        const candidate = await Candidate.findById(candidateId);
        
        if (!candidate) {
            return res.status(404).json({
                success: false,
                message: 'Candidate not found'
            });
        }
        
        const existingReview = candidate.reviews.find(review => 
            review.user && review.user.toString() === userId.toString()
        );

        if (existingReview) {
            return res.status(400).json({
                success: false,
                message: 'You have already reviewed this candidate'
            });
        }

        // Add the review
        await Candidate.findByIdAndUpdate(candidateId, {
            $push: {
                reviews: {
                    user: userId,
                    rating: parseInt(rating),
                    comment,
                    createdAt: new Date()
                }
            }
        });

        res.json({
            success: true,
            message: 'Review added successfully'
        });
    } catch (error) {
        console.error('Add review error:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding review'
        });
    }
};


exports.getReviews = async (req, res) => {
    try {
        const candidate = await Candidate.findById(req.params.id)
            .populate({
                path: 'reviews.user',
                select: 'name email',
                model: 'User'
            });

        if (!candidate) {
            return res.status(404).json({
                success: false,
                message: 'Candidate not found'
            });
        }

        // Sort reviews by date (newest first) and transform for display
        const sortedReviews = candidate.reviews.sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        ).map(r => ({
            _id: r._id,
            rating: r.rating,
            comment: r.comment,
            createdAt: r.createdAt,
            anonymous: !!r.anonymous,
            anonymousName: r.anonymousName || (r.user && r.user.anonName) || null,
            user: r.user ? { _id: r.user._id, name: (r.user.anonName || r.user.name), anonName: r.user.anonName } : null
        }));

        res.json({
            success: true,
            reviews: sortedReviews
        });
    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching reviews'
        });
    }
};

exports.getCandidateDetails = async (req, res) => {
    try {
        const candidate = await Candidate.findById(req.params.id)
            .populate({
                path: 'reviews.user',
                select: 'name email anonName',
                model: 'User'
            })
            .populate('election');

        if (!candidate) {
            req.flash('error', 'Candidate not found');
            return res.redirect('/elections');
        }

        // Calculate average rating
        let averageRating = 0;
        if (candidate.reviews && candidate.reviews.length > 0) {
            const totalRating = candidate.reviews.reduce((sum, review) => sum + review.rating, 0);
            averageRating = totalRating / candidate.reviews.length;
        }

        // Sort reviews by date (newest first) and transform for display
        const sortedReviews = candidate.reviews.sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        ).map(r => ({
            _id: r._id,
            rating: r.rating,
            comment: r.comment,
            createdAt: r.createdAt,
            anonymous: !!r.anonymous,
            anonymousName: r.anonymousName || (r.user && r.user.anonName) || null,
            user: r.user ? { _id: r.user._id, name: (r.user.anonName || r.user.name), anonName: r.user.anonName } : null
        }));

        // Check if user has already reviewed this candidate
        let hasReviewed = false;
        if (req.session.user) {
            hasReviewed = candidate.reviews.some(review => 
                review.user && review.user._id && review.user._id.toString() === req.session.user.id.toString()
            );
        }

        // Corruption field removed

        res.render('elections/candidate', {
            candidate,
            reviews: sortedReviews,
            averageRating,
            hasReviewed,
               user: req.session.user || null,
            success: req.flash('success'),
            error: req.flash('error')
        });
    } catch (error) {
        console.error('Get candidate details error:', error);
        req.flash('error', 'Error fetching candidate details');
        res.redirect('/elections');
    }
};