/**
 * form-preservation.js
 * 
 * Preserves tweet/post form content (text AND files) across reloads and login redirects.
 * 
 * Features:
 * 1. Autosaves text to localStorage.
 * 2. Autosaves selected files to IndexedDB.
 * 3. Auto-opens the modal if a draft is restored.
 * 4. Clears everything on successful post.
 */

const DB_NAME = 'SpeakStateDrafts';
const DB_VERSION = 1;
const STORE_NAME = 'media_drafts';
const TEXT_STORAGE_KEY = 'tweet_draft_content';
const SUBMISSION_FLAG_KEY = 'tweet_submission_pending';
const TEXT_AREA_ID = 'createTweetContent';
const FILE_INPUT_ID = 'createTweetMedia';

// --- IndexedDB Helpers ---
const openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const saveFilesToDB = async (files) => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const fileArray = Array.from(files);
    await store.put(fileArray, 'draft_files');
    return tx.complete;
};

const getFilesFromDB = async () => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const req = store.get('draft_files');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const clearDB = async () => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete('draft_files');
    return tx.complete;
};

const clearAllDrafts = async () => {
    console.log('Clearing all drafts...');
    localStorage.removeItem(TEXT_STORAGE_KEY);
    localStorage.removeItem(SUBMISSION_FLAG_KEY);
    try { await clearDB(); } catch (e) { console.error('DB Clear Error', e); }

    // Clear inputs if they exist on current page
    const textarea = document.getElementById(TEXT_AREA_ID);
    if (textarea) textarea.value = '';
    const fileInput = document.getElementById(FILE_INPUT_ID);
    if (fileInput) fileInput.value = '';
};

// --- Main Logic ---

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check Logic: Did we just submit?
    const successMessage = document.getElementById('flash-success-message') || document.querySelector('.bg-green-100');
    const errorMessage = document.querySelector('.bg-red-100');
    const submissionTimestamp = localStorage.getItem(SUBMISSION_FLAG_KEY);

    const isRecentSubmission = submissionTimestamp && (Date.now() - parseInt(submissionTimestamp) < 60000);

    if (successMessage && successMessage.textContent.trim().length > 0) {
        // Case A: Explicit Success Message
        await clearAllDrafts();
        return;
    }

    if (isRecentSubmission && !errorMessage) {
        // Case B: We submitted recently, and there is NO existing error message.
        // This likely means a successful redirect occurred.
        console.log('Detected recent submission without error. Clearing drafts.');
        await clearAllDrafts();
        return;
    }

    // Always clean up the flag if we are here (either error occurred, or not recent)
    localStorage.removeItem(SUBMISSION_FLAG_KEY);

    // --- Restoration Logic ---

    const textarea = document.getElementById(TEXT_AREA_ID);
    const fileInput = document.getElementById(FILE_INPUT_ID) || document.querySelector('input[name="media"]');
    const form = document.getElementById('createTweetForm');

    // Handle Form Submit
    if (form) {
        form.addEventListener('submit', (e) => {
            // Check auth status from data attribute
            const isLoggedIn = form.dataset.isLoggedIn === 'true';

            if (!isLoggedIn) {
                // PREVENT default POST submission to avoid 401/302 roundtrip issues
                e.preventDefault();
                console.log('User not logged in. Intercepting submission.');

                // Force save the current text content specifically for this event
                if (textarea) {
                    localStorage.setItem(TEXT_STORAGE_KEY, textarea.value);
                }

                // Construct redirect URL with returnTo
                const currentPath = window.location.pathname;
                const loginUrl = `/auth/login?returnTo=${encodeURIComponent(currentPath)}`;

                // Redirect user manually
                window.location.href = loginUrl;
            } else {
                localStorage.setItem(SUBMISSION_FLAG_KEY, Date.now());
            }
        });
    }

    let draftRestored = false;

    // 2. Restore Text
    if (textarea) {
        const savedText = localStorage.getItem(TEXT_STORAGE_KEY);
        if (savedText && !textarea.value.trim()) {
            textarea.value = savedText;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            draftRestored = true;
        }

        // Save on input
        textarea.addEventListener('input', (e) => {
            localStorage.setItem(TEXT_STORAGE_KEY, e.target.value);
        });
    }

    // 3. Restore Files
    if (fileInput) {
        try {
            const savedFiles = await getFilesFromDB();
            if (savedFiles && savedFiles.length > 0) {
                const dt = new DataTransfer();
                savedFiles.forEach(file => dt.items.add(file));
                fileInput.files = dt.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                draftRestored = true;
            }
        } catch (e) {
            console.error('Error restoring files:', e);
        }

        // Save on change
        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                await saveFilesToDB(e.target.files);
            }
        });
    }

    // 4. Auto-Open Modal
    if (draftRestored) {
        // Double check we are not in a success state
        if (!document.getElementById('flash-success-message')) {
            console.log('Draft restored, opening modal...');
            if (typeof openPostModal === 'function') {
                openPostModal();
            } else if (typeof openCreateTweetModal === 'function') {
                openCreateTweetModal();
            }
        }
    }
});
