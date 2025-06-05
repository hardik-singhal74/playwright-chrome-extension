// State
let isRecording = false;
let recordedSteps = [];
let lastUrl = window.location.href;

console.log('Content script loaded');

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

// Event Listeners
function handleClick(event) {
  if (!isRecording) return;

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
