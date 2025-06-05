// State management
let isRecording = false;
let startTime = null;
let durationInterval = null;
let recordedSteps = [];

// DOM Elements
const recordButton = document.getElementById('recordButton');
const stopButton = document.getElementById('stopButton');
const exportButton = document.getElementById('exportButton');
const statusElement = document.getElementById('status');
const stepCountElement = document.getElementById('stepCount');
const durationElement = document.getElementById('duration');
const codePreviewElement = document.getElementById('codePreview');
const codeTextarea = document.getElementById('codeTextarea');
const copyButton = document.getElementById('copyButton');

// Helper function to check if URL is recordable
function isRecordableUrl(url) {
  try {
    const urlObj = new URL(url);
    // Check if it's a restricted URL
    if (urlObj.protocol === 'chrome:' ||
        urlObj.protocol === 'chrome-extension:' ||
        urlObj.protocol === 'edge:' ||
        urlObj.protocol === 'about:' ||
        urlObj.protocol === 'file:') {
      return false;
    }
    // Only allow http and https URLs
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

// Initialize popup state
chrome.storage.local.get(['isRecording', 'recordedSteps'], (result) => {
  console.log('Initial state:', result);
  isRecording = result.isRecording || false;
  recordedSteps = result.recordedSteps || [];
  updateUI();
  if (recordedSteps.length > 0) {
    generatePreview();
  }
});

// Event Listeners
recordButton.addEventListener('click', () => {
  console.log('Record button clicked');
  startRecording();
});
stopButton.addEventListener('click', stopRecording);
exportButton.addEventListener('click', exportTest);
copyButton.addEventListener('click', copyCode);

// Open the recorder in side panel
async function openRecorderPanel() {
  try {
    // Open the side panel
    await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });
  } catch (err) {
    console.error('Error opening side panel:', err);
    showError('Failed to open recorder panel');
  }
}

// Copy code to clipboard
async function copyCode() {
  try {
    await navigator.clipboard.writeText(codeTextarea.value);
    copyButton.textContent = 'Copied!';
    copyButton.classList.add('copied');
    setTimeout(() => {
      copyButton.textContent = 'Copy Code';
      copyButton.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('Failed to copy code:', err);
    showError('Failed to copy code to clipboard');
  }
}

// Functions
async function startRecording() {
  console.log('Starting recording...');
  try {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      console.error('No active tab found');
      showError('No active tab found');
      return;
    }
    console.log('Current tab:', tab);

    // Check if we can record on this page
    if (!isRecordableUrl(tab.url)) {
      console.error('Cannot record on this page');
      showError('Recording is not available on this page. Please try on a regular website (http:// or https://)');
      return;
    }

    // Open the side panel
    await openRecorderPanel();

    // Inject the content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.log('Content script injected successfully');

      // Wait a brief moment to ensure the content script is initialized
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now try to send the start recording message
      chrome.tabs.sendMessage(tab.id, { action: 'startRecording' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError);
          // Try one more time after a short delay
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'startRecording' }, (retryResponse) => {
              if (chrome.runtime.lastError) {
                console.error('Still cannot connect to content script:', chrome.runtime.lastError);
                showError('Could not start recording. Please refresh the page and try again.');
                return;
              }
              handleRecordingStart(retryResponse);
            });
          }, 500);
          return;
        }
        handleRecordingStart(response);
      });
    } catch (err) {
      console.error('Error injecting content script:', err);
      showError('Could not start recording. Please make sure you\'re on a regular website.');
    }
  } catch (err) {
    console.error('Error in startRecording:', err);
    showError('An error occurred while starting the recording.');
  }
}

function showError(message) {
  statusElement.textContent = message;
  statusElement.className = 'status error';
  // Reset after 3 seconds
  setTimeout(() => {
    if (!isRecording) {
      statusElement.textContent = 'Not Recording';
      statusElement.className = 'status';
    }
  }, 3000);
}

function handleRecordingStart(response) {
  console.log('Start recording response:', response);
  if (response && response.success) {
    isRecording = true;
    startTime = Date.now();
    recordedSteps = [];
    updateStorage();
    updateUI();
    startDurationTimer();
  }
}

async function stopRecording() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'stopRecording' }, (response) => {
      if (response && response.success) {
        isRecording = false;
        recordedSteps = response.steps || [];
        updateStorage();
        updateUI();
        stopDurationTimer();
        generatePreview();
      }
    });
  });
}

function updateStorage() {
  chrome.storage.local.set({
    isRecording,
    recordedSteps,
    startTime
  });
}

function updateUI() {
  statusElement.textContent = isRecording ? 'Recording' : 'Not Recording';
  statusElement.className = `status ${isRecording ? 'recording' : ''}`;
  recordButton.style.display = isRecording ? 'none' : 'block';
  stopButton.style.display = isRecording ? 'block' : 'none';
  exportButton.disabled = recordedSteps.length === 0;
  stepCountElement.textContent = recordedSteps.length;

  // Show code preview if we have steps
  if (recordedSteps.length > 0) {
    codePreviewElement.classList.add('visible');
  } else {
    codePreviewElement.classList.remove('visible');
  }
}

function startDurationTimer() {
  durationInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    durationElement.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopDurationTimer() {
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }
}

function generatePreview() {
  if (recordedSteps.length === 0) return;

  const testName = 'Recorded Journey';
  const url = recordedSteps[0]?.url || 'unknown-url';

  let code = `import { test, expect } from '@playwright/test';\n\n`;
  code += `test('${testName}', async ({ page }) => {\n`;
  code += `  await page.goto('${url}');\n\n`;

  recordedSteps.forEach(step => {
    switch (step.type) {
      case 'click':
        code += `  await page.locator('${step.selector}').click();\n`;
        break;
      case 'type':
        code += `  await page.locator('${step.selector}').fill('${step.value}');\n`;
        break;
      case 'navigate':
        code += `  await page.goto('${step.url}');\n`;
        break;
    }
  });

  code += '});\n';

  codeTextarea.value = code;
  codePreviewElement.classList.add('visible');
}

function exportTest() {
  const testName = 'recorded-journey-' + new Date().toISOString().slice(0, 10);
  const blob = new Blob([codeTextarea.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download({
    url: url,
    filename: `${testName}.spec.ts`,
    saveAs: true
  });
}

// Listen for updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'stepRecorded') {
    recordedSteps = message.steps;
    stepCountElement.textContent = recordedSteps.length;
    updateStorage();
    generatePreview(); // Update preview with new steps
  }
});
