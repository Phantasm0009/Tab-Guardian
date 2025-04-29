// Tab management storage
const lockedTabs = new Map();
const lockedUrls = new Map();
const recentlyUnlocked = new Set();
const unlockedDomains = new Set(); // New set to track fully unlocked domains
const tabActivity = new Map(); // Track when tabs were last active
const tabData = new Map(); // Store additional data about tabs (memory usage, etc.)

// Load from storage
async function loadLockedData() {
  const { 
    lockedTabs: storedTabs, 
    lockedUrls: storedUrls,
    unlockedDomains: storedUnlockedDomains 
  } = await chrome.storage.sync.get(['lockedTabs', 'lockedUrls', 'unlockedDomains']);
  
  if (storedTabs) Object.entries(storedTabs).forEach(([key, value]) => 
    lockedTabs.set(parseInt(key), value));
  
  if (storedUrls) Object.entries(storedUrls).forEach(([pattern, data]) => 
    lockedUrls.set(pattern, data));
  
  if (storedUnlockedDomains) {
    storedUnlockedDomains.forEach(domain => unlockedDomains.add(domain));
  }
  
  console.log('Loaded data:', {
    'Locked tabs': lockedTabs.size,
    'Locked URLs': lockedUrls.size,
    'Unlocked domains': unlockedDomains.size
  });
}

// Update this function to improve the URL format consistency
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    // Check if URL has a protocol, add one if missing
    let urlToProcess = url;
    if (!url.includes('://')) {
      urlToProcess = 'https://' + url;
    }
    
    const urlObj = new URL(urlToProcess);
    return urlObj.hostname; // Store just the hostname for better matching
  } catch (e) {
    console.log('Couldn\'t normalize URL:', url, '- using as is');
    // If it's not a valid URL, return just the original string
    // but try to clean it up by removing any protocol parts
    if (typeof url === 'string') {
      // Remove common protocols if present
      return url.replace(/^(https?:\/\/)?(www\.)?/, '');
    }
    return url;
  }
}

// Update the shouldLockUrl function with more aggressive matching

function shouldLockUrl(url) {
  try {
    // Skip blank pages or internal Chrome URLs
    if (!url || url === 'about:blank' || url === 'chrome://newtab/') {
      return false;
    }
    
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // Special cases - extension pages and chrome URLs
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return false;
    }
    
    console.log(`Checking if URL should be locked: ${url}, hostname: ${hostname}`);
    console.log(`Current locked URLs: ${Array.from(lockedUrls.keys()).join(', ')}`);
    console.log(`Current unlocked domains: ${Array.from(unlockedDomains).join(', ')}`);
    
    // Check if this domain has been explicitly unlocked
    if (unlockedDomains.has(hostname)) {
      console.log(`Domain ${hostname} is in unlocked domains list, skipping lock check`);
      return false;
    }
    
    // Check if www variant is unlocked
    const wwwVariant = hostname.startsWith('www.') ? 
      hostname.substring(4) : `www.${hostname}`;
    if (unlockedDomains.has(wwwVariant)) {
      console.log(`Domain ${wwwVariant} is in unlocked domains list, skipping lock check`);
      return false;
    }
    
    // Check if base domain has been unlocked
    try {
      const baseDomain = getDomainFromUrl(url);
      if (unlockedDomains.has(baseDomain)) {
        console.log(`Base domain ${baseDomain} is in unlocked domains list, skipping lock check`);
        return false;
      }
    } catch (e) {
      // Ignore errors
    }
    
    // Direct check for the exact URL
    if (lockedUrls.has(url)) {
      console.log(`Match found - exact URL: ${url}`);
      return true;
    }
    
    // Direct check for the hostname
    if (lockedUrls.has(hostname)) {
      console.log(`Match found - hostname: ${hostname}`);
      return true;
    }
    
    // Check domain without www
    if (hostname.startsWith('www.')) {
      const withoutWww = hostname.substring(4);
      if (lockedUrls.has(withoutWww)) {
        console.log(`Match found - without www: ${withoutWww}`);
        return true;
      }
    } else {
      // Check with www added
      const withWww = 'www.' + hostname;
      if (lockedUrls.has(withWww)) {
        console.log(`Match found - with www: ${withWww}`);
        return true;
      }
    }
    
    // Check base domain
    try {
      const baseDomain = getDomainFromUrl(url);
      if (lockedUrls.has(baseDomain)) {
        console.log(`Match found - base domain: ${baseDomain}`);
        return true;
      }
    } catch (e) {
      console.log(`Error getting base domain: ${e.message}`);
    }
    
    // Check for partial path matches
    const urlWithoutProtocol = url.replace(/^https?:\/\//, '');
    for (const [pattern, data] of lockedUrls.entries()) {
      // Log the pattern being checked
      console.log(`Checking pattern: ${pattern}`);
      
      // URL starts with pattern (handles path-based locks)
      if (url.includes(pattern) || urlWithoutProtocol.includes(pattern)) {
        console.log(`Match found - URL includes pattern`);
        return true;
      }
      
      // Try to parse the pattern as a URL
      try {
        let patternUrl;
        try {
          patternUrl = new URL(pattern.includes('://') ? pattern : `https://${pattern}`);
        } catch (e) {
          continue; // Skip if not a valid URL
        }
        
        // Direct domain match
        if (hostname === patternUrl.hostname) {
          console.log(`Match found - hostname equals pattern hostname`);
          return true;
        }
        
        // Subdomain matching
        if (hostname.endsWith('.' + patternUrl.hostname) || 
            patternUrl.hostname.endsWith('.' + hostname)) {
          console.log(`Match found - subdomain match`);
          return true;
        }
      } catch (e) {
        // If pattern isn't a valid URL, check as string comparison
        if (hostname === pattern || hostname.includes(pattern) || pattern.includes(hostname)) {
          console.log(`Match found - string comparison`);
          return true;
        }
      }
    }
    
    // If we get to this point, no match was found
    console.log(`No match found for URL: ${url}`);
    return false;
  } catch (e) {
    console.error('Error checking URL:', e);
    return false;
  }
}

