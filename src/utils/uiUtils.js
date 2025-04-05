import { DELAYS } from '../config.js';

/**
 * Creates an HTML element with the specified tag and class name
 * @param {string} tag - HTML tag to create
 * @param {string} className - CSS class name to apply
 * @returns {HTMLElement} - The created element
 */
export function createElementWithClass(tag, className) {
  const newElement = document.createElement(tag);
  newElement.className = className;
  return newElement;
}

/**
 * Shows an error message toast
 * @param {string} message - Error message to display
 * @param {number} duration - Duration to show the message (ms) 
 * @returns {HTMLElement} - The error message element
 */
export function showErrorMessage(message, duration = DELAYS.TOAST_ERROR) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'frame-error-message';
  errorDiv.textContent = message;
  errorDiv.style.position = 'fixed';
  errorDiv.style.top = '10px';
  errorDiv.style.left = '50%';
  errorDiv.style.transform = 'translateX(-50%)';
  errorDiv.style.padding = '10px 20px';
  errorDiv.style.backgroundColor = 'rgba(244, 67, 54, 0.9)';
  errorDiv.style.color = 'white';
  errorDiv.style.borderRadius = '4px';
  errorDiv.style.zIndex = '9999';
  errorDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  
  document.body.appendChild(errorDiv);
  
  // Remove error after specified duration
  setTimeout(() => {
    errorDiv.style.opacity = '0';
    errorDiv.style.transition = 'opacity 0.5s ease';
    setTimeout(() => errorDiv.remove(), 500);
  }, duration);
  
  return errorDiv;
}

/**
 * Shows a success message toast
 * @param {string} message - Success message to display
 * @param {number} duration - Duration to show the message (ms)
 * @returns {HTMLElement} - The success message element
 */
export function showSuccessMessage(message, duration = DELAYS.TOAST_SUCCESS) {
  const successDiv = document.createElement('div');
  successDiv.className = 'frame-success-message';
  successDiv.textContent = message;
  successDiv.style.position = 'fixed';
  successDiv.style.top = '10px';
  successDiv.style.left = '50%';
  successDiv.style.transform = 'translateX(-50%)';
  successDiv.style.padding = '10px 20px';
  successDiv.style.backgroundColor = 'rgba(76, 175, 80, 0.9)';
  successDiv.style.color = 'white';
  successDiv.style.borderRadius = '4px';
  successDiv.style.zIndex = '9999';
  successDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  
  document.body.appendChild(successDiv);
  
  // Remove success message after specified duration
  setTimeout(() => {
    successDiv.style.opacity = '0';
    successDiv.style.transition = 'opacity 0.5s ease';
    setTimeout(() => successDiv.remove(), 500);
  }, duration);
  
  return successDiv;
}

/**
 * Shows a pending message toast
 * @param {string} message - Pending message to display
 * @returns {HTMLElement} - The pending message element
 */
export function showPendingMessage(message) {
  const pendingMessage = document.createElement('div');
  pendingMessage.className = 'frame-pending-message';
  pendingMessage.textContent = message;
  pendingMessage.style.position = 'fixed';
  pendingMessage.style.top = '10px';
  pendingMessage.style.left = '50%';
  pendingMessage.style.transform = 'translateX(-50%)';
  pendingMessage.style.padding = '10px 20px';
  pendingMessage.style.backgroundColor = 'rgba(33, 150, 243, 0.9)';
  pendingMessage.style.color = 'white';
  pendingMessage.style.borderRadius = '4px';
  pendingMessage.style.zIndex = '9999';
  pendingMessage.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  
  document.body.appendChild(pendingMessage);
  
  return pendingMessage;
}

/**
 * Remove a pending message with a fade effect
 * @param {HTMLElement} pendingElement - The pending message element to remove
 */
export function removePendingMessage(pendingElement) {
  if (!pendingElement) return;
  
  pendingElement.style.opacity = '0';
  pendingElement.style.transition = 'opacity 0.5s ease';
  setTimeout(() => {
    if (document.body.contains(pendingElement)) {
      document.body.removeChild(pendingElement);
    }
  }, 500);
}

/**
 * Add the rotating animation style if it doesn't exist
 */
export function addRotatingStyle() {
  if (!document.getElementById('rotating-style')) {
    const style = document.createElement('style');
    style.id = 'rotating-style';
    style.textContent = `
      .rotating {
        animation: rotate 1s linear infinite;
      }
      @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Sets a button to loading state with a spinner
 * @param {HTMLElement} button - The button to set to loading state
 * @param {string} loadingText - Text to show while loading
 * @returns {string} - Original button content for restoration
 */
export function setButtonLoading(button, loadingText = 'Loading...') {
  const originalContent = button.innerHTML;
  
  // Add rotating style if needed
  addRotatingStyle();
  
  button.innerHTML = `<svg class="rotating" width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" 
          fill="currentColor" />
  </svg> ${loadingText}`;
  button.disabled = true;
  
  return originalContent;
}

/**
 * Restores a button from loading state
 * @param {HTMLElement} button - The button to restore
 * @param {string} originalContent - Original button content
 * @param {number} delay - Delay before restoration (ms)
 */
export function restoreButton(button, originalContent, delay = 0) {
  setTimeout(() => {
    button.innerHTML = originalContent;
    button.disabled = false;
  }, delay);
}

/**
 * Creates a microphone icon SVG based on mute state
 * @param {boolean} isMuted - Whether microphone is muted
 * @returns {string} - SVG string for microphone icon
 */
export function createMicrophoneIcon(isMuted) {
  if (isMuted) {
    // Muted microphone with diagonal line
    return `
      <!-- Microphone body -->
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" 
            fill="currentColor" />
      <!-- Stand/base of microphone -->
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-0.49 6-3.39 6-6.92h-2z" 
            fill="currentColor" />
      <!-- Diagonal line through the mic (mute indicator) -->
      <line x1="3" y1="3" x2="21" y2="21" 
            stroke="currentColor" 
            stroke-width="2"
            stroke-linecap="round" />
    `;
  } else {
    // Unmuted microphone
    return `
      <!-- Microphone body -->
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" 
            fill="currentColor" />
      <!-- Stand/base of microphone -->
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-0.49 6-3.39 6-6.92h-2z" 
            fill="currentColor" />
    `;
  }
}

/**
 * Update the mute button UI based on audio state
 * @param {HTMLElement} muteAudioButton - The mute button element
 * @param {boolean} isEnabled - Whether audio is enabled
 */
export function updateMuteButtonUI(muteAudioButton, isEnabled) {
  const muteText = muteAudioButton.querySelector('span');
  if (muteText) {
    muteText.textContent = isEnabled ? "Mute" : "Unmute";
  }
  
  const micIcon = muteAudioButton.querySelector('.mic-icon');
  if (micIcon) {
    micIcon.innerHTML = createMicrophoneIcon(!isEnabled);
  }
} 