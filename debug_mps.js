const mongoose = require('mongoose');
const Mp = require('./models/Mp');
const Mla = require('./models/Mla');
const path = require('path');
require('dotenv').config();

const parseMentions = async (content) => {
    console.log('--- Parsing:', content);
    const words = content.replace(/\n/g, ' ').split(/\s+/);
    const candidates = new Set();

    for (let i = 0; i < words.length; i++) {
        if (words[i].startsWith('@') && words[i].length > 1) {
            let tempName = words[i].substring(1);
            candidates.add(tempName.replace(/[.,!?]+$/, '')); // Add single word

            for (let j = 1; j <= 3; j++) {
                if (i + j < words.length) {
                    tempName += ' ' + words[i + j];
                    candidates.add(tempName.replace(/[.,!?]+$/, ''));
                }
            }
        }
        else if (words[i] === '@' && i + 1 < words.length) {
            let tempName = words[i + 1];
            candidates.add(tempName.replace(/[.,!?]+$/, ''));

            for (let j = 1; j <= 3; j++) { // Look ahead from the NEXT word
                if (i + 1 + j < words.length) {
                    tempName += ' ' + words[i + 1 + j];
                    candidates.add(tempName.replace(/[.,!?]+$/, ''));
                }
            }
        }
    }

    console.log('Candidates:', Array.from(candidates));

    if (candidates.size > 0) {
        const uniqueCandidates = Array.from(candidates);
        const regexConditions = uniqueCandidates.map(name => new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'));

        const [mlas, mps] = await Promise.all([
            Mla.find({ name: { $in: regexConditions } }).select('_id name'),
            Mp.find({ name: { $in: regexConditions } }).select('_id name')
        ]);

        console.log(`Found ${mlas.length} MLAs and ${mps.length} MPs`);
        if (mlas.length > 0) console.log('MLAs found:', mlas.map(m => m.name));
        if (mps.length > 0) console.log('MPs found:', mps.map(m => m.name));
    }
};

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('MongoDB Connected');

        // Check specific names
        const specificNames = ["Makkan Singh Raj Thakur", "Sathish Reddy .M", "Pijush Hazarika"];

        for (const name of specificNames) {
            const regex = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
            const mla = await Mla.findOne({ name: regex });
            const mp = await Mp.findOne({ name: regex });
            console.log(`DB Check for "${name}": MLA=${!!mla}, MP=${!!mp}`);
            if (mla) console.log(`  -> Actual MLA Name: "${mla.name}"`);
            if (mp) console.log(`  -> Actual MP Name: "${mp.name}"`);
        }

        // Test Parse Mentions
        console.log('\n--- SIMULATION ---');
        await parseMentions("@Pijush Hazarika fix it");
        await parseMentions("@Makkan Singh Raj Thakur fix it");
        await parseMentions("@ Makkan Singh Raj Thakur fix it"); // With space
        await parseMentions("@Sathish Reddy .M fix it");

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

connectDB();
