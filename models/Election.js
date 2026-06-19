const mongoose = require('mongoose');

const electionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    state: {
        type: String,
        required: true,
        trim: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    constituencies: [{
        name: {
            type: String,
            required: true
        },
        candidates: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Candidate'
        }]
    }],
    totalVotes: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Election', electionSchema); 