// Improved lock tab function to handle URL edge cases
async function lockTab(tabId, password) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) return;
  
  try {
    // Get the base URL of the tab - ensure it's valid
    let domain, baseDomain, urlObj;
    
    try {
      urlObj = new URL(tab.url);
      domain = urlObj.hostname;
    } catch (e) {
      console.log('Invalid URL format, trying to normalize:', tab.url);
      domain = normalizeUrl(tab.url);
      if (!domain) {
        console.error('Cannot lock tab with invalid URL format:', tab.url);
        return;
      }
    }
    
    try {
      baseDomain = getDomainFromUrl(tab.url);
    } catch (e) {
      console.log('Could not extract base domain, using full domain');
      baseDomain = domain;
    }
    
    // Get global password or use provided password
    const { globalPassword } = await chrome.storage.sync.get('globalPassword');
    const passwordToUse = globalPassword || password;
    
    if (!passwordToUse) {
      console.error('No password provided and no global password set');
      return;
    }
    
    const hashedPassword = await hashPassword(passwordToUse);
    
    // Lock the current tab
    lockedTabs.set(tabId, { 
      originalUrl: tab.url, 
      password: hashedPassword,
      lockedAt: Date.now() 
    });
    
    // Store the normalized domain patterns in lockedUrls
    // Make sure we have a domain to lock
    if (domain) {
      console.log(`Locking domain: ${domain}`);
      lockedUrls.set(domain, {
        password: hashedPassword,
        lockedAt: Date.now()
      });
      
      // Also lock the base domain if different and valid
      if (baseDomain && baseDomain !== domain) {
        console.log(`Also locking base domain: ${baseDomain}`);
        lockedUrls.set(baseDomain, {
          password: hashedPassword,
          lockedAt: Date.now()
        });
      }
      
      // Also lock with www prefix if not present
      if (domain && !domain.startsWith('www.')) {
        const wwwDomain = 'www.' + domain;
        console.log(`Also locking www version: ${wwwDomain}`);
        lockedUrls.set(wwwDomain, {
          password: hashedPassword,
          lockedAt: Date.now()
        });
      }
      
      // Lock the protocol + hostname versions too if we have a URL object
      if (urlObj) {
        const protocolDomain = urlObj.protocol + '//' + domain;
        console.log(`Locking with protocol: ${protocolDomain}`);
        lockedUrls.set(protocolDomain, {
          password: hashedPassword,
          lockedAt: Date.now()
        });
      }
    }
    
    await saveLockedData();
    await applyTabLock(tabId);
    
    // Check if there are any other open tabs with the same domain that need to be locked
    const allTabs = await chrome.tabs.query({});
    for (const openTab of allTabs) {
      if (openTab.id !== tabId && !lockedTabs.has(openTab.id)) {
        try {
          if (openTab.url && shouldLockUrl(openTab.url)) {
            console.log(`Locking existing tab ${openTab.id} with URL ${openTab.url}`);
            await applyTabLock(openTab.id, openTab.url);
          }
        } catch (e) {
          console.error('Error checking existing tab:', e);
        }
      }
    }
    
  } catch (e) {
    console.error('Error locking tab:', e);
  }
}

