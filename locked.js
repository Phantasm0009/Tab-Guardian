// locked.js
document.addEventListener('DOMContentLoaded', () => {
  // Get tab ID from URL parameters
  const params = new URLSearchParams(window.location.search);
  const tabId = parseInt(params.get('tabId'));
  
  console.log('Locked page loaded for tab ID:', tabId);
  
  // Get original URL to display domain
  chrome.runtime.sendMessage({
    action: 'getLockedUrl',
    tabId
  }, (response) => {
    console.log('Got locked URL response:', response);
    if (response && response.url) {
      try {
        const urlObj = new URL(response.url);
        document.getElementById('domainDisplay').textContent = urlObj.hostname;
      } catch (e) {
        console.error('Error parsing URL:', e);
        document.getElementById('domainDisplay').textContent = 'this website';
      }
    }
  });
  
  // Set up unlock button
  document.getElementById('unlockBtn').addEventListener('click', () => {
    unlockTab();
  });
  
  // Allow pressing Enter to unlock
  document.getElementById('passwordInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      unlockTab();
    }
  });
  
  // Unlock function
  function unlockTab() {
    const password = document.getElementById('passwordInput').value;
    if (!password) return;
    
    // Get unlock domain option
    const unlockDomain = document.getElementById('unlockDomainCheck').checked;
    
    console.log('Attempting to unlock tab', tabId, 'unlock domain:', unlockDomain);
    
    chrome.runtime.sendMessage({
      action: 'unlockTab',
      tabId,
      password,
      unlockDomain
    }, (success) => {
      console.log('Unlock result:', success);
      if (!success) {
        document.getElementById('errorMsg').style.display = 'block';
        document.getElementById('passwordInput').value = '';
        document.getElementById('passwordInput').focus();
      }
      // If success, the background script will redirect
    });
  }
  
  // Try to pre-fill with global password
  chrome.storage.sync.get('globalPassword', ({ globalPassword }) => {
    if (globalPassword) {
      document.getElementById('passwordInput').value = globalPassword;
    }
  });
});