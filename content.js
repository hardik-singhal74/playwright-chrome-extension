// State
let isRecording = false;
let recordedSteps = [];
let lastUrl = window.location.href;

console.log('Content script loaded');

// Helper function to get the best selector for an element
function getSelector(element) {
  // First try data-cy
  const dataCy = element.getAttribute('data-cy');
  if (dataCy) {
    return `[data-cy="${dataCy}"]`;
  }

  // Fallback to a unique CSS selector
  if (element.id) {
    return `#${element.id}`;
  }

  // Try to build a unique selector using classes
  if (element.classList.length > 0) {
    const classSelector = Array.from(element.classList)
      .filter(cls => !cls.startsWith('js-')) // Filter out js- prefixed classes
      .map(cls => `.${cls}`)
      .join('');

    if (classSelector) {
      const elements = document.querySelectorAll(classSelector);
      if (elements.length === 1) {
        return classSelector;
      }
    }
  }

  // Fallback to nth-child
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
