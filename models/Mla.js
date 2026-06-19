const mongoose = require('mongoose');
const path = require('path');

const mlaSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true,
        get: function (image) {
            // Defensive: trim whitespace/newlines which sometimes get stored
            try {
                if (typeof image === 'string') image = image.trim();
            } catch (e) {
                // ignore
            }

            // Log the image path for debugging
            console.log('MLA Image getter - Original path:', image);

            if (!image) {
                console.log('Using default image');
                return '/uploads/mlas/default-mla.png';
            }
            if (image.startsWith('http')) {
                console.log('Using external image URL');
                return image;
            }
            if (image.startsWith('/uploads/')) {
                console.log('Image path already includes /uploads/');
                return image;
            }
            const path = `/uploads/mlas/${image}`;
            console.log('Constructed image path:', path);
            return path;
        }
    },
    party: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    constituency: {
        type: String,
        required: true
    },
    description: String,
    workDetails: [{
        title: {
            type: String,
            required: false
        },
        description: {
            type: String,
            required: false
        },
        date: {
            type: Date,
            default: Date.now
        },
        location: {
            type: String,
            required: false
        },
        images: [String],
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        status: {
            type: String,
            enum: ['', 'Needed', 'Planned', 'In Progress', 'Completed', 'Delayed', 'Cancelled', 'On Hold'],
            default: '',
            required: false
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        }
    }],
    reviews: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        comment: String,
        anonymous: {
            type: Boolean,
            default: false
        },
        anonymousName: {
            type: String,
            trim: true,
            default: null
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
});

// Virtual for thumbnail path (derived from stored filename)
mlaSchema.virtual('thumbnail').get(function () {
    // Access raw stored filename (no getters)
    const stored = this.get('image', null, { getters: false });
    if (!stored) return '/uploads/mlas/default-mla.png';
    // If it's already a path (starts with /uploads/ or http), try to derive a thumbnail
    if (stored.startsWith('/uploads/') || stored.startsWith('http')) {
        // If it already includes -thumb, return as-is
        if (stored.includes('-thumb')) return stored;
        const ext = path.extname(stored);
        const base = stored.slice(0, -ext.length);
        // Ensure thumbs live under /uploads/mlas when possible
        if (base.indexOf('/uploads/mlas/') === 0) return base + '-thumb.webp';
        if (base.indexOf('/uploads/candidates/') === 0) return base.replace('/uploads/candidates/', '/uploads/mlas/') + '-thumb.webp';
        return base + '-thumb.webp';
    }
    // It's a filename like 'candidate-123.webp' -> construct thumb filename
    const ext = path.extname(stored);
    const base = stored.slice(0, -ext.length);
    return `/uploads/mlas/${base}-thumb.webp`;
});

module.exports = mongoose.model('Mla', mlaSchema); 