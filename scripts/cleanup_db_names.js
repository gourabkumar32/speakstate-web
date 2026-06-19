const mongoose = require('mongoose');
const Mp = require('../models/Mp');
const Mla = require('../models/Mla');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('MongoDB Connected');

        console.log('Cleaning MPs...');
        const mps = await Mp.find({});
        let mpCount = 0;
        for (const mp of mps) {
            if (mp.name !== mp.name.trim()) {
                console.log(`Trimming MP: "${mp.name}" -> "${mp.name.trim()}"`);
                mp.name = mp.name.trim();
                await mp.save();
                mpCount++;
            }
        }
        console.log(`Updated ${mpCount} MPs.`);

        console.log('Cleaning MLAs...');
        const mlas = await Mla.find({});
        let mlaCount = 0;
        for (const mla of mlas) {
            if (mla.name !== mla.name.trim()) {
                console.log(`Trimming MLA: "${mla.name}" -> "${mla.name.trim()}"`);
                mla.name = mla.name.trim();
                await mla.save();
                mlaCount++;
            }
        }
        console.log(`Updated ${mlaCount} MLAs.`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

connectDB();
