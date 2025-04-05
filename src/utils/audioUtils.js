import { DELAYS } from '../config.js';
import { showErrorMessage } from './uiUtils.js';

// Track if we have microphone permission
let hasMicrophonePermission = false;

/**
 * Checks if the browser has microphone permission
 * @returns {Promise<boolean>} - Whether microphone permission is granted
 */
export async function checkMicrophonePermission() {
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
      return permissionStatus.state === 'granted';
    }
    
    // If permissions API not available, try getUserMedia
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        return true;
      }
    }
    
    return false;
  } catch (err) {
    console.warn('Microphone permission check failed:', err);
    return false;
  }
}

/**
 * Gets microphone permission, updates the global permission state
 * @param {boolean} showError - Whether to show an error message if permission is denied
 * @returns {Promise<boolean>} - Whether permission was granted
 */
export async function getMicrophonePermission(showError = false) {
  if (hasMicrophonePermission) {
    return true;
  }
  
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        hasMicrophonePermission = true;
        return true;
      }
    }
    
    if (showError) {
      showErrorMessage('Microphone permission is required to speak in rooms.');
    }
    return false;
  } catch (err) {
    console.warn('Failed to get microphone permission:', err);
    if (showError) {
      showErrorMessage('Microphone permission was denied. You need to allow microphone access to speak.');
    }
    return false;
  }
}

/**
 * Checks if the current browser is iOS
 * @returns {boolean} - Whether the browser is iOS
 */
export function isIOSBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * Creates and adds an iOS audio unlock overlay to the DOM
 * @param {Function} callback - Function to call when overlay is clicked
 * @returns {HTMLElement} - The created overlay element
 */
export function createIOSAudioUnlockOverlay(callback) {
  const audioUnlockDiv = document.createElement('div');
  audioUnlockDiv.id = 'ios-audio-unlock';
  audioUnlockDiv.innerHTML = `
    <div class="ios-audio-unlock-overlay">
      <button class="btn-primary unlock-audio-btn">Tap to Enable Audio</button>
    </div>
  `;
  audioUnlockDiv.style.position = 'fixed';
  audioUnlockDiv.style.top = '0';
  audioUnlockDiv.style.left = '0';
  audioUnlockDiv.style.width = '100%';
  audioUnlockDiv.style.height = '100%';
  audioUnlockDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  audioUnlockDiv.style.zIndex = '9999';
  audioUnlockDiv.style.display = 'flex';
  audioUnlockDiv.style.justifyContent = 'center';
  audioUnlockDiv.style.alignItems = 'center';
  
  document.body.appendChild(audioUnlockDiv);
  
  // Add event listener to the button
  document.querySelector('.unlock-audio-btn').addEventListener('click', (e) => {
    e.preventDefault();
    // Call the provided callback
    if (typeof callback === 'function') {
      callback();
    }
    
    // Remove the overlay
    document.body.removeChild(audioUnlockDiv);
  });
  
  // Auto-hide after timeout if not clicked
  setTimeout(() => {
    if (document.getElementById('ios-audio-unlock')) {
      document.body.removeChild(audioUnlockDiv);
    }
  }, DELAYS.IOS_AUDIO_UNLOCK);
  
  return audioUnlockDiv;
}

/**
 * Attempts to unlock iOS audio context with WebAudio
 */
export function unlockIOSAudio() {
  console.log('Attempting to unlock iOS audio...');
  
  // Create a dummy audio context and play an empty sound
  try {
    // For iOS Safari we need to create an AudioContext on user gesture
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    
    if (AudioContext) {
      const audioCtx = new AudioContext();
      
      // Resume audio context
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
          console.log('AudioContext resumed successfully');
        }).catch(err => {
          console.error('Failed to resume AudioContext:', err);
        });
      }
      
      // Create and play a silent audio element
      const silentSound = document.createElement('audio');
      silentSound.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjM1LjEwNAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABIgD///////////////////////////////////////////8AAAA8TEFNRTMuMTAwAQAAAAAAAAAAABQgJAUHQQAB9AAAASIttayFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
      silentSound.preload = 'auto';
      silentSound.volume = 0.01; // Nearly silent
      silentSound.setAttribute('playsinline', '');
      silentSound.setAttribute('webkit-playsinline', '');
      
      // Add to DOM temporarily
      document.body.appendChild(silentSound);
      
      // Try to play
      const playPromise = silentSound.play();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log('Silent sound played successfully, iOS audio unlocked');
          // Remove after playing
          setTimeout(() => {
            document.body.removeChild(silentSound);
          }, 1000);
        }).catch(err => {
          console.warn('Failed to play silent sound:', err);
          document.body.removeChild(silentSound);
        });
      }
    }
  } catch (err) {
    console.error('Error unlocking iOS audio:', err);
  }
}

/**
 * Sets global microphone permission state
 * @param {boolean} hasPermission - Whether permission is granted
 */
export function setMicrophonePermission(hasPermission) {
  hasMicrophonePermission = hasPermission;
}

/**
 * Gets global microphone permission state
 * @returns {boolean} - Whether permission is granted
 */
export function getHasMicrophonePermission() {
  return hasMicrophonePermission;
} 