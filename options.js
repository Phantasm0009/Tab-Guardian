// options.js
document.addEventListener('DOMContentLoaded', async () => {
  // Tab switching
  document.querySelectorAll('.tablinks').forEach(button => {
    button.addEventListener('click', () => {
      openTab(button.dataset.tab, button);
    });
  });

  // Load settings
  loadSettings();

  // Whitelist functionality
  document.getElementById('addWhitelist').addEventListener('click', addToWhitelist);
  document.getElementById('whitelistInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addToWhitelist();
  });

  // Save settings
  document.getElementById('saveSettings').addEventListener('click', saveSettings);

  // Advanced settings
  document.getElementById('stealthModeToggle').addEventListener('change', async (e) => {
    await chrome.storage.sync.set({ stealthMode: e.target.checked });
  });

  document.getElementById('tabVaultToggle').addEventListener('change', async (e) => {
    await chrome.storage.sync.set({ tabVaultEnabled: e.target.checked });
  });

  document.getElementById('clearVaultBtn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all tabs from the vault?')) {
      await chrome.runtime.sendMessage({ action: 'clearVault' });
      alert('Tab vault cleared!');
    }
  });

  // Reset declutter settings
  document.getElementById('resetDeclutterBtn').addEventListener('click', () => {
    document.getElementById('declutterThreshold').value = '24';
    document.getElementById('closeDuplicatesToggle').checked = true;
    document.getElementById('smartGroupingToggle').checked = true;
    document.getElementById('respectFormDataToggle').checked = true;
    document.getElementById('prioritizeByMemoryToggle').checked = false;
    document.getElementById('maxTabsToKeep').value = 0;
    document.getElementById('minTabsPerDomain').value = 3;
  });

  // Setup auto-save functionality
  setupAutoSave();
});

function openTab(tabName, button) {
  // Hide all tab content
  document.querySelectorAll('.tabcontent').forEach(tab => {
    tab.classList.remove('active');
  });

  // Remove active class from all buttons
  document.querySelectorAll('.tablinks').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show the current tab and mark button as active
  document.getElementById(tabName).classList.add('active');
  button.classList.add('active');
}

// Update the loadSettings function to match the key formats

async function loadSettings() {
  const { 
    autoLock = '0', 
    globalPassword = '', 
    whitelist = [],
    stealthMode = false,
    defaultStealthTitle = 'Loading...',
    tabVaultEnabled = true,
    vaultRetention = '30',
    // Renamed these to match the checkbox ID formats without "Toggle"
    declutterThreshold = '24',
    closeDuplicates = true,
    smartGrouping = true,
    respectFormData = true,
    prioritizeByMemory = false,
    maxTabsToKeep = 0,
    minTabsPerDomain = 3
  } = await chrome.storage.sync.get([
    'autoLock', 
    'globalPassword', 
    'whitelist',
    'stealthMode',
    'defaultStealthTitle',
    'tabVaultEnabled',
    'vaultRetention',
    'declutterThreshold',
    'closeDuplicates',
    'smartGrouping',
    'respectFormData',
    'prioritizeByMemory',
    'maxTabsToKeep',
    'minTabsPerDomain'
  ]);

  // Set form values
  document.getElementById('autoLock').value = autoLock;
  document.getElementById('globalPassword').value = globalPassword;
  document.getElementById('stealthModeToggle').checked = stealthMode;
  document.getElementById('defaultStealthTitle').value = defaultStealthTitle;
  document.getElementById('tabVaultToggle').checked = tabVaultEnabled;
  document.getElementById('vaultRetention').value = vaultRetention;

  // Set declutter values - updated to make sure we use the correct checkbox IDs
  document.getElementById('declutterThreshold').value = declutterThreshold;
  document.getElementById('closeDuplicatesToggle').checked = closeDuplicates;
  document.getElementById('smartGroupingToggle').checked = smartGrouping;
  document.getElementById('respectFormDataToggle').checked = respectFormData;
  document.getElementById('prioritizeByMemoryToggle').checked = prioritizeByMemory;
  document.getElementById('maxTabsToKeep').value = maxTabsToKeep;
  document.getElementById('minTabsPerDomain').value = minTabsPerDomain;
  
  // Populate whitelist
  const whitelistItems = document.getElementById('whitelistItems');
  whitelistItems.innerHTML = '';
  whitelist.forEach(site => {
    const li = document.createElement('li');
    li.textContent = site;
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.className = 'remove-btn';
    removeBtn.addEventListener('click', () => removeFromWhitelist(site));
    
    li.appendChild(removeBtn);
    whitelistItems.appendChild(li);
  });
}

