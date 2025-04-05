import { 
  selectPeers, 
  selectLocalPeer, 
  selectIsLocalAudioEnabled,
  selectIsConnectedToRoom
} from "@100mslive/hms-video-store";

import { DOM_IDS, HMS_ROLES } from '../config.js';
import hmsService from '../services/hmsService.js';
import userService from '../services/userService.js';
import farcasterService from '../services/farcasterService.js';
import modals from '../components/modals.js';
import { showErrorMessage, showSuccessMessage, updateMuteButtonUI } from '../utils/uiUtils.js';

/**
 * Conference component for managing audio conference UI and interactions
 */
class Conference {
  constructor() {
    // DOM elements
    this.header = document.querySelector('header');
    this.roomTitle = document.getElementById(DOM_IDS.ROOM_TITLE);
    this.roomDuration = document.getElementById(DOM_IDS.ROOM_DURATION);
    this.speakersList = document.getElementById(DOM_IDS.SPEAKERS_LIST);
    this.listenersList = document.getElementById(DOM_IDS.LISTENERS_LIST);
    this.listenersCount = document.getElementById(DOM_IDS.LISTENERS_COUNT);
    this.hostControls = document.getElementById(DOM_IDS.HOST_CONTROLS);
    this.viewerControls = document.getElementById(DOM_IDS.VIEWER_CONTROLS);
    this.muteAudio = document.getElementById(DOM_IDS.MUTE_AUDIO);
    this.endRoomBtn = document.getElementById(DOM_IDS.END_ROOM_BTN);
    this.leaveBtn = document.getElementById(DOM_IDS.LEAVE_BTN);
    this.conferenceEl = document.getElementById(DOM_IDS.CONFERENCE);
    this.controls = document.getElementById(DOM_IDS.CONTROLS);
    this.listenerActionModal = document.getElementById(DOM_IDS.LISTENER_ACTION_MODAL);
    this.listenerInitial = document.getElementById(DOM_IDS.LISTENER_INITIAL);
    this.listenerName = document.getElementById(DOM_IDS.LISTENER_NAME);
    this.promoteListenerBtn = document.getElementById(DOM_IDS.PROMOTE_LISTENER_BTN);
    this.demoteSpeakerBtn = document.getElementById(DOM_IDS.DEMOTE_SPEAKER_BTN);
    
    // State variables
    this.currentRoomId = null;
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup HMS store subscriptions
    this.setupSubscriptions();
  }
  
  /**
   * Initialize the UI
   */
  setupEventListeners() {
    // Mute audio button
    if (this.muteAudio) {
      this.muteAudio.addEventListener('click', this.handleMuteAudio.bind(this));
    }
    
    // End room button
    if (this.endRoomBtn) {
      this.endRoomBtn.addEventListener('click', this.handleEndRoom.bind(this));
    }
    
    // Leave room button
    if (this.leaveBtn) {
      this.leaveBtn.addEventListener('click', this.handleLeaveRoom.bind(this));
    }
    
    // Promote listener button
    if (this.promoteListenerBtn) {
      this.promoteListenerBtn.addEventListener('click', this.handlePromoteListener.bind(this));
    }
    
    // Demote speaker button
    if (this.demoteSpeakerBtn) {
      this.demoteSpeakerBtn.addEventListener('click', this.handleDemoteSpeaker.bind(this));
    }
    
    // Close modal buttons
    document.querySelectorAll('.close-button').forEach(button => {
      button.addEventListener('click', (event) => {
        // Make sure we stop event propagation to prevent other handlers from firing
        event.stopPropagation();
        
        const modalId = button.dataset.modal;
        if (modalId) {
          document.getElementById(modalId).classList.add('hide');
          hmsService.clearSelectedPeerId();
        }
      });
    });
    
    // Listen for debug events
    document.addEventListener('debugRoomJoined', this.handleDebugRoomJoined.bind(this));
    document.addEventListener('refreshConferenceUI', this.handleRefreshUI.bind(this));
    document.addEventListener('debugSpeakingUpdate', this.handleDebugSpeakingUpdate.bind(this));
    document.addEventListener('debugLeaveRoom', this.handleDebugLeaveRoom.bind(this));
    
    // Fix listeners list layout
    this.fixListenersListLayout();
  }
  
