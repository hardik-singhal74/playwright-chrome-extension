// State management
const state = {
  isRecording: false,
  isPaused: false,
  recordedSteps: [],
  currentUrl: window.location.href,
  uiElements: {},
  durationInterval: null,
  pendingAssertion: null,  // Add this to track pending assertion
  aiSuggestions: [],
  isGeneratingSuggestions: false
};

// Add edit mode state
let isEditMode = false;

// Update Gemini API configuration
const GEMINI_API_KEY = 'AIzaSyAzfB7-OnyaZi_XfhlVsCdxYXK9d9Hm1UE';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Add Playwright best practices and code generation rules
const PlaywrightBestPractices = {
  // Best practices for selectors
  selectors: {
    preferred: [
      { type: 'testId', priority: 1, description: 'Use data-testid or data-cy attributes' },
      { type: 'role', priority: 2, description: 'Use role-based selectors with name' },
      { type: 'label', priority: 3, description: 'Use label-based selectors' },
      { type: 'placeholder', priority: 4, description: 'Use placeholder text for inputs' },
      { type: 'text', priority: 5, description: 'Use text content as last resort' }
    ],
    generateLocator: (selector) => {
      switch (selector.type) {
        case 'testId':
          return `page.getByTestId("${selector.value}")`;
        case 'role':
          return selector.value.name
            ? `page.getByRole('${selector.value.role}', { name: '${selector.value.name}' })`
            : `page.getByRole('${selector.value.role}')`;
        case 'label':
          return `page.getByLabel("${selector.value}")`;
        case 'placeholder':
          return `page.getByPlaceholder("${selector.value}")`;
        case 'text':
          return `page.getByText("${selector.value}")`;
        default:
          return `page.locator("${selector.value}")`;
      }
    }
  },

  // Best practices for assertions
  assertions: {
    preferred: [
      { type: 'toBeVisible', description: 'Check element visibility' },
      { type: 'toHaveText', description: 'Verify text content' },
      { type: 'toHaveValue', description: 'Check input value' },
      { type: 'toBeChecked', description: 'Verify checkbox state' },
      { type: 'toBeDisabled', description: 'Check disabled state' },
      { type: 'toHaveCount', description: 'Verify number of elements' }
    ],
    generateAssertion: (type, locator, value) => {
      switch (type) {
        case 'toBeVisible':
          return `await expect(${locator}).toBeVisible();`;
        case 'toHaveText':
          return `await expect(${locator}).toHaveText('${value}');`;
        case 'toHaveValue':
          return `await expect(${locator}).toHaveValue('${value}');`;
        case 'toBeChecked':
          return `await expect(${locator}).toBeChecked();`;
        case 'toBeDisabled':
          return `await expect(${locator}).toBeDisabled();`;
        case 'toHaveCount':
          return `await expect(${locator}).toHaveCount(${value});`;
        default:
          return `await expect(${locator}).toBeVisible();`;
      }
    }
  },

  // Code structure best practices
  structure: {
    testSteps: {
      format: `await test.step('{description}', async () => {
  {actions}
});`,
      actions: {
        navigate: 'await page.goto("{url}");',
        click: 'await {locator}.click();',
        type: 'await {locator}.fill("{value}");',
        select: 'await {locator}.selectOption("{value}");',
        check: 'await {locator}.check();',
        uncheck: 'await {locator}.uncheck();',
        hover: 'await {locator}.hover();',
        waitFor: 'await {locator}.waitFor({state: "visible"});'
      }
    },
    bestPractices: [
      'Use test.step for logical grouping of actions',
      'Include meaningful step descriptions',
      'Add appropriate waits and assertions',
      'Handle dynamic content with proper waiting strategies',
      'Use page object models for complex pages',
      'Implement proper error handling',
      'Add comments for complex operations'
    ]
  }
};

// Initialize UI elements and state
async function initializeUI() {
  state.uiElements = {
    recordButton: document.getElementById('recordButton'),
    pauseButton: document.getElementById('pauseButton'),
    stopButton: document.getElementById('stopButton'),
    clearButton: document.getElementById('clearButton'),
    exportButton: document.getElementById('exportButton'),
    copyButton: document.getElementById('copyButton'),
    status: document.getElementById('status'),
    codeTextarea: document.getElementById('codeTextarea')
  };

  // Add event listeners
  state.uiElements.recordButton.addEventListener('click', startRecording);
  state.uiElements.pauseButton.addEventListener('click', togglePauseRecording);
  state.uiElements.stopButton.addEventListener('click', stopRecording);
  state.uiElements.clearButton.addEventListener('click', clearRecording);
  state.uiElements.exportButton.addEventListener('click', exportTest);
  state.uiElements.copyButton.addEventListener('click', copyCode);

  // Load saved state
  try {
    const result = await chrome.storage.local.get(['isRecording', 'isPaused', 'recordedSteps']);
    console.log('Loaded saved state:', result); // Add logging
    state.isRecording = result.isRecording || false;
    state.isPaused = result.isPaused || false;
    state.recordedSteps = result.recordedSteps || [];

    if (state.isRecording) {
      // Verify recording state with content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getRecordingState' });
          console.log('Content script recording state:', response); // Add logging
          if (response && response.isRecording) {
            state.isRecording = true;
            state.isPaused = response.isPaused || false;
          } else {
            // Reset state if content script reports no recording
            state.isRecording = false;
            state.isPaused = false;
            await chrome.storage.local.set({
              isRecording: false,
              isPaused: false
            });
          }
        } catch (error) {
          console.error('Error checking recording state:', error);
          // Reset state if content script is not available
          state.isRecording = false;
          state.isPaused = false;
          await chrome.storage.local.set({
            isRecording: false,
            isPaused: false
          });
        }
      }
    }

    updateUI();
    if (state.recordedSteps.length > 0) {
      generatePreview();
    }

    // Add AI prompt section after the code textarea
    const aiPromptSection = createAIPromptSection();
    const container = state.uiElements.codeTextarea.parentElement;
    container.appendChild(aiPromptSection);

    // Initialize Gemini API
    initializeGeminiAPI();
  } catch (error) {
    console.error('Error initializing UI:', error);
    state.uiElements.status.textContent = 'Error initializing recorder';
    state.uiElements.status.className = 'status error';
  }
}

// Update UI based on recording state
function updateUI() {
  const { recordButton, pauseButton, stopButton, status } = state.uiElements;

  if (state.isRecording) {
    recordButton.style.display = 'none';
    pauseButton.style.display = 'flex';
    stopButton.style.display = 'flex';
    status.textContent = state.isPaused ? 'Recording paused' : 'Recording...';
    status.className = 'status ' + (state.isPaused ? 'paused' : 'recording');
    pauseButton.textContent = state.isPaused ? 'Resume' : 'Pause';
    pauseButton.classList.toggle('paused', state.isPaused);
  } else {
    recordButton.style.display = 'flex';
    pauseButton.style.display = 'none';
    stopButton.style.display = 'none';
    status.textContent = 'Not recording';
    status.className = 'status';
  }
}

// Start recording
async function startRecording() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    if (tab.url.startsWith('chrome://')) {
      throw new Error('Cannot record on chrome:// URLs');
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'startRecording' });
    if (!response.success) {
      throw new Error(response.error || 'Failed to start recording');
    }

    state.isRecording = true;
    state.isPaused = false;
    state.recordedSteps = [];
    state.currentUrl = tab.url;

    await chrome.storage.local.set({
      isRecording: true,
      isPaused: false,
      recordedSteps: []
    });

    updateUI();
    generatePreview();
  } catch (error) {
    console.error('Error starting recording:', error);
    state.uiElements.status.textContent = error.message || 'Error starting recording';
    state.uiElements.status.className = 'status error';

    // Reset state
    state.isRecording = false;
    state.isPaused = false;
    await chrome.storage.local.set({
      isRecording: false,
      isPaused: false
    });
    updateUI();
  }
}

// Toggle pause recording
async function togglePauseRecording() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'pauseRecording' });
    if (!response.success) {
      throw new Error(response.error || 'Failed to pause recording');
    }

    state.isPaused = !state.isPaused;
    await chrome.storage.local.set({ isPaused: state.isPaused });
    updateUI();
  } catch (error) {
    console.error('Error toggling pause:', error);
    state.uiElements.status.textContent = 'Error pausing recording';
    state.uiElements.status.className = 'status error';
  }
}

