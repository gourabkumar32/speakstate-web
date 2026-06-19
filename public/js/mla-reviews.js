// Function to update the review count and average rating
function updateReviewStats(mlaId) {
    fetch(`/mlas/${mlaId}/review-stats`)
        .then(response => response.json())
        .then(data => {
            // Update review count
            const reviewCountElement = document.getElementById('reviewCount');
            if (reviewCountElement) {
                reviewCountElement.textContent = data.reviewCount;
            }

            // Update average rating
            const averageRatingElement = document.getElementById('averageRating');
            if (averageRatingElement) {
                averageRatingElement.textContent = data.averageRating.toFixed(1);
            }

            // Update rating stars
            const starsContainer = document.getElementById('averageStars');
            if (starsContainer) {
                const fullStars = Math.floor(data.averageRating);
                const hasHalfStar = data.averageRating % 1 >= 0.5;
                let starsHtml = '';
                
                // Add full stars
                for (let i = 0; i < fullStars; i++) {
                    starsHtml += '<span class="star filled">★</span>';
                }
                
                // Add half star if needed
                if (hasHalfStar) {
                    starsHtml += '<span class="star half-filled">★</span>';
                }
                
                // Add empty stars
                const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
                for (let i = 0; i < emptyStars; i++) {
                    starsHtml += '<span class="star">☆</span>';
                }
                
                starsContainer.innerHTML = starsHtml;
            }
        })
        .catch(error => {
            console.error('Error updating review stats:', error);
        });
}

// Function to handle review submission
function submitReview(event, mlaId) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const rating = formData.get('rating');
    const comment = formData.get('comment');

    fetch(`/mlas/${mlaId}/review`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rating, comment })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Clear the form
            event.target.reset();
            
            // Update the reviews list
            const reviewsContainer = document.querySelector('.reviews-container');
            if (reviewsContainer) {
                const newReview = `
                    <div class="review-item bg-white-700 rounded-lg p-4">
                        <div class="flex justify-between items-center mb-2">
                            <div class="">
                                <span class="name text-black-300 ml-2">${data.userName}</span>
                                <div class="stars text-yellow-400">
                                    ${Array(5).fill(0).map((_, i) => 
                                        `<span class="star ${i < rating ? 'filled' : ''}">${i < rating ? '★' : '☆'}</span>`
                                    ).join('')}
                                </div>
                            </div>
                            <span class="date text-black-400 text-sm">
                                ${new Date().toLocaleDateString()}
                            </span>
                        </div>
                        <p class="text-black-300 mt-2">${comment}</p>
                    </div>
                `;
                reviewsContainer.insertAdjacentHTML('afterbegin', newReview);
            }
            
            // Update the review stats
            updateReviewStats(mlaId);
            
            // Show success message
            const messageElement = document.getElementById('reviewMessage');
            if (messageElement) {
                messageElement.textContent = 'Review submitted successfully!';
                messageElement.className = 'text-green-500 mt-2';
                setTimeout(() => {
                    messageElement.textContent = '';
                }, 3000);
            }
        }
    })
    .catch(error => {
        console.error('Error submitting review:', error);
        const messageElement = document.getElementById('reviewMessage');
        if (messageElement) {
            messageElement.textContent = 'Error submitting review. Please try again.';
            messageElement.className = 'text-red-500 mt-2';
        }
    });
}

// Initialize star rating functionality
function initStarRating() {
    const ratingContainer = document.querySelector('.rating-input');
    if (ratingContainer) {
        const stars = ratingContainer.querySelectorAll('.star');
        const ratingInput = document.getElementById('ratingInput');
        
        stars.forEach((star, index) => {
            star.addEventListener('click', () => {
                const rating = index + 1;
                ratingInput.value = rating;
                stars.forEach((s, i) => {
                    s.classList.toggle('filled', i < rating);
                });
            });
            
            star.addEventListener('mouseover', () => {
                stars.forEach((s, i) => {
                    s.classList.toggle('hover', i <= index);
                });
            });
            
            star.addEventListener('mouseout', () => {
                stars.forEach(s => s.classList.remove('hover'));
            });
        });
    }
}