  /**
   * Fix the listeners list layout to prevent it from being hidden behind the bottom nav
   */
  fixListenersListLayout() {
    if (!this.listenersList || !this.conferenceEl || !this.controls) return;
    
    // Reset any previously applied styles that could be causing issues
    this.conferenceEl.style = '';
    this.listenersList.style = '';
    
    // Add specific styles via a stylesheet to avoid overriding existing styles
    const styleId = 'conference-layout-styles';
    let styleEl = document.getElementById(styleId);
    
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    
    // Get the controls height for the bottom padding
    const controlsHeight = this.controls.offsetHeight || 60;
    
    // Create a CSS stylesheet with all our layout fixes
    styleEl.textContent = `
      #${DOM_IDS.CONFERENCE} {
        position: relative;
        width: 100%;
        height: 100vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      #${DOM_IDS.SPEAKERS_LIST} {
        width: 100%;
        flex-shrink: 0;
      }
      
      #${DOM_IDS.LISTENERS_LIST} {
        width: 100%;
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding-bottom: ${controlsHeight + 20}px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.3) transparent;
      }
      
      #${DOM_IDS.LISTENERS_LIST}::-webkit-scrollbar {
        width: 5px;
      }
      
      #${DOM_IDS.LISTENERS_LIST}::-webkit-scrollbar-track {
        background: transparent;
      }
      
      #${DOM_IDS.LISTENERS_LIST}::-webkit-scrollbar-thumb {
        background-color: rgba(255,255,255,0.3);
        border-radius: 5px;
      }
      
      #${DOM_IDS.CONTROLS} {
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;
        z-index: 100;
      }
    `;
    
    // Update the layout when the window is resized
    const updateLayout = () => {
      const updatedControlsHeight = this.controls.offsetHeight || 60;
      document.getElementById(styleId).textContent = document.getElementById(styleId).textContent.replace(
        /padding-bottom: \d+px/,
        `padding-bottom: ${updatedControlsHeight + 20}px`
      );
    };
    
    // Remove any existing resize listener to avoid duplicates
    window.removeEventListener('resize', updateLayout);
    
    // Add the resize listener
    window.addEventListener('resize', updateLayout);
    
    // Set up an observer to watch for changes in listeners list content
    // This will help handle dynamic content changes
    if (this.listenersObserver) {
      this.listenersObserver.disconnect();
    }
    
    this.listenersObserver = new MutationObserver((mutations) => {
      // Check if we need to update scrolling or layout
      if (mutations.some(mutation => mutation.type === 'childList')) {
        // Small delay to let the DOM stabilize
        setTimeout(() => {
          // Force layout recalculation by a small scroll
          this.listenersList.scrollTop = 1;
          this.listenersList.scrollTop = 0;
        }, 50);
      }
    });
    
    // Start observing changes
    this.listenersObserver.observe(this.listenersList, {
      childList: true,
      subtree: true
    });
  }
  
  /**
   * Set up HMS store subscriptions
   */
  setupSubscriptions() {
    // Subscribe to peers updates
    hmsService.store.subscribe(this.renderPeers.bind(this), selectPeers);
    
    // Subscribe to audio status changes
    hmsService.store.subscribe(() => {
      this.renderPeers();
      this.updateMuteButton();
    }, selectIsLocalAudioEnabled);
    
    // Subscribe to connection state
    hmsService.store.subscribe(this.handleConnectionChange.bind(this), selectIsConnectedToRoom);
  }
  
  /**
   * Handle audio mute/unmute button click
   */
  async handleMuteAudio() {
    try {
      const newAudioState = await hmsService.toggleAudio();
      updateMuteButtonUI(this.muteAudio, newAudioState);
    } catch (error) {
      console.error('Error toggling audio:', error);
    }
  }
  
  /**
   * Handle end room button click
   */
  async handleEndRoom() {
    try {
      // Check if user is a creator WITHOUT leaving the room first
      const isCreator = hmsService.isRoomCreator();
      const roomId = this.currentRoomId;
      
      console.log('End Room: Using stored roomId:', roomId);
      
      if (isCreator && roomId) {
        // Use custom modal instead of confirm()
        modals.showConfirmation({
          title: 'End Room',
          message: 'Do you want to end this room for everyone? If you click Cancel, you will leave without ending the room.',
          confirmText: 'End Room',
          cancelText: 'Just Leave',
          confirmClass: 'btn-danger',
          cancelClass: 'btn-secondary',
          onConfirm: async () => {
            try {
              const fid = farcasterService.getUserFid();
              const address = await farcasterService.getWalletAddress() || document.getElementById(DOM_IDS.ETH_ADDRESS_INPUT)?.value || '';
              
              if (!fid || !address) {
                showErrorMessage('Missing required credentials to end the room');
                return;
              }
              
              // Disable the room on the server
              const apiDisableResult = await window.apiService.disableRoom(roomId, address, fid);
              showSuccessMessage('Room ended successfully for everyone.');
              
              // NOW leave the room
              await hmsService.actions.leave();
              hmsService.stopRoomTimer();
              
              // Clear our room ID
              this.currentRoomId = null;
            } catch (disableError) {
              console.error('Failed to disable room:', disableError);
              showErrorMessage('Failed to end the room, but you have been disconnected.');
              
              // Still leave the room on error
              await hmsService.actions.leave();
              hmsService.stopRoomTimer();
              this.currentRoomId = null;
            }
          },
          onCancel: async () => {
            // Just leave without ending the room
            await hmsService.actions.leave();
            hmsService.stopRoomTimer();
            this.currentRoomId = null;
          }
        });
      } else {
        // Not a creator, just leave immediately
        await hmsService.actions.leave();
        hmsService.stopRoomTimer();
        this.currentRoomId = null;
      }
      
      // UI update will be handled by connection state subscription
    } catch (error) {
      console.error('Error ending room:', error);
      showErrorMessage('Failed to end the room: ' + error.message);
    }
  }
  
