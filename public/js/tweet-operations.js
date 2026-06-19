// Clean tweet operations matching the profile template
function toggleTweetMenu(button) {
    const allMenus = document.querySelectorAll('.tweet-menu');
    const menu = button.nextElementSibling;
    allMenus.forEach(m => { if (m !== menu) m.classList.add('hidden'); });
    menu.classList.toggle('hidden');

    if (!menu.classList.contains('hidden')) {
        const close = (e) => {
            if (!menu.contains(e.target) && e.target !== button) {
                menu.classList.add('hidden');
                document.removeEventListener('click', close);
            }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
    }
}

function openEditTweetModal() {
    const modal = document.getElementById('editTweetModal');
    if (modal) modal.classList.remove('hidden');
}

function closeEditTweetModal() {
    const modal = document.getElementById('editTweetModal');
    if (modal) modal.classList.add('hidden');
}

async function editTweet(tweetId) {
    // Fetch tweet data from the server JSON endpoint to populate the modal
    try {
        const res = await fetch(`/tweets/${tweetId}/json`, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('Failed to fetch tweet data');
        const payload = await res.json();
        if (!payload.success) throw new Error(payload.error || 'Failed to fetch tweet');

        const tweet = payload.tweet;
        const editForm = document.getElementById('editTweetForm');
        const editTextarea = document.getElementById('editTweetContent');
        const editId = document.getElementById('editTweetId');

        if (!editForm || !editTextarea || !editId) return console.error('Edit form elements missing');

        editForm.action = `/tweets/${tweetId}`;
        editTextarea.value = tweet.content || '';
        editId.value = tweet._id;

        // Populate extra fields
        const repInput = document.getElementById('editRepresentative');
        const constituencyInput = document.getElementById('editConstituency');
        const locationInput = document.getElementById('editLocation');
        const currentMediaGrid = document.getElementById('editTweetCurrentMediaGrid');
        const currentMediaWrapper = document.getElementById('editTweetCurrentMedia');

        if (repInput) repInput.value = tweet.representative || '';
        if (constituencyInput) constituencyInput.value = tweet.constituency || '';
        if (locationInput) locationInput.value = tweet.location || '';
        // Anonymous is default server-side now; no checkbox to set on edit modal.

        // Fill current media
        if (currentMediaGrid) {
            currentMediaGrid.innerHTML = '';
            const mediaArr = tweet.media || [];
            if (mediaArr.length > 0) {
                mediaArr.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'relative';
                    div.innerHTML = `
                        <img src="/uploads/tweets/${item}" class="w-full h-32 object-cover rounded-lg" />
                        <label class="absolute top-1 right-1 bg-white p-1 rounded-md">
                            <input type="checkbox" name="removeMedia" value="${item}" /> Remove
                        </label>
                    `;
                    currentMediaGrid.appendChild(div);
                });
                if (currentMediaWrapper) currentMediaWrapper.classList.remove('hidden');
            } else if (currentMediaWrapper) {
                currentMediaWrapper.classList.add('hidden');
            }
        }

        // Clear new media preview
        const mediaPreview = document.getElementById('editTweetMediaPreview');
        if (mediaPreview) mediaPreview.innerHTML = '';

        openEditTweetModal();
    } catch (err) {
        console.error('Error fetching tweet data for edit', err);
        alert('Could not load post for editing. Try reloading the page.');
    }
}

async function deleteTweet(tweetId) {
    if (!confirm('Are you sure you want to delete this post?')) return;
    try {
        const res = await fetch(`/tweets/${tweetId}`, { method: 'DELETE', headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
        if (!res.ok) throw new Error('Delete failed');
        // Reload to update UI and counters
        window.location.reload();
    } catch (err) {
        console.error(err);
        alert('Failed to delete post');
    }
}

// submit handler for edit tweet form
document.addEventListener('DOMContentLoaded', () => {
    const editForm = document.getElementById('editTweetForm');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tweetId = document.getElementById('editTweetId').value;
            const formData = new FormData(editForm);
            // server expects POST with method override or PUT depending on route
            try {
                const res = await fetch(editForm.action || `/tweets/${tweetId}`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    body: formData,
                    headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
                });
                const data = await res.json();
                if (data && data.success) {
                    // simple behaviour: reload to reflect changes
                    closeEditTweetModal();
                    window.location.reload();
                } else {
                    console.error('Update failed', data);
                    alert(data.error || data.message || 'Failed to update post');
                }
            } catch (err) {
                console.error(err);
                alert('Error updating post');
            }
        });
    }
});

// Preview new media in edit modal
document.addEventListener('DOMContentLoaded', () => {
    const mediaInput = document.getElementById('editTweetMedia');
    if (mediaInput) {
        mediaInput.addEventListener('change', function (event) {
            const preview = document.getElementById('editTweetMediaPreview');
            preview.innerHTML = '';
            Array.from(event.target.files).slice(0, 5).forEach(file => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        const div = document.createElement('div');
                        div.className = 'relative';
                        div.innerHTML = `
                            <img src="${e.target.result}" class="w-full h-32 object-cover rounded-lg" />
                        `;
                        preview.appendChild(div);
                    };
                    reader.readAsDataURL(file);
                }
            });
        });
    }
});
