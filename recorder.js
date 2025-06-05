// State management
let startTime = Date.now();
let durationInterval = null;
let recordedSteps = [];

// DOM Elements
const stopButton = document.getElementById('stopButton');
const statusElement = document.getElementById('status');
const stepCountElement = document.getElementById('stepCount');
const durationElement = document.getElementById('duration');
const codeTextarea = document.getElementById('codeTextarea');
const copyButton = document.getElementById('copyButton');
const exportButton = document.getElementById('exportButton');

// Initialize recorder window
chrome.storage.local.get(['recordedSteps', 'startTime'], (result) => {
  recordedSteps = result.recordedSteps || [];
  if (result.startTime) {
    startTime = result.startTime;
  }
  updateUI();
  startDurationTimer();
});

// Event Listeners
stopButton.addEventListener('click', stopRecording);
copyButton.addEventListener('click', copyCode);
exportButton.addEventListener('click', exportTest);

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

function showError(message) {
  statusElement.textContent = message;
  statusElement.className = 'status error';
  setTimeout(() => {
    statusElement.textContent = 'Recording';
    statusElement.className = 'status recording';
  }, 3000);
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

function updateUI() {
  stepCountElement.textContent = recordedSteps.length;
  generatePreview();
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

async function stopRecording() {
  try {
    // Send message to background script to stop recording
    chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
      if (response && response.success) {
        stopDurationTimer();
        // Update status to show recording has stopped
        statusElement.textContent = 'Recording Stopped';
        statusElement.className = 'status';
        // Disable the stop button
        stopButton.disabled = true;
        stopButton.style.opacity = '0.5';
      } else {
        showError('Failed to stop recording');
      }
    });
  } catch (err) {
    console.error('Error stopping recording:', err);
    showError('Failed to stop recording');
  }
}

// Listen for updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'stepRecorded') {
    recordedSteps = message.steps;
    updateUI();
  }
});
