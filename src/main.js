import { DOM_IDS } from './config.js';
import apiService from './services/apiService.js';
import farcasterService from './services/farcasterService.js';
import userService from './services/userService.js';
import { checkMicrophonePermission, setMicrophonePermission, unlockIOSAudio, isIOSBrowser } from './utils/audioUtils.js';
import RoomsList from './components/roomsList.js';
import Conference from './components/conference.js';

// Make API service globally available for backward compatibility
window.apiService = apiService;

// Make iOS audio unlock function globally available for backward compatibility
window.unlockIOSAudio = unlockIOSAudio;

/**
 * Main application entry point
 */
class App {
  constructor() {
    // Initialize components
    this.conference = new Conference();
    this.roomsList = new RoomsList();
    
    // Share button DOM element
    this.shareWarpcastBtn = document.getElementById(DOM_IDS.SHARE_WARPCAST_BTN);
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the application
   */
  async init() {
    try {
      console.log('Initializing Fariscope Frame application');
      
      // Check for microphone permission early
      const hasMicPermission = await checkMicrophonePermission();
      setMicrophonePermission(hasMicPermission);
      console.log('Microphone permission:', hasMicPermission ? 'granted' : 'denied/undetermined');
      
      // Check if we're on iOS
      if (isIOSBrowser()) {
        console.log('iOS device detected, will unlock audio on user interaction');
      }
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Initialize Farcaster SDK
      try {
        await farcasterService.initialize();
        
        // Try to get user's Farcaster ID
        const user = await farcasterService.refreshUser();
        
        if (user?.fid) {
          // Fetch user profile from Neynar
          let userProfile = null;
          try {
            userProfile = await userService.fetchUserProfile(user.fid);
            console.log('Fetched user profile:', userProfile);
          } catch (profileError) {
            console.warn('Failed to fetch user profile:', profileError);
          }
          
          // Update greeting with username if available
          const userGreeting = document.getElementById(DOM_IDS.USER_GREETING);
          if (userGreeting) {
            const displayName = userProfile?.username || `FID: ${user.fid}`;
            userGreeting.textContent = `Hello, ${displayName}`;
            userGreeting.classList.add('show');
          }
          
          // Store FID in hidden input
          const fidInput = document.getElementById('fid');
          if (fidInput) {
            fidInput.value = user.fid;
          }
          
          // Try to get wallet address
          try {
            const address = await farcasterService.getWalletAddress();
            if (address) {
              const addressInput = document.getElementById(DOM_IDS.ETH_ADDRESS_INPUT);
              if (addressInput) {
                addressInput.value = address;
              }
            }
          } catch (walletError) {
            console.warn('Could not get wallet address:', walletError);
          }
        }
      } catch (error) {
        console.error('Farcaster initialization failed:', error);
      }
      
      // Initialize the rooms list
      this.roomsList.init();
      
    } catch (error) {
      console.error('App initialization failed:', error);
    }
  }
  
  /**
   * Set up global event listeners
   */
  setupEventListeners() {
    // Set up share to Warpcast button
    if (this.shareWarpcastBtn) {
      this.shareWarpcastBtn.addEventListener('click', this.handleShareToWarpcast.bind(this));
    }
    
    // Add iOS audio unlock
    if (isIOSBrowser()) {
      // Add listeners to main interaction elements
      document.querySelectorAll('button, a, input, .interactive').forEach(element => {
        element.addEventListener('click', unlockIOSAudio);
      });
      
      // Also try to unlock on first touch anywhere
      const unlockOnce = () => {
        unlockIOSAudio();
        document.removeEventListener('touchstart', unlockOnce);
      };
      document.addEventListener('touchstart', unlockOnce);
    }
  }
  
  /**
   * Handle share to Warpcast button click
   */
  async handleShareToWarpcast() {
    // Use the fixed message and URL as requested
    const shareText = "I'm live on FC Audio Chat!";
    const shareUrl = "https://fc-audio-chat.kasra.codes";
    
    // Show a small success indicator
    const successIndicator = document.createElement('div');
    successIndicator.className = 'share-success-indicator';
    successIndicator.style.position = 'absolute';
    successIndicator.style.top = '0';
    successIndicator.style.right = '0';
    successIndicator.style.background = 'rgba(76, 175, 80, 0.9)';
    successIndicator.style.color = 'white';
    successIndicator.style.padding = '4px 8px';
    successIndicator.style.borderRadius = '4px';
    successIndicator.style.fontSize = '12px';
    successIndicator.style.zIndex = '999';
    successIndicator.textContent = 'Sharing...';
    
    this.shareWarpcastBtn.style.position = 'relative';
    this.shareWarpcastBtn.appendChild(successIndicator);
    
    // Call farcasterService.shareToCast with the fixed message and URL
    console.log('Sharing to Warpcast:', { shareText, shareUrl });
    
    try {
      // The shareToCast function constructs the URL and opens it using the frame SDK
      await farcasterService.shareToCast(shareText, shareUrl);
      
      // Update success indicator
      successIndicator.textContent = 'Opening Warpcast...';
      successIndicator.style.background = 'rgba(76, 175, 80, 0.9)';
    } catch (error) {
      console.error('Failed to share to Warpcast:', error);
      
      // Update indicator to show error
      successIndicator.textContent = 'Failed';
      successIndicator.style.background = 'rgba(244, 67, 54, 0.9)';
    }
    
    // Remove indicator after a delay
    setTimeout(() => {
      if (this.shareWarpcastBtn.contains(successIndicator)) {
        this.shareWarpcastBtn.removeChild(successIndicator);
      }
    }, 2000);
  }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

// Export the App class
export default App;