// Helper function to extract base domain from URL - improved for robustness
function getDomainFromUrl(url) {
  if (!url) return '';
  
  try {
    // If the URL doesn't have a protocol, add one
    let urlToProcess = url;
    if (!url.includes('://')) {
      urlToProcess = 'https://' + url;
    }
    
    const urlObj = new URL(urlToProcess);
    const parts = urlObj.hostname.split('.');
    
    if (parts.length < 2) {
      return urlObj.hostname; // Return as is if it's a simple hostname
    }
    
    // Handle special cases like co.uk, com.au, etc.
    if (parts.length > 2) {
      // Check for common TLDs with country codes
      const lastTwoParts = parts.slice(-2).join('.');
      if (['co.uk', 'com.au', 'co.nz', 'co.za', 'co.jp', 'com.br', 'com.mx'].includes(lastTwoParts)) {
        return parts.slice(-3).join('.');
      }
    }
    
    // Get the base domain (last two parts)
    return parts.slice(-2).join('.');
  } catch (e) {
    console.error('Error extracting domain from URL:', url, e);
    
    // Fallback: try to extract domain manually
    if (typeof url === 'string') {
      // Strip protocol if present
      let domain = url.replace(/^https?:\/\//, '');
      // Strip path if present
      domain = domain.split('/')[0];
      // Strip port if present
      domain = domain.split(':')[0];
      
      return domain;
    }
    
    return url;
  }
}

// Save locked data to storage
async function saveLockedData() {
  const serializedTabs = {};
  lockedTabs.forEach((value, key) => {
    serializedTabs[key] = value;
  });

  const serializedUrls = {};
  lockedUrls.forEach((value, key) => {
    serializedUrls[key] = value;
  });

  await chrome.storage.sync.set({
    lockedTabs: serializedTabs,
    lockedUrls: serializedUrls,
    unlockedDomains: Array.from(unlockedDomains)
  });
}

// Apply tab lock - enhanced to handle URLs
async function applyTabLock(tabId, originalUrl = null) {
  try {
    // If no original URL was provided, try to get it from the tab
    if (!originalUrl) {
      try {
        const tab = await chrome.tabs.get(tabId);
        originalUrl = tab.url;
      } catch (e) {
        console.error('Error getting tab URL:', e);
      }
    }
    
    // Store the tab data if we have an original URL
    if (originalUrl) {
      const { globalPassword } = await chrome.storage.sync.get('globalPassword');
      if (globalPassword) {
        const hashedPassword = await hashPassword(globalPassword);
        lockedTabs.set(tabId, { 
          originalUrl: originalUrl, 
          password: hashedPassword,
          lockedAt: Date.now() 
        });
      }
    }
    
    const { isPremium, stealthMode } = await chrome.storage.sync.get(['isPremium', 'stealthMode']);
    const stealth = stealthMode;
    
    if (stealth) {
      try {
        // Apply stealth mode styling
        await chrome.scripting.executeScript({
          target: { tabId },
          function: () => {
            document.title = "Loading...";
            // Change favicon to generic icon
            const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = 'data:image/x-icon;base64,AAABAAEAAAAAAAAAAAAAAA==';
            document.head.appendChild(link);
          }
        });
      } catch (e) {
        console.error('Error applying stealth mode:', e);
      }
    }
    
    // Save our data before redirecting
    await saveLockedData();
    
    const lockedPage = chrome.runtime.getURL(`locked.html?tabId=${tabId}`);
    await chrome.tabs.update(tabId, { url: lockedPage });
  } catch (e) {
    console.error('Error applying tab lock:', e);
  }
}

// Modified unlock tab with improved domain unlock support
async function unlockTab(tabId, password, unlockDomain = false) {
  tabId = parseInt(tabId);
  const tabData = lockedTabs.get(tabId);
  if (!tabData) {
    console.error('No locked data found for tab:', tabId);
    return false;
  }
  
  // Try with the provided password first
  let passwordMatch = await verifyPassword(password, tabData.password);
  
  // If that fails, try with the global password
  if (!passwordMatch) {
    const { globalPassword } = await chrome.storage.sync.get('globalPassword');
    if (globalPassword) {
      passwordMatch = await verifyPassword(globalPassword, tabData.password);
    }
  }
  
  if (!passwordMatch) {
    console.error('Password verification failed for tab:', tabId);
    return false;
  }
  
  const originalUrl = tabData.originalUrl;
  
  // Get the domain to potentially unlock all related tabs
  let domainToUnlock = null;
  try {
    const urlObj = new URL(originalUrl);
    domainToUnlock = urlObj.hostname;
  } catch (e) {
    console.error('Error parsing URL for unlock:', e);
  }
  
  // Remove this tab from locked tabs
  lockedTabs.delete(tabId);
  
  // If unlockDomain is true, remove the domain from lockedUrls
  if (unlockDomain && domainToUnlock) {
    // Add to the explicitly unlocked domains set
    unlockedDomains.add(domainToUnlock);
    
    // Add www variant
    if (domainToUnlock.startsWith('www.')) {
      unlockedDomains.add(domainToUnlock.substring(4));
    } else {
      unlockedDomains.add('www.' + domainToUnlock);
    }
    
    // Add base domain
    try {
      const baseDomain = getDomainFromUrl(originalUrl);
      unlockedDomains.add(baseDomain);
    } catch (e) {
      // Ignore errors
    }
    
    console.log(`Added to unlockedDomains:`, Array.from(unlockedDomains));
    
    // Remove all variants of this domain
    const keysToDelete = [];
    
    // First, collect all keys to delete
    for (const [pattern, _] of lockedUrls.entries()) {
      try {
        // Direct match
        if (pattern === domainToUnlock) {
          keysToDelete.push(pattern);
          continue;
        }
        
        // URL pattern match
        if (pattern.includes(domainToUnlock)) {
          keysToDelete.push(pattern);
          continue;
        }
        
        // Try to parse the pattern as a URL
        let patternUrl;
        try {
          patternUrl = new URL(pattern.startsWith('http') ? pattern : `https://${pattern}`);
          // Domain match
          if (patternUrl.hostname === domainToUnlock) {
            keysToDelete.push(pattern);
            continue;
          }
          
          // Subdomain match
          if (patternUrl.hostname.endsWith('.' + domainToUnlock) || 
              domainToUnlock.endsWith('.' + patternUrl.hostname)) {
            keysToDelete.push(pattern);
            continue;
          }
        } catch (e) {
          // Not a valid URL
        }
        
        // www variant check
        const withoutWww = domainToUnlock.startsWith('www.') ? 
            domainToUnlock.substring(4) : domainToUnlock;
        const withWww = domainToUnlock.startsWith('www.') ? 
            domainToUnlock : 'www.' + domainToUnlock;
            
        if (pattern === withoutWww || pattern === withWww || 
            pattern.includes(withoutWww) || pattern.includes(withWww)) {
          keysToDelete.push(pattern);
          continue;
        }
        
        // Base domain check
        try {
          const baseDomain = getDomainFromUrl(originalUrl);
          if (pattern === baseDomain || pattern.includes(baseDomain)) {
            keysToDelete.push(pattern);
            continue;
          }
        } catch (e) {
          // Ignore errors
        }
      } catch (e) {
        console.error('Error checking pattern for deletion:', pattern, e);
      }
    }
    
    // Now delete all collected keys
    console.log(`Found ${keysToDelete.length} domain patterns to unlock:`, keysToDelete);
    for (const key of keysToDelete) {
      lockedUrls.delete(key);
    }
    
    // Unlock all tabs with the same domain
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (tab.id !== tabId && lockedTabs.has(tab.id)) {
        try {
          const lockedTabData = lockedTabs.get(tab.id);
          if (lockedTabData && lockedTabData.originalUrl) {
            const tabUrlObj = new URL(lockedTabData.originalUrl);
            
            // Check if this tab should be unlocked
            let shouldUnlock = false;
            
            // Direct domain match
            if (tabUrlObj.hostname === domainToUnlock) {
              shouldUnlock = true;
            }
            
            // www variant match
            if (tabUrlObj.hostname === 'www.' + domainToUnlock ||
                domainToUnlock === 'www.' + tabUrlObj.hostname) {
              shouldUnlock = true;
            }
            
            // Subdomain match
            if (tabUrlObj.hostname.endsWith('.' + domainToUnlock) ||
                domainToUnlock.endsWith('.' + tabUrlObj.hostname)) {
              shouldUnlock = true;
            }
            
            if (shouldUnlock) {
              console.log(`Also unlocking tab ${tab.id} with same domain: ${tabUrlObj.hostname}`);
              lockedTabs.delete(tab.id);
              
              // Mark tab as recently unlocked
              recentlyUnlocked.add(tab.id);
              setTimeout(() => recentlyUnlocked.delete(tab.id), 5000);
              
              // Restore original URL
              await chrome.tabs.update(tab.id, { url: lockedTabData.originalUrl });
            }
          }
        } catch (e) {
          console.error('Error checking tab for domain unlock:', e);
        }
      }
    }
  }
  
  // Mark tab as recently unlocked to prevent immediate re-lock
  recentlyUnlocked.add(tabId);
  
  // Increase the unlock protection time to 30 seconds to ensure new tabs aren't immediately locked
  setTimeout(() => recentlyUnlocked.delete(tabId), 30000);
  
  // Restore original URL
  await chrome.tabs.update(tabId, { url: originalUrl });
  
  // Save the updated state to storage
  await saveLockedData();
  console.log('Saved unlocked state to storage. Current lockedUrls size:', lockedUrls.size);
  
  return true;
}

