const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");
const { generateAnonName } = require('../utils/anonNames');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.CALLBACK_URL,
      proxy: true
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google profile:', profile);
        
        // Check if user already exists with this Google ID or email
        let user = await User.findOne({ 
          $or: [
            { googleId: profile.id },
            { email: profile.emails[0].value }
          ]
        });

        if (!user) {
          // Create a new user with Google profile data and an anonymous name
          // Generate a unique anonName (retry a few times if collision)
          let anonName = generateAnonName();
          for (let i = 0; i < 5; i++) {
            const existing = await User.findOne({ anonName });
            if (!existing) break;
            anonName = generateAnonName();
          }
          user = await User.create({
            name: profile.displayName,
            email: profile.emails[0].value,
            password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8), // Random password
            state: "unknown", // Default state
            googleId: profile.id,
            isEmailVerified: true, // Google accounts are verified
            // Store Google photo in the site's profilePicture field for consistency
            profilePicture: profile.photos?.[0]?.value || null,
            anonName: anonName // Assign anonymous name
          });
          console.log('New user created from Google login:', user._id);
        } else {
          // If user exists, ensure they have an anonymous name
          if (!user.anonName) {
            user.anonName = generateAnonName();
          }
          // Update Google-specific fields if not present
          if (!user.googleId) {
            user.googleId = profile.id;
          }
          user.isEmailVerified = true;
          if (!user.profilePicture && profile.photos?.[0]?.value) {
            user.profilePicture = profile.photos[0].value;
          }
          await user.save();
          console.log('Updated existing user with Google ID and/or anonName:', user._id);
        }

        done(null, user);
      } catch (err) {
        console.error('Google auth error:', err);
        done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  console.log('Serializing user:', user._id);
  done(null, user._id.toString());  // store user ID as string in session
});

passport.deserializeUser(async (id, done) => {
  try {
    console.log('Deserializing user:', id);
    const user = await User.findById(id);
    if (!user) {
      console.log('No user found with ID:', id);
      return done(null, false);
    }
    console.log('Found user:', user.email);
    done(null, user);
  } catch (err) {
    console.error('Deserialize error:', err);
    done(err, null);
  }
});

module.exports = passport;