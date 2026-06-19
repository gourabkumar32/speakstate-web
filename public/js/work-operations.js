// Function to edit work
function editWork(type, leaderId, workId) {
    // Fetch the work details
    fetch(`/profile/work/${type}/${leaderId}/${workId}`, { credentials: 'same-origin' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Populate the edit form
                document.getElementById('editLeaderType').value = type;
                document.getElementById('editLeaderId').value = leaderId;
                document.getElementById('editWorkId').value = workId;
                document.getElementById('editWorkTitle').value = data.work.title;
                document.getElementById('editWorkDescription').value = data.work.description || '';
                document.getElementById('editWorkLocation').value = data.work.location || '';
                document.getElementById('editWorkStatus').value = data.work.status;

                // Populate images using the helper from edit-work.ejs
                if (typeof populateEditWorkImages === 'function') {
                    populateEditWorkImages(data.work.images);
                } else {
                    // Fallback manual population if helper not available in scope (it should be)
                    // (Assuming populateEditWorkImages logic is moved or duplicated here if needed, 
                    // but better to rely on what's in edit-work.ejs if accessible globally)
                    // For now, let's trigger the global function if it exists.
                }

                // Show the edit modal
                document.getElementById('editWorkModal').classList.remove('hidden');
            } else {
                alert('Failed to fetch work details');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while fetching work details');
        });
}

// Function to delete work
function deleteWork(type, leaderId, workId) {
    if (confirm('Are you sure you want to delete this work update?')) {
        fetch(`/profile/work/${type}/${leaderId}/${workId}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Remove the work item from the DOM
                    const workElement = document.querySelector(`[data-work-id="${workId}"]`);
                    if (workElement) {
                        workElement.remove();
                    }
                } else {
                    alert(data.error || 'Failed to delete work update');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('An error occurred while deleting the work update');
            });
    }
}

// Function to close edit modal
function closeEditWorkModal() {
    document.getElementById('editWorkModal').classList.add('hidden');
}

// Handle edit form submission
document.addEventListener('DOMContentLoaded', function () {
    // Handle Work Edit Form
    const editWorkForm = document.getElementById('editWorkForm');
    if (editWorkForm) {
        editWorkForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const formData = new FormData(this);
            const type = document.getElementById('editLeaderType').value;
            const leaderId = document.getElementById('editLeaderId').value;
            const workId = document.getElementById('editWorkId').value;

            // Debug: log all FormData entries (keys and sample values)
            try {
                console.group('Submitting editWork form');
                for (const pair of formData.entries()) {
                    const key = pair[0];
                    let val = pair[1];
                    if (val instanceof File) {
                        console.log(key, '(File):', val.name, val.size, val.type);
                    } else {
                        const text = String(val);
                        console.log(key, text.length > 200 ? text.substring(0, 200) + '...' : text);
                    }
                }
                console.groupEnd();
            } catch (err) {
                console.warn('Could not enumerate FormData entries', err);
            }

            fetch(`/profile/work/${type}/${leaderId}/${workId}`, {
                method: 'PUT',
                credentials: 'same-origin',
                body: formData,
                headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
            })
                .then(async response => {
                    console.log('Server responded', { status: response.status, ok: response.ok });
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const data = await response.json();
                        return { response, data };
                    }
                    // If server returned non-JSON (HTML redirect/page), capture text for easier debugging
                    const text = await response.text();
                    return { response, data: null, text };
                })
                .then(result => {
                    const { response, data, text } = result;
                    if (data) {
                        if (data.success) {
                            closeEditWorkModal();
                            window.location.reload();
                        } else {
                            console.error('Update failed:', data);
                            alert(data.error || data.message || 'Failed to update work details');
                        }
                    } else {
                        console.error('Non-JSON response from server:', { status: response.status, body: text });
                        alert('Unexpected server response. Check console for details.');
                    }
                })
                .catch(error => {
                    console.error('Network or parsing error during update:', error);
                    alert('An error occurred while updating work details. See console for details.');
                });
        });
    }
});