// Utility functions for password handling
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPassword(input, hash) {
  return await hashPassword(input) === hash;
}

// Improved tab creation listener - add this at the bottom of the file, replacing the existing onCreated listener

// Remove the existing tabs.onCreated listener and replace with this more robust version
chrome.tabs.onCreated.addListener(async (tab) => {
  console.log(`New tab created with ID: ${tab.id}, initial URL: ${tab.url || 'empty'}`);
  
  // Set up a more reliable checker for the new tab
  const checkNewTab = async (attempt = 1) => {
    try {
      // Get the latest tab info
      const updatedTab = await chrome.tabs.get(tab.id);
      console.log(`Check attempt ${attempt} for tab ${tab.id}, URL: ${updatedTab.url || 'empty'}`);
      
      if (!updatedTab.url || updatedTab.url === 'chrome://newtab/' || updatedTab.url === 'about:blank') {
        // Tab doesn't have a proper URL yet, try again if we haven't exceeded max attempts
        if (attempt < 5) {
          setTimeout(() => checkNewTab(attempt + 1), 300);
        }
        return;
      }
      
      // Check if URL should be locked
      if (shouldLockUrl(updatedTab.url) && !lockedTabs.has(updatedTab.id) && !recentlyUnlocked.has(updatedTab.id)) {
        console.log(`New tab ${tab.id} NEEDS TO BE LOCKED with URL: ${updatedTab.url}`);
        await applyTabLock(updatedTab.id, updatedTab.url);
      } else {
        console.log(`Tab ${tab.id} DOES NOT NEED TO BE LOCKED: URL=${updatedTab.url}, isLocked=${lockedTabs.has(updatedTab.id)}, isRecentlyUnlocked=${recentlyUnlocked.has(updatedTab.id)}`);
      }
    } catch (e) {
      console.error('Error checking new tab:', e);
      // If tab was closed, stop checking
      if (e.message.includes("No tab with id")) {
        return;
      }
      // Otherwise retry if we haven't exceeded max attempts
      if (attempt < 5) {
        setTimeout(() => checkNewTab(attempt + 1), 300);
      }
    }
  };
  
  // Start checking the tab after a brief delay to let it initialize
  setTimeout(() => checkNewTab(), 100);
});

