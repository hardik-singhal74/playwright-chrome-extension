// Check if we're on a chrome:// URL
if (window.location.href.startsWith('chrome://')) {
  console.log('Content script disabled on chrome:// URLs');
  // Don't initialize the recorder on chrome:// URLs
  throw new Error('Content script cannot run on chrome:// URLs');
}

// State
let isRecording = false;
let isPaused = false;
let recordedSteps = [];
let lastUrl = window.location.href;

// Add assertion mode state
let isAssertionMode = false;
let currentAssertType = null;

console.log('Content script loaded');

// Add new assertion types
const ASSERTION_TYPES = {
  VISIBLE: 'visible',
  TEXT: 'text',
  VALUE: 'value',
  CHECKED: 'checked',
  DISABLED: 'disabled',
  COUNT: 'count',
  ATTRIBUTE: 'attribute'
};

// Helper function to get the best selector for an element
function getSelector(element) {
  // First try data-cy attribute (most preferred)
  const dataCy = element.getAttribute('data-cy');
  if (dataCy) {
    return {
      type: 'testId',
      value: dataCy,
      source: 'data-cy'
    };
  }

  // Then try data-testid (React Testing Library convention)
  const testId = element.getAttribute('data-testid');
  if (testId) {
    return {
      type: 'testId',
      value: testId,
      source: 'data-testid'
    };
  }

  // Try role-based selectors (ARIA best practice)
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

  // Try label association (accessibility best practice)
  const label = getAssociatedLabel(element);
  if (label) {
    return {
      type: 'label',
      value: label
    };
  }

  // Try placeholder for input elements
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {
      return {
        type: 'placeholder',
        value: placeholder
      };
    }
  }

  // Try alt text for images (accessibility best practice)
  if (element.tagName === 'IMG') {
    const alt = element.getAttribute('alt');
    if (alt) {
      return {
        type: 'altText',
        value: alt
      };
    }
  }

  // Try text content for buttons and links (common interactive elements)
  if (element.tagName === 'BUTTON' || element.tagName === 'A') {
    const text = element.textContent?.trim();
    if (text && text.length < 50) { // Avoid long text content
      return {
        type: 'text',
        value: text
      };
    }
  }

  // Try title attribute as a last resort
  const title = element.getAttribute('title');
  if (title) {
    return {
      type: 'title',
      value: title
    };
  }

  // Fallback to a unique CSS selector, but only if necessary
  const cssSelector = getUniqueCssSelector(element);
  if (cssSelector) {
    return {
      type: 'css',
      value: cssSelector
    };
  }

  // If all else fails, use a combination of tag and attributes
  return {
    type: 'fallback',
    value: {
      tag: element.tagName.toLowerCase(),
      attributes: Array.from(element.attributes)
        .filter(attr => !attr.name.startsWith('data-') && attr.name !== 'class' && attr.name !== 'style')
        .map(attr => `${attr.name}="${attr.value}"`)
        .join(', ')
    }
  };
}

// Helper function to get implicit ARIA role
function getImplicitRole(element) {
  const tag = element.tagName.toLowerCase();
  const type = element.getAttribute('type')?.toLowerCase();

  const roleMap = {
    'button': 'button',
    'a': 'link',
    'input': type === 'checkbox' ? 'checkbox' :
             type === 'radio' ? 'radio' :
             type === 'submit' ? 'button' :
             'textbox',
    'select': 'combobox',
    'textarea': 'textbox',
    'img': 'img',
    'nav': 'navigation',
    'main': 'main',
    'header': 'banner',
    'footer': 'contentinfo',
    'aside': 'complementary',
    'article': 'article',
    'section': 'region'
  };

  return roleMap[tag] || null;
}

// Helper function to get associated label
function getAssociatedLabel(element) {
  // Check for explicit label association
  const id = element.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) {
      return label.textContent?.trim();
    }
  }

  // Check for implicit label association
  if (element.parentElement?.tagName === 'LABEL') {
    return element.parentElement.textContent?.trim();
  }

  // Check for aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }

  return null;
}

// Helper function to get a unique CSS selector
function getUniqueCssSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }

  let path = [];
  let current = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break;
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        child => child.tagName === current.tagName
      );

      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    current = parent;
  }

  return path.join(' > ');
}

// Notify background script of state changes
function notifyStateChange() {
  chrome.runtime.sendMessage({
    type: 'recordingStateChanged',
    isRecording,
    isPaused
  }).catch(error => {
    console.error('Error notifying state change:', error);
  });
}

// Record a step
function recordStep(step) {
  if (!isRecording || isPaused) return;

  recordedSteps.push({
    ...step,
    timestamp: Date.now(),
    url: window.location.href
  });

  // Notify popup
  chrome.runtime.sendMessage({
    type: 'stepRecorded',
    steps: recordedSteps
  }).catch(error => {
    console.error('Error sending step update:', error);
  });
}