  /**
   * Handle leave room button click
   */
  async handleLeaveRoom() {
    try {
      // Check if user is a creator WITHOUT leaving the room first
      const isCreator = hmsService.isRoomCreator();
      const roomId = this.currentRoomId;
      
      console.log('Leave Room: Using stored roomId:', roomId);
      
      // If user is creator, ask if they want to end room
      if (isCreator && roomId) {
        // Use custom modal instead of confirm()
        modals.showConfirmation({
          title: 'End Room',
          message: 'Do you want to end this room for everyone? If you click Cancel, you will leave without ending the room.',
          confirmText: 'End Room',
          cancelText: 'Just Leave',
          confirmClass: 'btn-danger',
          cancelClass: 'btn-secondary',
          onConfirm: async () => {
            try {
              const fid = farcasterService.getUserFid();
              const address = await farcasterService.getWalletAddress() || document.getElementById(DOM_IDS.ETH_ADDRESS_INPUT)?.value || '';
              
              if (!fid || !address) {
                showErrorMessage('Missing required credentials to end the room');
                return;
              }
              
              // Disable the room on the server
              await window.apiService.disableRoom(roomId, address, fid);
              showSuccessMessage('Room ended successfully for everyone.');
              
              // NOW leave the room
              await hmsService.actions.leave();
              this.currentRoomId = null;
            } catch (disableError) {
              console.error('Failed to disable room:', disableError);
              showErrorMessage('Failed to end the room, but you have been disconnected.');
              
              // Still leave the room on error
              await hmsService.actions.leave();
              this.currentRoomId = null;
            }
          },
          onCancel: async () => {
            // Just leave without ending the room
            await hmsService.actions.leave();
            this.currentRoomId = null;
          }
        });
      } else {
        // Not a creator, just leave immediately
        await hmsService.actions.leave();
        this.currentRoomId = null;
      }
      
      // UI update will be handled by connection state subscription
    } catch (error) {
      console.error('Error leaving room:', error);
      showErrorMessage('Failed to leave the room: ' + error.message);
    }
  }
  
