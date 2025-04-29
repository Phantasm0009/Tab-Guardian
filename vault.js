// vault.js
document.addEventListener('DOMContentLoaded', () => {
  loadTabVault();
  
  document.getElementById('filterSelect').addEventListener('change', () => {
    loadTabVault();
  });
  
  document.getElementById('clearVaultBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all tabs from the vault?')) {
      chrome.runtime.sendMessage({ action: 'clearVault' }, () => {
        loadTabVault();
      });
    }
  });
  
  // Add handler for the URL form submission
  document.getElementById('addUrlForm').addEventListener('submit', (event) => {
    event.preventDefault();
    
    const url = document.getElementById('urlInput').value.trim();
    const title = document.getElementById('titleInput').value.trim() || url;
    
    // Check if URL is valid
    try {
      new URL(url); // This will throw an error if URL is invalid
      
      chrome.runtime.sendMessage({ 
        action: 'addToVault',
        url: url,
        title: title,
        reason: 'manual-add'
      }, (response) => {
        if (response && response.success) {
          showFeedback('URL added to vault successfully!', 'success');
          document.getElementById('urlInput').value = '';
          document.getElementById('titleInput').value = '';
          loadTabVault(); // Reload the vault to show the new entry
        } else {
          showFeedback('Failed to add URL to vault.', 'error');
        }
      });
    } catch (e) {
      showFeedback('Please enter a valid URL including http:// or https://', 'error');
    }
  });
});

function showFeedback(message, type) {
  // Remove any existing feedback
  const existingFeedback = document.querySelector('.feedback-message');
  if (existingFeedback) {
    existingFeedback.remove();
  }
  
  // Create feedback element
  const feedback = document.createElement('div');
  feedback.className = `feedback-message ${type}`;
  feedback.textContent = message;
  
  // Add to the form container
  document.querySelector('.add-url-container').appendChild(feedback);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    feedback.remove();
  }, 3000);
}

async function loadTabVault() {
  const filter = document.getElementById('filterSelect').value;
  
  chrome.runtime.sendMessage({ action: 'getVault' }, (tabVault) => {
    const tabList = document.getElementById('tabList');
    const emptyState = document.getElementById('emptyState');
    
    // Clear current list
    tabList.innerHTML = '';
    
    // Filter tabs based on selection
    let tabs = tabVault || [];
    if (filter !== 'all') {
      tabs = tabs.filter(tab => tab.reason === filter);
    }
    
    // Sort by timestamp (newest first)
    tabs.sort((a, b) => b.timestamp - a.timestamp);
    
    if (tabs.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    
    emptyState.style.display = 'none';
    
    // Create tab entries
    tabs.forEach((tab, index) => {
      const tabEntry = document.createElement('div');
      tabEntry.className = 'tab-entry';
      tabEntry.dataset.index = index;
      
      const favicon = document.createElement('img');
      favicon.src = tab.favicon || `chrome://favicon/${tab.url}`;
      favicon.className = 'tab-favicon';
      favicon.onerror = function() {
        this.src = 'icons/default-favicon.png';
      };
      
      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = tab.title || tab.url;
      title.title = tab.url; // Show full URL on hover
      
      const time = document.createElement('span');
      time.className = 'tab-time';
      time.textContent = formatTime(tab.timestamp);
      
      const url = document.createElement('span');
      url.className = 'tab-url';
      try {
        const urlObj = new URL(tab.url);
        url.textContent = urlObj.hostname;
      } catch (e) {
        url.textContent = tab.url;
      }
      
      const actionContainer = document.createElement('div');
      actionContainer.className = 'tab-actions';
      
      const restore = document.createElement('button');
      restore.className = 'tab-restore';
      restore.textContent = 'Reopen';
      restore.addEventListener('click', () => {
        chrome.tabs.create({ url: tab.url });
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'tab-delete';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.title = 'Remove from vault';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTabFromVault(tab);
      });
      
      actionContainer.appendChild(restore);
      actionContainer.appendChild(deleteBtn);
      
      tabEntry.appendChild(favicon);
      tabEntry.appendChild(title);
      
      const detailsContainer = document.createElement('div');
      detailsContainer.className = 'tab-details';
      detailsContainer.appendChild(url);
      detailsContainer.appendChild(time);
      
      tabEntry.appendChild(detailsContainer);
      tabEntry.appendChild(actionContainer);
      
      tabList.appendChild(tabEntry);
    });
  });
}

// Add this function to handle deleting individual tabs from the vault
function deleteTabFromVault(tab) {
  if (confirm('Remove this tab from the vault?')) {
    chrome.runtime.sendMessage({
      action: 'deleteFromVault',
      url: tab.url,
      timestamp: tab.timestamp
    }, (response) => {
      if (response && response.success) {
        // Reload the vault to reflect the changes
        loadTabVault();
        showFeedback('Tab removed from vault', 'success');
      } else {
        showFeedback('Failed to remove tab from vault', 'error');
      }
    });
  }
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    // Today - show time
    return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays === 1) {
    // Yesterday
    return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    // Within a week
    return `${diffDays} days ago`;
  } else {
    // Older than a week
    return date.toLocaleDateString();
  }
}