const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    party: {
        type: String,
        required: true
    },
    constituency: {
        type: String,
        required: true
    },
    image: {
        type: String,
        default: 'default-candidate.jpg'
    },
    election: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election',
        required: true
    },
    votes: {
        type: Number,
        default: 0
    },
    yesVotes: {
        type: Number,
        default: 0
    },
    noVotes: {
        type: Number,
        default: 0
    },
    manifesto: {
        type: [String],
        default: []
    },
    achievements: {
        type: [String],
        default: []
    },
    corruption: {
        type: [String],
        default: []
    },
   reviews: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        comment: {
            type: String,
            required: true,
            trim: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Candidate', candidateSchema);