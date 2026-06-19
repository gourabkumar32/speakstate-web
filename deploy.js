/**
 * Deployment script for production environment
 * 
 * This script helps prepare the application for production deployment
 * by setting the correct environment variables and configuration.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Ensure we're in production mode
process.env.NODE_ENV = 'production';

console.log('Starting deployment process...');

// Check if .env.production exists
if (!fs.existsSync(path.join(__dirname, '.env.production'))) {
  console.error('Error: .env.production file not found!');
  console.log('Please create a .env.production file with your production settings.');
  process.exit(1);
}

// Verify MongoDB connection
try {
  console.log('Testing MongoDB connection...');
  // Load environment variables from .env.production
  require('dotenv').config({ path: '.env.production' });
  
  // Try to connect to MongoDB
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    console.log('MongoDB connection successful!');
    mongoose.disconnect();
    
    // Continue with deployment
    console.log('\nDeployment preparation complete!');
    console.log('\nTo start the server in production mode, run:');
    console.log('  npm run start:win-prod  (on Windows)');
    console.log('  npm run start:prod     (on Linux/Mac)\n');
    
  }).catch(err => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
} catch (error) {
  console.error('Error during deployment:', error);
  process.exit(1);
}