  /**
   * Handle connection state changes
   * @param {boolean} isConnected - Whether connected to a room
   */
  handleConnectionChange(isConnected) {
    const roomsList = document.getElementById(DOM_IDS.ROOMS_LIST);
    const form = document.getElementById(DOM_IDS.FORM);
    
    if (isConnected) {
      // Show conference UI
      if (form) form.classList.add("hide");
      if (roomsList) roomsList.classList.add("hide");
      if (this.conferenceEl) this.conferenceEl.classList.remove("hide");
      if (this.header) this.header.classList.add("hide");
      
      // Show/hide controls based on role
      this.updateControlsVisibility();
      
      // Start the speaking detection interval
      hmsService.startSpeakingDetection();
      
      // Get the room ID if not already set
      if (!this.currentRoomId) {
        this.currentRoomId = hmsService.getCurrentRoomId();
        console.log('Connection: Set currentRoomId to:', this.currentRoomId);
      }
      
      // Reapply layout fixes after the UI becomes visible and DOM updates
      setTimeout(() => {
        // Recheck the DOM elements since they might have changed
        this.roomTitle = document.getElementById(DOM_IDS.ROOM_TITLE) || this.roomTitle;
        this.roomDuration = document.getElementById(DOM_IDS.ROOM_DURATION) || this.roomDuration;
        this.speakersList = document.getElementById(DOM_IDS.SPEAKERS_LIST) || this.speakersList;
        this.listenersList = document.getElementById(DOM_IDS.LISTENERS_LIST) || this.listenersList;
        this.controls = document.getElementById(DOM_IDS.CONTROLS) || this.controls;
        
        this.fixListenersListLayout();
        
        // Force a scrollbar refresh with a tiny scroll
        if (this.listenersList) {
          this.listenersList.scrollTop = 1;
          this.listenersList.scrollTop = 0;
        }
      }, 300);
      
      // If we're on iOS, try to unlock audio again
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        setTimeout(() => {
          console.log('Attempting to unlock iOS audio after successful room join');
          window.unlockIOSAudio?.();
        }, 500);
      }
    } else {
      // Clear the room ID when disconnecting
      console.log('Connection: Clearing currentRoomId (was:', this.currentRoomId, ')');
      this.currentRoomId = null;
      
      // Hide conference UI
      if (this.conferenceEl) this.conferenceEl.classList.add("hide");
      if (this.controls) this.controls.classList.add("hide");
      if (this.header) this.header.classList.remove("hide");
      
      // Return to room list
      if (roomsList) roomsList.classList.remove("hide");
      
      // Stop the speaking detection interval
      hmsService.stopSpeakingDetection();
      
      // Reset selected peer
      hmsService.clearSelectedPeerId();
      
      // Close any open modals
      document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.add('hide');
      });
      
      // Refresh the rooms list when returning to it
      try {
        // Check if window.app exists and has the roomsList component
        if (window.app && window.app.roomsList) {
          console.log('Refreshing rooms list after leaving room');
          window.app.roomsList.loadRooms();
        } else {
          // Alternative approach: click the refresh button if it exists
          const refreshBtn = document.getElementById(DOM_IDS.REFRESH_ROOMS_BTN);
          if (refreshBtn) {
            console.log('Clicking refresh button to update rooms list');
            refreshBtn.click();
          }
        }
      } catch (err) {
        console.warn('Failed to refresh rooms list:', err);
      }
      
      // Additional cleanup will be handled by the rooms component
    }
  }
  
  /**
   * Handle promote listener button click
   */
  async handlePromoteListener() {
    const selectedPeerId = hmsService.getSelectedPeerId();
    if (!selectedPeerId) return;
    
    const localPeer = hmsService.store.getState(selectLocalPeer);
    
    // Verify user is a streamer
    if (localPeer?.roleName !== HMS_ROLES.STREAMER) {
      showErrorMessage('Only streamers can manage participants');
      return;
    }
    
    // Verify user is the room creator
    if (!hmsService.isRoomCreator()) {
      showErrorMessage('Only the room creator can promote listeners to speakers');
      return;
    }
    
    try {
      // Get the peer object before we change their role
      const peers = hmsService.store.getState(selectPeers);
      const targetPeer = peers.find(peer => peer.id === selectedPeerId);
      
      if (!targetPeer) {
        throw new Error('Selected peer not found');
      }
      
      console.log('Promoting listener to speaker:', targetPeer.name);
      
      // First ensure the user is unmuted so they can talk after promotion
      try {
        // This ensures the user's audio track is enabled
        await hmsService.setRemoteTrackEnabled(targetPeer.audioTrack, true);
        console.log('Enabled remote audio track for promoted user');
      } catch (audioError) {
        console.warn('Failed to enable audio track, continuing with role change:', audioError);
      }
      
      // Change role
      await hmsService.changeRole(selectedPeerId, HMS_ROLES.STREAMER);
      
      // Close the modal
      this.listenerActionModal.classList.add('hide');
      hmsService.clearSelectedPeerId();
      
      // Show success message to room creator
      showSuccessMessage('Successfully promoted to speaker! They can now talk in the room.');
      
      // Force refresh the peer list to update UI
      setTimeout(() => {
        this.renderPeers();
      }, 1000);
    } catch (error) {
      console.error('Failed to promote listener:', error);
      showErrorMessage('Failed to promote listener: ' + error.message);
    }
  }
  
  /**
   * Handle demote speaker button click
   */
  async handleDemoteSpeaker() {
    const selectedPeerId = hmsService.getSelectedPeerId();
    if (!selectedPeerId) return;
    
    const localPeer = hmsService.store.getState(selectLocalPeer);
    
    // Verify user is a streamer
    if (localPeer?.roleName !== HMS_ROLES.STREAMER) {
      showErrorMessage('Only streamers can manage participants');
      return;
    }
    
    // Verify user is the room creator
    if (!hmsService.isRoomCreator()) {
      showErrorMessage('Only the room creator can demote speakers to listeners');
      return;
    }
    
    try {
      // Change role
      await hmsService.changeRole(selectedPeerId, HMS_ROLES.VIEWER);
      
      // Close the modal
      this.listenerActionModal.classList.add('hide');
      hmsService.clearSelectedPeerId();
      
      // Show success message
      showSuccessMessage('Successfully moved back to listener. They can no longer speak in the room.');
    } catch (error) {
      console.error('Failed to demote speaker:', error);
      showErrorMessage('Failed to demote speaker: ' + error.message);
    }
  }
  
  /**
   * Update the mute button UI
   */
  updateMuteButton() {
    const isEnabled = hmsService.store.getState(selectIsLocalAudioEnabled);
    updateMuteButtonUI(this.muteAudio, isEnabled);
  }
  
  /**
   * Update controls visibility based on role
   */
  updateControlsVisibility() {
    const localPeer = hmsService.store.getState(selectLocalPeer);
    const expectedRole = document.getElementById('expected-role')?.value;
    const isStreamer = expectedRole === HMS_ROLES.STREAMER || localPeer?.roleName === HMS_ROLES.STREAMER;
    
    console.log('Controls visibility check:', {
      expectedRole,
      actualRole: localPeer?.roleName,
      isStreamer,
      controlsHidden: !isStreamer
    });
    
    // Never hide controls if expected role is streamer
    this.controls.classList.toggle('hide', !isStreamer);
    
    // Also make sure host controls are visible if user should be a streamer
    if (isStreamer) {
      this.hostControls.classList.remove('hide');
    }
  }
  
  /**
   * Render the peers list
   */
  renderPeers() {
    // Use hmsService.getPeers() which supports debug mode instead of directly using the store
    const peers = hmsService.getPeers();
    const localPeer = hmsService.getLocalPeer();
    
    if (!peers.length) return;
    
    // Set room title based on the room description if available
    const localPeerRoom = localPeer?.roomId;
    
    // Store the currentRoomId from HMS service or local peer
    // This ensures we have the roomId available when needed for ending/leaving
    if (!this.currentRoomId) {
      this.currentRoomId = hmsService.getCurrentRoomId() || localPeerRoom || null;
      console.log('Conference: Set currentRoomId to:', this.currentRoomId);
    }
    
    // Try to get the current room details from any active room element
    const activeRoomElement = document.querySelector('.room-item.active-room');
    if (activeRoomElement) {
      const roomDescription = activeRoomElement.querySelector('.room-title')?.textContent;
      if (roomDescription) {
        this.roomTitle.textContent = roomDescription;
      }
      
      // If we have a room ID in the dataset, store it
      if (activeRoomElement.dataset.roomId && !this.currentRoomId) {
        this.currentRoomId = activeRoomElement.dataset.roomId;
        console.log('Conference: Set currentRoomId from active room element:', this.currentRoomId);
      }
    }
    
    // Fallback to streamer name if no room description is available
    if (!this.roomTitle.textContent) {
      const streamer = peers.find(peer => peer.roleName === HMS_ROLES.STREAMER || peer.role === HMS_ROLES.STREAMER);
      if (streamer) {
        let streamerId = streamer.name;
        if (streamerId.startsWith('FID:')) {
          streamerId = streamerId.split('FID:')[1];
        }
        this.roomTitle.textContent = `${streamerId}'s Room`;
      }
    }
    
    // Separate speakers (streamers) and listeners (viewers)
    // Check both the role and metadata to determine if someone should be a speaker
    const speakers = peers.filter(peer => {
      // Check role name (support both HMS objects and mock objects)
      if (peer.roleName === HMS_ROLES.STREAMER || peer.role === HMS_ROLES.STREAMER) return true;
      
      // Check metadata for creator flag as fallback
      try {
        if (peer.metadata) {
          const metadata = typeof peer.metadata === 'string' ? JSON.parse(peer.metadata) : peer.metadata;
          if (metadata.isCreator === true) return true;
        }
      } catch (e) {
        console.warn('Error parsing peer metadata:', e);
      }
      
      return false;
    });
    
    // Everyone who's not a speaker is a listener
    const listeners = peers.filter(peer => !speakers.find(s => s.id === peer.id));
    
    // If the room is starting for the first time, set up the duration timer
    if (speakers.length && !hmsService.getRoomDuration()) {
      hmsService.startRoomTimer();
    }
    
    // Update room duration display
    this.roomDuration.textContent = hmsService.getRoomDuration();
    
    // Check if we're the host (streamer role) AND the creator
    // Use isLocalAudioEnabled method which supports debug mode
    const isHost = localPeer?.roleName === HMS_ROLES.STREAMER || 
                   localPeer?.role === HMS_ROLES.STREAMER;
    
    // Check if we're the creator of the room
    const isCreator = hmsService.isRoomCreator();

    // Show the correct buttons per role
    if (isCreator) {
      this.viewerControls.classList.add('hide');
      this.hostControls.classList.remove('hide');
    } else {
      this.viewerControls.classList.remove('hide');
      this.hostControls.classList.add('hide');
    }

    // Render speakers list
    this.renderSpeakersList(speakers, localPeer, isCreator);
    
    // Render listeners list
    this.renderListenersList(listeners, localPeer, isHost, isCreator);
    
    // Update listeners count
    this.listenersCount.textContent = listeners.length;
  }
  
  /**
   * Render the speakers list
   * @param {Array} speakers - Array of speaker peers
   * @param {Object} localPeer - Local peer
   * @param {boolean} userIsCreator - Whether local user is the room creator
   */
  renderSpeakersList(speakers, localPeer, userIsCreator) {
    // Add a class to the speakers-list if the user is the creator
    if (userIsCreator) {
      this.speakersList.classList.add('room-creator');
    } else {
      this.speakersList.classList.remove('room-creator');
    }
    
    this.speakersList.innerHTML = speakers.map(speaker => {
      // Support both real HMS peers and mock peers in debug mode
      const profile = userService.getProfileFromPeer(speaker);
      const displayName = userService.getDisplayName(speaker);
      const isLocal = speaker.isLocal || (localPeer && speaker.id === localPeer.id);
      
      // Get accurate mute state - for local peer, use the global state selector
      let isMuted;
      if (isLocal) {
        // For local peer, use the most reliable source of truth
        isMuted = !hmsService.isLocalAudioEnabled();
      } else {
        // For remote peers, use their peer object state (handle both real and mock peers)
        isMuted = !(speaker.audioEnabled === true);
      }
      
      const isHost = true; // All speakers are hosts in this app
      const isSpeaking = speaker.isSpeaking || hmsService.isPeerSpeaking(speaker.id);
      
      // Check if we have a profile picture
      let hasPfp = false;
      let pfpUrl = '';
      if (profile && profile.pfpUrl) {
        hasPfp = true;
        pfpUrl = profile.pfpUrl;
      } else if (speaker.pfp) { // Support mock peers in debug mode
        hasPfp = true;
        pfpUrl = speaker.pfp;
      }
      
      const avatarContent = hasPfp 
        ? `<img src="${pfpUrl}" alt="${displayName}" />`
        : speaker.name.charAt(0).toUpperCase();
      
      // Only show mute badge for local user
      const showMuteBadge = isLocal && isMuted;
      
      // Only show interaction hint for non-local peers if user is creator
      const showInteractionHint = !isLocal && userIsCreator;
      
      return `
        <div class="speaker-item" data-peer-id="${speaker.id}" data-role="${speaker.roleName || speaker.role || HMS_ROLES.STREAMER}" title="${userIsCreator && !isLocal ? 'Click to manage this speaker' : ''}">
          <div class="avatar${hasPfp ? ' with-image' : ''}${isSpeaking ? ' speaking' : ''}">
            ${avatarContent}
            ${isHost ? '<div class="avatar-badge host-badge">★</div>' : ''}
            ${showMuteBadge ? '<div class="avatar-badge muted-badge">🔇</div>' : ''}
          </div>
          <div class="avatar-name">${displayName}${isLocal ? ' (You)' : ''}</div>
          ${showInteractionHint ? '<div class="interaction-hint">⚙️</div>' : ''}
        </div>
      `;
    }).join('');
    
    // Add click handlers for speaker items if local user is host
    if (localPeer?.roleName === HMS_ROLES.STREAMER || localPeer?.role === HMS_ROLES.STREAMER) {
      document.querySelectorAll('.speaker-item').forEach(item => {
        item.addEventListener('click', this.handlePeerClick.bind(this));
      });
    }
    
    // Add avatar click handlers for all users - enable profile viewing for everyone
    document.querySelectorAll('.speaker-item .avatar').forEach(avatar => {
      avatar.addEventListener('click', this.handleAvatarClick.bind(this));
    });
  }
  
  /**
   * Render the listeners list
   * @param {Array} listeners - Array of listener peers
   * @param {Object} localPeer - Local peer
   * @param {boolean} isHost - Whether local user is a host
   * @param {boolean} userIsCreator - Whether local user is the room creator
   */
  renderListenersList(listeners, localPeer, isHost, userIsCreator) {
    // Add a class to the listeners-list if the user is the creator
    if (userIsCreator) {
      this.listenersList.classList.add('room-creator');
    } else {
      this.listenersList.classList.remove('room-creator');
    }
    
    this.listenersList.innerHTML = listeners.map(listener => {
      // Support both real HMS peers and mock peers in debug mode
      const profile = userService.getProfileFromPeer(listener);
      const displayName = userService.getDisplayName(listener);
      const isLocal = listener.isLocal || (localPeer && listener.id === localPeer.id);
      
      // Get accurate mute state - for local peer, use the global state selector
      let isMuted;
      if (isLocal) {
        // For local peer, use the most reliable source of truth
        isMuted = !hmsService.isLocalAudioEnabled();
      } else {
        // For remote peers, use their peer object state (handle both real and mock peers)
        isMuted = !(listener.audioEnabled === true);
      }
      
      const isSpeaking = listener.isSpeaking || hmsService.isPeerSpeaking(listener.id);
      
      // Check if we have a profile picture
      let hasPfp = false;
      let pfpUrl = '';
      if (profile && profile.pfpUrl) {
        hasPfp = true;
        pfpUrl = profile.pfpUrl;
      } else if (listener.pfp) { // Support mock peers in debug mode
        hasPfp = true;
        pfpUrl = listener.pfp;
      }
      
      const avatarContent = hasPfp 
        ? `<img src="${pfpUrl}" alt="${displayName}" />`
        : listener.name.charAt(0).toUpperCase();
      
      // Only show mute badge for local user
      const showMuteBadge = isLocal && isMuted;
      
      // Only show interaction hint for non-local peers if user is creator
      const showInteractionHint = !isLocal && userIsCreator;
      
      return `
        <div class="listener-item" data-peer-id="${listener.id}" data-role="${listener.roleName || listener.role || HMS_ROLES.VIEWER}" title="${userIsCreator && !isLocal ? 'Click to invite this listener to speak' : ''}">
          <div class="avatar listener-avatar${hasPfp ? ' with-image' : ''}${isSpeaking ? ' speaking' : ''}">
            ${avatarContent}
            ${showMuteBadge ? '<div class="avatar-badge muted-badge">🔇</div>' : ''}
          </div>
          <div class="avatar-name">${displayName}${isLocal ? ' (You)' : ''}</div>
          ${showInteractionHint ? '<div class="interaction-hint">🎤</div>' : ''}
        </div>
      `;
    }).join('');
    
    // Add click handlers for listener items if local user is host
    if (isHost) {
      document.querySelectorAll('.listener-item').forEach(item => {
        item.addEventListener('click', this.handlePeerClick.bind(this));
      });
    }
    
    // Add avatar click handlers for all users - enable profile viewing for everyone
    document.querySelectorAll('.listener-item .avatar').forEach(avatar => {
      avatar.addEventListener('click', this.handleAvatarClick.bind(this));
    });
  }
  
  /**
   * Handle avatar click to view profile
   * @param {Event} e - Click event
   */
  handleAvatarClick(e) {
    e.stopPropagation(); // Prevent bubbling to the handlePeerClick
    
    const peerItem = e.currentTarget.closest('.speaker-item, .listener-item');
    if (!peerItem) return;
    
    const peerId = peerItem.dataset.peerId;
    const peers = hmsService.store.getState(selectPeers);
    
    // Find the clicked peer
    const peer = peers.find(p => p.id === peerId);
    if (!peer) return;
    
    // Try to get profile information to find FID
    try {
      if (peer.metadata) {
        const metadata = JSON.parse(peer.metadata);
        if (metadata.fid) {
          console.log("Opening profile for FID:", metadata.fid);
          farcasterService.viewProfile(metadata.fid);
        }
      }
    } catch (error) {
      console.error("Error parsing metadata:", error);
    }
  }
  
  /**
   * Handle peer item click for moderation actions
   * @param {Event} e - Click event
   */
  handlePeerClick(e) {
    // Don't process if the click was directly on an avatar
    if (e.target.closest('.avatar')) {
      // Let the avatar click handler take care of this
      return;
    }
    
    const peerItem = e.currentTarget;
    const peerId = peerItem.dataset.peerId;
    const role = peerItem.dataset.role;
    const peers = hmsService.store.getState(selectPeers);
    const localPeer = hmsService.store.getState(selectLocalPeer);
    
    // Only streamers can see peer details
    if (localPeer?.roleName !== HMS_ROLES.STREAMER) return;
    
    // Don't allow actions on self
    if (peerId === localPeer.id) return;
    
    // Find the clicked peer
    const peer = peers.find(p => p.id === peerId);
    if (!peer) return;
    
    // Store selected peer ID for later use
    hmsService.setSelectedPeerId(peerId);
    
    // Try to get profile information
    const profile = userService.getProfileFromPeer(peer);
    const displayName = userService.getDisplayName(peer);
    
    // Show appropriate action modal based on role
    this.listenerActionModal.classList.remove('hide');
    
    // Add click-outside listener to close the modal
    const closeModalOnOutsideClick = (event) => {
      // Check if the click was outside the modal content
      if (!event.target.closest('.modal-content') && event.target.classList.contains('modal')) {
        this.listenerActionModal.classList.add('hide');
        document.removeEventListener('click', closeModalOnOutsideClick);
      }
    };
    
    // Use setTimeout to avoid the current click triggering the handler
    setTimeout(() => {
      document.addEventListener('click', closeModalOnOutsideClick);
    }, 10);
    
    // Update the avatar in the modal
    const listenerAvatar = document.querySelector('.listener-avatar');
    if (profile && profile.pfpUrl) {
      listenerAvatar.innerHTML = `<img src="${profile.pfpUrl}" alt="${displayName}" />`;
      listenerAvatar.classList.add('with-image');
    } else {
      this.listenerInitial.textContent = peer.name.charAt(0).toUpperCase();
      listenerAvatar.classList.remove('with-image');
    }
    
    // Set the name display
    this.listenerName.textContent = displayName;
    
    // Check if the local user is the room creator
    const userIsCreator = hmsService.isRoomCreator();
    
    // Show explanatory text if user is not a creator but is a streamer
    const creatorOnlyMessage = document.getElementById('creator-only-message');
    if (creatorOnlyMessage) {
      if (!userIsCreator && localPeer?.roleName === HMS_ROLES.STREAMER) {
        creatorOnlyMessage.classList.remove('hide');
      } else {
        creatorOnlyMessage.classList.add('hide');
      }
    }
    
    // Get the description elements
    const promoteDescription = document.getElementById('promote-description');
    const demoteDescription = document.getElementById('demote-description');
    
    // Show/hide appropriate buttons and descriptions based on role and creator status
    if (role === HMS_ROLES.VIEWER) {
      // Only room creator can promote to streamer
      this.promoteListenerBtn.classList.toggle('hide', !userIsCreator);
      this.demoteSpeakerBtn.classList.add('hide');
      
      // Show/hide appropriate descriptions
      if (promoteDescription) promoteDescription.classList.toggle('hide', !userIsCreator);
      if (demoteDescription) demoteDescription.classList.add('hide');
    } else {
      this.promoteListenerBtn.classList.add('hide');
      // Only room creator can demote speakers
      this.demoteSpeakerBtn.classList.toggle('hide', !userIsCreator);
      
      // Show/hide appropriate descriptions
      if (promoteDescription) promoteDescription.classList.add('hide');
      if (demoteDescription) demoteDescription.classList.toggle('hide', !userIsCreator);
    }
  }
  
  /**
   * Handle debug room join event
   * @param {CustomEvent} event - Debug room join event
   */
  handleDebugRoomJoined(event) {
    console.log('[DEBUG] Conference received debug room joined event:', event.detail);
    
    // Store room ID from the debug event
    if (event.detail?.roomId) {
      this.currentRoomId = event.detail.roomId;
      console.log('[DEBUG] Conference: Set currentRoomId from debug event:', this.currentRoomId);
    }
    
    // Update connection status
    this.handleConnectionChange(true);
    
    // Force render the peers immediately
    this.renderPeers();
    
    // Update room title
    if (this.roomTitle) {
      this.roomTitle.textContent = 'Debug Room';
    }
    
    // Show controls
    if (this.controls) {
      this.controls.classList.remove('hide');
    }
    
    // Apply layout fixes for debug mode after a small delay
    // to ensure DOM has been properly updated
    setTimeout(() => {
      this.fixListenersListLayout();
    }, 300);
  }
  
  /**
   * Handle refresh UI event
   */
  handleRefreshUI() {
    console.log('[DEBUG] Refreshing conference UI');
    this.renderPeers();
  }
  
  /**
   * Handle debug speaking update event
   * @param {CustomEvent} event - Debug speaking update event
   */
  handleDebugSpeakingUpdate(event) {
    console.log('[DEBUG] Conference received speaking update event:', event.detail);
    this.renderPeers();
  }
  
  /**
   * Handle debug leave room event
   */
  handleDebugLeaveRoom() {
    console.log('[DEBUG] Conference received leave room event');
    this.handleConnectionChange(false);
  }
}

export default Conference; 