async function addToWhitelist() {
  const input = document.getElementById('whitelistInput');
  const site = input.value.trim();
  
  if (site) {
    const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
    
    if (!whitelist.includes(site)) {
      whitelist.push(site);
      await chrome.storage.sync.set({ whitelist });
      loadSettings();
      
      // Show feedback
      const feedback = document.createElement('div');
      feedback.className = 'feedback success';
      feedback.textContent = `Added ${site} to whitelist`;
      document.querySelector('.whitelist-container').appendChild(feedback);
      
      // Remove feedback after 3 seconds
      setTimeout(() => feedback.remove(), 3000);
    } else {
      // Show already exists feedback
      const feedback = document.createElement('div');
      feedback.className = 'feedback warning';
      feedback.textContent = `${site} is already in the whitelist`;
      document.querySelector('.whitelist-container').appendChild(feedback);
      
      // Remove feedback after 3 seconds
      setTimeout(() => feedback.remove(), 3000);
    }
    
    input.value = '';
  } else {
    // Show empty feedback
    const feedback = document.createElement('div');
    feedback.className = 'feedback error';
    feedback.textContent = 'Please enter a domain to whitelist';
    document.querySelector('.whitelist-container').appendChild(feedback);
    
    // Remove feedback after 3 seconds
    setTimeout(() => feedback.remove(), 3000);
  }
}

async function removeFromWhitelist(site) {
  const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
  const updated = whitelist.filter(item => item !== site);
  await chrome.storage.sync.set({ whitelist: updated });
  
  // Show feedback
  const feedback = document.createElement('div');
  feedback.className = 'feedback';
  feedback.textContent = `Removed ${site} from whitelist`;
  document.querySelector('.whitelist-container').appendChild(feedback);
  
  // Remove feedback after 3 seconds
  setTimeout(() => feedback.remove(), 3000);
  
  loadSettings();
}

// Update saveSettings function for consistent keys

async function saveSettings() {
  const autoLock = document.getElementById('autoLock').value;
  const globalPassword = document.getElementById('globalPassword').value;
  const defaultStealthTitle = document.getElementById('defaultStealthTitle').value;
  const vaultRetention = document.getElementById('vaultRetention').value;
  
  // Get declutter settings with consistent naming
  const declutterThreshold = document.getElementById('declutterThreshold').value;
  const closeDuplicates = document.getElementById('closeDuplicatesToggle').checked;
  const smartGrouping = document.getElementById('smartGroupingToggle').checked;
  const respectFormData = document.getElementById('respectFormDataToggle').checked;
  const prioritizeByMemory = document.getElementById('prioritizeByMemoryToggle').checked;
  const maxTabsToKeep = parseInt(document.getElementById('maxTabsToKeep').value);
  const minTabsPerDomain = parseInt(document.getElementById('minTabsPerDomain').value);
  
  // Save settings
  const settings = {
    autoLock,
    defaultStealthTitle,
    vaultRetention,
    declutterThreshold,
    closeDuplicates,
    smartGrouping,
    respectFormData,
    prioritizeByMemory,
    maxTabsToKeep,
    minTabsPerDomain
  };
  
  // Only update the password if it's not empty
  if (globalPassword) {
    settings.globalPassword = globalPassword;
  }
  
  await chrome.storage.sync.set(settings);
  
  // Show a feedback message
  const feedback = document.createElement('div');
  feedback.className = 'feedback success';
  feedback.textContent = 'Settings saved successfully!';
  
  // Find where to insert the feedback
  const saveBtn = document.getElementById('saveSettings');
  saveBtn.parentElement.insertBefore(feedback, saveBtn.nextSibling);
  
  // Remove feedback after 3 seconds
  setTimeout(() => feedback.remove(), 3000);
}

// Update the setupAutoSave function to use consistent keys

function setupAutoSave() {
  // Auto-save toggles when they change
  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', async function() {
      // Extract the setting name without "Toggle" suffix
      const settingName = this.id.replace('Toggle', '');
      
      // Use the exact camel case version of the setting name for storage
      console.log(`Auto-saving ${settingName}: ${this.checked}`);
      
      // Save individual setting
      await chrome.storage.sync.set({ [settingName]: this.checked });
    });
  });
  
  // Auto-save selects and numeric inputs when they change
  document.querySelectorAll('select, input[type="number"]').forEach(element => {
    element.addEventListener('change', async function() {
      console.log(`Auto-saving ${this.id}: ${this.value}`);
      
      // For numeric inputs, store as numbers
      const value = this.type === 'number' ? parseInt(this.value) : this.value;
      
      // Save individual setting
      await chrome.storage.sync.set({ [this.id]: value });
    });
  });
}