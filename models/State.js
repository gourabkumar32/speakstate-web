const mongoose = require('mongoose');

const stateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    constituencies: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Constituency'
    }],
    // Topics and topic-specific news items managed by admin
    topics: [{
        name: { type: String, required: true },
        slug: { type: String },
        // optional topic-level description and image
        description: { type: String },
        image: { type: String },
        infos: [{
            title: { type: String, required: true },
            content: { type: String },
            url: { type: String },
            image: { type: String },
            likes: { type: Number, default: 0 },
            likedBy: { type: [String], default: [] },
            comments: [{
                user: { type: String },
                text: { type: String },
                createdAt: { type: Date, default: Date.now }
            }],
            createdAt: { type: Date, default: Date.now }
        }]
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('State', stateSchema); 