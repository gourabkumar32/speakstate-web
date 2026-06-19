// Initialize tweet interaction handlers. We define the handlers synchronously so
// they're available immediately even if this script is loaded after DOMContentLoaded.
function initTweetInteractions() {
    // Helper function to redirect to login
    function redirectToLogin(message = 'Please log in to continue') {
        const currentPath = window.location.pathname + window.location.search;
        window.location.href = `/auth/login?returnTo=${encodeURIComponent(currentPath)}&message=${encodeURIComponent(message)}`;
    }

    // Like button functionality — expects (event, tweetId, anonymous)
    window.handleLike = function (event, tweetId, anonymous = true) {
        // event may be a MouseEvent or omitted if called programmatically
        try { if (event && typeof event.preventDefault === 'function') event.preventDefault(); } catch (e) { }

        // If called as handleLike(tweetId) from older inline code, normalize arguments
        if (typeof tweetId === 'undefined' && typeof event === 'string') {
            tweetId = event;
            event = null;
        }

        // Determine the button element if possible
        const button = (event && event.currentTarget) || document.querySelector(`button.like-button[data-tweet-id="${tweetId}"]`);
        const isAuthenticated = button ? (button.getAttribute('data-auth') === 'true') : true;

        if (!isAuthenticated) {
            redirectToLogin('Please log in to like posts');
            return;
        }

        fetch(`/tweets/${tweetId}/like`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ anonymous: anonymous })
        })
            .then(response => {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    if (!button) return;
                    const icon = button.querySelector('i.fa-heart');
                    const count = button.querySelector('.like-count');

                    if (data.liked) {
                        icon.classList.remove('far');
                        icon.classList.add('fas', 'text-[#ed4956]');
                        count.classList.add('text-[#ed4956]');
                    } else {
                        icon.classList.remove('fas', 'text-[#ed4956]');
                        icon.classList.add('far');
                        count.classList.remove('text-[#ed4956]');
                    }

                    // Update the like count
                    count.textContent = data.likeCount || '0';
                }
            })
            .catch(error => {
                console.error('Error:', error);
                if (error.message === 'Unauthorized') {
                    redirectToLogin('Your session has expired. Please log in again.');
                }
            });
    };

    // Comment handling — expects (event, tweetId)
    window.handleComment = function (event, tweetId) {
        try { if (event && typeof event.preventDefault === 'function') event.preventDefault(); } catch (e) { }

        // If called as handleComment(tweetId)
        if (typeof tweetId === 'undefined' && typeof event === 'string') {
            tweetId = event;
            event = null;
        }

        const button = (event && event.currentTarget) || document.querySelector(`button.comment-button[data-tweet-id="${tweetId}"]`);
        const isAuthenticated = button ? (button.getAttribute('data-auth') === 'true') : true;

        if (!isAuthenticated) {
            redirectToLogin('Please log in to comment');
            return;
        }

        window.toggleComment(tweetId);
    };

    // Comment section toggle
    window.toggleComment = function (tweetId) {
        const commentsSection = document.getElementById(`comments-section-${tweetId}`);
        if (commentsSection) {
            const isHidden = commentsSection.classList.contains('hidden');
            commentsSection.classList.toggle('hidden');

            if (!isHidden) return;

            const textarea = commentsSection.querySelector('textarea');
            if (textarea) textarea.focus();

            // Scroll the comments section into view
            commentsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    // Attach submit handlers for comment forms
    document.querySelectorAll('.comment-form').forEach(form => {
        // Avoid attaching duplicate listeners
        if (form.__tweetInteractionsAttached) return;
        form.__tweetInteractionsAttached = true;

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            const tweetId = this.getAttribute('data-tweet-id');
            const textarea = this.querySelector('textarea');
            const content = textarea.value.trim();

            if (!content) return;

            fetch(`/tweets/${tweetId}/comments`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content })
            })
                .then(response => {
                    if (response.status === 401) {
                        throw new Error('Unauthorized');
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.success) {
                        // Clear textarea
                        textarea.value = '';

                        // Update comment count
                        const button = document.querySelector(`button.comment-button[data-tweet-id="${tweetId}"]`);
                        const count = button ? button.querySelector('.comment-count') : null;
                        if (count) count.textContent = data.commentCount;

                        // Add new comment to list
                        const commentsList = document.querySelector(`#comments-list-${tweetId}`);
                        if (commentsList && data.comment) {
                            const commentHtml = createCommentElement(data.comment);
                            commentsList.insertAdjacentHTML('beforeend', commentHtml);
                        }
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    if (error.message === 'Unauthorized') {
                        redirectToLogin('Your session has expired. Please log in again.');
                    }
                });
        });
    });
    // Helper function to create comment HTML
    function createCommentElement(comment) {
        const isAnonymous = comment.anonymous === true || comment.anonymous === 'true';
        const displayName = comment.displayName || (isAnonymous ? (comment.anonymousName || (comment.user && comment.user.anonName) || 'Anonymous') : ((comment.user && comment.user.anonName) || (comment.user && comment.user.name) || 'Anonymous'));

        // Determine avatar source if available. If none, we'll render an initial instead.
        let avatarSrc = null;
        if (comment.displayProfilePicture) {
            avatarSrc = comment.displayProfilePicture.startsWith('/') ? comment.displayProfilePicture : ('/uploads/profiles/' + comment.displayProfilePicture);
        } else if (isAnonymous) {
            avatarSrc = '/img/anonymous-avatar.svg';
        } else if (comment.user && comment.user.profilePicture) {
            avatarSrc = '/uploads/profiles/' + comment.user.profilePicture;
        }

        const firstChar = (displayName || '').toString().trim().charAt(0) || '?';
        const upperChar = firstChar.toUpperCase();

        if (avatarSrc) {
            return `
                <div class="flex space-x-3 mb-4">
                    <img src="${avatarSrc}" 
                         alt="${displayName}" 
                         class="w-8 h-8 rounded-full object-cover">
                    <div>
                        <p class="font-semibold">${displayName}</p>
                        <p class="text-gray-600">${comment.content}</p>
                        <p class="text-xs text-gray-400 mt-1 comment-time" data-timestamp="${comment.createdAt}">
                            ${formatTimeAgo(comment.createdAt)}
                        </p>
                    </div>
                </div>
            `;
        }

        // No avatar image — render initial fallback
        return `
            <div class="flex space-x-3 mb-4">
                <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold overflow-hidden">
                    <span aria-hidden="true">${upperChar}</span>
                </div>
                <div>
                    <p class="font-semibold">${displayName}</p>
                    <p class="text-gray-600">${comment.content}</p>
                    <p class="text-xs text-gray-400 mt-1 comment-time" data-timestamp="${comment.createdAt}">
                        ${formatTimeAgo(comment.createdAt)}
                    </p>
                </div>
            </div>
        `;
    }

    // Format timestamps
    function formatTimeAgo(timestamp) {
        const now = new Date();
        const diff = now - new Date(timestamp);
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }

    // Update timestamps periodically
    function updateTimestamps() {
        document.querySelectorAll('.tweet-time, .comment-time').forEach(element => {
            element.textContent = formatTimeAgo(element.dataset.timestamp);
        });
    }

    // Initialize timestamps
    updateTimestamps();
    setInterval(updateTimestamps, 60000);
}