// Add assertion recording function
function recordAssertion(element, type, expectedValue = null) {
  if (!isRecording) return;

  const selector = getSelector(element);
  let assertion = {
    type: 'assert',
    assertionType: type,
    selector,
    expectedValue
  };

  // Add specific data based on assertion type
  switch (type) {
    case ASSERTION_TYPES.TEXT:
      assertion.expectedValue = element.textContent?.trim();
      break;
    case ASSERTION_TYPES.VALUE:
      assertion.expectedValue = element.value;
      break;
    case ASSERTION_TYPES.CHECKED:
      assertion.expectedValue = element.checked;
      break;
    case ASSERTION_TYPES.DISABLED:
      assertion.expectedValue = element.disabled;
      break;
    case ASSERTION_TYPES.COUNT:
      // For count assertions, we'll count similar elements
      const similarElements = document.querySelectorAll(getUniqueCssSelector(element));
      assertion.expectedValue = similarElements.length;
      break;
    case ASSERTION_TYPES.ATTRIBUTE:
      if (expectedValue) {
        assertion.attributeName = expectedValue;
        assertion.expectedValue = element.getAttribute(expectedValue);
      }
      break;
  }

  recordStep(assertion);
}

// Event Listeners
function handleClick(event) {
  if (!isRecording) return;

  // Ignore right-clicks (button 2) and middle-clicks (button 1)
  if (event.button !== 0) return;

  // Check if the click target or any of its parents is part of the assertion menu
  let target = event.target;
  while (target) {
    if (target.classList.contains('playwright-recorder-ignore')) {
      return;
    }
    target = target.parentElement;
  }

  const element = event.target;
  const selector = getSelector(element);

  recordStep({
    type: 'click',
    selector,
    tagName: element.tagName.toLowerCase()
  });
}

function handleInput(event) {
  if (!isRecording) return;

  const element = event.target;
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    const selector = getSelector(element);

    recordStep({
      type: 'type',
      selector,
      value: element.value,
      inputType: element.type
    });
  }
}

function handleNavigation() {
  if (!isRecording) return;

  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    recordStep({
      type: 'navigate',
      url: currentUrl
    });
    lastUrl = currentUrl;
  }
}

// MutationObserver for URL changes in SPAs
const observer = new MutationObserver(() => {
  handleNavigation();
});

// Add function to get data-cy attributes from the page
function getDataCyAttributes() {
  const attributes = [];
  const elements = document.querySelectorAll('[data-cy]');

  elements.forEach(element => {
    const name = element.getAttribute('data-cy');
    // Try to get a description from aria-label or title
    const description = element.getAttribute('aria-label') ||
                       element.getAttribute('title') ||
                       element.textContent?.trim() ||
                       'No description';

    // Get element type and role for context
    const type = element.tagName.toLowerCase();
    const role = element.getAttribute('role') || getImplicitRole(element);

    attributes.push({
      name,
      description,
      type,
      role,
      // Include the element's text content if it's a button or link
      text: (type === 'button' || type === 'a') ? element.textContent?.trim() : null
    });
  });

  return attributes;
}

