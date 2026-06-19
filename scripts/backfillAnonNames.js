/**
 * Backfill anonName for existing users who don't have one.
 * Usage: node scripts/backfillAnonNames.js
 *
 * This script:
 *  - connects to MongoDB using the project's .env MONGO_URI
 *  - finds users with no anonName (null/undefined/empty)
 *  - generates a candidate anonName using utils/generateAnonName
 *  - retries up to maxAttempts to avoid collisions
 *  - updates each user and logs progress
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Ensure we use the same models and utils from the project
const User = require(path.join(__dirname, '..', 'models', 'User'));
const { generateAnonName } = require(path.join(__dirname, '..', 'utils', 'anonNames'));

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI is not set in environment. Set it in .env before running this script.');
  process.exit(1);
}

async function connect() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
  });
}

async function backfill() {
  try {
    await connect();
    console.log('Connected to MongoDB');

    // Find users missing anonName (null, missing, or empty string)
    const query = {
      $or: [
        { anonName: { $exists: false } },
        { anonName: null },
        { anonName: '' }
      ]
    };

    const users = await User.find(query).exec();
    console.log(`Found ${users.length} users missing anonName`);

    if (users.length === 0) {
      console.log('Nothing to do. Exiting.');
      await mongoose.disconnect();
      return;
    }

    let updated = 0;
    for (const user of users) {
      let attempts = 0;
      const maxAttempts = 10;
      let assigned = false;

      while (!assigned && attempts < maxAttempts) {
        attempts++;
        const candidate = generateAnonName();
        // Ensure uniqueness
        const exists = await User.findOne({ anonName: candidate }).lean().exec();
        if (exists) {
          console.log(`Collision for candidate ${candidate} (attempt ${attempts}), retrying...`);
          continue;
        }

        try {
          user.anonName = candidate;
          await user.save();
          assigned = true;
          updated++;
          console.log(`Assigned anonName ${candidate} to user ${user._id} (${user.email || user.name || 'no-email'})`);
        } catch (err) {
          console.error(`Failed to save anonName for user ${user._id} on attempt ${attempts}:`, err.message || err);
          // If save failed due to duplicate key (race), retry
          continue;
        }
      }

      if (!assigned) {
        console.warn(`Failed to assign anonName to user ${user._id} after ${maxAttempts} attempts`);
      }
    }

    console.log(`Backfill complete. Updated ${updated} users.`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('Backfill failed:', err);
    try { await mongoose.disconnect(); } catch (e) {}
    process.exit(1);
  }
}

if (require.main === module) {
  backfill();
}

module.exports = { backfill };