// Stop recording
async function stopRecording() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    // First, try to stop recording in the content script
    try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'stopRecording' });
      if (!response || !response.success) {
        console.warn('Content script response:', response);
        // Continue even if content script response is not successful
      }
    } catch (error) {
      console.warn('Error communicating with content script:', error);
      // Continue even if content script communication fails
    }

    // Update local state
    state.isRecording = false;
    state.isPaused = false;

    // Get the latest steps from storage
    const storage = await chrome.storage.local.get(['recordedSteps']);
    state.recordedSteps = storage.recordedSteps || [];

    // Update storage
    await chrome.storage.local.set({
      isRecording: false,
      isPaused: false,
      recordedSteps: state.recordedSteps
    });

    // Update UI
    updateUI();
    generatePreview();

    // Show success message
    state.uiElements.status.textContent = 'Recording stopped';
    state.uiElements.status.className = 'status success';

    // Reset status message after 2 seconds
    setTimeout(() => {
      if (state.uiElements.status.textContent === 'Recording stopped') {
        state.uiElements.status.textContent = 'Not recording';
        state.uiElements.status.className = 'status';
      }
    }, 2000);

  } catch (error) {
    console.error('Error stopping recording:', error);
    state.uiElements.status.textContent = 'Error stopping recording: ' + error.message;
    state.uiElements.status.className = 'status error';

    // Reset state even if there was an error
    state.isRecording = false;
    state.isPaused = false;
    await chrome.storage.local.set({
      isRecording: false,
      isPaused: false
    });
    updateUI();
  }
}

// Clear recording
function clearRecording() {
  state.recordedSteps = [];
  setTextareaContent(state.uiElements.codeTextarea, '');
  updateUI();
}

