const mongoose = require('mongoose');
const Mla = require('../models/Mla');
const User = require('../models/User');
require('../config/db');

async function migrateWorkDetails() {
    try {
        // Find an admin user to set as creator for existing work details
        const adminUser = await User.findOne({ isAdmin: true });
        
        if (!adminUser) {
            console.log('No admin user found. Please create an admin user first.');
            process.exit(1);
        }

        // Find all MLAs with work details
        const mlas = await Mla.find({ 'workDetails.0': { $exists: true } });
        
        console.log(`Found ${mlas.length} MLAs with work details`);

        for (const mla of mlas) {
            let updated = false;
            
            mla.workDetails = mla.workDetails.map(work => {
                if (!work.createdBy) {
                    work.createdBy = adminUser._id;
                    updated = true;
                }
                return work;
            });

            if (updated) {
                await mla.save();
                console.log(`Updated work details for MLA: ${mla.name}`);
            }
        }

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateWorkDetails();
