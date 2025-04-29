document.addEventListener('DOMContentLoaded', () => {
  // Handle the close onboarding button
  document.getElementById('closeOnboarding').addEventListener('click', () => {
    // Mark onboarding as complete
    chrome.storage.sync.set({ onboardingComplete: true }, () => {
      // Close this tab
      window.close();
    });
  });

  // Create placeholder images if they don't exist yet
  // In a real extension, you would have actual screenshots/images
  createPlaceholderImages();
});

function createPlaceholderImages() {
  const images = document.querySelectorAll('.feature-image img');
  
  images.forEach(img => {
    // Check if the image exists, if not use a placeholder
    img.onerror = function() {
      this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect fill="%23f0f0f0" width="300" height="200"/><text fill="%23999" font-family="sans-serif" font-size="18" dy="10.5" font-weight="bold" x="50%" y="50%" text-anchor="middle">Feature Image Placeholder</text></svg>';
    };
  });
}