// Start duration timer
function startDurationTimer() {
  if (state.durationInterval) {
    clearInterval(state.durationInterval);
  }

  let seconds = 0;
  state.uiElements.duration.textContent = '00:00';

  state.durationInterval = setInterval(() => {
    seconds++;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    state.uiElements.duration.textContent =
      `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, 1000);
}

// Stop duration timer
function stopDurationTimer() {
  if (state.durationInterval) {
    clearInterval(state.durationInterval);
    state.durationInterval = null;
  }
}

// Update steps list
function updateStepsList() {
  // Skip updating the steps list UI since we're removing it
  generatePreview();
}

// Modify the getSelector function
function getSelector(element) {
  // First try data-cy (most preferred)
  const testId = element.getAttribute('data-cy');
  if (testId) {
    return {
      type: 'testId',  // Keep type as 'testId' to use getByTestId
      value: testId,
      source: 'data-cy'  // Add source to track where the testId came from
    };
  }

  // Then try title
  const title = element.getAttribute('title');
  if (title) {
    return {
      type: 'title',
      value: title
    };
  }

  // Then try role-based selectors
  const role = element.getAttribute('role') || getImplicitRole(element);
  if (role) {
    const name = element.getAttribute('aria-label') ||
                element.textContent?.trim() ||
                element.getAttribute('title');
    if (name) {
      return {
        type: 'role',
        value: { role, name }
      };
    }
    // If no name, still use role if it's a semantic role
    if (['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'listbox', 'menu', 'menuitem'].includes(role)) {
      return {
        type: 'role',
        value: { role }
      };
    }
  }

  // Then try label association
  const label = getAssociatedLabel(element);
  if (label) {
    return {
      type: 'label',
      value: label
    };
  }

  // Then try placeholder
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {
      return {
        type: 'placeholder',
        value: placeholder
      };
    }
  }

  // Then try alt text
  if (element.tagName === 'IMG') {
    const alt = element.getAttribute('alt');
    if (alt) {
      return {
        type: 'altText',
        value: alt
      };
    }
  }

  // Then try text content (only for specific elements)
  if (element.tagName === 'BUTTON' || element.tagName === 'A' || element.tagName === 'SPAN' || element.tagName === 'DIV') {
    const text = element.textContent?.trim();
    if (text && text.length < 50) { // Avoid long text content
      return {
        type: 'text',
        value: text
      };
    }
  }

  // As a last resort, try to find a parent with a testId and chain locators
  const parentWithTestId = findParentWithTestId(element);
  if (parentWithTestId) {
    return {
      type: 'chained',
      value: {
        parent: {
          type: 'testId',
          value: parentWithTestId.testId,
          source: parentWithTestId.source
        },
        child: getSelectorForChild(element, parentWithTestId.element)
      }
    };
  }

  // If all else fails, use a combination of role and text as a last resort
  return {
    type: 'fallback',
    value: {
      role: role || getImplicitRole(element),
      text: element.textContent?.trim()
    }
  };
}

// Modify the findParentWithTestId function
function findParentWithTestId(element) {
  let current = element.parentElement;
  while (current && current !== document.body) {
    const testId = current.getAttribute('data-cy');
    if (testId) {
      return {
        element: current,
        testId: testId,
        source: 'data-cy'
      };
    }
    current = current.parentElement;
  }
  return null;
}

// Helper function to get selector for a child element relative to its parent
function getSelectorForChild(element, parent) {
  // Try to find a unique attribute or property
  const title = element.getAttribute('title');
  if (title) {
    return {
      type: 'title',
      value: title
    };
  }

  const role = element.getAttribute('role') || getImplicitRole(element);
  if (role) {
    return {
      type: 'role',
      value: { role }
    };
  }

  // If element has text, use it with a filter
  const text = element.textContent?.trim();
  if (text && text.length < 50) {
    return {
      type: 'text',
      value: text
    };
  }

  // If no unique identifier found, use index as last resort
  const siblings = Array.from(parent.children).filter(
    child => child.tagName === element.tagName
  );
  if (siblings.length > 1) {
    const index = siblings.indexOf(element);
    return {
      type: 'index',
      value: index
    };
  }

  return null;
}

// Add this function to handle textarea content
function setTextareaContent(textarea, content) {
  // First, clear any existing content
  textarea.value = '';

  // Create a temporary div to normalize the content
  const tempDiv = document.createElement('div');
  tempDiv.textContent = content;

  // Set the normalized content
  textarea.value = tempDiv.textContent;

  // Force a reflow to ensure proper rendering
  textarea.style.display = 'none';
  textarea.offsetHeight; // Force reflow
  textarea.style.display = '';
}

// Modify the generatePreview function
function generatePreview() {
  if (!state.recordedSteps.length) {
    setTextareaContent(state.uiElements.codeTextarea, '');
    return;
  }

  try {
    const code = generateTestCode(state.recordedSteps);
    setTextareaContent(state.uiElements.codeTextarea, code);

    // Create assertion toolbar if it doesn't exist
    if (!state.uiElements.assertionToolbar) {
      createAssertionToolbar();
    }
  } catch (error) {
    console.error('Error generating preview:', error);
    state.uiElements.status.textContent = 'Error generating preview: ' + error.message;
    state.uiElements.status.className = 'status error';
  }
}

// Add function to format code with proper indentation
function formatCode(code) {
  // Split the code into lines
  const lines = code.split('\n');
  const formattedLines = [];
  let indentLevel = 0;
  const indentSize = 2; // 2 spaces for indentation

  for (let line of lines) {
    line = line.trim();

    // Skip empty lines
    if (!line) {
      formattedLines.push('');
      continue;
    }

    // Decrease indent level for closing braces
    if (line.startsWith('});') || line.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    // Add the line with proper indentation
    formattedLines.push(' '.repeat(indentLevel * indentSize) + line);

    // Increase indent level for opening braces
    if (line.endsWith('{')) {
      indentLevel++;
    }
  }

  return formattedLines.join('\n');
}

// Update addSuggestionToTest to handle assertions properly
function addSuggestionToTest(suggestion) {
  // Convert any locator syntax to getByTestId
  const convertedCode = convertToGetByTestId(suggestion.code);

  // Replace hardcoded values with Faker
  const codeWithFaker = replaceWithFaker(convertedCode);

  // Format the code with proper indentation
  const formattedCode = formatCode(codeWithFaker);

  // Validate the generated code
  const validation = validateGeneratedCode(formattedCode);
  if (!validation.isValid) {
    console.warn('Code validation issues:', validation.issues);
  }

  // Extract actions from the code
  const actions = formattedCode.split('\n').filter(line => line.trim());
  const newActions = [];

  // Process each action to prevent duplicates
  for (let i = 0; i < actions.length; i++) {
    const currentAction = actions[i];
    const nextAction = actions[i + 1];

    // Skip click action if it's followed by an assertion on the same element
    if (currentAction.includes('.click()') && nextAction && nextAction.includes('expect(')) {
      const currentSelector = extractSelector(currentAction);
      const nextSelector = extractSelector(nextAction);

      if (currentSelector && nextSelector && currentSelector === nextSelector) {
        // Skip the click action and just keep the assertion
        continue;
      }
    }

    newActions.push(currentAction);
  }

  // Create the final code with filtered actions
  const finalCode = newActions.join('\n');

  // Check if this step already exists to prevent duplicates
  const isDuplicate = state.recordedSteps.some(step =>
    step.type === 'testStepBlock' &&
    step.description === suggestion.description &&
    step.actions.some(action => action.code === finalCode)
  );

  if (isDuplicate) {
    state.uiElements.status.textContent = 'This step already exists in the test';
    state.uiElements.status.className = 'status warning';
    setTimeout(() => {
      if (state.uiElements.status.textContent === 'This step already exists in the test') {
        state.uiElements.status.textContent = state.isRecording ? 'Recording...' : 'Not recording';
        state.uiElements.status.className = 'status ' + (state.isPaused ? 'paused' : '');
      }
    }, 2000);
    return;
  }

  const newStep = {
    type: 'testStepBlock',
    description: suggestion.description,
    actions: [{
      type: 'testStep',
      code: finalCode
    }]
  };

  state.recordedSteps.push(newStep);
  chrome.storage.local.set({ recordedSteps: state.recordedSteps }, () => {
  generatePreview();
    const message = validation.isValid
      ? 'Step added to test'
      : 'Step added to test (with validation warnings)';
    state.uiElements.status.textContent = message;
    state.uiElements.status.className = 'status ' + (validation.isValid ? 'success' : 'warning');
    setTimeout(() => {
      if (state.uiElements.status.textContent === message) {
        state.uiElements.status.textContent = state.isRecording ? 'Recording...' : 'Not recording';
        state.uiElements.status.className = 'status ' + (state.isPaused ? 'paused' : '');
      }
    }, 2000);
  });
}

// Add helper function to extract selector from action
function extractSelector(action) {
  if (action.includes('getByTestId')) {
    const match = action.match(/getByTestId\("([^"]+)"\)/);
    return match ? match[1] : null;
  }
  return null;
}

// Update generateTestCode to handle assertions more strictly
function generateTestCode(steps) {
  try {
    let codeBuffer = [];
    codeBuffer.push('import { test, expect } from \'@playwright/test\';');
    codeBuffer.push(FAKER_IMPORT);
    codeBuffer.push('');

    codeBuffer.push('test(\'recorded test\', async ({ page }) => {');

    // Track the last action for each selector to prevent duplicates
    const lastActionMap = new Map();

    steps.forEach(step => {
      if (step.type === 'testStepBlock') {
        // Handle test step blocks as before
        const code = step.actions[0]?.code || '';
        if (code.includes('test.step')) {
          const innerStepMatch = code.match(/await test\.step\('([^']+)',\s*async\s*\(\)\s*=>\s*{([^}]+)}\);/);
          if (innerStepMatch) {
            const [_, description, innerCode] = innerStepMatch;
            codeBuffer.push(`  await test.step('${step.description}', async () => {`);
            formatCode(innerCode).split('\n').forEach(line => {
              if (line.trim()) {
                codeBuffer.push(`    ${line}`);
              }
            });
            codeBuffer.push('  });');
      } else {
            codeBuffer.push(`  ${formatCode(code)}`);
      }
    } else {
          codeBuffer.push(`  await test.step('${step.description}', async () => {`);
          if (step.actions && step.actions.length > 0) {
            step.actions.forEach(action => {
              if (action.type === 'testStep') {
                const formattedCode = formatCode(action.code);
                formattedCode.split('\n').forEach(line => {
                  if (line.trim()) {
                    codeBuffer.push(`    ${line}`);
                  }
                });
              }
            });
          }
          codeBuffer.push('  });');
        }
      } else if (step.type === 'testStep') {
        const formattedCode = formatCode(step.code);
        formattedCode.split('\n').forEach(line => {
          if (line.trim()) {
            codeBuffer.push(`  ${line}`);
          }
        });
      } else {
        const locator = generateLocator(step.selector);
        const selectorKey = JSON.stringify(step.selector);

    switch (step.type) {
      case 'navigate':
            codeBuffer.push(`  await page.goto('${step.url.replace(/\s+/g, '').trim()}');`);
            break;
      case 'click':
            // Only add click if it's not immediately followed by an assertion on the same element
            const nextStep = steps[steps.indexOf(step) + 1];
            if (!(nextStep &&
                nextStep.type === 'assert' &&
                JSON.stringify(nextStep.selector) === selectorKey)) {
              codeBuffer.push(`  await ${locator}.click();`);
              lastActionMap.set(selectorKey, { type: 'click', locator });
            }
            break;
      case 'type':
            const value = replaceWithFaker(`'${step.value.replace(/\s+/g, ' ').trim()}'`);
            codeBuffer.push(`  await ${locator}.fill(${value});`);
            lastActionMap.set(selectorKey, { type: 'type', locator });
            break;
      case 'assert':
            // For assertions, check if we need to add a wait before the assertion
            const lastAction = lastActionMap.get(selectorKey);
            if (lastAction && lastAction.type === 'click') {
              // Add a small wait after click before assertion
              codeBuffer.push(`  await ${locator}.waitFor({ state: 'visible' });`);
            }
            codeBuffer.push(`  await expect(${locator}).${getAssertionMethod(step)};`);
            break;
        }
      }
    });

    codeBuffer.push('});');
    codeBuffer.push('');

    return codeBuffer
      .join('\n')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (error) {
    console.error('Error generating test code:', error);
    throw new Error('Failed to generate test code: ' + error.message);
  }
}

// Add helper function to get assertion method
function getAssertionMethod(step) {
  switch (step.assertionType) {
    case 'visible':
      return 'toBeVisible()';
    case 'text':
      return `toHaveText('${step.expectedValue}')`;
    case 'value':
      return `toHaveValue('${step.expectedValue}')`;
    case 'checked':
      return 'toBeChecked()';
    case 'disabled':
      return 'toBeDisabled()';
    case 'count':
      return `toHaveCount(${step.expectedValue})`;
    case 'attribute':
      return `toHaveAttribute('${step.attributeName}', '${step.expectedValue}')`;
    default:
      return `// Unknown assertion type: ${step.assertionType}`;
  }
}

// New function to generate Playwright locator code
function generateLocator(selector) {
  if (!selector) return 'page.locator("body")';

  switch (selector.type) {
    case 'testId':
      // Always use getByTestId for both data-cy and data-testid attributes
      return `page.getByTestId("${selector.value}")`;
    case 'title':
      return `page.getByTitle("${selector.value}")`;
    case 'role':
      const roleValue = selector.value;
      return roleValue.name
        ? `page.getByRole('${roleValue.role}', { name: '${roleValue.name}' })`
        : `page.getByRole('${roleValue.role}')`;
    case 'label':
      return `page.getByLabel("${selector.value}")`;
    case 'placeholder':
      return `page.getByPlaceholder("${selector.value}")`;
    case 'altText':
      return `page.getByAltText("${selector.value}")`;
    case 'text':
      return `page.getByText("${selector.value}")`;
    case 'chained':
      const parentLocator = generateLocator(selector.value.parent);
      const childSelector = selector.value.child;
      if (childSelector.type === 'text') {
        return `${parentLocator}.getByText("${childSelector.value}")`;
      } else if (childSelector.type === 'role') {
        return `${parentLocator}.getByRole('${childSelector.value.role}')`;
      } else if (childSelector.type === 'title') {
        return `${parentLocator}.getByTitle("${childSelector.value}")`;
      } else if (childSelector.type === 'index') {
        return `${parentLocator}.nth(${childSelector.value})`;
      } else if (childSelector.type === 'testId') {
        return `${parentLocator}.getByTestId("${childSelector.value}")`;
      }
      return `${parentLocator}.locator("${childSelector.value}")`;
    case 'fallback':
      if (selector.value.role && selector.value.text) {
        return `page.getByRole('${selector.value.role}').filter({ hasText: '${selector.value.text}' })`;
      }
      // Try to find a better selector before falling back to locator
      if (selector.value.tag) {
        const role = getImplicitRole({ tagName: selector.value.tag.toUpperCase() });
        if (role) {
          return `page.getByRole('${role}')`;
        }
      }
      return `page.locator('${selector.value}')`;
    default:
      // Try to find a better selector before falling back to locator
      if (typeof selector.value === 'string' && selector.value.includes('data-cy=')) {
        const testId = selector.value.match(/data-cy="([^"]+)"/)?.[1];
        if (testId) {
          return `page.getByTestId("${testId}")`;
        }
      }
      return `page.locator('${selector.value}')`;
  }
}

// Modify the createAssertionToolbar function's add button click handler
function createAssertionToolbar() {
  // Create toolbar container
  const toolbar = document.createElement('div');
  toolbar.className = 'assertion-toolbar';

  // Create left section for buttons
  const leftSection = document.createElement('div');
  leftSection.className = 'toolbar-left-section';

  // Add edit button first
  const editButton = document.createElement('button');
  editButton.className = 'edit-button';
  editButton.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>`;
  editButton.title = 'Edit Code';
  editButton.addEventListener('click', toggleEditMode);

  const editContainer = document.createElement('div');
  editContainer.className = 'assertion-button-container';
  editContainer.appendChild(editButton);
  leftSection.appendChild(editContainer);

  // Add test step block button
  const testStepButton = document.createElement('button');
  testStepButton.className = 'assertion-button';
  testStepButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <path d="M4 6h16M4 12h16M4 18h16"></path>
  </svg>`;
  testStepButton.title = 'Add Test Step Block';

  // Create test step form
  const testStepForm = document.createElement('div');
  testStepForm.className = 'assertion-input-container';
  testStepForm.style.display = 'none';

  const descriptionLabel = document.createElement('label');
  descriptionLabel.textContent = 'Step Description';
  descriptionLabel.className = 'assertion-label';

  const descriptionInput = document.createElement('input');
  descriptionInput.type = 'text';
  descriptionInput.placeholder = 'Enter step description (e.g., Login to application)';
  descriptionInput.className = 'assertion-input';

  const addButton = document.createElement('button');
  addButton.className = 'add-assertion-button';
  addButton.textContent = 'Add Step';

  // Add elements to form
  testStepForm.appendChild(descriptionLabel);
  testStepForm.appendChild(descriptionInput);
  testStepForm.appendChild(addButton);

  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'assertion-button-container';
  buttonContainer.appendChild(testStepButton);
  buttonContainer.appendChild(testStepForm);

  // Add click handler for the button
  testStepButton.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const isVisible = testStepForm.style.display === 'flex';

    // Hide all other input containers
    document.querySelectorAll('.assertion-input-container').forEach(container => {
      if (container !== testStepForm) {
        container.style.display = 'none';
      }
    });

    // Remove active class from all buttons
    document.querySelectorAll('.assertion-button').forEach(btn => {
      if (btn !== this) {
        btn.classList.remove('active');
      }
    });

    // Toggle visibility
    testStepForm.style.display = isVisible ? 'none' : 'flex';
    this.classList.toggle('active', !isVisible);
  });

  // Add click handler for the add button
  addButton.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const description = descriptionInput.value.trim();
    if (description) {
      // Create a new test step block
      const newStep = {
        type: 'testStepBlock',
        description: description,
        actions: []  // Empty actions array for now
      };

      // Add the step to recorded steps
      state.recordedSteps.push(newStep);

      // Save to storage
      chrome.storage.local.set({ recordedSteps: state.recordedSteps }, function() {
        if (chrome.runtime.lastError) {
          console.error('Error saving steps:', chrome.runtime.lastError);
    return;
  }

        // Update the preview
        generatePreview();

        // Reset the form
        testStepForm.style.display = 'none';
        testStepButton.classList.remove('active');
        descriptionInput.value = '';

        // Show success message
        state.uiElements.status.textContent = 'Test step added';
        state.uiElements.status.className = 'status success';

        // Reset status message after 2 seconds
        setTimeout(() => {
          if (state.uiElements.status.textContent === 'Test step added') {
            state.uiElements.status.textContent = state.isRecording ? 'Recording...' : 'Not recording';
            state.uiElements.status.className = 'status ' + (state.isPaused ? 'paused' : '');
          }
        }, 2000);
      });
    }
  });

  // Add click outside handler
  document.addEventListener('click', function(e) {
    if (!testStepForm.contains(e.target) && !testStepButton.contains(e.target)) {
      testStepForm.style.display = 'none';
      testStepButton.classList.remove('active');
    }
  });

  // Add button container to left section
  leftSection.appendChild(buttonContainer);

  // Add other assertion buttons
  const assertionTypes = [
    {
      type: 'visible',
      label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>`,
      tooltip: 'Is Visible'
    },
    {
      type: 'text',
      label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M4 7V4h16v3"></path>
        <path d="M9 20h6"></path>
        <path d="M12 4v16"></path>
      </svg>`,
      tooltip: 'Has Text',
      hasInput: true,
      placeholder: 'Enter expected text'
    },
    {
      type: 'value',
      label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M20 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"></path>
        <path d="M8 10h.01"></path>
        <path d="M12 10h.01"></path>
        <path d="M16 10h.01"></path>
      </svg>`,
      tooltip: 'Has Value',
      hasInput: true,
      placeholder: 'Enter expected value'
    },
    {
      type: 'checked',
      label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>`,
      tooltip: 'Is Checked'
    },
    {
      type: 'disabled',
      label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="4.93" y1="19.07" x2="19.07" y2="4.93"></line>
      </svg>`,
      tooltip: 'Is Disabled'
    },
    {
      type: 'count',
      label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>`,
      tooltip: 'Has Count',
      hasInput: true,
      placeholder: 'Enter expected count'
    },
    {
      type: 'attribute',
      label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
        <line x1="7" y1="7" x2="7.01" y2="7"></line>
      </svg>`,
      tooltip: 'Has Attribute',
      hasInput: true,
      needsAttributeName: true
    }
  ];

  // Add the rest of the assertion buttons
  assertionTypes.forEach(assertion => {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'assertion-button-container';

    const button = document.createElement('button');
    button.className = 'assertion-button';
    button.innerHTML = assertion.label;
    button.title = assertion.tooltip;

    if (assertion.hasInput) {
      const inputContainer = document.createElement('div');
      inputContainer.className = 'assertion-input-container';
      inputContainer.style.display = 'none';

      if (assertion.type === 'testStepBlock') {
        // Test step block form is already handled above
      } else if (assertion.needsAttributeName) {
        const attrLabel = document.createElement('label');
        attrLabel.textContent = 'Attribute Name';
        attrLabel.className = 'assertion-label';

        const attrInput = document.createElement('input');
        attrInput.type = 'text';
        attrInput.placeholder = 'Enter attribute name';
        attrInput.className = 'assertion-input';

        const valueLabel = document.createElement('label');
        valueLabel.textContent = 'Expected Value';
        valueLabel.className = 'assertion-label';

        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.placeholder = 'Enter expected value';
        valueInput.className = 'assertion-input';

        const addButton = document.createElement('button');
        addButton.className = 'add-assertion-button';
        addButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;
        addButton.title = 'Select Element';

        inputContainer.appendChild(attrLabel);
        inputContainer.appendChild(attrInput);
        inputContainer.appendChild(valueLabel);
        inputContainer.appendChild(valueInput);
        inputContainer.appendChild(addButton);

        // Add click handler
        button.addEventListener('click', function(e) {
          e.stopPropagation();
          const isVisible = inputContainer.style.display === 'flex';

          // Hide all other input containers
          document.querySelectorAll('.assertion-input-container').forEach(container => {
            if (container !== inputContainer) {
              container.style.display = 'none';
            }
          });

          // Remove active class from all buttons
          document.querySelectorAll('.assertion-button').forEach(btn => {
            if (btn !== this) {
              btn.classList.remove('active');
            }
          });

          // Toggle visibility
          inputContainer.style.display = isVisible ? 'none' : 'flex';
          this.classList.toggle('active', !isVisible);
        });

        // Handle add button click
        addButton.addEventListener('click', function(e) {
          e.stopPropagation();
          const attrValue = attrInput.value.trim();
          const expectedValue = valueInput.value.trim();

          if (attrValue && expectedValue) {
            state.pendingAssertion = {
              type: assertion.type,
              expectedValue: expectedValue,
              attributeName: attrValue
            };
            startElementSelection();
            inputContainer.style.display = 'none';
            button.classList.remove('active');
          } else {
            // Show error if inputs are empty
            state.uiElements.status.textContent = 'Please fill in both attribute name and expected value';
            state.uiElements.status.className = 'status error';
            setTimeout(() => {
              if (state.uiElements.status.textContent === 'Please fill in both attribute name and expected value') {
                state.uiElements.status.textContent = state.isRecording ? 'Recording...' : 'Not recording';
                state.uiElements.status.className = 'status ' + (state.isPaused ? 'paused' : '');
              }
            }, 2000);
          }
        });
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = assertion.placeholder;
        input.className = 'assertion-input';

        const addButton = document.createElement('button');
        addButton.className = 'add-assertion-button';
        addButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;
        addButton.title = 'Select Element';

        inputContainer.appendChild(input);
        inputContainer.appendChild(addButton);

        // Add click handler
        button.addEventListener('click', function(e) {
          e.stopPropagation();
          const isVisible = inputContainer.style.display === 'flex';

          // Hide all other input containers
          document.querySelectorAll('.assertion-input-container').forEach(container => {
            if (container !== inputContainer) {
              container.style.display = 'none';
            }
          });

          // Remove active class from all buttons
          document.querySelectorAll('.assertion-button').forEach(btn => {
            if (btn !== this) {
              btn.classList.remove('active');
            }
          });

          // Toggle visibility
          inputContainer.style.display = isVisible ? 'none' : 'flex';
          this.classList.toggle('active', !isVisible);
        });

        // Handle add button click
        addButton.addEventListener('click', function(e) {
          e.stopPropagation();
          const inputValue = input.value.trim();

          if (inputValue) {
            state.pendingAssertion = {
              type: assertion.type,
              expectedValue: inputValue
            };
            startElementSelection();
            inputContainer.style.display = 'none';
            button.classList.remove('active');
          } else {
            // Show error if input is empty
            state.uiElements.status.textContent = 'Please enter a value';
            state.uiElements.status.className = 'status error';
            setTimeout(() => {
              if (state.uiElements.status.textContent === 'Please enter a value') {
                state.uiElements.status.textContent = state.isRecording ? 'Recording...' : 'Not recording';
                state.uiElements.status.className = 'status ' + (state.isPaused ? 'paused' : '');
              }
            }, 2000);
          }
        });
      }

      buttonContainer.appendChild(button);
      buttonContainer.appendChild(inputContainer);
      leftSection.appendChild(buttonContainer);
    } else {
      // For non-input assertions
      button.addEventListener('click', function() {
        state.pendingAssertion = {
          type: assertion.type
        };
        startElementSelection();
      });
      buttonContainer.appendChild(button);
      leftSection.appendChild(buttonContainer);
    }
  });

  // Add click outside handler
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.assertion-button-container')) {
      document.querySelectorAll('.assertion-input-container').forEach(container => {
        container.style.display = 'none';
      });
      document.querySelectorAll('.assertion-button').forEach(btn => {
        btn.classList.remove('active');
      });
    }
  });

  // Create right section
  const rightSection = document.createElement('div');
  rightSection.className = 'toolbar-right-section';

  // Add copy button
  const copyButton = document.createElement('button');
  copyButton.className = 'action-button copy-button';
  copyButton.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
  </svg>`;
  copyButton.title = 'Copy Code';
  copyButton.addEventListener('click', copyCode);

  rightSection.appendChild(copyButton);

  // Add sections to toolbar
  toolbar.appendChild(leftSection);
  toolbar.appendChild(rightSection);

  // Insert toolbar before the textarea
  const container = state.uiElements.codeTextarea.parentElement;
  container.insertBefore(toolbar, state.uiElements.codeTextarea);
  state.uiElements.assertionToolbar = toolbar;
}

// Add new function to handle element selection
async function startElementSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    // Update UI to show selection mode
    state.uiElements.status.textContent = 'Select an element on the page...';
    state.uiElements.status.className = 'status selecting';

    // Send message to content script to start element selection
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'startAssertionMode',  // Changed from startElementSelection to startAssertionMode
      type: state.pendingAssertion.type
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to start element selection');
    }
  } catch (error) {
    console.error('Error starting element selection:', error);
    state.uiElements.status.textContent = 'Error: ' + error.message;
    state.uiElements.status.className = 'status error';
    state.pendingAssertion = null;
  }
}

