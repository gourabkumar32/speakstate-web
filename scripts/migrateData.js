const mongoose = require('mongoose');

// Connect to both databases
const sourceDb = mongoose.createConnection('mongodb://127.0.0.1:27017/election_system', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const targetDb = mongoose.createConnection('mongodb://127.0.0.1:27017/voting_system', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Define schemas for both connections
const electionSchema = new mongoose.Schema({}, { strict: false });
const constituencySchema = new mongoose.Schema({}, { strict: false });
const candidateSchema = new mongoose.Schema({}, { strict: false });
const userSchema = new mongoose.Schema({}, { strict: false });
const mlaSchema = new mongoose.Schema({}, { strict: false });

// Create models for both connections
const SourceElection = sourceDb.model('Election', electionSchema);
const SourceConstituency = sourceDb.model('Constituency', constituencySchema);
const SourceCandidate = sourceDb.model('Candidate', candidateSchema);
const SourceUser = sourceDb.model('User', userSchema);
const SourceMLA = sourceDb.model('MLA', mlaSchema);

const TargetElection = targetDb.model('Election', electionSchema);
const TargetConstituency = targetDb.model('Constituency', constituencySchema);
const TargetCandidate = targetDb.model('Candidate', candidateSchema);
const TargetUser = targetDb.model('User', userSchema);
const TargetMLA = targetDb.model('MLA', mlaSchema);

async function migrateData() {
    try {
        // Migrate Elections
        const elections = await SourceElection.find({});
        if (elections.length > 0) {
            await TargetElection.deleteMany({}); // Clear existing data
            await TargetElection.insertMany(elections);
            console.log(`Migrated ${elections.length} elections`);
        }

        // Migrate Constituencies
        const constituencies = await SourceConstituency.find({});
        if (constituencies.length > 0) {
            await TargetConstituency.deleteMany({});
            await TargetConstituency.insertMany(constituencies);
            console.log(`Migrated ${constituencies.length} constituencies`);
        }

        // Migrate Candidates
        const candidates = await SourceCandidate.find({});
        if (candidates.length > 0) {
            await TargetCandidate.deleteMany({});
            await TargetCandidate.insertMany(candidates);
            console.log(`Migrated ${candidates.length} candidates`);
        }

        // Migrate MLAs
        const mlas = await SourceMLA.find({});
        if (mlas.length > 0) {
            await TargetMLA.deleteMany({});
            await TargetMLA.insertMany(mlas);
            console.log(`Migrated ${mlas.length} MLAs`);
        }

        // Migrate Users (except the new admin) - Handle duplicates
        const users = await SourceUser.find({ email: { $ne: 'admin@example.com' } });
        if (users.length > 0) {
            // Get existing users emails to avoid duplicates
            const existingUsers = await TargetUser.find({}, { email: 1 });
            const existingEmails = new Set(existingUsers.map(u => u.email));

            // Filter out users that already exist
            const newUsers = users.filter(user => !existingEmails.has(user.email));

            if (newUsers.length > 0) {
                // Create new documents without _id to avoid conflicts
                const usersToInsert = newUsers.map(user => {
                    const userObj = user.toObject();
                    delete userObj._id;  // Remove the _id field
                    return userObj;
                });

                await TargetUser.insertMany(usersToInsert);
                console.log(`Migrated ${newUsers.length} users`);
            }
        }

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    }
}

migrateData(); 