// Message listener for popup communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);

  try {
    switch (message.action) {
      case 'ping':
        // Simple ping to check if content script is loaded
        sendResponse({ success: true, message: 'Content script is ready' });
        break;

      case 'getRecordingState':
        // Report current recording state
        sendResponse({
          success: true,
          isRecording,
          isPaused
        });
        break;

      case 'startRecording':
        console.log('Starting recording in content script');
        if (isRecording) {
          sendResponse({
            success: false,
            error: 'Recording is already in progress'
          });
          return true;
        }

        isRecording = true;
        isPaused = false;
        recordedSteps = [];
        lastUrl = window.location.href;

        // Start observing URL changes
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        // Record initial navigation
        recordStep({
          type: 'navigate',
          url: lastUrl
        });

        // Notify state change
        notifyStateChange();

        console.log('Recording started successfully');
        sendResponse({ success: true });
        break;

      case 'pauseRecording':
        console.log('Pausing recording in content script');
        if (!isRecording) {
          sendResponse({
            success: false,
            error: 'No recording in progress'
          });
          return true;
        }

        isPaused = !isPaused;

        // Notify state change
        notifyStateChange();

        sendResponse({ success: true, isPaused });
        break;

      case 'stopRecording':
        console.log('Stopping recording in content script');
        if (!isRecording) {
          sendResponse({
            success: false,
            error: 'No recording in progress'
          });
          return true;
        }

        isRecording = false;
        isPaused = false;
        observer.disconnect();

        // Notify state change
        notifyStateChange();

        console.log('Final recorded steps:', recordedSteps);
        sendResponse({ success: true, steps: recordedSteps });
        break;

      case 'startAssertionMode':
        console.log('Starting assertion mode:', message.type);
        if (!isRecording) {
          sendResponse({
            success: false,
            error: 'Recording must be active to add assertions'
          });
          return true;
        }

        isAssertionMode = true;
        currentAssertType = message.type;

        // Add visual indicator to the page
        const indicator = document.createElement('div');
        indicator.className = 'playwright-assertion-mode-indicator';
        indicator.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: #9c27b0;
          color: white;
          padding: 8px;
          text-align: center;
          font-size: 14px;
          z-index: 10000;
        `;
        indicator.textContent = `Click an element to assert ${message.type}`;
        document.body.appendChild(indicator);

        // Add click handler for assertion
        document.addEventListener('click', handleAssertionClick, true);

        sendResponse({ success: true });
        break;

      case 'cancelAssertionMode':
        console.log('Cancelling assertion mode');
        isAssertionMode = false;
        currentAssertType = null;

        // Remove visual indicator
        const existingIndicator = document.querySelector('.playwright-assertion-mode-indicator');
        if (existingIndicator) {
          existingIndicator.remove();
        }

        // Remove click handler
        document.removeEventListener('click', handleAssertionClick);

        sendResponse({ success: true });
        break;

      case 'getDataCyAttributes':
        try {
          const attributes = getDataCyAttributes();
          sendResponse({
            success: true,
            attributes
          });
        } catch (error) {
          console.error('Error getting data-cy attributes:', error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
        return true; // Keep the message channel open for async response

      default:
        console.warn('Unknown action:', message.action);
        sendResponse({
          success: false,
          error: `Unknown action: ${message.action}`
        });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({
      success: false,
      error: error.message || 'Internal error in content script'
    });
  }

  return true; // Keep the message channel open for async response
});

// Add event listeners with logging
document.addEventListener('click', (event) => {
  if (isRecording) {
    console.log('Click event captured:', event.target);
    handleClick(event);
  }
}, true);

document.addEventListener('input', (event) => {
  if (isRecording) {
    console.log('Input event captured:', event.target);
    handleInput(event);
  }
}, true);

document.addEventListener('change', (event) => {
  if (isRecording) {
    console.log('Change event captured:', event.target);
    handleInput(event);
  }
}, true);

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (isRecording) {
    chrome.storage.local.set({
      recordedSteps,
      isRecording,
      isPaused
    }).catch(error => {
      console.error('Error saving state on unload:', error);
    });
  }
});

// Add right-click context menu handler for assertions
function handleContextMenu(event) {
  if (!isRecording) return;

  event.preventDefault();
  event.stopPropagation();

  const element = event.target;

  // Create assertion menu
  const menu = document.createElement('div');
  menu.className = 'playwright-assertion-menu playwright-recorder-ignore';
  menu.style.cssText = `
    position: fixed;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    z-index: 10000;
  `;

  const assertions = [
    { type: ASSERTION_TYPES.VISIBLE, label: 'Assert Visible' },
    { type: ASSERTION_TYPES.TEXT, label: 'Assert Text' },
    { type: ASSERTION_TYPES.VALUE, label: 'Assert Value' },
    { type: ASSERTION_TYPES.CHECKED, label: 'Assert Checked' },
    { type: ASSERTION_TYPES.DISABLED, label: 'Assert Disabled' },
    { type: ASSERTION_TYPES.COUNT, label: 'Assert Count' },
    { type: ASSERTION_TYPES.ATTRIBUTE, label: 'Assert Attribute' }
  ];

  assertions.forEach(({ type, label }) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.className = 'playwright-recorder-ignore';
    button.style.cssText = `
      display: block;
      width: 100%;
      padding: 4px 8px;
      margin: 2px 0;
      border: none;
      background: none;
      text-align: left;
      cursor: pointer;
    `;
    button.onmouseover = () => button.style.background = '#f0f0f0';
    button.onmouseout = () => button.style.background = 'none';
    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (type === ASSERTION_TYPES.ATTRIBUTE) {
        const attrName = prompt('Enter attribute name:');
        if (attrName) {
          recordAssertion(element, type, attrName);
        }
      } else {
        recordAssertion(element, type);
      }
      document.body.removeChild(menu);
    };
    menu.appendChild(button);
  });

  menu.style.left = `${event.pageX}px`;
  menu.style.top = `${event.pageY}px`;
  document.body.appendChild(menu);

  // Close menu when clicking outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      document.body.removeChild(menu);
      document.removeEventListener('click', closeMenu);
    }
  };
  document.addEventListener('click', closeMenu);
}

// Add context menu event listener
document.addEventListener('contextmenu', handleContextMenu, true);

// Handle assertion click
function handleAssertionClick(event) {
  if (!isAssertionMode || !currentAssertType) return;

  event.preventDefault();
  event.stopPropagation();

  const element = event.target;

  // Remove assertion mode indicator
  const indicator = document.querySelector('.playwright-assertion-mode-indicator');
  if (indicator) {
    indicator.remove();
  }

  // Record the assertion
  recordAssertion(element, currentAssertType);

  // Reset assertion mode
  isAssertionMode = false;
  currentAssertType = null;
  document.removeEventListener('click', handleAssertionClick);

  // Notify popup that assertion is complete
  chrome.runtime.sendMessage({
    type: 'assertionComplete'
  }).catch(error => {
    console.error('Error sending assertion complete message:', error);
  });
}

// Remove context menu handler since we're using the assertion button now
document.removeEventListener('contextmenu', handleContextMenu, true);