// Update the message listener to handle assertions more strictly
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'stepRecorded') {
    state.recordedSteps = message.steps || [];
    chrome.storage.local.set({ recordedSteps: state.recordedSteps }).catch(console.error);
    generatePreview();
  } else if (message.type === 'recordingStateChanged') {
    console.log('Recording state changed:', message);
    state.isRecording = message.isRecording || false;
    state.isPaused = message.isPaused || false;
    updateUI();
  } else if (message.type === 'assertionComplete') {
    if (state.pendingAssertion) {
      const { type, expectedValue, attributeName } = state.pendingAssertion;
      const selector = message.selector;

      // Create the assertion step
      const assertionStep = {
        type: 'assert',
        selector: selector,
        assertionType: type,
        expectedValue: expectedValue,
        attributeName: attributeName
      };

      // Add the assertion to recorded steps
      state.recordedSteps.push(assertionStep);

      chrome.storage.local.set({ recordedSteps: state.recordedSteps }, () => {
        generatePreview();
        state.uiElements.status.textContent = 'Assertion added';
        state.uiElements.status.className = 'status success';
        setTimeout(() => {
          if (state.uiElements.status.textContent === 'Assertion added') {
            state.uiElements.status.textContent = state.isRecording ? 'Recording...' : 'Not recording';
            state.uiElements.status.className = 'status ' + (state.isPaused ? 'paused' : '');
          }
        }, 2000);
      });
    }
    state.pendingAssertion = null;
  }
});