// Initialize immediately in case DOM is already ready
initTweetInteractions();

// Also initialize on DOMContentLoaded in case script loads early
document.addEventListener('DOMContentLoaded', initTweetInteractions);

// --- Share Functionality ---
let currentShareTweetId = null;

window.handleShare = function (event, tweetId) {
    if (event && event.preventDefault) event.preventDefault();
    if (event && event.stopPropagation) event.stopPropagation();

    // Try to get content from the DOM
    const tweetEl = document.querySelector(`article[data-tweet-id="${tweetId}"]`);
    const contentEl = tweetEl ? tweetEl.querySelector('.tweet-body-text') : null;
    let text = contentEl ? contentEl.textContent.trim() : 'Check out this post on SpeakState!';

    // Truncate if too long (optional, but good for some platforms)
    if (text.length > 280) text = text.substring(0, 277) + '...';

    // Construct URL with hash for deep linking
    const url = `${window.location.origin}/tweets#tweet-${tweetId}`;
    const shareData = {
        title: 'SpeakState Post',
        text: text,
        url: url
    };

    // 1. Try Native Share API
    if (navigator.share) {
        navigator.share(shareData)
            .then(() => console.log('Shared successfully'))
            .catch((err) => console.log('Error sharing:', err));
    } else {
        // 2. Fallback to Modal
        currentShareTweetId = tweetId;
        window.currentShareUrl = url;
        window.currentShareText = text;

        const modal = document.getElementById('shareModal');
        if (modal) {
            modal.classList.remove('hidden');
        } else {
            // Fallback if modal is missing (shouldn't happen)
            alert('Share not supported on this device. Copy link manually: ' + url);
        }
    }
};

window.closeShareModal = function () {
    const modal = document.getElementById('shareModal');
    if (modal) modal.classList.add('hidden');
    currentShareTweetId = null;
    window.currentShareUrl = null;
    window.currentShareText = null;
};

window.shareToPlatform = function (platform) {
    const url = encodeURIComponent(window.currentShareUrl || window.location.href);
    const text = encodeURIComponent(window.currentShareText || 'Check this out!');

    let shareUrl = '';

    switch (platform) {
        case 'whatsapp':
            shareUrl = `https://api.whatsapp.com/send?text=${text}%20${url}`;
            break;
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
            break;
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
            break;
        case 'copy':
            copyToClipboard(window.currentShareUrl || window.location.href);
            return; // Don't open window
    }

    if (shareUrl) {
        window.open(shareUrl, '_blank', 'width=600,height=400');
        closeShareModal();
    }
};

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Link copied to clipboard!');
            closeShareModal();
        }).catch(err => {
            console.error('Failed to copy: ', err);
            prompt('Copy this link:', text);
        });
    } else {
        // Fallback
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('Link copied to clipboard!');
            closeShareModal();
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
            prompt('Copy this link:', text);
        }
        document.body.removeChild(textArea);
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 3000);
    } else {
        alert(message);
    }
}
