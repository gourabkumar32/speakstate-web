let currentCandidateId = null;

async function voteYesNo(electionId, candidateId, constituencyName, voteType) {
    try {
        const response = await fetch('/elections/vote', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                electionId,
                candidateId,
                constituencyName,
                voteType
            })
        });

        const data = await response.json();

        if (data.success) {
            // Update only the vote button and vote count, not the entire candidate card
            const candidateCard = document.querySelector(`[data-candidate="${candidateId}"]`);
            const voteButtons = candidateCard.querySelectorAll('.vote-button');
            const votesCount = candidateCard.querySelector('.votes-count');
            const yesVotesElement = candidateCard.querySelector('.yes-votes');
            const noVotesElement = candidateCard.querySelector('.no-votes');
            const totalVotesElement = document.querySelector('.total-votes-count');

            // Update vote count
            if (votesCount) {
                votesCount.textContent = parseInt(votesCount.textContent) + 1;
            }

            // Update yes/no vote counts with real-time data from server
            if (yesVotesElement) {
                yesVotesElement.textContent = `Yes: ${data.yesVotes}`;
            }

            if (noVotesElement) {
                noVotesElement.textContent = `No: ${data.noVotes}`;
            }

            // Update total votes
            if (totalVotesElement) {
                totalVotesElement.textContent = parseInt(totalVotesElement.textContent) + 1;
            }

            // Replace vote buttons with vote counts and user's vote
            const buttonsContainer = voteButtons[0].parentNode;
            
            // Create vote counts display
            const votesDiv = document.createElement('div');
            votesDiv.className = 'mt-2 flex justify-between text-sm font-bold';
            votesDiv.innerHTML = `
                <span class="yes-votes text-green-600">Yes: ${data.yesVotes}</span>
                <span class="no-votes text-red-600">No: ${data.noVotes}</span>
            `;
            
            // Create user's vote message
            const userVoteDiv = document.createElement('div');
            userVoteDiv.className = 'mt-2 text-center text-sm text-gray-600';
            userVoteDiv.innerHTML = `
                You voted: <span class="${voteType === 'yes' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}">${voteType.charAt(0).toUpperCase() + voteType.slice(1)}</span>
            `;
            
            // Replace the buttons container with the vote counts and user's vote message
            const newContainer = document.createElement('div');
            newContainer.appendChild(votesDiv);
            newContainer.appendChild(userVoteDiv);
            buttonsContainer.parentNode.replaceChild(newContainer, buttonsContainer);

            // Replace all other vote buttons with vote counts and "Already voted in this state" message
            document.querySelectorAll('.vote-button').forEach(button => {
                if (button.closest(`[data-candidate="${candidateId}"]`)) return;
                
                // Find the buttons container for other candidates
                const otherButtonsContainer = button.parentNode;
                if (otherButtonsContainer && otherButtonsContainer.classList.contains('flex')) {
                    // Get the candidate card to find the yes/no vote counts
                    const otherCandidateCard = button.closest('[data-candidate]');
                    if (!otherCandidateCard) return;
                    
                    const otherCandidateId = otherCandidateCard.getAttribute('data-candidate');
                    const otherYesVotesElement = otherCandidateCard.querySelector('.yes-votes');
                    const otherNoVotesElement = otherCandidateCard.querySelector('.no-votes');
                    
                    // Check if this candidate's buttons have already been replaced
                    if (otherCandidateCard.querySelector('.vote-button-replaced')) return;
                    
                    // Create a container for the vote counts and message
                    const newContainer = document.createElement('div');
                    newContainer.classList.add('vote-button-replaced');
                    
                    // Create vote counts display
                    const votesDiv = document.createElement('div');
                    votesDiv.className = 'mt-2 flex justify-between text-sm font-bold';
                    votesDiv.innerHTML = `
                        <span class="yes-votes text-green-600">${otherYesVotesElement ? otherYesVotesElement.textContent : 'Yes: 0'}</span>
                        <span class="no-votes text-red-600">${otherNoVotesElement ? otherNoVotesElement.textContent : 'No: 0'}</span>
                    `;
                    
                    // Create "Already voted in this state" message
                    const stateVotedDiv = document.createElement('div');
                    stateVotedDiv.className = 'mt-2 text-center text-xs text-gray-500';
                    stateVotedDiv.textContent = '(Already voted in this state)';
                    
                    // Add both to the container and replace the buttons
                    newContainer.appendChild(votesDiv);
                    newContainer.appendChild(stateVotedDiv);
                    otherButtonsContainer.parentNode.replaceChild(newContainer, otherButtonsContainer);
                }
            });

            showNotification(`Vote (${voteType}) recorded successfully!`, 'success');
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Voting error:', error);
        showNotification('Error recording vote. Please try again.', 'error');
    }
}

