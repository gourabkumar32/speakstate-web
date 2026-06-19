const mongoose = require('mongoose');

const mpSchema = new mongoose.Schema({
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
            console.log('MP Image getter - Original path:', image);

            if (!image) {
                console.log('Using default image');
                return '/uploads/candidates/default-mp.png';
            }
            if (image.startsWith('http')) {
                console.log('Using external image URL');
                return image;
            }
            if (image.startsWith('/uploads/')) {
                console.log('Image path already includes /uploads/');
                return image;
            }
            const path = `/uploads/candidates/${image}`;
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
            default: null
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
        get: function (val) {
            if (this.reviews && this.reviews.length > 0) {
                const avgRating = this.reviews.reduce((sum, r) => sum + r.rating, 0) / this.reviews.length;
                return parseFloat(avgRating.toFixed(1));
            }
            return 0;
        }
    },
    reviewCount: {
        type: Number,
        default: 0,
        get: function () {
            return this.reviews ? this.reviews.length : 0;
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

mpSchema.set('toJSON', { getters: true });
mpSchema.set('toObject', { getters: true });

module.exports = mongoose.model('Mp', mpSchema);
