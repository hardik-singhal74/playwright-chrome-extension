// State
let isRecording = false;
let recordedSteps = [];
let lastUrl = window.location.href;

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
  // First try data-* attributes (data-testid, data-test, data-cy)
  const dataAttributes = ['data-testid', 'data-test', 'data-cy'];
  for (const attr of dataAttributes) {
    const value = element.getAttribute(attr);
    if (value) {
      return {
        type: 'testId',
        value: value,
        attribute: attr
      };
    }
  }

  // Try title attribute
  const title = element.getAttribute('title');
  if (title) {
    return {
      type: 'title',
      value: title
    };
  }

  // Try role attribute or implicit role
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
  }

  // Try label association
  const label = getAssociatedLabel(element);
  if (label) {
    return {
      type: 'label',
      value: label
    };
  }

  // Try placeholder
  const placeholder = element.getAttribute('placeholder');
  if (placeholder) {
    return {
      type: 'placeholder',
      value: placeholder
    };
  }

  // Try alt text for images
  if (element.tagName === 'IMG') {
    const alt = element.getAttribute('alt');
    if (alt) {
      return {
        type: 'altText',
        value: alt
      };
    }
  }

  // Try text content as last resort
  const text = element.textContent?.trim();
  if (text && text.length < 100) { // Avoid long text content
    return {
      type: 'text',
      value: text
    };
  }

  // Fallback to a unique CSS selector
  return {
    type: 'css',
    value: getUniqueCssSelector(element)
  };
}

// Helper function to get implicit ARIA role
function getImplicitRole(element) {
  const tagName = element.tagName.toLowerCase();
  const roleMap = {
    'button': 'button',
    'a': 'link',
    'input': element.type === 'submit' ? 'button' : 'textbox',
    'select': 'combobox',
    'textarea': 'textbox',
    'img': 'img',
    'nav': 'navigation',
    'main': 'main',
    'header': 'banner',
    'footer': 'contentinfo',
    'aside': 'complementary',
    'article': 'article',
    'section': 'region',
    'table': 'table',
    'ul': 'list',
    'ol': 'list',
    'li': 'listitem'
  };
  return roleMap[tagName];
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

// Record a step
function recordStep(step) {
  if (!isRecording) return;

  recordedSteps.push({
    ...step,
    timestamp: Date.now(),
    url: window.location.href
  });

  // Notify popup
  chrome.runtime.sendMessage({
    type: 'stepRecorded',
    steps: recordedSteps
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

// Message listener for popup communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);

  switch (message.action) {
    case 'startRecording':
      console.log('Starting recording in content script');
      isRecording = true;
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

      console.log('Recording started successfully');
      sendResponse({ success: true });
      break;

    case 'stopRecording':
      console.log('Stopping recording in content script');
      isRecording = false;
      observer.disconnect();
      console.log('Final recorded steps:', recordedSteps);
      sendResponse({ success: true, steps: recordedSteps });
      break;
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
    chrome.storage.local.set({ recordedSteps });
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
