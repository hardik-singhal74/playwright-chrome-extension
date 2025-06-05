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

    if (step.type === 'navigate') {
      code += `  await page.goto('${step.url}');\n`;
      return;
    }

    if (!step.selector) {
      console.warn('Step missing selector:', step);
      return;
    }

    // Generate locator based on selector type
    const locator = generateLocator(step.selector);
    if (!locator) {
      console.warn('Could not generate locator for:', step.selector);
      return;
    }

    switch (step.type) {
      case 'click':
        code += `  await ${locator}.click();\n`;
        break;
      case 'type':
        if (!step.value) {
          console.warn('Type step missing value:', step);
          return;
        }
        code += `  await ${locator}.fill('${step.value}');\n`;
        break;
    }
  });

  code += '});\n';

  if (codeTextarea) {
    codeTextarea.value = code;
  }
}

function generateLocator(selector) {
  if (!selector || typeof selector !== 'object') {
    console.warn('Invalid selector format:', selector);
    return null;
  }

  switch (selector.type) {
    case 'testId':
      // Use getByTestId for data-* attributes
      return `page.getByTestId('${selector.value}')`;

    case 'title':
      // Use getByTitle for title attribute
      return `page.getByTitle('${selector.value}')`;

    case 'role':
      // Use getByRole with name
      const { role, name } = selector.value;
      return `page.getByRole('${role}', { name: '${name}' })`;

    case 'label':
      // Use getByLabel for label associations
      return `page.getByLabel('${selector.value}')`;

    case 'placeholder':
      // Use getByPlaceholder for placeholder text
      return `page.getByPlaceholder('${selector.value}')`;

    case 'altText':
      // Use getByAltText for image alt text
      return `page.getByAltText('${selector.value}')`;

    case 'text':
      // Use getByText for text content
      return `page.getByText('${selector.value}')`;

    case 'css':
      // Fallback to locator with CSS selector
      return `page.locator('${selector.value}')`;

    default:
      console.warn('Unknown selector type:', selector.type);
      return null;
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
