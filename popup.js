// State management
const state = {
  isRecording: false,
  startTime: null,
  durationInterval: null,
  recordedSteps: []
};

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

// Add new UI elements
const suggestionButton = document.getElementById('suggestionButton');
const suggestionPanel = document.getElementById('suggestionPanel');
const suggestionContent = document.getElementById('suggestionContent');
const loadingIndicator = document.getElementById('loadingIndicator');

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
  state.isRecording = result.isRecording || false;
  state.recordedSteps = result.recordedSteps || [];
  updateUI();
  if (state.recordedSteps.length > 0) {
    generatePreview().catch(console.error);
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
    if (!state.isRecording) {
      statusElement.textContent = 'Not Recording';
      statusElement.className = 'status';
    }
  }, 3000);
}

function handleRecordingStart(response) {
  console.log('Start recording response:', response);
  if (response && response.success) {
    state.isRecording = true;
    state.startTime = Date.now();
    state.recordedSteps = [];
    updateStorage();
    updateUI();
    startDurationTimer();
  }
}

async function stopRecording() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'stopRecording' }, (response) => {
      if (response && response.success) {
        state.isRecording = false;
        state.recordedSteps = response.steps || [];
        updateStorage();
        updateUI();
        stopDurationTimer();
        generatePreview().catch(console.error);
      }
    });
  });
}

function updateStorage() {
  chrome.storage.local.set({
    isRecording: state.isRecording,
    recordedSteps: state.recordedSteps,
    startTime: state.startTime
  });
}

function updateUI() {
  statusElement.textContent = state.isRecording ? 'Recording' : 'Not Recording';
  statusElement.className = `status ${state.isRecording ? 'recording' : ''}`;
  recordButton.style.display = state.isRecording ? 'none' : 'block';
  stopButton.style.display = state.isRecording ? 'block' : 'none';
  exportButton.disabled = state.recordedSteps.length === 0;
  stepCountElement.textContent = state.recordedSteps.length;

  // Show code preview if we have steps
  if (state.recordedSteps.length > 0) {
    codePreviewElement.classList.add('visible');
    generatePreview().catch(console.error);
  } else {
    codePreviewElement.classList.remove('visible');
  }
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

async function generatePreview() {
  if (!state.recordedSteps || state.recordedSteps.length === 0) return;

  try {
    // Get test description from Gemini
    const description = await geminiService.generateTestDescription(state.recordedSteps);
    const testName = description?.testName || 'Recorded Journey';
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
        case 'assert':
          code += generateAssertion(locator, step);
          break;
      }
    });

    code += '});\n';

    if (codeTextarea) {
      codeTextarea.value = code;
      if (codePreviewElement) {
        codePreviewElement.classList.add('visible');
      }
    }
  } catch (error) {
    console.error('Error generating preview:', error);
    // Fallback to basic test name if Gemini fails
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
      if (codePreviewElement) {
        codePreviewElement.classList.add('visible');
      }
    }
  }
}

function generateAssertion(locator, step) {
  const { assertionType, expectedValue, attributeName } = step;
  let assertion = '';

  switch (assertionType) {
    case 'visible':
      assertion = `  await expect(${locator}).toBeVisible();\n`;
      break;
    case 'text':
      assertion = `  await expect(${locator}).toHaveText('${expectedValue}');\n`;
      break;
    case 'value':
      assertion = `  await expect(${locator}).toHaveValue('${expectedValue}');\n`;
      break;
    case 'checked':
      assertion = `  await expect(${locator}).toBe${expectedValue ? 'Checked' : 'Unchecked'}();\n`;
      break;
    case 'disabled':
      assertion = `  await expect(${locator}).toBe${expectedValue ? 'Disabled' : 'Enabled'}();\n`;
      break;
    case 'count':
      assertion = `  await expect(${locator}).toHaveCount(${expectedValue});\n`;
      break;
    case 'attribute':
      assertion = `  await expect(${locator}).toHaveAttribute('${attributeName}', '${expectedValue}');\n`;
      break;
    default:
      console.warn('Unknown assertion type:', assertionType);
      return '';
  }

  return assertion;
}

