// Modal state management

let currentElectionId = null;

function showCreateElectionModal() {
    document.getElementById('createElectionModal').classList.remove('hidden');
}

function closeCreateElectionModal() {
    document.getElementById('createElectionModal').classList.add('hidden');
    document.getElementById('createElectionForm').reset();
}

function showAddCandidateModal(electionId, constituencyName) {
    currentElectionId = electionId;
    document.getElementById('modalElectionId').value = electionId;
    document.getElementById('modalConstituency').value = constituencyName;
    document.getElementById('addCandidateModal').classList.remove('hidden');
}

function showAddConstituencyModal(electionId) {
    if (electionId) {
        currentElectionId = electionId;
        document.getElementById('modalElectionIdForConstituency').value = electionId;
    }
    document.getElementById('addConstituencyModal').classList.remove('hidden');
}

function closeAddConstituencyModal() {
    document.getElementById('addConstituencyModal').classList.add('hidden');
    document.getElementById('addConstituencyForm').reset();
    currentElectionId = null;
}

function showAddStateModal() {
    document.getElementById('addStateModal').classList.remove('hidden');
}

function closeAddStateModal() {
    document.getElementById('addStateModal').classList.add('hidden');
    document.getElementById('addStateForm').reset();
}

// Add State form submission handler
document.getElementById('addStateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';
    
    try {
        const response = await fetch('/admin/states', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(Object.fromEntries(formData)),
            credentials: 'include'
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('State added successfully!', 'success');
            closeAddStateModal();
            window.location.reload();
        } else {
            showNotification(data.message || 'Failed to add state', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add State';
        }
    } catch (error) {
        console.error('Error adding state:', error);
        showNotification('Error adding state. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add State';
    }
});

// Add Constituency form submission handler
document.getElementById('addConstituencyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';
    
    try {
        const response = await fetch('/admin/constituencies', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(Object.fromEntries(formData)),
            credentials: 'include'
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Constituency added successfully!', 'success');
            closeAddConstituencyModal();
            window.location.reload();
        } else {
            showNotification(data.message || 'Failed to add constituency', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Constituency';
        }
    } catch (error) {
        console.error('Error adding constituency:', error);
        showNotification('Error adding constituency. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Constituency';
    }
});

function closeAddCandidateModal() {
    document.getElementById('addCandidateModal').classList.add('hidden');
    document.getElementById('addCandidateForm').reset();
    currentElectionId = null;
}

// Form submissions
document.getElementById('createElectionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    try {
        const response = await fetch('/admin/elections', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(Object.fromEntries(formData))
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Election created successfully!', 'success');
            closeCreateElectionModal();
            window.location.reload();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error creating election:', error);
        showNotification('Error creating election. Please try again.', 'error');
    }
});

document.getElementById('addCandidateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';
    
    try {
        // Process manifesto and achievements as arrays
        const manifestoText = formData.get('manifesto');
        const achievementsText = formData.get('achievements');
        
        // Remove original form values
        formData.delete('manifesto');
        formData.delete('achievements');
        
        // Convert to arrays and add to formData
        if (manifestoText) {
            const manifestoArray = manifestoText.trim().split('\n').filter(item => item.trim() !== '');
            formData.append('manifesto', JSON.stringify(manifestoArray));
        }
        
        if (achievementsText) {
            const achievementsArray = achievementsText.trim().split('\n').filter(item => item.trim() !== '');
            formData.append('achievements', JSON.stringify(achievementsArray));
        }
        
        const response = await fetch('/admin/candidates', {
            method: 'POST',
            body: formData, // Send as multipart/form-data for file upload
            credentials: 'include' // Add credentials to include cookies for authentication
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Candidate added successfully!', 'success');
            closeAddCandidateModal();
            window.location.reload();
        } else {
            showNotification(data.message || 'Failed to add candidate', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Candidate';
        }
    } catch (error) {
        console.error('Error adding candidate:', error);
        let errorMessage = 'Error adding candidate. Please try again.';
        
        // Check if the error is related to JSON parsing
        if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
            errorMessage = 'Server returned an invalid response. Please check your connection and try again.';
        }
        
        showNotification(errorMessage, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Candidate';
    }
});

// Election management functions
async function toggleElectionStatus(electionId) {
    try {
        const response = await fetch(`/admin/elections/${electionId}/toggle`, {
            method: 'POST'
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Election status updated successfully!', 'success');
            window.location.reload();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error toggling election status:', error);
        showNotification('Error updating election status. Please try again.', 'error');
    }
}

async function deleteElection(electionId) {
    if (!confirm('Are you sure you want to delete this election? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/admin/elections/${electionId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Election deleted successfully!', 'success');
            window.location.reload();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error deleting election:', error);
        showNotification('Error deleting election. Please try again.', 'error');
    }
}

// Utility functions
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg ${
        type === 'success' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
    } transition-opacity duration-500`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

// Close modals when clicking outside
document.getElementById('createElectionModal').addEventListener('click', (e) => {
    if (e.target.id === 'createElectionModal') {
        closeCreateElectionModal();
    }
});

document.getElementById('addCandidateModal').addEventListener('click', (e) => {
    if (e.target.id === 'addCandidateModal') {
        closeAddCandidateModal();
    }
});

// Initialize date inputs with min date as today
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    document.querySelector('input[name="startDate"]').min = today;
    document.querySelector('input[name="endDate"]').min = today;
});

function showElectionDetails(electionId) {
    const detailsRow = document.getElementById(`details-${electionId}`);
    detailsRow.classList.toggle('hidden');
}

async function editCandidate(candidateId) {
    try {
        const response = await fetch(`/admin/candidates/${candidateId}`, {
            credentials: 'include' // ✅ added
        });
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('editCandidateId').value = candidateId;
            document.getElementById('editCandidateName').value = data.candidate.name;
            document.getElementById('editCandidateParty').value = data.candidate.party;
            
            // Populate manifesto, achievements, and corruption data
            if (data.candidate.manifesto && Array.isArray(data.candidate.manifesto)) {
                document.getElementById('editCandidateManifesto').value = data.candidate.manifesto.join('\n');
            }
            
            if (data.candidate.achievements && Array.isArray(data.candidate.achievements)) {
                document.getElementById('editCandidateAchievements').value = data.candidate.achievements.join('\n');
            }
            
            if (data.candidate.corruption && Array.isArray(data.candidate.corruption)) {
                document.getElementById('editCandidateCorruption').value = data.candidate.corruption.join('\n');
            }
            
            document.getElementById('editCandidateModal').classList.remove('hidden');
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error fetching candidate:', error);
        showNotification('Error loading candidate details', 'error');
    }
}

function closeEditCandidateModal() {
    document.getElementById('editCandidateModal').classList.add('hidden');
    document.getElementById('editCandidateForm').reset();
}

document.getElementById('editCandidateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const candidateId = formData.get('candidateId');
    
    // Process text areas into arrays
    const manifestoText = formData.get('manifesto') || '';
    const achievementsText = formData.get('achievements') || '';
    const corruptionText = formData.get('corruption') || '';
    
    // Split by lines and filter out empty lines
    const manifestoArray = manifestoText.split('\n').map(item => item.trim()).filter(Boolean);
    const achievementsArray = achievementsText.split('\n').map(item => item.trim()).filter(Boolean);
    const corruptionArray = corruptionText.split('\n').map(item => item.trim()).filter(Boolean);
    
    // Replace form values with JSON strings
    formData.set('manifesto', JSON.stringify(manifestoArray));
    formData.set('achievements', JSON.stringify(achievementsArray));
    formData.set('corruption', JSON.stringify(corruptionArray));
    
    try {
        const response = await fetch(`/admin/candidates/${candidateId}`, {
            method: 'PUT',
            body: formData,
            credentials: 'include'
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Candidate updated successfully!', 'success');
            closeEditCandidateModal();
            window.location.reload();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error updating candidate:', error);
        showNotification('Error updating candidate', 'error');
    }
});

async function deleteCandidate(candidateId) {
    if (!confirm('Are you sure you want to delete this candidate?')) {
        return;
    }

    try {
        const response = await fetch(`/admin/candidates/${candidateId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Candidate deleted successfully!', 'success');
            window.location.reload();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error deleting candidate:', error);
        showNotification('Error deleting candidate', 'error');
    }
}

// Modal state management
// Functions are already defined above, removing duplicates

// Form submissions
document.getElementById('createElectionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    try {
        const response = await fetch('/admin/elections', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(Object.fromEntries(formData)),
            credentials: 'include' // ✅ added
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Election created successfully!', 'success');
            closeCreateElectionModal();
            window.location.reload();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error creating election:', error);
        showNotification('Error creating election. Please try again.', 'error');
    }
});

document.getElementById('addCandidateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';
    
    try {
        // Get form values
        const manifestoText = formData.get('manifesto') || '';
        const achievementsText = formData.get('achievements') || '';
        const corruptionText = formData.get('corruption') || '';
        
        // Split text areas into arrays, filtering out empty lines
        const manifestoArray = manifestoText.split('\n').map(item => item.trim()).filter(Boolean);
        const achievementsArray = achievementsText.split('\n').map(item => item.trim()).filter(Boolean);
        const corruptionArray = corruptionText.split('\n').map(item => item.trim()).filter(Boolean);
        
        // Replace the original form values with the arrays
        formData.set('manifesto', JSON.stringify(manifestoArray));
        formData.set('achievements', JSON.stringify(achievementsArray));
        formData.set('corruption', JSON.stringify(corruptionArray));
        
        // Create the request
        const response = await fetch('/admin/candidates', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Candidate added successfully!', 'success');
            closeAddCandidateModal();
            window.location.reload();
        } else {
            showNotification(data.message || 'Failed to add candidate', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Candidate';
        }
    } catch (error) {
        console.error('Error adding candidate:', error);
        showNotification('Error adding candidate. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Candidate';
    }
});

// Election management functions
async function toggleElectionStatus(electionId) {
    try {
        const response = await fetch(`/admin/elections/${electionId}/toggle`, {
            method: 'POST',
            credentials: 'include' // ✅ added
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Election status updated successfully!', 'success');
            window.location.reload();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error toggling election status:', error);
        showNotification('Error updating election status. Please try again.', 'error');
    }
}

async function deleteElection(electionId) {
    if (!confirm('Are you sure you want to delete this election? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/admin/elections/${electionId}`, {
            method: 'DELETE',
            credentials: 'include' // ✅ added
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Election deleted successfully!', 'success');
            window.location.reload();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error deleting election:', error);
        showNotification('Error deleting election. Please try again.', 'error');
    }
}

// Utility functions
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg ${
        type === 'success' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
    } transition-opacity duration-500`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

// Close modals when clicking outside
document.getElementById('createElectionModal').addEventListener('click', (e) => {
    if (e.target.id === 'createElectionModal') {
        closeCreateElectionModal();
    }
});

document.getElementById('addCandidateModal').addEventListener('click', (e) => {
    if (e.target.id === 'addCandidateModal') {
        closeAddCandidateModal();
    }
});

// Initialize date inputs with min date as today
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    document.querySelector('input[name="startDate"]').min = today;
    document.querySelector('input[name="endDate"]').min = today;
});

function showElectionDetails(electionId) {
    const detailsRow = document.getElementById(`details-${electionId}`);
    detailsRow.classList.toggle('hidden');
}

async function editCandidate(candidateId) {
    try {
        const response = await fetch(`/admin/candidates/${candidateId}`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('editCandidateId').value = candidateId;
            document.getElementById('editCandidateName').value = data.candidate.name;
            document.getElementById('editCandidateParty').value = data.candidate.party;
            
            // Populate manifesto, achievements, and corruption data
            if (data.candidate.manifesto && Array.isArray(data.candidate.manifesto)) {
                document.getElementById('editCandidateManifesto').value = data.candidate.manifesto.join('\n');
            }
            
            if (data.candidate.achievements && Array.isArray(data.candidate.achievements)) {
                document.getElementById('editCandidateAchievements').value = data.candidate.achievements.join('\n');
            }
            
            if (data.candidate.corruption && Array.isArray(data.candidate.corruption)) {
                document.getElementById('editCandidateCorruption').value = data.candidate.corruption.join('\n');
            }
            
            document.getElementById('editCandidateModal').classList.remove('hidden');
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error fetching candidate:', error);
        showNotification('Error loading candidate details', 'error');
    }
}

function closeEditCandidateModal() {
    document.getElementById('editCandidateModal').classList.add('hidden');
    document.getElementById('editCandidateForm').reset();
}

document.getElementById('editCandidateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const candidateId = formData.get('candidateId');
    
    // Process text areas into arrays
    const manifestoText = formData.get('manifesto') || '';
    const achievementsText = formData.get('achievements') || '';
    const corruptionText = formData.get('corruption') || '';
    
    // Split by lines and filter out empty lines
    const manifestoArray = manifestoText.split('\n').map(item => item.trim()).filter(Boolean);
    const achievementsArray = achievementsText.split('\n').map(item => item.trim()).filter(Boolean);
    const corruptionArray = corruptionText.split('\n').map(item => item.trim()).filter(Boolean);
    
    // Replace form values with JSON strings
    formData.set('manifesto', JSON.stringify(manifestoArray));
    formData.set('achievements', JSON.stringify(achievementsArray));
    formData.set('corruption', JSON.stringify(corruptionArray));
    
    try {
        const response = await fetch(`/admin/candidates/${candidateId}`, {
            method: 'PUT',
            body: formData,
            credentials: 'include'
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Candidate updated successfully!', 'success');
            closeEditCandidateModal();
            window.location.reload();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error updating candidate:', error);
        showNotification('Error updating candidate', 'error');
    }
});

async function deleteCandidate(candidateId) {
    if (!confirm('Are you sure you want to delete this candidate?')) {
        return;
    }

    try {
        const response = await fetch(`/admin/candidates/${candidateId}`, {
            method: 'DELETE',
            credentials: 'include' // ✅ added
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Candidate deleted successfully!', 'success');
            window.location.reload();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error deleting candidate:', error);
        showNotification('Error deleting candidate', 'error');
    }
}

// Notification function
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'} text-white`;
    notification.textContent = message;
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('opacity-0', 'transition-opacity', 'duration-500');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}