// Improve the tab update listener to be more robust
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only process when the URL changes
  if (changeInfo.url && !recentlyUnlocked.has(tabId)) {
    console.log(`Tab ${tabId} navigated to ${changeInfo.url}, checking locks...`);
    
    // Check if URL should be locked
    if (shouldLockUrl(changeInfo.url) && !lockedTabs.has(tabId)) {
      console.log(`Locking tab ${tabId} with URL ${changeInfo.url} - matched lock pattern`);
      // Lock the tab with the same URL
      await applyTabLock(tabId, changeInfo.url);
    }
  } else if (changeInfo.status === 'complete' && tab.url && !recentlyUnlocked.has(tabId)) {
    // Double-check on complete in case we missed it during the URL change
    if (shouldLockUrl(tab.url) && !lockedTabs.has(tabId)) {
      console.log(`Locking tab ${tabId} with URL ${tab.url} on load complete`);
      await applyTabLock(tabId, tab.url);
    }
  }
});

// Set up auto-declutter alarm
chrome.alarms.create('autoDeclutter', { periodInMinutes: 60 });

// Update the alarm listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'autoDeclutter') {
    const { 
      declutterThreshold = 24,
      autoDeclutterEnabled = true
    } = await chrome.storage.sync.get(['declutterThreshold', 'autoDeclutterEnabled']);
    
    if (autoDeclutterEnabled) {
      console.log(`Running scheduled auto declutter with threshold of ${declutterThreshold} hours`);
      const closedCount = await declutterTabs(declutterThreshold);
      
      if (closedCount > 0) {
        console.log(`Auto declutter closed ${closedCount} tabs`);
      } else {
        console.log('Auto declutter found no tabs to close');
      }
    } else {
      console.log('Auto declutter is disabled in settings');
    }
  }
});

// Message handling - modified for better debugging
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request.action, request);
  
  switch (request.action) {
    case 'lockTab':
      lockTab(request.tabId, request.password);
      break;
    case 'unlockTab':
      console.log('Attempting to unlock tab:', request.tabId, 'with password length:', request.password?.length, 'unlock domain:', request.unlockDomain);
      unlockTab(request.tabId, request.password, request.unlockDomain).then(result => {
        console.log('Unlock result:', result);
        sendResponse(result);
      });
      return true;
    case 'unlockAllTabs':
      unlockAllTabs(request.password).then(result => {
        sendResponse(result);
      });
      return true;
    case 'getLockedUrl':
      const tabData = lockedTabs.get(parseInt(request.tabId));
      console.log('Get locked URL for tab', request.tabId, 'data:', tabData);
      sendResponse({ url: tabData?.originalUrl });
      break;
    case 'declutterTabs':
      declutterTabs(request.hours, request.options || {}).then(result => {
        sendResponse(result);
      });
      return true; // Important: Return true to indicate we'll call sendResponse asynchronously
    case 'enableStealth':
      enableStealthMode(request.tabId, request.title).then(result => {
        sendResponse(result);
      });
      return true;
    case 'getVault':
      getTabVault().then(sendResponse);
      return true;
    case 'clearVault':
      clearTabVault().then(sendResponse);
      return true;
    // Add new case for manual vault addition
    case 'addToVault':
      addManualUrlToVault(request.url, request.title, request.reason)
        .then((result) => {
          sendResponse({ success: result });
        })
        .catch((error) => {
          console.error('Error adding manual URL to vault:', error);
          sendResponse({ success: false });
        });
      return true; // Important for async response
    case 'deleteFromVault':
      deleteFromVault(request.url, request.timestamp)
        .then(result => {
          sendResponse({ success: result });
        })
        .catch(error => {
          console.error('Error deleting from vault:', error);
          sendResponse({ success: false });
        });
      return true;
  }
});

// Add this new function to handle manual URL addition
async function addManualUrlToVault(url, title, reason = 'manual-add') {
  try {
    console.log(`Manually adding URL to vault: ${url}`);
    
    // Get current tab vault
    const { tabVault = [] } = await chrome.storage.local.get('tabVault');
    
    const { tabVaultEnabled = true } = await chrome.storage.sync.get('tabVaultEnabled');
    
    // Skip if tab vault is disabled
    if (!tabVaultEnabled) {
      console.log('Tab vault is disabled, not adding URL');
      return false;
    }
    
    // Get favicon for the URL
    const favicon = `chrome://favicon/${url}`;
    
    // Add the new entry
    const newEntry = {
      url: url,
      title: title || url,
      favicon: favicon,
      timestamp: Date.now(),
      reason: reason
    };
    
    console.log('Adding to tab vault:', newEntry);
    tabVault.push(newEntry);
    
    // Keep vault at a manageable size
    const maxEntries = 500;
    const finalVault = tabVault.length > maxEntries ? 
      tabVault.slice(-maxEntries) : tabVault;
    
    await chrome.storage.local.set({ tabVault: finalVault });
    console.log(`Tab vault now contains ${finalVault.length} entries`);
    
    return true;
  } catch (e) {
    console.error('Error adding manual URL to vault:', e);
    return false;
  }
}