function generateBasicTestCode(steps) {
  const testName = 'Recorded Journey';
  const url = steps[0]?.url || 'unknown-url';

  let code = `import { test, expect } from '@playwright/test';\n\n`;
  code += `test('${testName}', async ({ page }) => {\n`;
  code += `  await page.goto('${url}');\n\n`;

  steps.forEach(step => {
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
  return code;
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

// Listen for updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'stepRecorded') {
    state.recordedSteps = message.steps;
    stepCountElement.textContent = state.recordedSteps.length;
    updateStorage();
    generatePreview().catch(console.error);
  }
});

// Add event listener for suggestion button
suggestionButton.addEventListener('click', async () => {
  if (!state.recordedSteps.length) return;

  try {
    loadingIndicator.style.display = 'block';
    suggestionPanel.classList.add('visible');

    // Get suggestions from Gemini
    const suggestions = await geminiService.generateTestSuggestions(state.recordedSteps);
    if (!suggestions) {
      throw new Error('Failed to get suggestions');
    }

    // Get test description
    const description = await geminiService.generateTestDescription(state.recordedSteps);

    // Update UI with suggestions
    let suggestionHTML = '';

    if (description) {
      suggestionHTML += `
        <div class="suggestion-section">
          <h3>Suggested Test Description</h3>
          <p><strong>Name:</strong> ${description.testName}</p>
          <p><strong>Description:</strong> ${description.testDescription}</p>
        </div>
      `;
    }

    if (suggestions.additionalAssertions.length) {
      suggestionHTML += `
        <div class="suggestion-section">
          <h3>Additional Assertions</h3>
          <ul>
            ${suggestions.additionalAssertions.map(assertion => `
              <li>
                <button class="apply-suggestion" data-type="assertion" data-code="${encodeURIComponent(assertion)}">
                  Apply
                </button>
                ${assertion}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    if (suggestions.edgeCases.length) {
      suggestionHTML += `
        <div class="suggestion-section">
          <h3>Edge Cases to Consider</h3>
          <ul>
            ${suggestions.edgeCases.map(edgeCase => `
              <li>${edgeCase}</li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    if (suggestions.optimizationSuggestions.length) {
      suggestionHTML += `
        <div class="suggestion-section">
          <h3>Optimization Suggestions</h3>
          <ul>
            ${suggestions.optimizationSuggestions.map(suggestion => `
              <li>${suggestion}</li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    if (suggestions.flakinessWarnings.length) {
      suggestionHTML += `
        <div class="suggestion-section">
          <h3>Potential Flakiness Issues</h3>
          <ul>
            ${suggestions.flakinessWarnings.map(warning => `
              <li>${warning}</li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    suggestionContent.innerHTML = suggestionHTML;

    // Add event listeners for apply buttons
    document.querySelectorAll('.apply-suggestion').forEach(button => {
      button.addEventListener('click', (e) => {
        const code = decodeURIComponent(e.target.dataset.code);
        const type = e.target.dataset.type;
        applySuggestion(code, type);
      });
    });

  } catch (error) {
    console.error('Error getting suggestions:', error);
    suggestionContent.innerHTML = `
      <div class="error-message">
        Failed to get suggestions. Please try again.
      </div>
    `;
  } finally {
    loadingIndicator.style.display = 'none';
  }
});

function applySuggestion(code, type) {
  if (!codeTextarea) return;

  const currentCode = codeTextarea.value;
  let newCode = currentCode;

  switch (type) {
    case 'assertion':
      // Insert assertion before the last closing brace
      newCode = currentCode.replace(/}\);$/, `  ${code}\n});`);
      break;
    // Add more cases for other suggestion types
  }

  codeTextarea.value = newCode;
  generatePreview().catch(console.error);
}
