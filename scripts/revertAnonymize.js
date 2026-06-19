/**
 * Revert anonymization by restoring `name` from `originalName` for users that were anonymized.
 * Usage: node scripts/revertAnonymize.js [--dry-run] [--clear-anon]
 * - --dry-run : preview changes without writing
 * - --clear-anon : also clear the anonName field after restoring
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const User = require(path.join(__dirname, '..', 'models', 'User'));

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

async function revert({ dryRun = false, clearAnon = false } = {}) {
  await connect();
  console.log('Connected to MongoDB');

  // Users who have originalName set (these are candidates to restore)
  const query = { originalName: { $exists: true, $ne: null } };
  const users = await User.find(query).lean().exec();
  console.log(`Found ${users.length} users with originalName`);

  if (users.length === 0) {
    console.log('Nothing to revert.');
    await mongoose.disconnect();
    return;
  }

  const results = [];
  for (const u of users) {
    const change = { userId: u._id, email: u.email || null, currentName: u.name, originalName: u.originalName };
    if (dryRun) {
      console.log('[dry-run] would restore', u._id, 'name:', u.originalName, clearAnon ? 'and clear anonName' : '');
      results.push({ ...change, ok: true, applied: false });
      continue;
    }

    try {
      const update = { $set: { name: u.originalName }, $unset: { originalName: '' } };
      if (clearAnon) update.$unset.anonName = '';

      const updated = await User.findByIdAndUpdate(u._id, update, { new: true, runValidators: true }).exec();
      console.log('Restored user:', u._id, '-> name:', updated.name);
      results.push({ ...change, ok: true, applied: true });
    } catch (err) {
      console.error('Failed to revert user', u._id, err.message || err);
      results.push({ ...change, ok: false, reason: err.message || err });
    }
  }

  console.log('Revert run complete. Summary:');
  console.table(results.map(r => ({ userId: r.userId, email: r.email, currentName: r.currentName, originalName: r.originalName, ok: r.ok, applied: r.applied })));

  await mongoose.disconnect();
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const clearAnon = process.argv.includes('--clear-anon');
  revert({ dryRun, clearAnon }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { revert };
