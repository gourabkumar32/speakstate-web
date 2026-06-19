# Production Deployment Guide

## Overview

This guide explains how to deploy the voting website in production mode. The application has been updated to work correctly in both development (localhost) and production environments.

## Key Changes Made

1. **Environment Configuration**
   - Added `.env.production` file for production settings
   - Updated server.js to load the correct environment variables based on NODE_ENV

2. **Session Management**
   - Modified session configuration to work in both environments
   - Set secure cookies only in production
   - Increased session duration to 7 days

3. **CORS Configuration**
   - Updated CORS settings to allow requests from both localhost and production domain
   - Added proper headers and methods

4. **Authentication Flow**
   - Improved authentication middleware to remember the original URL
   - Updated login handler to redirect back to the original URL after login
   - Added a diagnostic endpoint at `/check-access` to verify session status

## Deployment Instructions

### 1. Set Up Environment

Ensure you have the correct environment files:

- `.env` - For development
- `.env.production` - For production

### 2. Start in Production Mode

On Linux/Mac:
```bash
npm run start:prod
```

On Windows:
```bash
npm run start:win-prod
```

### 3. Verify Deployment

Access the `/check-access` endpoint to verify that the server is running in production mode and sessions are working correctly.

### 4. Troubleshooting

If you encounter issues with authentication or sessions:

1. Check that cookies are enabled in the browser
2. Verify that the domain in CORS configuration matches your actual domain
3. Ensure MongoDB is running and accessible
4. Check server logs for any errors

## Notes for Live Deployment

When deploying to a live server:

1. Set NODE_ENV=production in your hosting environment
2. Update the CORS origin in server.js to match your actual domain
3. Ensure your domain uses HTTPS for secure cookie transmission
4. Consider using a process manager like PM2 to keep the application running

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start start-production.js --name "voting-website"
```