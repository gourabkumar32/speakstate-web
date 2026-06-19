/**
 * Anonymize existing users by replacing their `name` with an anon handle.
 * Usage: node scripts/anonymizeUsers.js [--dry-run]
 * - --dry-run : will print planned changes but won't persist them
 *
 * Behavior:
 *  - For each user with a non-empty `name` and missing/empty `anonName`, generate a unique anonName
 *  - Save the original real name to `originalName` field (so it can be reverted later)
 *  - Replace `name` with the anonName (so UI shows anonName everywhere `name` was used)
 *  - Optionally dry-run to preview changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const User = require(path.join(__dirname, '..', 'models', 'User'));
const { generateAnonName } = require(path.join(__dirname, '..', 'utils', 'anonNames'));

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set in .env');
  process.exit(1);
}

async function connect() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
}

async function anonymize({ dryRun = false } = {}) {
  await connect();
  console.log('Connected to MongoDB');

  // Select users who currently have a real name (non-empty) and either no anonName or anonName is empty
  const query = {
    name: { $exists: true, $ne: '' },
    $or: [ { anonName: { $exists: false } }, { anonName: null }, { anonName: '' } ]
  };

  const users = await User.find(query).lean().exec();
  console.log(`Found ${users.length} users to anonymize`);

  if (users.length === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const results = [];
  for (const u of users) {
    let attempts = 0;
    const maxAttempts = 10;
    let assigned = false;
    let candidate = null;

    while (!assigned && attempts < maxAttempts) {
      attempts++;
      candidate = generateAnonName();
      const exists = await User.findOne({ anonName: candidate }).lean().exec();
      if (exists) continue;
      assigned = true;
    }

    if (!assigned) {
      console.warn(`Could not find unique anonName for user ${u._id} after ${maxAttempts} attempts`);
      results.push({ userId: u._id, ok: false, reason: 'no-unique-anonname' });
      continue;
    }

    const change = {
      userId: u._id,
      email: u.email || null,
      originalName: u.name,
      newAnonName: candidate
    };

    if (dryRun) {
      console.log('[dry-run] would set anonName for', u._id, '->', candidate, ' (original name: ', u.name, ')');
      results.push({ ...change, ok: true, applied: false });
      continue;
    }

    try {
      // Build update: set anonName and overwrite name. Also set originalName if not present.
      const update = { $set: { anonName: candidate, name: candidate } };
      if (!u.originalName) update.$set.originalName = u.name;

      // Persist changes
      const updated = await User.findByIdAndUpdate(u._id, update, { new: true, runValidators: true }).exec();
      console.log('Anonymized user:', u._id, '->', candidate);
      results.push({ ...change, ok: true, applied: true });
    } catch (err) {
      console.error('Failed to anonymize user', u._id, err.message || err);
      results.push({ ...change, ok: false, reason: err.message || err });
    }
  }

  console.log('Anonymization run complete. Summary:');
  console.table(results.map(r => ({ userId: r.userId, email: r.email, originalName: r.originalName, newAnonName: r.newAnonName, ok: r.ok, applied: r.applied })));

  await mongoose.disconnect();
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  anonymize({ dryRun }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { anonymize };
