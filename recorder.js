// State management
const state = {
  startTime: Date.now(),
  durationInterval: null,
  recordedSteps: []
};

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
  state.recordedSteps = result.recordedSteps || [];
  if (result.startTime) {
    state.startTime = result.startTime;
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
  state.durationInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    durationElement.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopDurationTimer() {
  if (state.durationInterval) {
    clearInterval(state.durationInterval);
    state.durationInterval = null;
  }
}

function updateUI() {
  stepCountElement.textContent = state.recordedSteps.length;
  generatePreview();
}

function generatePreview() {
  if (!state.recordedSteps || state.recordedSteps.length === 0) return;

  const testName = 'Recorded Journey';
  const url = state.recordedSteps[0]?.url || 'unknown-url';

  let code = `import { test, expect } from '@playwright/test';\n\n`;
  code += `test('${testName}', async ({ page }) => {\n`;
  code += `  await page.goto('${url}');\n\n`;

  state.recordedSteps.forEach(step => {
    if (!step || !step.type) return;

    // Handle navigation steps separately since they don't have selectors
    if (step.type === 'navigate') {
      code += `  await page.goto('${step.url}');\n`;
      return;
    }

    // Skip if selector is undefined or null
    if (!step.selector) {
      console.warn('Step missing selector:', step);
      return;
    }

    // Check if the selector is a data-cy attribute
    const isDataCy = typeof step.selector === 'string' &&
                    step.selector.startsWith('[data-cy="') &&
                    step.selector.endsWith('"]');

    let selector;
    try {
      selector = isDataCy
        ? step.selector.match(/\[data-cy="([^"]+)"\]/)?.[1]  // Extract the data-cy value
        : step.selector;

      if (!selector) {
        console.warn('Could not extract selector from:', step.selector);
        return;
      }
    } catch (err) {
      console.error('Error processing selector:', err);
      return;
    }

    switch (step.type) {
      case 'click':
        code += isDataCy
          ? `  await page.getByTestId('${selector}').click();\n`
          : `  await page.locator('${selector}').click();\n`;
        break;
      case 'type':
        if (!step.value) {
          console.warn('Type step missing value:', step);
          return;
        }
        code += isDataCy
          ? `  await page.getByTestId('${selector}').fill('${step.value}');\n`
          : `  await page.locator('${selector}').fill('${step.value}');\n`;
        break;
    }
  });

  code += '});\n';

  if (codeTextarea) {
    codeTextarea.value = code;
  }
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
    state.recordedSteps = message.steps;
    updateUI();
  }
});
