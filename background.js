// Initialize extension state
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isRecording: false,
    recordedSteps: [],
    startTime: null
  });
});

// Handle tab updates to maintain recording state
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.storage.local.get(['isRecording'], (result) => {
      if (result.isRecording) {
        // Re-inject content script if recording was active
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
      }
    });
  }
});

// Handle extension icon click to show popup
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.get(['isRecording'], (result) => {
    if (result.isRecording) {
      // If recording, clicking the icon will stop recording
      chrome.tabs.sendMessage(tab.id, { action: 'stopRecording' });
    }
  });
});

// Listen for messages from popup and recorder window
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'stopRecording') {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      // Send stop recording message to content script
      chrome.tabs.sendMessage(tabs[0].id, { action: 'stopRecording' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error stopping recording:', chrome.runtime.lastError);
          sendResponse({ success: false, error: 'Failed to communicate with content script' });
          return;
        }
        sendResponse(response || { success: false });
      });
    });
    return true; // Keep the message channel open for async response
  }
});