// Add styles for the assertion toolbar
const style = document.createElement('style');
style.textContent = `
  /* Reset all button styles first */
  .assertion-button,
  .edit-button,
  .save-button,
  .action-button,
  .assertion-button-container button {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px !important;
    height: 20px !important;
    min-width: 20px !important;
    max-width: 20px !important;
    padding: 2px !important;
    margin: 0 !important;
    border: 1px solid #ced4da !important;
    border-radius: 3px !important;
    background: #ffffff !important;
    cursor: pointer !important;
    color: #495057 !important;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
    transition: all 0.2s ease !important;
  }

  /* Reset all SVG styles */
  .assertion-button svg,
  .edit-button svg,
  .save-button svg,
  .action-button svg,
  .assertion-button-container button svg {
    width: 10px !important;
    height: 10px !important;
    stroke: #495057 !important;
    stroke-width: 2.5 !important;
    fill: none !important;
    display: block !important;
  }

  /* Hover states */
  .assertion-button:hover,
  .edit-button:hover,
  .save-button:hover,
  .action-button:hover,
  .assertion-button-container button:hover {
    background: #f8f9fa !important;
    border-color: #adb5bd !important;
  }

  .assertion-button:hover svg,
  .edit-button:hover svg,
  .save-button:hover svg,
  .action-button:hover svg,
  .assertion-button-container button:hover svg {
    stroke: #212529 !important;
  }

  /* Active states */
  .assertion-button.active,
  .edit-button.active,
  .assertion-button-container button.active {
    background: #e9ecef !important;
    border-color: #6c757d !important;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.1) !important;
  }

  .assertion-button.active svg,
  .edit-button.active svg,
  .assertion-button-container button.active svg {
    stroke: #212529 !important;
  }

  /* Save button specific styles */
  .save-button {
    background: #198754 !important;
  }

  .save-button svg {
    stroke: #ffffff !important;
  }

  .save-button:hover {
    background: #157347 !important;
  }

  .save-button:hover svg {
    stroke: #ffffff !important;
  }

  /* Container styles */
  .assertion-button-container {
    position: relative;
    display: inline-flex;
    align-items: center;
    margin: 0 1px;
  }

  /* Dialog box styles */
  .assertion-input-container {
    position: absolute;
    top: 100%;
    left: 0;
    display: none;
    flex-direction: column;
    gap: 8px;
    background: white;
    padding: 12px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 9999;
    width: 320px;
    margin-top: 4px;
    box-sizing: border-box;
  }

  .assertion-input-container .add-assertion-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    margin: 8px 0 0 auto;  /* Align to the right */
    background: #0d6efd;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    box-sizing: border-box;
  }

  .assertion-input-container .add-assertion-button svg {
    width: 20px;
    height: 20px;
    stroke: currentColor;
    stroke-width: 2.5;
    fill: none;
  }

  .assertion-input-container .add-assertion-button:hover {
    background: #0b5ed7;
  }

  .assertion-input-container .add-assertion-button:active {
    background: #0a58ca;
  }

  /* Remove any conflicting styles */
  .add-assertion-button {
    all: unset;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 36px !important;
    height: 36px !important;
    padding: 0 !important;
    margin: 8px 0 0 auto !important;
    background: #0d6efd !important;
    color: white !important;
    border: none !important;
    border-radius: 4px !important;
    cursor: pointer !important;
    transition: background-color 0.2s ease !important;
    box-sizing: border-box !important;
  }

  .assertion-input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 13px;
    line-height: 1.4;
    color: #212529;
    background: #fff;
  }

  .assertion-input:focus {
    border-color: #86b7fe;
    outline: 0;
    box-shadow: 0 0 0 0.2rem rgba(13,110,253,.25);
  }

  .add-assertion-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 32px;  /* Fixed height */
    min-width: 140px;  /* Increased minimum width */
    padding: 0 16px;  /* Horizontal padding only */
    background: #0d6efd;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    text-align: center;
    transition: background-color 0.2s ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-sizing: border-box;
    line-height: 1;  /* Ensure text is vertically centered */
  }

  .add-assertion-button:hover {
    background: #0b5ed7;
  }

  .add-assertion-button:active {
    background: #0a58ca;
  }

  /* Toolbar styles */
  .assertion-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    margin-bottom: 8px;
    width: 100%;
    box-sizing: border-box;
  }

  .toolbar-left-section {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-wrap: nowrap;
    min-width: 0;
    position: relative;
  }

  .toolbar-right-section {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  /* Status message styles */
  .status {
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 13px;
    margin: 8px 0;
  }

  .status.recording {
    background: #d1e7dd;
    color: #0f5132;
    border: 1px solid #badbcc;
  }

  .status.paused {
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffeeba;
  }

  .status.error {
    background: #f8d7da;
    color: #842029;
    border: 1px solid #f5c2c7;
  }

  .status.success {
    background: #d1e7dd;
    color: #0f5132;
    border: 1px solid #badbcc;
  }

  #codeTextarea.editing {
    border-color: #86b7fe;
    box-shadow: 0 0 0 0.2rem rgba(13,110,253,.25);
  }

  .status.selecting {
    background: #cff4fc;
    color: #055160;
    border: 1px solid #9eeaf9;
  }

  .test-step-input {
    min-height: 60px;
    resize: vertical;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.4;
  }
`;
document.head.appendChild(style);

