// Initialize side panel state
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed/updated - initializing...');

  try {
    // Set initial state
    await chrome.storage.local.set({
      recordedSteps: [],
      isRecording: false,
      isPaused: false
    });
    console.log('Initial state set in storage');

    // Initialize side panel
    try {
      await chrome.sidePanel.setOptions({
        enabled: true,
        path: 'recorder.html'
      });
      console.log('Side panel options set successfully');
    } catch (error) {
      console.error('Error setting side panel options:', error);
    }
  } catch (error) {
    console.error('Error during initialization:', error);
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked for tab:', tab.id, 'URL:', tab.url);

  try {
    // Check if the tab is accessible
    if (tab.url.startsWith('chrome://')) {
      console.log('Cannot open side panel on chrome:// URLs');
      return;
    }

    // First try to get the current side panel state
    try {
      const { enabled } = await chrome.sidePanel.getOptions();
      console.log('Current side panel state:', { enabled });

      if (!enabled) {
        console.log('Side panel is disabled, enabling...');
        await chrome.sidePanel.setOptions({
          enabled: true,
          path: 'recorder.html'
        });
      }
    } catch (error) {
      console.error('Error checking side panel state:', error);
    }

    // Try to open the side panel
    try {
      console.log('Attempting to open side panel...');
      await chrome.sidePanel.open({ windowId: tab.windowId });
      console.log('Side panel opened successfully');
    } catch (error) {
      console.error('Error opening side panel:', error);

      // Fallback: try to set options and open again
      try {
        console.log('Attempting fallback method...');
        await chrome.sidePanel.setOptions({
          enabled: true,
          path: 'recorder.html'
        });
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
        await chrome.sidePanel.open({ windowId: tab.windowId });
        console.log('Side panel opened with fallback method');
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError);
      }
    }

    // Ensure content script is injected
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.log('Content script injected successfully');
    } catch (error) {
      console.error('Error injecting content script:', error);
      // Continue anyway as the content script might already be loaded
    }
  } catch (error) {
    console.error('Error in action click handler:', error);
  }
});

// Handle tab updates to ensure content script is loaded
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && !tab.url.startsWith('chrome://')) {
    try {
      // Check if content script is already injected
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
      // Content script not found, inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        console.log('Content script injected for tab:', tabId);
      } catch (injectError) {
        console.error('Error injecting content script:', injectError);
      }
    }
  }
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message, 'from:', sender);

  switch (message.action) {
    case 'toggleSidePanel':
      try {
        if (!sender.tab) {
          console.error('No sender tab available');
          sendResponse({ success: false, error: 'No tab context available' });
          return true;
        }

        if (sender.tab.url.startsWith('chrome://')) {
          console.log('Cannot toggle side panel on chrome:// URLs');
          sendResponse({ success: false, error: 'Cannot access chrome:// URLs' });
          return true;
        }

        console.log('Attempting to toggle side panel for tab:', sender.tab.id);
        chrome.sidePanel.open({ windowId: sender.tab.windowId })
          .then(() => {
            console.log('Side panel opened via message');
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('Error opening side panel via message:', error);
            sendResponse({ success: false, error: error.message });
          });
      } catch (error) {
        console.error('Error handling toggleSidePanel:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;

    case 'getRecordingState':
      chrome.storage.local.get(['isRecording', 'isPaused'], (result) => {
        sendResponse({
          isRecording: result.isRecording || false,
          isPaused: result.isPaused || false
        });
      });
      break;

    case 'updateRecordingState':
      chrome.storage.local.set({
        isRecording: message.isRecording,
        isPaused: message.isPaused
      }, () => {
        sendResponse({ success: true });
      });
      break;

    case 'saveSteps':
      chrome.storage.local.set({ recordedSteps: message.steps }, () => {
        sendResponse({ success: true });
      });
      break;

    case 'getSteps':
      chrome.storage.local.get(['recordedSteps'], (result) => {
        sendResponse({ steps: result.recordedSteps || [] });
      });
      break;
  }

  return true; // Keep the message channel open for async responses
});

// Handle tab removal to clean up state
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(['isRecording'], (result) => {
    if (result.isRecording) {
      chrome.storage.local.set({
        isRecording: false,
        isPaused: false
      });
    }
  });
});