// Add this new function to handle deleting a specific tab from the vault
async function deleteFromVault(url, timestamp) {
  try {
    // Get the current tab vault
    const { tabVault = [] } = await chrome.storage.local.get('tabVault');
    
    // Find the index of the tab to remove
    const index = tabVault.findIndex(tab => 
      tab.url === url && tab.timestamp === timestamp
    );
    
    if (index === -1) {
      console.log('Tab not found in vault:', url, timestamp);
      return false;
    }
    
    // Remove the tab from the array
    tabVault.splice(index, 1);
    
    // Save the updated vault
    await chrome.storage.local.set({ tabVault });
    
    console.log(`Removed tab from vault. Vault now contains ${tabVault.length} entries`);
    return true;
  } catch (e) {
    console.error('Error removing tab from vault:', e);
    return false;
  }
}

// Completely revised auto declutter functionality
async function declutterTabs(hours, options = {}) {
  try {
    // Get settings and preferences
    const { 
      whitelist = [], 
      closeDuplicates = true,
      smartGrouping = false,
      respectFormData = true,
      prioritizeByMemory = false,
      maxTabsToKeep = 0,
      minTabsPerDomain = 1
    } = await chrome.storage.sync.get([
      'whitelist', 
      'closeDuplicates', 
      'smartGrouping', 
      'respectFormData',
      'prioritizeByMemory',
      'maxTabsToKeep',
      'minTabsPerDomain'
    ]);

    // Merge with options passed directly to the function
    const settings = {
      whitelist,
      closeDuplicates: options.closeDuplicates !== undefined ? options.closeDuplicates : closeDuplicates,
      smartGrouping: options.smartGrouping !== undefined ? options.smartGrouping : smartGrouping,
      respectFormData: options.respectFormData !== undefined ? options.respectFormData : respectFormData,
      prioritizeByMemory: options.prioritizeByMemory !== undefined ? options.prioritizeByMemory : prioritizeByMemory,
      maxTabsToKeep: options.maxTabsToKeep !== undefined ? options.maxTabsToKeep : maxTabsToKeep,
      minTabsPerDomain: options.minTabsPerDomain !== undefined ? options.minTabsPerDomain : minTabsPerDomain
    };

    // Parse hours to float to handle fractional values for testing (e.g., 0.0083 for 30 seconds)
    const hoursFloat = parseFloat(hours);
    console.log(`Running auto declutter with settings: ${hoursFloat} hours threshold`, settings);

    // Calculate time threshold in milliseconds
    const threshold = Date.now() - hoursFloat * 60 * 60 * 1000;
    
    // Get all tabs
    const tabs = await chrome.tabs.query({});
    console.log(`Found ${tabs.length} total tabs to check for decluttering`);

    // Process tabs - apply whitelisting and active tab protection
    let candidateTabs = tabs.filter(tab => 
      !lockedTabs.has(tab.id) && 
      !whitelist.some(pattern => matchUrlPattern(tab.url, pattern)) &&
      !tab.active
    );

    // Skip pinned tabs
    candidateTabs = candidateTabs.filter(tab => !tab.pinned);
    
    // Apply inactivity threshold using tabActivity map
    candidateTabs = candidateTabs.filter(tab => {
      const lastActive = tabActivity.get(tab.id) || 0;
      const isInactive = lastActive < threshold;
      console.log(`Tab ${tab.id} (${tab.url}): last active ${new Date(lastActive).toLocaleTimeString()}, inactive: ${isInactive}`);
      return isInactive;
    });
    
    console.log(`Found ${candidateTabs.length} candidate tabs for decluttering after filtering`);

    if (candidateTabs.length === 0) {
      console.log('No tabs to declutter');
      return 0;
    }

    // Add selected tabs to vault and close them
    console.log(`Closing ${candidateTabs.length} tabs`);
    
    // Add to tab vault before closing
    for (const tab of candidateTabs) {
      await addToTabVault(tab, 'auto-declutter');
    }
    
    // Show notification about closed tabs
    const domains = [...new Set(candidateTabs.map(tab => {
      try {
        return new URL(tab.url).hostname;
      } catch (e) {
        return 'unknown';
      }
    }))];
    
    const domainSummary = domains.length <= 3 ? 
      domains.join(', ') : 
      `${domains.slice(0, 3).join(', ')} and ${domains.length - 3} more`;
    
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Tab Guardian',
      message: `Closed ${candidateTabs.length} inactive tabs from ${domainSummary}`,
      buttons: [
        { title: 'View in Vault' },
        { title: 'Undo' }
      ],
      requireInteraction: true
    });
    
    // Store the IDs of closed tabs for potential undo
    await chrome.storage.local.set({ 
      lastDeclutterAction: {
        tabs: candidateTabs.map(tab => ({ 
          id: tab.id, 
          url: tab.url, 
          title: tab.title 
        })),
        timestamp: Date.now()
      }
    });
    
    // Close tabs
    const tabIds = candidateTabs.map(tab => tab.id);
    await chrome.tabs.remove(tabIds);
    
    return tabIds.length;
  } catch (e) {
    console.error('Error in declutter tabs:', e);
    return 0;
  }
}

