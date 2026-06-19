const mongoose = require('mongoose');
const Mla = require('../models/Mla');
const User = require('../models/User');
require('../config/db');

async function fixWorkDetails() {
    try {
        console.log('Starting work details fix...');

        // Find an admin user to set as creator for existing work details
        const adminUser = await User.findOne({ isAdmin: true });
        
        if (!adminUser) {
            console.log('No admin user found. Creating a default admin...');
            const newAdmin = new User({
                username: 'admin',
                email: 'admin@example.com',
                password: 'admin123', // You should change this
                isAdmin: true
            });
            await newAdmin.save();
            console.log('Created default admin user');
        }

        const userId = adminUser ? adminUser._id : newAdmin._id;

        // Find all MLAs with work details
        const mlas = await Mla.find({ workDetails: { $exists: true } });
        
        console.log(`Found ${mlas.length} MLAs with work details`);

        for (const mla of mlas) {
            let updated = false;
            
            // Ensure workDetails is an array
            if (!Array.isArray(mla.workDetails)) {
                mla.workDetails = [];
            }

            // Fix each work detail
            mla.workDetails = mla.workDetails.map(work => {
                if (!work.createdBy || typeof work.createdBy !== 'object') {
                    work.createdBy = userId;
                    updated = true;
                }
                if (!work.date) {
                    work.date = new Date();
                    updated = true;
                }
                if (!work.status) {
                    work.status = 'Completed';
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

fixWorkDetails();
