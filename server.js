// Load environment variables based on NODE_ENV
if (process.env.NODE_ENV === 'production') {
    require('dotenv').config({ path: '.env.production' });
} else {
    require('dotenv').config();
}

// Set default NODE_ENV if not set
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
console.log(`Running in ${process.env.NODE_ENV} mode`);

// Initialize passport
const passport = require('passport');
require("./config/passport");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const { fileURLToPath } = require('url');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const { isAuthenticated } = require('./middleware/auth');
const MongoStore = require('connect-mongo');
// Method override for forms
const methodOverride = require('./middleware/methodOverride');
const flashMiddleware = require('./middleware/flash');

// Create uploads directories if they don't exist
const uploadsDir = path.join(__dirname, 'public/uploads');
const tweetsDir = path.join(uploadsDir, 'tweets');
const candidatesDir = path.join(uploadsDir, 'candidates');
const profilesDir = path.join(uploadsDir, 'profiles');

[uploadsDir, tweetsDir, candidatesDir, profilesDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Load environment variables


const app = express();

// Configure method-override first
app.use(require('method-override')('_method', {
    methods: ['POST', 'GET']
}));

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle deprecation warning
mongoose.set('strictQuery', true);

// MongoDB Connection and HTTP + Socket.IO server initialization
const connectDB = async () => {
    try {
        console.log("Connecting to MongoDB with URI:", process.env.MONGO_URI);
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('MongoDB Connected Successfully');

        // Start HTTP server and attach Socket.IO so we can emit realtime updates
        const http = require('http');
        const server = http.createServer(app);
        const { Server } = require('socket.io');
        const io = new Server(server, {
            cors: {
                origin: ['https://speakstate.com', 'http://localhost:3000'],
                methods: ['GET', 'POST']
            }
        });

        // Attach io to app locals so controllers can emit events
        app.locals.io = io;

        io.on('connection', (socket) => {
            console.log('Socket connected:', socket.id);
            socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
        });

        const PORT = process.env.PORT || 3000;

        // Handle server errors (e.g., port already in use) gracefully
        server.on('error', (err) => {
            console.error('HTTP server error:', err);
            if (err && err.code === 'EADDRINUSE') {
                console.error(`Port ${PORT} is already in use. Stop the other process or set a different PORT environment variable.`);
                process.exit(1);
            }
        });

        server.listen(PORT, () => {
            console.log(`Server (with Socket.IO) is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

// Session and authentication setup

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: true,
    saveUninitialized: true,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        ttl: 24 * 60 * 60
    }),
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Flash middleware
app.use(flash());

// Custom flash middleware to set res.locals
app.use(flashMiddleware);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Make flash messages and user available to all views
app.use((req, res, next) => {
    // Set user in res.locals
    res.locals.user = req.user || req.session.user || null;
    // Set current path for returnTo redirection
    res.locals.currentPath = req.path;

    // Debug info for flash messages
    const error = req.flash('error');
    const success = req.flash('success');

    if (error.length || success.length) {
        console.log('Flash Messages Present:', {
            path: req.path,
            error: error,
            success: success
        });
    }

    next();
});

app.use(cors({
    origin: ['https://speakstate.com', 'http://localhost:3000'], // Allow both production and local development
    credentials: true,            // Must be true to send session cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));


// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/candidates'); // Make sure this directory exists
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
    }
});

// Make upload available globally
app.locals.upload = upload;

// Set view engine and views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploads with long caching for static image assets (helps performance)
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    setHeaders: (res, path) => {
        if (path.match(/\.(jpg|jpeg|png|webp|gif|avif|svg)$/i)) {
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        }
    }
}));


app.set('trust proxy', 1);

// Add session debugging middleware (removed for clarity)
// app.use((req, res, next) => { ... });


// Add a middleware to check if these routes are accessible
app.get('/check-access', (req, res) => {
    res.json({
        authenticated: !!req.session.user,
        sessionExists: !!req.session,
        cookiesEnabled: req.headers.cookie ? true : false,
        env: process.env.NODE_ENV
    });
});

// Test route for flash messages
app.get('/test-flash', (req, res) => {
    req.flash('success', 'This is a test success message');
    req.flash('error', 'This is a test error message');
    res.redirect('/auth/login');
});

app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.render("index");
    }
    if (req.session.user.isAdmin) {
        return res.redirect('/admin/dashboard');
    }
    // return res.redirect('/elections');
    return res.render("index");
});
// Legal pages
app.get('/privacy-policy', (req, res) => {
    res.render('legal/privacy');       // views/legal/privacy.ejs
});

app.get('/terms-and-conditions', (req, res) => {
    res.render('legal/terms');         // views/legal/terms.ejs
});

//news section
// --- Automatic Daily Trending Topics ---

// A master list of potential political topics. You can expand this list.
const masterTopicList = [
    "State Assembly Elections", "Digital India Act", "GST Council Meeting",
    "Infrastructure Projects", "Farmers Protest", "Foreign Policy",
    "Defence Acquisitions", "Unemployment Data", "Economic Growth",
    "Education Policy", "Healthcare Reforms", "Environmental Regulations",
    "Parliament Session", "Supreme Court Rulings", "Data Privacy Bill"
];

// Function to get a deterministic, daily-changing list of topics
function getDailyTrendingTopics(count = 5) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format

    // Create a simple "seeded" random number generator based on the date
    let seed = 0;
    for (let i = 0; i < today.length; i++) {
        seed += today.charCodeAt(i);
    }
    const seededRandom = () => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    };

    // Shuffle the master list using the seeded random function
    const shuffled = [...masterTopicList].sort(() => 0.5 - seededRandom());

    // Return the first 'count' topics
    return shuffled.slice(0, count);
}


// --- Routes ---

// Helper function to fetch news from the API
const fetchNewsFromAPI = async (topic, pageToken) => {
    const API_KEY = process.env.NEWSDATA_API_KEY;
    if (!API_KEY) {
        throw new Error("API Key not configured.");
    }
    const searchQuery = topic ? encodeURIComponent(topic) : 'India%20politics';
    let newsAPIUrl = `https://newsdata.io/api/1/news?apikey=${API_KEY}&q=${searchQuery}&category=politics&language=en&country=in`;

    if (pageToken) {
        newsAPIUrl += `&page=${pageToken}`;
    }

    const response = await axios.get(newsAPIUrl);
    return {
        articles: response.data.results || [],
        nextPage: response.data.nextPage || null
    };
};

// Route for the initial page load
app.get('/news', async (req, res) => {
    try {
        const data = await fetchNewsFromAPI("India politics", null);
        const trendingTopics = getDailyTrendingTopics(); // Get today's topics
        res.render('news', { ...data, error: null, trendingTopics });
    } catch (error) {
        console.error('Error fetching initial news:', error.message);
        let userMessage = 'An unexpected error occurred while fetching news.';
        if (error.response?.status) {
            userMessage = `Failed to load news. Service responded with status ${error.response.status}.`;
        }
        res.status(500).render('news', { articles: [], error: userMessage, nextPage: null, trendingTopics: getDailyTrendingTopics() });
    }
});

// API endpoint for filtering and infinite scroll
app.get('/api/news', async (req, res) => {
    const { page, topic } = req.query;
    try {
        const data = await fetchNewsFromAPI(topic, page);
        res.json(data);
    } catch (error) {
        console.error('API error fetching news:', error.message);
        res.status(500).json({ error: 'Failed to fetch more articles.' });
    }
});

app.get('/privacy-policy', (req, res) => {
    res.render('legal/privacy');
});

app.get('/terms-and-conditions', (req, res) => {
    res.render('legal/terms');
});


// Auth routes (must come before isAuthenticated middleware)
app.use('/auth', require('./routes/authRoutes'));

// Public routes (no authentication required)
// Explicitly bypass authentication for these routes
app.use('/elections', (req, res, next) => {
    // Ensure these routes are always accessible without authentication
    console.log('Accessing elections route:', req.path);
    next();
}, require('./routes/electionRoutes'));

// Public state/topic pages
app.use('/states', (req, res, next) => {
    console.log('Accessing states route:', req.path);
    next();
}, require('./routes/stateRoutes'));
// Combine MLA routes with work routes
const mpRoutes = require('./routes/mpRoutes');
const mlaRoutes = require('./routes/mlaRoutes');


// Mount MLA routes with work routes
app.use('/mlas', (req, res, next) => {
    console.log('Accessing MLA routes:', req.path);
    next();
}, mlaRoutes);

// Mount MP routes
app.use('/mps', (req, res, next) => {
    console.log('Accessing MP routes:', req.path);
    next();
}, mpRoutes);

// Mount API Routes for Mobile App
app.use('/api', require('./routes/apiRoutes'));

// Protected routes
app.use('/profile', isAuthenticated, require('./routes/profileRoutes'));
app.use('/admin', isAuthenticated, require('./routes/adminRoutes'));
app.use('/constituency', isAuthenticated, require('./routes/constituencyRoutes'));
// Tweet routes with authentication
app.use('/tweets', require('./routes/tweetRoutes'));
// Test route for flash messages
app.get('/test-flash', (req, res) => {
    req.flash('error', 'Test error message');
    res.redirect('/auth/login');
});




// Error handling middleware
app.use((err, req, res, next) => {

    // If headers have already been sent, delegate to the default Express handler
    // This will close the connection and prevent the 'HEADERS_SENT' crash
    if (res.headersSent) {
        return next(err);
    }

    // Otherwise, send a generic 500 error response
    res.status(500).render('error', { // Assumes you have an error.ejs view
        message: err.message || 'Something went wrong on our end. Please try again later.',
        error: err.message || 'Something went wrong on our end. Please try again later.'
    });
});
// Connect to MongoDB and start server
connectDB().catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
}); 