// Helper function to match URL against pattern (including wildcards)
function matchUrlPattern(url, pattern) {
  if (!url || !pattern) return false;
  
  // Simple match
  if (url.includes(pattern)) return true;
  
  // Handle wildcard patterns
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + 
      pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
            .replace(/\*/g, '.*') // Convert * to regex .*
      + '$');
    return regex.test(url);
  }
  
  return false;
}

// Fix the addToTabVault function to ensure it's working properly:
async function addToTabVault(tab, reason = 'manual') {
  try {
    console.log(`Adding tab to vault: ${tab.url} (${reason})`);
    
    // Get current tab vault from local storage (not sync)
    const { tabVault = [] } = await chrome.storage.local.get('tabVault');
    
    const { tabVaultEnabled = true } = await chrome.storage.sync.get('tabVaultEnabled');
    
    // Skip if tab vault is disabled
    if (!tabVaultEnabled) {
      console.log('Tab vault is disabled, not adding tab');
      return;
    }
    
    // Get retention period (days)
    const { vaultRetention = '30' } = await chrome.storage.sync.get('vaultRetention');
    const retentionDays = parseInt(vaultRetention);
    
    // Clean up old entries if retention is not "forever"
    const cleanVault = retentionDays > 0 ? 
      tabVault.filter(entry => {
        const entryAge = (Date.now() - entry.timestamp) / (1000 * 60 * 60 * 24);
        return entryAge <= retentionDays;
      }) : tabVault;
    
    // Add the new entry
    const newEntry = {
      url: tab.url,
      title: tab.title || tab.url,
      favicon: tab.favIconUrl || `chrome://favicon/${tab.url}`,
      timestamp: Date.now(),
      reason
    };
    
    console.log('Adding to tab vault:', newEntry);
    cleanVault.push(newEntry);
    
    // Keep vault at a manageable size
    const maxEntries = 500;
    const finalVault = cleanVault.length > maxEntries ? 
      cleanVault.slice(-maxEntries) : cleanVault;
    
    await chrome.storage.local.set({ tabVault: finalVault });
    console.log(`Tab vault now contains ${finalVault.length} entries`);
  } catch (e) {
    console.error('Error adding tab to vault:', e);
  }
}

// Add notification click handler
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // View in vault
    chrome.tabs.create({ url: chrome.runtime.getURL('vault.html') });
  } else if (buttonIndex === 1) {
    // Undo close
    const { lastDeclutterAction } = await chrome.storage.local.get('lastDeclutterAction');
    
    if (lastDeclutterAction && lastDeclutterAction.tabs.length > 0) {
      // Don't restore tabs if it's been more than 5 minutes
      if (Date.now() - lastDeclutterAction.timestamp > 5 * 60 * 1000) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Tab Guardian',
          message: 'Cannot restore tabs after 5 minutes. Please use the Tab Vault instead.'
        });
        return;
      }
      
      // Restore the tabs
      for (const tabInfo of lastDeclutterAction.tabs) {
        chrome.tabs.create({ url: tabInfo.url, active: false });
      }
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Tab Guardian',
        message: `Restored ${lastDeclutterAction.tabs.length} tabs`
      });
    }
  }
});

// Tab vault functionality
async function getTabVault() {
  const { tabVault = [] } = await chrome.storage.local.get('tabVault');
  return tabVault;
}

async function clearTabVault() {
  await chrome.storage.local.remove('tabVault');
  return true;
}

// Add this periodic scanner function to the bottom of your file

// Scan all tabs every minute to ensure none have escaped our lock
function startTabScanner() {
  console.log("Starting periodic tab scanner");
  
  setInterval(async () => {
    try {
      console.log("Scanning all tabs for lock enforcement");
      const tabs = await chrome.tabs.query({});
      
      for (const tab of tabs) {
        // Skip tabs that are already locked or recently unlocked
        if (lockedTabs.has(tab.id) || recentlyUnlocked.has(tab.id)) continue;
        
        // Skip internal Chrome pages and extension pages
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
        
        // Check if this tab should be locked
        if (shouldLockUrl(tab.url)) {
          console.log(`Scanner found unlocked tab that should be locked: ${tab.id}, URL: ${tab.url}`);
          await applyTabLock(tab.id, tab.url);
        }
      }
    } catch (e) {
      console.error('Error in tab scanner:', e);
    }
  }, 60000); // Check every minute
}