// Export test
function exportTest() {
  if (!state.recordedSteps.length) {
    state.uiElements.status.textContent = 'No steps to export';
    state.uiElements.status.className = 'status error';
    return;
  }

  try {
    const code = generateTestCode(state.recordedSteps);
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recorded-test.spec.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting test:', error);
    state.uiElements.status.textContent = 'Error exporting test';
    state.uiElements.status.className = 'status error';
  }
}

// Copy code to clipboard
async function copyCode() {
  try {
    const code = state.uiElements.codeTextarea.value;
    if (!code) {
      state.uiElements.status.textContent = 'No code to copy';
      state.uiElements.status.className = 'status error';
      return;
    }

    await navigator.clipboard.writeText(code);
    state.uiElements.status.textContent = 'Code copied to clipboard!';
    state.uiElements.status.className = 'status success';

    // Reset status message after 2 seconds
    setTimeout(() => {
      if (state.uiElements.status.textContent === 'Code copied to clipboard!') {
        state.uiElements.status.textContent = state.isRecording ? 'Recording...' : 'Not recording';
        state.uiElements.status.className = 'status ' + (state.isPaused ? 'paused' : '');
      }
    }, 2000);
  } catch (error) {
    console.error('Error copying code:', error);
    state.uiElements.status.textContent = 'Error copying code';
    state.uiElements.status.className = 'status error';
  }
}

