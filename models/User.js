const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    /* 
     password: {
        type: String,
        required: function() {
            return !this.googleId; // Required if NOT using Google OAuth
        }
    },
    state: {
        type: String,
        required: function() {
            return !this.googleId; // Required if NOT using Google OAuth
        },
         trim: true,
        default: 'unknown'
    },
    */
   password: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true,
        trim: true
    },
    
    isAdmin: {
        type: Boolean,
        default: false
    },
    profilePicture: {
        type: String,
        default: null
    },
    // Persistent anonymous handle (e.g., curious_fox_4821)
    // Persistent anonymous handle (e.g., curious_fox_4821)
    anonName: {
        type: String,
        trim: true,
        unique: true,
        sparse: true,
        default: null
    },
    votedConstituencies: [{
        type: String
    }],
    votingHistory: [{
        election: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Election'
        },
        candidate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Candidate'
        },
        voteType: {
            type: String,
            enum: ['yes', 'no'],
            required: true
        },
        votedAt: {
            type: Date,
            default: Date.now
        }
    }],
    constituency: {
        type: String,
        required: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);