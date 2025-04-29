// popup.js
document.addEventListener('DOMContentLoaded', async () => {
  // Check if global password is set
  const { globalPassword } = await chrome.storage.sync.get('globalPassword');
  const passwordStatus = document.getElementById('passwordStatus');
  
  if (globalPassword) {
    passwordStatus.textContent = "Global password is set";
    passwordStatus.classList.add('password-set');
  } else {
    passwordStatus.textContent = "No global password set";
    passwordStatus.classList.add('password-missing');
  }
  
  // Initialize buttons
  document.getElementById('lockCurrentBtn').addEventListener('click', async () => {
    if (!globalPassword) {
      // No global password set, redirect to options
      alert('Please set a global password in the settings first');
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
      window.close();
      return;
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.runtime.sendMessage({
      action: 'lockTab',
      tabId: tab.id
      // No need to send password, global password will be used
    });
    window.close();
  });

  document.getElementById('stealthModeBtn').addEventListener('click', () => {
    const options = document.getElementById('stealthOptions');
    options.style.display = options.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('applyStealthBtn').addEventListener('click', async () => {
    const stealthTitle = document.getElementById('stealthTitle').value;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    await chrome.runtime.sendMessage({
      action: 'enableStealth',
      tabId: tab.id,
      title: stealthTitle || 'Loading...'
    });
    
    window.close();
  });

  document.getElementById('declutterNowBtn').addEventListener('click', async () => {
    const threshold = document.getElementById('inactiveThreshold').value;
    const closeDuplicates = document.getElementById('closeDuplicatesCheck').checked;
    
    // Show loading state
    const originalText = document.getElementById('declutterNowBtn').textContent;
    document.getElementById('declutterNowBtn').textContent = '⏳ Processing...';
    document.getElementById('declutterNowBtn').disabled = true;
    
    // Run declutter with options from the popup
    const result = await chrome.runtime.sendMessage({
      action: 'declutterTabs',
      hours: parseFloat(threshold), // Changed from parseInt to parseFloat
      options: {
        closeDuplicates
      }
    });
    
    // Reset button
    document.getElementById('declutterNowBtn').textContent = originalText;
    document.getElementById('declutterNowBtn').disabled = false;
    
    // Close popup
    window.close();
  });

  document.getElementById('tabVaultBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('vault.html') });
  });

  document.getElementById('unlockAllBtn').addEventListener('click', async () => {
    const password = prompt('Enter your Tab Guardian password:');
    if (password) {
      await chrome.runtime.sendMessage({
        action: 'unlockAllTabs',
        password
      });
      window.close();
    }
  });

  // Load saved settings
  const { declutterThreshold } = await chrome.storage.sync.get('declutterThreshold');
  if (declutterThreshold) {
    document.getElementById('inactiveThreshold').value = declutterThreshold;
  }
});