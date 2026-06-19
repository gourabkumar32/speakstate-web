const mongoose = require('mongoose');

// Comment schema to handle sorting
const commentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 280
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    anonymous: {
        type: Boolean,
        default: false
    },
    anonymousName: {
        type: String,
        trim: true,
        default: null
    }
});

const tweetSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true,
        trim: true,
        // Allow longer posts (e.g., 300 words). Increase character limit from 280 to 5000.
        maxlength: 5000
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    anonymous: {
        type: Boolean,
        default: false
    },
    anonymousName: {
        type: String,
        trim: true,
        default: null
    },
    mlaName: {
        type: String,
        trim: true
    },
    taggedMlas: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Mla'
    }],
    taggedMps: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Mp'
    }],
    likes: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        anonymous: {
            type: Boolean,
            default: false
        },
        anonymousName: {
            type: String,
            trim: true,
            default: null
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    comments: [commentSchema],
    institution: {
        type: String,
        trim: true
    },
    location: {
        type: String,
        trim: true
    },
    media: [{
        type: String
    }]
    ,
    anonymous: {
        type: Boolean,
        default: false
    },
    anonymousName: {
        type: String,
        trim: true,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Tweet', tweetSchema);