// Add back the edit mode functions
function toggleEditMode() {
  const codeTextarea = state.uiElements.codeTextarea;
  const editButton = document.querySelector('.edit-button');

  isEditMode = !isEditMode;

  if (isEditMode) {
    // Enable editing
    codeTextarea.readOnly = false;
    codeTextarea.classList.add('editing');
    editButton.classList.add('active');

    // Add save button
    if (!document.querySelector('.save-button')) {
      const saveButton = document.createElement('button');
      saveButton.className = 'save-button';
      saveButton.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>`;
      saveButton.title = 'Save Changes';
      saveButton.addEventListener('click', saveCodeChanges);

      const saveContainer = document.createElement('div');
      saveContainer.className = 'assertion-button-container';
      saveContainer.appendChild(saveButton);
      document.querySelector('.assertion-toolbar').appendChild(saveContainer);
    }
  } else {
    // Disable editing
    codeTextarea.readOnly = true;
    codeTextarea.classList.remove('editing');
    editButton.classList.remove('active');

    // Remove save button
    const saveButton = document.querySelector('.save-button');
    if (saveButton) {
      saveButton.parentElement.remove();
    }
  }
}

// Add back the save code changes function
function saveCodeChanges() {
  const codeTextarea = state.uiElements.codeTextarea;
  const code = codeTextarea.value;

  try {
    // Validate the code (basic check for Playwright test structure)
    if (!code.includes('test(') || !code.includes('async ({ page })')) {
      throw new Error('Invalid test code structure');
    }

    // Update the recorded steps based on the edited code
    const lines = code.split('\n');
    const newSteps = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('//')) continue;

      if (line.includes('test.step(')) {
        // Handle test step blocks
        const stepMatch = line.match(/test\.step\('([^']+)',\s*async\s*\(\)\s*=>\s*{/);
        if (stepMatch) {
          const description = stepMatch[1];
          const stepActions = [];
          let i = lines.indexOf(line) + 1;
          while (i < lines.length && !lines[i].includes('});')) {
            const actionLine = lines[i].trim();
            if (actionLine && !actionLine.startsWith('//')) {
              if (actionLine.includes('await')) {
                stepActions.push({
                  type: 'testStep',
                  code: actionLine.replace(/^\s*await\s*/, 'await ')
                });
              }
            }
            i++;
          }
          newSteps.push({
            type: 'testStepBlock',
            description: description,
            actions: stepActions
          });
          i++; // Skip the closing brace
          continue;
        }
      }

      if (line.includes('page.goto')) {
        newSteps.push({
          type: 'navigate',
          url: line.match(/page\.goto\('([^']+)'\)/)?.[1]
        });
      } else if (line.includes('.click()')) {
        newSteps.push({
          type: 'click',
          selector: parseSelector(line)
        });
      } else if (line.includes('.fill(')) {
        newSteps.push({
          type: 'type',
          selector: parseSelector(line),
          value: line.match(/\.fill\('([^']+)'\)/)?.[1]
        });
      } else if (line.includes('expect(')) {
        newSteps.push({
          type: 'assert',
          selector: parseSelector(line),
          assertionType: parseAssertionType(line),
          expectedValue: parseExpectedValue(line)
        });
      } else if (line.includes('await')) {
        // Handle custom test steps
        newSteps.push({
          type: 'testStep',
          code: trimmedLine.replace(/^\s*await\s*/, 'await ')
        });
      }
    }

    // Update the recorded steps
    state.recordedSteps = newSteps;
    chrome.storage.local.set({ recordedSteps: newSteps });

    // Show success message
    state.uiElements.status.textContent = 'Changes saved successfully';
    state.uiElements.status.className = 'status success';

    // Exit edit mode
    toggleEditMode();

  } catch (error) {
    console.error('Error saving code:', error);
    state.uiElements.status.textContent = 'Error saving changes: ' + error.message;
    state.uiElements.status.className = 'status error';
  }
}

// Add back the helper functions
function parseSelector(line) {
  if (line.includes('getByTestId')) {
    return {
      type: 'testId',
      value: line.match(/getByTestId\("([^"]+)"\)/)?.[1]
    };
  } else if (line.includes('getByRole')) {
    const roleMatch = line.match(/getByRole\('([^']+)'(?:,\s*{\s*name:\s*'([^']+)'\s*})?\)/);
    return {
      type: 'role',
      value: {
        role: roleMatch?.[1],
        name: roleMatch?.[2]
      }
    };
  } else if (line.includes('getByText')) {
    return {
      type: 'text',
      value: line.match(/getByText\("([^"]+)"\)/)?.[1]
    };
  }
  return null;
}

function parseAssertionType(line) {
  if (line.includes('toBeVisible')) return 'visible';
  if (line.includes('toHaveText')) return 'text';
  if (line.includes('toHaveValue')) return 'value';
  if (line.includes('toBeChecked')) return 'checked';
  if (line.includes('toBeDisabled')) return 'disabled';
  if (line.includes('toHaveCount')) return 'count';
  if (line.includes('toHaveAttribute')) return 'attribute';
  return null;
}

function parseExpectedValue(line) {
  const match = line.match(/toHave(?:Text|Value|Count|Attribute)\('([^']+)'\)/);
  return match?.[1];
}

// Add function to get data-cy attributes from the current page
async function getPageDataCyAttributes() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'getDataCyAttributes'
    });

    if (!response || !response.success) {
      console.warn('Failed to get data-cy attributes:', response?.error);
      return [];
    }

    return response.attributes || [];
  } catch (error) {
    console.error('Error getting data-cy attributes:', error);
    return [];
  }
}

// Add function to convert locator syntax to getByTestId
function convertToGetByTestId(code) {
  // Replace page.locator('[data-cy="..."]') with page.getByTestId('...')
  return code.replace(
    /page\.locator\('\[data-cy="([^"]+)"\]'\)/g,
    'page.getByTestId("$1")'
  );
}

// Add Faker configuration
const FAKER_IMPORT = "import { faker } from '@faker-js/faker';";

// Update replaceWithFaker to exclude test step descriptions
function replaceWithFaker(code) {
  // First, protect test step descriptions from being replaced
  const stepDescriptionRegex = /await test\.step\('([^']+)',/g;
  const protectedCode = code.replace(stepDescriptionRegex, (match, description) => {
    return match.replace(description, `__PROTECTED_DESCRIPTION_${description}__`);
  });

  // Common patterns for different types of data
  const patterns = {
    email: {
      regex: /'[^@]+@[^@]+\.[^@]+'/g,
      faker: "faker.internet.email()"
    },
    name: {
      regex: /'[A-Za-z\s]{3,50}'/g,
      faker: "faker.person.fullName()"
    },
    phone: {
      regex: /'\+?[\d\s-]{10,15}'/g,
      faker: "faker.phone.number()"
    },
    text: {
      regex: /'[A-Za-z\s]{10,100}'/g,
      faker: "faker.lorem.sentence()"
    },
    number: {
      regex: /'\d{1,5}'/g,
      faker: "faker.number.int({ min: 1, max: 1000 })"
    },
    date: {
      regex: /'\d{4}-\d{2}-\d{2}'/g,
      faker: "faker.date.recent().toISOString().split('T')[0]"
    }
  };

  let modifiedCode = protectedCode;
  for (const [type, { regex, faker }] of Object.entries(patterns)) {
    modifiedCode = modifiedCode.replace(regex, () => faker);
  }

  // Restore protected descriptions
  modifiedCode = modifiedCode.replace(/__PROTECTED_DESCRIPTION_([^_]+)__/g, '$1');

  return modifiedCode;
}

// Update generateSuggestions to emphasize static step descriptions
async function generateSuggestions(prompt) {
  try {
    console.log('Generating suggestions for prompt:', prompt);

    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key is not configured. Please add your API key to use this feature.');
    }

    // Get data-cy attributes from the current page
    const dataCyAttributes = await getPageDataCyAttributes();
    console.log('Available data-cy attributes:', dataCyAttributes);

    // Format data-cy attributes for the prompt
    const dataCyInfo = dataCyAttributes.length > 0
      ? `Available data-cy attributes on the page:
${dataCyAttributes.map(attr => `- ${attr.name}: ${attr.description || 'No description'}`).join('\n')}

Please use these data-cy attributes in your selectors when applicable.`
      : 'No data-cy attributes found on the current page.';

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a Playwright test automation expert. Generate test steps following these best practices:

${JSON.stringify(PlaywrightBestPractices.structure.bestPractices, null, 2)}

${dataCyInfo}

For the scenario: "${prompt}"

IMPORTANT: Follow these rules:
1. Use test.step with static, descriptive names (NEVER use Faker or dynamic values in step descriptions)
2. ALWAYS use page.getByTestId() for data-cy attributes, NEVER use page.locator('[data-cy="..."]')
3. Use the following selector priority: ${PlaywrightBestPractices.selectors.preferred.map(s => s.type).join(' > ')}
4. Include appropriate assertions after actions
5. When available, prefer using data-cy attributes from the provided list
6. Use Faker ONLY for input values (email, name, text, etc.), NEVER for step descriptions
7. Format each step as a JSON object with:
   - description: Clear, static step description
   - code: Playwright code using the provided best practices
   - explanation: Brief explanation of the step

Example format:
[
  {
    "description": "Select a conversation from the list",
    "code": "await test.step('Select a conversation from the list', async () => {\\n  await page.getByTestId('all-contacts-row').first().click();\\n  await expect(page.getByTestId('inbox-body')).toBeVisible();\\n});",
    "explanation": "Selects the first conversation and verifies the inbox body is visible"
  }
]

Generate the steps now, ensuring the response is valid JSON and follows these best practices.`
          }]
        }]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('API Error Response:', error);
      throw new Error(`API request failed: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    console.log('Full API Response:', JSON.stringify(data, null, 2));

    // Extract the text from the response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Invalid response structure:', data);
      throw new Error('Invalid response format from API');
    }

    console.log('Raw API Response Text:', text);

    // Try to clean the response text before parsing
    const cleanedText = text
      .replace(/```json\n?/g, '')  // Remove JSON code block markers
      .replace(/```\n?/g, '')      // Remove any remaining code block markers
      .trim();                     // Remove extra whitespace

    console.log('Cleaned Response Text:', cleanedText);

    // Parse the JSON response
    let suggestions;
    try {
      suggestions = JSON.parse(cleanedText);
    } catch (error) {
      console.error('JSON Parse Error:', error);
      console.error('Failed to parse text:', cleanedText);
      throw new Error(`Failed to parse API response: ${error.message}`);
    }

    if (!Array.isArray(suggestions)) {
      console.error('Response is not an array:', suggestions);
      throw new Error('API response is not in the expected array format');
    }

    if (suggestions.length === 0) {
      throw new Error('No suggestions were generated');
    }

    // Validate each suggestion has the required fields
    const validSuggestions = suggestions.filter(suggestion =>
      suggestion.description &&
      suggestion.code &&
      suggestion.explanation
    );

    if (validSuggestions.length === 0) {
      console.error('No valid suggestions found in response:', suggestions);
      throw new Error('Generated suggestions are missing required fields');
    }

    return validSuggestions;
  } catch (error) {
    console.error('Error in generateSuggestions:', error);
    throw new Error(`Failed to generate suggestions: ${error.message}`);
  }
}

// Update validateGeneratedCode to check for proper step descriptions
function validateGeneratedCode(code) {
  const validationResults = {
    isValid: true,
    issues: []
  };

  // Check for test.step usage
  if (!code.includes('test.step')) {
    validationResults.isValid = false;
    validationResults.issues.push('Code should use test.step for action grouping');
  }

  // Check for dynamic values in step descriptions
  if (code.includes('faker.') && code.match(/await test\.step\([^,]+faker[^,]+,/)) {
    validationResults.isValid = false;
    validationResults.issues.push('Step descriptions should be static, not use Faker');
  }

  // Check for appropriate assertions
  if (!code.includes('expect(')) {
    validationResults.isValid = false;
    validationResults.issues.push('Code should include assertions');
  }

  // Check for proper selector usage
  if (code.includes('page.locator(\'[data-cy=')) {
    validationResults.isValid = false;
    validationResults.issues.push('Use page.getByTestId() instead of page.locator(\'[data-cy="..."]\')');
  }

  // Check for getByTestId usage
  const preferredSelectors = PlaywrightBestPractices.selectors.preferred.map(s => s.type);
  const usedSelectors = preferredSelectors.filter(selector =>
    code.includes(`getBy${selector.charAt(0).toUpperCase() + selector.slice(1)}`)
  );

  if (usedSelectors.length === 0) {
    validationResults.isValid = false;
    validationResults.issues.push('Code should use preferred selectors');
  }

  return validationResults;
}

// Update the createAIPromptSection function to use the new API
function createAIPromptSection() {
  const container = document.createElement('div');
  container.className = 'ai-prompt-section';

  // Create prompt input area
  const promptContainer = document.createElement('div');
  promptContainer.className = 'prompt-container';

  const promptLabel = document.createElement('label');
  promptLabel.textContent = 'AI Assistant';
  promptLabel.className = 'prompt-label';

  const promptInput = document.createElement('textarea');
  promptInput.className = 'prompt-input';
  promptInput.placeholder = 'Describe what you want to test (e.g., "Create a test for login functionality" or "Add steps to verify user profile")';
  promptInput.rows = 3;

  const generateButton = document.createElement('button');
  generateButton.className = 'generate-button';
  generateButton.textContent = 'Generate Suggestions';
  generateButton.disabled = true;

  // Create suggestions container
  const suggestionsContainer = document.createElement('div');
  suggestionsContainer.className = 'suggestions-container';
  suggestionsContainer.style.display = 'none';

  // Add event listeners
  promptInput.addEventListener('input', function() {
    const hasText = this.value.trim().length > 0;
    generateButton.disabled = !hasText;

    // Clear suggestions if input is empty
    if (!hasText) {
      suggestionsContainer.style.display = 'none';
      suggestionsContainer.innerHTML = '';
    }
  });

  generateButton.addEventListener('click', async function(e) {
    e.preventDefault();
    e.stopPropagation();

    const prompt = promptInput.value.trim();
    if (!prompt) {
      console.warn('Empty prompt, not generating suggestions');
      return;
    }

    try {
      // Disable the button and show loading state
      generateButton.disabled = true;
      generateButton.textContent = 'Generating...';
      state.isGeneratingSuggestions = true;

      // Show loading state
      suggestionsContainer.style.display = 'block';
      suggestionsContainer.innerHTML = `
        <div class="loading">
          <div>Generating suggestions...</div>
          <div style="font-size: 12px; color: #6c757d; margin-top: 8px;">This may take a few seconds</div>
        </div>`;

      console.log('Starting suggestion generation...');
      const suggestions = await generateSuggestions(prompt);
      console.log('Generated suggestions:', suggestions);

      if (!suggestions || suggestions.length === 0) {
        throw new Error('No valid suggestions were generated');
      }

      // Display the suggestions
      displaySuggestions(suggestions);

    } catch (error) {
      console.error('Error in generate button click handler:', error);
      suggestionsContainer.innerHTML = `
        <div class="error">
          <div>Error generating suggestions:</div>
          <div style="margin-top: 8px; font-size: 13px;">${error.message}</div>
          <div style="margin-top: 8px; font-size: 12px; color: #6c757d;">
            Please try again or rephrase your prompt.
          </div>
        </div>`;
    } finally {
      // Reset button state
      generateButton.disabled = false;
      generateButton.textContent = 'Generate Suggestions';
      state.isGeneratingSuggestions = false;
    }
  });

  // Add elements to containers
  promptContainer.appendChild(promptLabel);
  promptContainer.appendChild(promptInput);
  promptContainer.appendChild(generateButton);

  container.appendChild(promptContainer);
  container.appendChild(suggestionsContainer);

  return container;
}

// Update the displaySuggestions function to ensure proper button visibility
function displaySuggestions(suggestions) {
  const container = document.querySelector('.suggestions-container');
  container.innerHTML = '';
  container.style.display = 'block';

  suggestions.forEach((suggestion, index) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';

    const header = document.createElement('div');
    header.className = 'suggestion-header';

    const title = document.createElement('div');
    title.className = 'suggestion-title';
    title.textContent = suggestion.description;

    const actions = document.createElement('div');
    actions.className = 'suggestion-actions';

    const addButton = document.createElement('button');
    addButton.className = 'suggestion-button';
    addButton.textContent = 'Add Step';
    addButton.onclick = () => addSuggestionToTest(suggestion);

    const codeButton = document.createElement('button');
    codeButton.className = 'suggestion-button';
    codeButton.textContent = 'Show Code';
    codeButton.onclick = () => toggleCode(item, suggestion);

    actions.appendChild(addButton);
    actions.appendChild(codeButton);
    header.appendChild(title);
    header.appendChild(actions);
    item.appendChild(header);

    container.appendChild(item);
  });
}

// Add function to toggle code visibility
function toggleCode(item, suggestion) {
  const existingCode = item.querySelector('.suggestion-code');
  if (existingCode) {
    existingCode.remove();
  } else {
    const code = document.createElement('pre');
    code.className = 'suggestion-code';
    code.textContent = suggestion.code;
    item.appendChild(code);
  }
}

// Update initializeGeminiAPI to use real API
function initializeGeminiAPI() {
  console.log('Initializing Gemini API');
  if (!GEMINI_API_KEY) {
    console.warn('Gemini API key is not configured. Please add your API key to use AI suggestions.');
    // Show warning in the UI
    const status = document.querySelector('.status');
    if (status) {
      status.textContent = 'Warning: Gemini API key not configured';
      status.className = 'status error';
    }
  }
}

// Add back the styles for the AI prompt section
const aiPromptStyles = document.createElement('style');
aiPromptStyles.textContent = `
  .ai-prompt-section {
    margin-top: 16px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    background: #f8f9fa;
    padding: 16px;
  }

  .prompt-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .prompt-label {
    font-weight: 500;
    color: #495057;
    font-size: 14px;
  }

  .prompt-input {
    width: 100%;
    padding: 6px 12px;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 14px;
    line-height: 1.4;
    resize: vertical;
    min-height: 60px;
    max-height: 60px;
    font-family: inherit;
    overflow-y: auto;
  }

  .prompt-input:focus {
    border-color: #86b7fe;
    outline: 0;
    box-shadow: 0 0 0 0.2rem rgba(13,110,253,.25);
  }

  .generate-button {
    align-self: flex-end;
    padding: 6px 16px;
    background: #0d6efd;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .generate-button:hover:not(:disabled) {
    background: #0b5ed7;
  }

  .generate-button:disabled {
    background: #6c757d;
    cursor: not-allowed;
    opacity: 0.65;
  }

  .suggestions-container {
    margin-top: 16px;
    border-top: 1px solid #dee2e6;
    padding-top: 16px;
  }

  .suggestion-item {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }

  .suggestion-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
    gap: 12px;
  }

  .suggestion-title {
    font-weight: 500;
    color: #212529;
    font-size: 14px;
    flex: 1;
    margin: 0;
  }

  .suggestion-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .suggestion-button {
    padding: 6px 12px;
    border: 1px solid #ced4da;
    border-radius: 4px;
    background: white;
    color: #495057;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 80px;
  }

  .suggestion-button:hover {
    background: #f8f9fa;
    border-color: #adb5bd;
    color: #212529;
  }

  .suggestion-button:active {
    background: #e9ecef;
    border-color: #6c757d;
  }

  .suggestion-code {
    background: #f8f9fa;
    padding: 12px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 13px;
    white-space: pre-wrap;
    margin-top: 12px;
    border: 1px solid #e9ecef;
    color: #212529;
    line-height: 1.5;
  }

  .loading {
    text-align: center;
    color: #6c757d;
    padding: 24px;
    background: white;
    border-radius: 4px;
    border: 1px solid #dee2e6;
  }

  .error {
    color: #dc3545;
    padding: 12px;
    background: #f8d7da;
    border: 1px solid #f5c2c7;
    border-radius: 4px;
    margin-top: 12px;
  }

  .error div:first-child {
    font-weight: 500;
    margin-bottom: 8px;
  }

  .status.warning {
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffeeba;
  }
`;
document.head.appendChild(aiPromptStyles);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeUI);