// Keep the original function for backward compatibility
async function voteForCandidate(electionId, candidateId, constituencyName) {
    // Call the new function with a default 'yes' vote
    return voteYesNo(electionId, candidateId, constituencyName, 'yes');
}

async function loadReviews(candidateId) {
    const reviewsList = document.getElementById('reviewsList');
    reviewsList.innerHTML = '<p class="text-gray-400 text-center">Loading reviews...</p>';

    try {
        const response = await fetch(`/elections/candidate/${candidateId}/reviews`);
        const data = await response.json();

        if (data.success) {
            if (data.reviews && data.reviews.length > 0) {
                const sortedReviews = data.reviews.sort((a, b) => 
                    new Date(b.createdAt) - new Date(a.createdAt)
                );

                reviewsList.innerHTML = sortedReviews.map(review => {
                    const isAnon = !!review.anonymous;
                        const displayName = review.displayName || (isAnon ? (review.anonymousName || (review.user && review.user.anonName) || 'Anonymous') : ((review.user && (review.user.anonName || review.user.name)) || 'Anonymous'));
                    return `
                    <div class="bg-gray-700 rounded-lg p-4 mb-4">
                        <div class="flex justify-between items-center mb-2">
                            <div class="flex items-center">
                                <span class="text-yellow-400 mr-2">
                                    ${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}
                                </span>
                                <span class="text-gray-300">${displayName}</span>
                            </div>
                            <span class="text-gray-400 text-sm">
                                ${new Date(review.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                        <p class="text-gray-300">${review.comment}</p>
                    </div>
                `}).join('');
            } else {
                reviewsList.innerHTML = '<p class="text-gray-400 text-center">No reviews yet</p>';
            }
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Error loading reviews:', error);
        reviewsList.innerHTML = '<p class="text-red-400 text-center">Error loading reviews</p>';
    }
}

function showReviews(candidateId) {
    currentCandidateId = candidateId;
    document.getElementById('reviewModal').classList.remove('hidden');
    loadReviews(candidateId);
}

function closeReviewModal() {
    document.getElementById('reviewModal').classList.add('hidden');
    document.getElementById('reviewForm').reset();
    resetStars();
    currentCandidateId = null;
}

async function submitReview(candidateId, rating, comment) {
    try {
        const response = await fetch(`/elections/candidate/${candidateId}/reviews`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rating, comment })
        });

        // Check for authentication error
        if (response.status === 401) {
            showNotification('Please login to add a review', 'error');
            setTimeout(() => {
                window.location.href = '/auth/login';
            }, 2000);
            return false;
        }

        const data = await response.json();
        if (data.success) {
            showNotification('Review submitted successfully', 'success');
            await loadReviews(candidateId);
            document.getElementById('reviewForm').reset();
            setRating(0);
            return true;
        } else {
            showNotification(data.message || 'Error submitting review', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error submitting review:', error);
        showNotification('Error submitting review', 'error');
        return false;
    }
}

function resetStars() {
    const stars = document.querySelectorAll('.rating-star');
    stars.forEach(star => {
        star.textContent = '☆';
        star.classList.remove('text-yellow-400');
    });
    document.getElementById('ratingInput').value = '';
}

document.getElementById('reviewForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!currentCandidateId) {
        showNotification('No candidate selected', 'error');
        return;
    }

    const rating = document.getElementById('ratingInput').value;
    const comment = this.querySelector('[name="comment"]').value;

    if (!rating || !comment.trim()) {
        showNotification('Please provide both rating and comment', 'error');
        return;
    }

    const success = await submitReview(currentCandidateId, rating, comment);
    if (success) {
        closeReviewModal();
    }
});

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg ${
        type === 'success' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
    } z-50 transition-opacity duration-500`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

// Close modal when clicking outside
document.getElementById('reviewModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeReviewModal();
    }
});