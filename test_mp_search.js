
const mongoose = require('mongoose');
const Mp = require('./models/Mp');
const Mla = require('./models/Mla');
const path = require('path');
require('dotenv').config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('MongoDB Connected');

        // Test query - search for "a"
        const query = "a";
        const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fuzzyQuery = safeQuery.split('').join('\\s*');
        const regex = new RegExp(fuzzyQuery, 'i');

        console.log(`Testing search for query: "${query}" (Regex: ${regex})`);

        const [mlas, mps] = await Promise.all([
            Mla.find({ name: regex }).limit(5),
            Mp.find({ name: regex }).limit(5)
        ]);

        console.log(`Found ${mlas.length} MLAs`);
        if (mlas.length > 0) {
            console.log('First MLA:', mlas[0].name);
        }

        console.log(`Found ${mps.length} MPs`);
        if (mps.length > 0) {
            console.log('First MP:', mps[0]);
        } else {
            // If no MPs found with regex, try finding ALL MPs just to check if they exist
            const allMps = await Mp.find({}).limit(1);
            if (allMps.length > 0) {
                console.log('MPs exist in DB, but regex match failed.');
                console.log('Sample MP name:', allMps[0].name);
            } else {
                console.log('No MPs found in DB at all.');
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

connectDB();
