const mongoose = require('mongoose');

const constituencySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    state: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'State',
        required: true
    },
    totalVoters: {
        type: Number,
        default: 0
    },
    candidates: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidate'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Constituency', constituencySchema);