// Add this function to track tab activity
function trackTabActivity() {
  // Set up listeners for tab activity
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    tabActivity.set(tabId, Date.now());
    saveTabActivity();
  });

  // Track when new tabs are created
  chrome.tabs.onCreated.addListener((tab) => {
    tabActivity.set(tab.id, Date.now());
    saveTabActivity();
  });

  // Track tab URL updates as activity
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      tabActivity.set(tabId, Date.now());
      
      // Collect memory usage data if available (Chrome 94+)
      if (chrome.processes && typeof chrome.processes.getProcessIdForTab === 'function') {
        chrome.processes.getProcessIdForTab(tabId).then(processId => {
          if (processId) {
            chrome.processes.getProcessInfo([processId], true).then(processes => {
              if (processes[processId]) {
                tabData.set(tabId, {
                  memory: processes[processId].privateMemory,
                  cpu: processes[processId].cpu,
                  lastUpdated: Date.now()
                });
              }
            });
          }
        }).catch(() => {
          // Process API may not be available, ignore errors
        });
      }
      
      saveTabActivity();
    }
  });

  // Remove data when tabs are closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabActivity.delete(tabId);
    tabData.delete(tabId);
    saveTabActivity();
  });
}

// Save tab activity to storage
async function saveTabActivity() {
  const activityData = {};
  tabActivity.forEach((timestamp, tabId) => {
    activityData[tabId] = timestamp;
  });
  
  try {
    await chrome.storage.local.set({ tabActivity: activityData });
  } catch (e) {
    console.error('Error saving tab activity:', e);
  }
}

// Load tab activity from storage
async function loadTabActivity() {
  try {
    const { tabActivity: storedActivity = {} } = await chrome.storage.local.get('tabActivity');
    Object.entries(storedActivity).forEach(([tabId, timestamp]) => {
      tabActivity.set(parseInt(tabId), timestamp);
    });
    
    // Clean up activity data for tabs that no longer exist
    const tabs = await chrome.tabs.query({});
    const validTabIds = new Set(tabs.map(tab => tab.id));
    
    for (const tabId of tabActivity.keys()) {
      if (!validTabIds.has(tabId)) {
        tabActivity.delete(tabId);
      }
    }
    
    saveTabActivity();
  } catch (e) {
    console.error('Error loading tab activity:', e);
  }
}

// Add the new enableStealthMode function
async function enableStealthMode(tabId, customTitle) {
  try {
    const tab = await chrome.tabs.get(tabId);
    
    // Check if the URL is a protected page that cannot be scripted
    if (!tab.url || 
        tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.includes('chrome.google.com/webstore') ||
        tab.url.startsWith('about:')) {
      console.log(`Cannot apply stealth mode to protected page: ${tab.url}`);
      // Notify the user that stealth mode can't be applied to this page
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Tab Guardian',
        message: 'Stealth mode cannot be applied to Chrome system pages or the Web Store.'
      });
      return false;
    }
    
    // Existing code to apply stealth mode
    const title = customTitle || 'Loading...';
    
    // Update tab title
    await chrome.scripting.executeScript({
      target: { tabId },
      function: (title) => {
        document.title = title;
        
        // Override potential title updates by sites
        const originalTitle = document.title;
        Object.defineProperty(document, 'title', {
          set: function() { return originalTitle; },
          get: function() { return title; }
        });
      },
      args: [title]
    });
    
    return true;
  } catch (e) {
    console.error('Error applying stealth mode:', e);
    return false;
  }
}

// Initialize extension
(async function initialize() {
  await loadLockedData();
  await loadTabActivity();  // Load saved tab activity
  
  console.log('Tab Guardian initialized with:');
  console.log(`- ${lockedTabs.size} locked tabs`);
  console.log(`- ${lockedUrls.size} locked URLs`);
  console.log(`- ${unlockedDomains.size} unlocked domains`);
  
  // Start tracking tab activity
  trackTabActivity();
  
  // Start the periodic scanner
  startTabScanner();
  
  // Do an initial check of all open tabs
  const tabs = await chrome.tabs.query({});
  console.log(`Checking ${tabs.length} open tabs on startup`);
  
  // Add this to the initialize function to ensure all tabs have activity timestamps

  // Set initial activity timestamps for existing tabs if they don't have one
  for (const tab of tabs) {
    if (!tabActivity.has(tab.id)) {
      console.log(`Setting initial activity timestamp for tab ${tab.id}`);
      tabActivity.set(tab.id, Date.now());
    }
  }

  // Save after setting initial values
  saveTabActivity();

  for (const tab of tabs) {
    if (!tab.url) continue;
    
    // Set initial activity timestamp for existing tabs
    if (!tabActivity.has(tab.id)) {
      tabActivity.set(tab.id, Date.now());
    }
    
    if (shouldLockUrl(tab.url) && !lockedTabs.has(tab.id)) {
      console.log(`Locking tab ${tab.id} with URL ${tab.url} during startup check`);
      await applyTabLock(tab.id, tab.url);
    }
  }
  
  // Set up the declutter alarm with user preferences
  const { declutterFrequency = 60 } = await chrome.storage.sync.get('declutterFrequency');
  chrome.alarms.create('autoDeclutter', { periodInMinutes: declutterFrequency });

  // Add this at the bottom of the initialize function

  // Check if onboarding has been completed
  const { onboardingComplete } = await chrome.storage.sync.get('onboardingComplete');
  if (!onboardingComplete) {
    // Open onboarding page
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
})();