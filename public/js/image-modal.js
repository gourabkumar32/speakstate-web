// Image Modal Functionality
function showImageModal(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    modalImage.src = imageSrc;
    modal.classList.remove('hidden');
    
    // Enable zoom functionality
    let scale = 1;
    modalImage.style.transform = `scale(${scale})`;
    
    modalImage.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY * -0.01;
        scale = Math.min(Math.max(0.5, scale + delta), 3);
        modalImage.style.transform = `scale(${scale})`;
    });
}

function hideImageModal() {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    modal.classList.add('hidden');
    modalImage.style.transform = 'scale(1)';
}

document.addEventListener('DOMContentLoaded', function() {
    // Close modal when clicking outside the image
    const modal = document.getElementById('imageModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            hideImageModal();
        }
    });

    // Close modal with escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideImageModal();
        }
    });
});
