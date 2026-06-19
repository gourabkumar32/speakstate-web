/**
 * Test script to verify MongoDB connection
 */

// Load environment variables
require('dotenv').config();

const mongoose = require('mongoose');

console.log('Testing MongoDB connection...');
console.log('MONGO_URI:', process.env.MONGO_URI);

// Try to connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connection successful!');
  mongoose.disconnect();
}).catch(err => {
  console.error('MongoDB connection failed:', err);
});