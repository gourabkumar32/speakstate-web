/**
 * Production server starter script
 * This script sets NODE_ENV to production and starts the server
 */

process.env.NODE_ENV = 'production';
console.log('Starting server in PRODUCTION mode');

// Load the main server file
require('./server.js');