import { 
  selectPeers, 
  selectLocalPeer, 
  selectIsLocalAudioEnabled,
  selectIsConnectedToRoom,
} from "@100mslive/hms-video-store";

import { DOM_IDS, HMS_ROLES, USER_ROLES } from '../config.js';
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
    this.raiseHandBtn = document.getElementById(DOM_IDS.RAISE_HAND_BTN);
    this.emojiReactionBtn = document.getElementById(DOM_IDS.EMOJI_REACTION_BTN);
    this.emojiReactionModal = document.getElementById(DOM_IDS.EMOJI_REACTION_MODAL);
    this.emojiContainer = document.getElementById(DOM_IDS.EMOJI_CONTAINER);
    this.conferenceEl = document.getElementById(DOM_IDS.CONFERENCE);
    this.controls = document.getElementById(DOM_IDS.CONTROLS);
    this.listenerActionModal = document.getElementById(DOM_IDS.LISTENER_ACTION_MODAL);
    this.listenerInitial = document.getElementById(DOM_IDS.LISTENER_INITIAL);
    this.listenerName = document.getElementById(DOM_IDS.LISTENER_NAME);
    this.promoteListenerBtn = document.getElementById(DOM_IDS.PROMOTE_LISTENER_BTN);
    this.demoteSpeakerBtn = document.getElementById(DOM_IDS.DEMOTE_SPEAKER_BTN);
    this.chatBtn = document.getElementById(DOM_IDS.CHAT_BTN);
    this.chatBadge = document.getElementById(DOM_IDS.CHAT_BADGE);
    this.chatContainer = document.getElementById(DOM_IDS.CHAT_CONTAINER);
    this.chatMessages = document.getElementById(DOM_IDS.CHAT_MESSAGES);
    this.chatInput = document.getElementById(DOM_IDS.CHAT_INPUT);
    this.chatSendBtn = document.getElementById(DOM_IDS.CHAT_SEND_BTN);
    this.makeCoHostBtn = document.getElementById(DOM_IDS.MAKE_COHOST_BTN);
    this.removeCoHostBtn = document.getElementById(DOM_IDS.REMOVE_COHOST_BTN);
    this.cohostDescription = document.getElementById('cohost-description');
    
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
    
    // Raise hand button
    if (this.raiseHandBtn) {
      this.raiseHandBtn.addEventListener('click', this.handleRaiseHand.bind(this));
    }
    
    // Emoji reaction button
    if (this.emojiReactionBtn) {
      this.emojiReactionBtn.addEventListener('click', this.handleEmojiReactionClick.bind(this));
    }
    
    // Chat button
    if (this.chatBtn) {
      this.chatBtn.addEventListener('click', this.handleChatBtnClick.bind(this));
    }
    
    // Chat send button
    if (this.chatSendBtn) {
      this.chatSendBtn.addEventListener('click', this.handleChatSend.bind(this));
    }
    
    // Chat input keypress (Enter key)
    if (this.chatInput) {
      this.chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.handleChatSend();
        }
      });
    }
    
    // Promote listener button
    if (this.promoteListenerBtn) {
      this.promoteListenerBtn.addEventListener('click', this.handlePromoteListener.bind(this));
    }
    
    // Demote speaker button
    if (this.demoteSpeakerBtn) {
      this.demoteSpeakerBtn.addEventListener('click', this.handleDemoteSpeaker.bind(this));
    }
    
    // Make cohost button
    if (this.makeCoHostBtn) {
      this.makeCoHostBtn.addEventListener('click', this.handleMakeCohost.bind(this));
    }
    
    // Remove cohost button
    if (this.removeCoHostBtn) {
      this.removeCoHostBtn.addEventListener('click', this.handleRemoveCohost.bind(this));
    }
    
    // Close modal buttons
    document.querySelectorAll('.close-button').forEach(button => {
      // Using bind(this) to preserve the Conference class context
      button.addEventListener('click', this.handleCloseButtonClick.bind(this));
    });
    
    // Add a dedicated method to handle chat close button click
    this.handleChatClose = () => {
      this.chatContainer.classList.add('hide');
      this.isChatOpen = false;
      console.log('Chat closed with X button, isChatOpen set to:', this.isChatOpen);
    };
    
    // Add click handlers for emoji buttons
    document.querySelectorAll('.emoji-btn').forEach(button => {
      button.addEventListener('click', this.handleEmojiSelected.bind(this));
    });
    
    // Listen for debug events
    document.addEventListener('debugRoomJoined', this.handleDebugRoomJoined.bind(this));
    document.addEventListener('refreshConferenceUI', this.handleRefreshUI.bind(this));
    document.addEventListener('debugSpeakingUpdate', this.handleDebugSpeakingUpdate.bind(this));
    document.addEventListener('debugLeaveRoom', this.handleDebugLeaveRoom.bind(this));
    
    // Listen for hand raise events
    document.addEventListener('hand-raise-changed', this.handleHandRaiseChanged.bind(this));
    
    // Listen for emoji reaction events
    document.addEventListener('emoji-reaction', this.handleEmojiReaction.bind(this));
    
    // Listen for emoji cooldown complete events
    document.addEventListener('emoji-cooldown-complete', this.handleEmojiCooldownComplete.bind(this));
    
    // Listen for active speaker changes from HMS
    document.addEventListener('active-speaker-changed', this.handleActiveSpeakerChange.bind(this));
    
    // Listen for chat messages
    document.addEventListener('chat-message', this.handleChatMessage.bind(this));
    
    // Listen for chat cooldown complete
    document.addEventListener('chat-cooldown-complete', this.handleChatCooldownComplete.bind(this));
    
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
   * Clean up all emoji reaction timeouts and containers
   */
  cleanupEmojiReactionTimeouts() {
    // Clear all timeouts
    if (this.emojiReactionTimeouts) {
      // Iterate through all sender IDs and clear their timeouts
      this.emojiReactionTimeouts.forEach((timeouts, senderId) => {
        timeouts.forEach(timeoutId => clearTimeout(timeoutId));
      });
      
      // Clear the map
      this.emojiReactionTimeouts.clear();
    }
    
    // Clear all container tracking
    if (this.activeSenderContainers) {
      this.activeSenderContainers.clear();
    }
    
    // Remove all emoji containers from the DOM
    if (this.emojiContainer) {
      // First remove all flying-emoji elements directly
      const emojis = this.emojiContainer.querySelectorAll('.flying-emoji');
      emojis.forEach(emoji => emoji.remove());
      
      // Then remove the containers
      const containers = this.emojiContainer.querySelectorAll('.reaction-container');
      containers.forEach(container => container.remove());
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
      
      // Initialize chat state
      this.initChatState();
      
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
      
      // Clean up emoji reaction timeouts and elements
      this.cleanupEmojiReactionTimeouts();
      
      // Clean up chat
      this.cleanupChat();
      
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
   * Handle promoting listener to speaker
   */
  async handlePromoteListener() {
    const selectedPeerId = hmsService.getSelectedPeerId();
    if (!selectedPeerId) {
      console.warn('No peer selected for promotion');
      return;
    }
    
    try {
      const localPeer = hmsService.getLocalPeer();
      if (!localPeer) {
        console.warn('No local peer found');
        return;
      }
      
      // Is the user authorized to promote listeners?
      if (!hmsService.canModerate()) {
        showErrorMessage('Only the room creator and cohosts can promote listeners to speakers.');
        return;
      }
      
      // Close the modal
      this.listenerActionModal.classList.add('hide');
      
      // Show loading UI
      this.promoteListenerBtn.textContent = 'Promoting...';
      this.promoteListenerBtn.disabled = true;
      
      // Change the role of the peer
      await hmsService.changeRole(selectedPeerId, HMS_ROLES.STREAMER);
      
      // Reset the button state
      this.promoteListenerBtn.textContent = 'Invite to Speak';
      this.promoteListenerBtn.disabled = false;
      
      // Clear the selected peer ID
      hmsService.clearSelectedPeerId();
      
      // Show success message
      showSuccessMessage('Listener has been promoted to speaker');
      
      // Re-render the UI
      setTimeout(() => {
        this.renderPeers();
      }, 500);
    } catch (error) {
      console.error('Error promoting listener:', error);
      this.promoteListenerBtn.textContent = 'Invite to Speak';
      this.promoteListenerBtn.disabled = false;
      showErrorMessage('Failed to promote listener. Please try again.');
    }
  }
  
  /**
   * Handle demote speaker button click
   */
  async handleDemoteSpeaker() {
    const selectedPeerId = hmsService.getSelectedPeerId();
    if (!selectedPeerId) return;
    
    const localPeer = hmsService.store.getState(selectLocalPeer);
    
    // Verify the user can moderate
    if (!hmsService.canModerate()) {
      showErrorMessage('Only the room creator and cohosts can move speakers to listeners');
      return;
    }
    
    // Check if the target peer is a cohost
    const isPeerCohost = hmsService.hasPeerRole(selectedPeerId, USER_ROLES.COHOST);
    
    // Check if we are the room creator
    const isCreator = hmsService.isRoomCreator();
    
    // If the target is a cohost and we're not the creator, prevent the action
    if (isPeerCohost && !isCreator) {
      showErrorMessage('Only the room creator can move cohosts to listeners');
      return;
    }
    
    try {
      // If the peer is a cohost, remove cohost status first
      if (isPeerCohost && isCreator) {
        await hmsService.removePeerCohost(selectedPeerId);
      }
      
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
    
    // Check if user is the creator - this affects which buttons we show
    const isCreator = hmsService.isRoomCreator();
    
    console.log('Controls visibility check:', {
      expectedRole,
      actualRole: localPeer?.roleName,
      isStreamer,
      isCreator
    });

    // Always show control bar
    this.controls.classList.remove('hide');
    
    // Handle controls visibility based on role
    if (isCreator) {
      // For creators: only show mute, chat, and end room
      this.viewerControls.classList.add('hide'); // Hide emoji and hand raise buttons
      this.hostControls.classList.remove('hide'); // Show end room button
      this.leaveBtn.classList.add('hide'); // Hide leave button
    } else {
      // For non-creators: show emoji, hand raise, and leave buttons
      this.viewerControls.classList.remove('hide');
      this.hostControls.classList.add('hide');
      this.leaveBtn.classList.remove('hide');
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
    let isCreator = hmsService.isRoomCreator();
    
    // SAFETY CHECK: If the UI state says we were previously the creator but HMS thinks we're not,
    // this likely means we had a metadata corruption - log it and honor the UI state
    if (!isCreator && this.wasCreator === true) {
      console.error('METADATA CORRUPTION DETECTED: Local peer lost creator status, restoring...');
      isCreator = true;
      // Try to restore the creator status in the HMS metadata
      if (localPeer && localPeer.id) {
        try {
          // Get current metadata
          let metadata = {};
          if (localPeer.metadata) {
            metadata = typeof localPeer.metadata === 'string' ? 
              JSON.parse(localPeer.metadata) : localPeer.metadata;
          }
          metadata.isCreator = true;
          
          // Update our metadata asynchronously
          hmsService.actions.changeMetadata(JSON.stringify(metadata))
            .then(() => console.log('Successfully restored creator status'))
            .catch(err => console.error('Failed to restore creator status:', err));
        } catch (e) {
          console.error('Error attempting to restore creator status:', e);
        }
      }
    }
    
    // Save creator status for consistency checks
    this.wasCreator = isCreator;

    // Show the correct buttons per role
    if (isCreator) {
      // For creators: only show mute, chat, and end room
      this.viewerControls.classList.add('hide'); // Hide emoji and hand raise buttons
      this.hostControls.classList.remove('hide'); // Show end room button
      this.leaveBtn.classList.add('hide'); // Hide "Leave" button for room creators
    } else {
      // For non-creators: show emoji, hand raise, and leave buttons
      this.viewerControls.classList.remove('hide');
      this.hostControls.classList.add('hide');
      this.leaveBtn.classList.remove('hide'); // Show "Leave" button for non-creators
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
      
      // Check if this speaker is the room creator
      let isCreator = false;
      let isCohost = false;
      
      try {
        if (speaker.metadata) {
          const metadata = typeof speaker.metadata === 'string' ? JSON.parse(speaker.metadata) : speaker.metadata;
          isCreator = metadata.isCreator === true;
          isCohost = metadata.isCohost === true;
        }
      } catch (e) {
        console.warn('Error parsing peer metadata:', e);
      }
      
      // Also check if this is the local peer and we know we're the creator
      if (isLocal && userIsCreator) {
        isCreator = true;
      }
      
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
      
      // Determine avatar classes - with-image class now controls overflow:hidden
      const avatarClasses = [
        'avatar',
        hasPfp ? 'with-image' : '',
        isSpeaking ? 'speaking' : ''
      ].filter(Boolean).join(' ');
      
      // Use crown for creator, star for regular speakers, special badge for cohosts
      let hostBadgeContent = '★';
      let hostBadgeClass = 'host-badge';
      
      if (isCreator) {
        hostBadgeContent = '👑';
        hostBadgeClass = 'host-badge creator-badge';
      } else if (isCohost) {
        hostBadgeContent = '👑';
        hostBadgeClass = 'host-badge cohost-badge';
      }
      
      return `
        <div class="speaker-item" data-peer-id="${speaker.id}" data-role="${speaker.roleName || speaker.role || HMS_ROLES.STREAMER}" title="${userIsCreator && !isLocal ? 'Click to manage this speaker' : ''}">
          <div class="${avatarClasses}">
            ${avatarContent}
            ${isHost ? `<div class="avatar-badge ${hostBadgeClass}">${hostBadgeContent}</div>` : ''}
            ${showMuteBadge ? '<div class="avatar-badge muted-badge">🔇</div>' : ''}
          </div>
          <div class="avatar-name">${displayName}${isLocal ? ' (You)' : ''}</div>
          ${showInteractionHint ? '<div class="interaction-hint">⚙️</div>' : ''}
        </div>
      `;
    }).join('');
    
    // Only add click handlers if user is the room creator
    if (userIsCreator) {
      document.querySelectorAll('.speaker-item').forEach(item => {
        item.addEventListener('click', this.handlePeerClick.bind(this));
      });
    } else {
      // For non-creators, add profile view click handlers
      document.querySelectorAll('.speaker-item .avatar').forEach(avatar => {
        avatar.addEventListener('click', this.handleAvatarClick.bind(this));
      });
    }
  }
  
  /**
   * Render the listeners list
   * @param {Array} listeners - Array of listener peers
   * @param {Object} localPeer - Local peer
   * @param {boolean} isHost - Whether local user is a host
   * @param {boolean} userIsCreator - Whether local user is the room creator
   */
  renderListenersList(listeners, localPeer, isHost, userIsCreator) {
    // Get listeners sorted by hand raised status
    const sortedListeners = hmsService.getSortedPeers().filter(peer => 
      peer.roleName === HMS_ROLES.VIEWER || peer.role === HMS_ROLES.VIEWER
    );
    
    // Add a class to the listeners-list if the user is the creator
    if (userIsCreator) {
      this.listenersList.classList.add('room-creator');
    } else {
      this.listenersList.classList.remove('room-creator');
    }
    
    this.listenersList.innerHTML = sortedListeners.map(listener => {
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
      const isHandRaised = hmsService.isPeerHandRaised(listener.id);
      
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
      
      // Show hand raised badge if hand is raised
      const handRaisedBadge = isHandRaised 
        ? '<div class="hand-raised-badge">✋</div>' 
        : '';
      
      // Only show interaction hint for non-local peers if user is creator
      const showInteractionHint = !isLocal && userIsCreator;
      
      // Determine avatar classes - with-image class now controls overflow:hidden
      const avatarClasses = [
        'avatar',
        'listener-avatar',
        hasPfp ? 'with-image' : '',
        isSpeaking ? 'speaking' : ''
      ].filter(Boolean).join(' ');
      
      return `
        <div class="listener-item" data-peer-id="${listener.id}" data-role="${listener.roleName || listener.role || HMS_ROLES.VIEWER}" title="${userIsCreator && !isLocal ? 'Click to invite this listener to speak' : ''}">
          <div class="${avatarClasses}">
            ${avatarContent}
            ${showMuteBadge ? '<div class="avatar-badge muted-badge">🔇</div>' : ''}
            ${handRaisedBadge}
          </div>
          <div class="avatar-name">${displayName}${isLocal ? ' (You)' : ''}</div>
          ${showInteractionHint ? '<div class="interaction-hint">🎤</div>' : ''}
        </div>
      `;
    }).join('');
    
    // Only add click handlers if user is the room creator
    if (userIsCreator) {
      document.querySelectorAll('.listener-item').forEach(item => {
        item.addEventListener('click', this.handlePeerClick.bind(this));
      });
    } else {
      // For non-creators, add profile view click handlers
      document.querySelectorAll('.listener-item .avatar').forEach(avatar => {
        avatar.addEventListener('click', this.handleAvatarClick.bind(this));
      });
    }
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
    const peers = hmsService.getPeers();
    
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
    // Only proceed if we can moderate
    if (!hmsService.canModerate()) return;
    
    // Don't process if the click was directly on an avatar
    if (e.target.closest('.avatar')) {
      return;
    }
    
    const peerItem = e.currentTarget;
    const peerId = peerItem.dataset.peerId;
    const role = peerItem.dataset.role;
    const peers = hmsService.getPeers();
    const localPeer = hmsService.getLocalPeer();
    
    // Don't allow actions on self
    if (peerId === localPeer?.id) return;
    
    // Find the clicked peer
    const peer = peers.find(p => p.id === peerId);
    if (!peer) return;
    
    // Store selected peer ID for later use
    hmsService.setSelectedPeerId(peerId);
    
    // Try to get profile information
    const profile = userService.getProfileFromPeer(peer);
    const displayName = userService.getDisplayName(peer);
    
    // Check if the selected peer is a creator (can't moderate creators)
    const isPeerCreator = hmsService.hasPeerRole(peerId, USER_ROLES.CREATOR);
    if (isPeerCreator) {
      showErrorMessage('Room creator cannot be moderated');
      return;
    }
    
    // Check if this peer is a cohost
    const isPeerCohost = hmsService.hasPeerRole(peerId, USER_ROLES.COHOST);
    
    // Check if we are the room creator
    const isCreator = hmsService.isRoomCreator();
    
    // Check if we are a cohost (but not creator)
    const isCohost = !isCreator && hmsService.isCohost();
    
    // Don't allow cohosts to moderate other cohosts
    if (isCohost && isPeerCohost) {
      showErrorMessage('Cohosts cannot modify other cohosts');
      return;
    }
    
    // Show action modal
    this.listenerActionModal.classList.remove('hide');
      
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
    
    // Get the description elements
    const promoteDescription = document.getElementById('promote-description');
    const demoteDescription = document.getElementById('demote-description');
    const cohostDescription = document.getElementById('cohost-description');
    
    // Hide all descriptions and buttons by default
    if (promoteDescription) promoteDescription.classList.add('hide');
    if (demoteDescription) demoteDescription.classList.add('hide');
    if (cohostDescription) cohostDescription.classList.add('hide');
    
    this.promoteListenerBtn.classList.add('hide');
    this.demoteSpeakerBtn.classList.add('hide');
    this.makeCoHostBtn.classList.add('hide');
    this.removeCoHostBtn.classList.add('hide');
    
    // Show/hide appropriate buttons and descriptions based on role
    if (role === HMS_ROLES.VIEWER) {
      // Viewer can be promoted to speaker
      this.promoteListenerBtn.classList.remove('hide');
      promoteDescription.classList.remove('hide');
    } else {
      // Speaker can be demoted to viewer
      this.demoteSpeakerBtn.classList.remove('hide');
      demoteDescription.classList.remove('hide');
      
      // TEMPORARILY DISABLED: Cohost functionality due to issues with metadata corruption
      // Only uncomment when the issue is fixed
      /*
      // Only creators can manage cohosts
      if (isCreator) {
        cohostDescription.classList.remove('hide');
        
        if (isPeerCohost) {
          // Already a cohost, show remove button
          this.removeCoHostBtn.classList.remove('hide');
        } else {
          // Not a cohost, show make cohost button
          this.makeCoHostBtn.classList.remove('hide');
        }
      }
      */
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
  
  /**
   * Handle raising hand
   * @param {Event} event - Click event
   */
  async handleRaiseHand(event) {
    event.preventDefault();
    
    try {
      // Disable the button to prevent multiple clicks
      this.raiseHandBtn.disabled = true;
      
      // Set button to raising state
      this.raiseHandBtn.innerHTML = '<span>...</span>';
      
      // Call the HMS service to raise hand
      const success = await hmsService.raiseHand();
      
      if (success) {
        this.raiseHandBtn.innerHTML = '<span>✋</span>';
        showSuccessMessage('Your hand has been raised. If the host sees it, they may invite you to speak.');
        
        // The button will be re-enabled when the hand is automatically lowered after 10 seconds
        // See handleHandRaiseChanged method
      } else {
        showErrorMessage('Failed to raise hand. Please try again.');
        // Re-enable the button
        this.raiseHandBtn.disabled = false;
        this.raiseHandBtn.innerHTML = '<span>✋</span>';
      }
    } catch (error) {
      console.error('Error raising hand:', error);
      showErrorMessage('Failed to raise hand. Please try again.');
      
      // Re-enable the button
      this.raiseHandBtn.disabled = false;
      this.raiseHandBtn.innerHTML = '<span>✋</span>';
    }
  }
  
  /**
   * Handle hand raise changed event
   * @param {CustomEvent} event - Hand raise changed event
   */
  handleHandRaiseChanged(event) {
    const { peerId, isRaised } = event.detail;
    
    // Get the local peer ID
    const localPeer = hmsService.getLocalPeer();
    const isLocalPeer = localPeer && localPeer.id === peerId;
    
    // Update the raise hand button if this is the local peer
    if (isLocalPeer) {
      if (isRaised) {
        this.raiseHandBtn.innerHTML = '<span>✋</span>';
        this.raiseHandBtn.disabled = true;
      } else {
        // Reset the button to its original state
        this.raiseHandBtn.disabled = false;
        this.raiseHandBtn.innerHTML = '<span>✋</span>';
      }
    }
    
    // Update the listeners list to show hand raised indicator
    this.updateHandRaisedIndicator(peerId, isRaised);
    
    // Don't re-render the entire list, which causes flashing
    // Instead, handle the sorting manually
    this.updatePeerOrder();
  }
  
  /**
   * Update peer order without re-rendering everything
   * This prevents the flash that would occur with a full re-render
   */
  updatePeerOrder() {
    // Only apply to the listeners list where raised hands appear
    if (!this.listenersList) return;
    
    // Get all listener elements
    const listenerItems = Array.from(this.listenersList.querySelectorAll('.listener-item'));
    if (listenerItems.length <= 1) return; // No need to sort if only one or zero listeners
    
    // Sort the elements based on hand raised status (raising hands first)
    listenerItems.sort((a, b) => {
      const aRaised = a.querySelector('.hand-raised-badge') !== null;
      const bRaised = b.querySelector('.hand-raised-badge') !== null;
      
      if (aRaised && !bRaised) return -1;
      if (!aRaised && bRaised) return 1;
      return 0;
    });
    
    // Detach all elements but preserve their DOM structure
    listenerItems.forEach(item => {
      this.listenersList.removeChild(item);
    });
    
    // Reattach in the new sorted order
    listenerItems.forEach(item => {
      this.listenersList.appendChild(item);
    });
    
    // No need to reattach handlers because we're not cloning or replacing nodes,
    // just reordering them. The original event handlers remain attached.
  }
  
  /**
   * Update hand raised indicator for a specific peer
   * @param {string} peerId - ID of peer
   * @param {boolean} isRaised - Whether hand is raised
   */
  updateHandRaisedIndicator(peerId, isRaised) {
    // Find the peer element
    const peerElement = document.querySelector(`.listener-item[data-peer-id="${peerId}"]`);
    if (!peerElement) return;
    
    // Find the avatar element
    const avatarElement = peerElement.querySelector('.avatar');
    if (!avatarElement) return;
    
    // Check if there's already a hand raised badge
    let handRaisedBadge = avatarElement.querySelector('.hand-raised-badge');
    
    if (isRaised) {
      // Add the hand raised badge if it doesn't exist
      if (!handRaisedBadge) {
        handRaisedBadge = document.createElement('div');
        handRaisedBadge.className = 'hand-raised-badge';
        handRaisedBadge.textContent = '✋';
        avatarElement.appendChild(handRaisedBadge);
      }
    } else {
      // Remove the hand raised badge if it exists
      if (handRaisedBadge) {
        handRaisedBadge.remove();
      }
    }
  }
  
  /**
   * Handle emoji reaction button click
   * @param {Event} event - Click event
   */
  handleEmojiReactionClick(event) {
    event.preventDefault();
    
    // Check if the user is in cooldown
    const localPeer = hmsService.getLocalPeer();
    if (localPeer) {
      const timeoutInfo = hmsService.getEmojiReactionTimeoutInfo(localPeer.id);
      if (timeoutInfo) {
        // User is in cooldown, show a message and don't open the modal
        showErrorMessage(`Please wait ${timeoutInfo.timeLeft} seconds before sending another reaction`);
        return;
      }
    }
    
    // Show emoji selection modal
    this.emojiReactionModal.classList.remove('hide');
    
    // Add click-outside listener to close the modal
    const closeModalOnOutsideClick = (event) => {
      // Check if the click was outside the modal content
      if (!event.target.closest('.modal-content') && event.target.classList.contains('modal')) {
        this.emojiReactionModal.classList.add('hide');
        document.removeEventListener('click', closeModalOnOutsideClick);
      }
    };
    
    // Use setTimeout to avoid the current click triggering the handler
    setTimeout(() => {
      document.addEventListener('click', closeModalOnOutsideClick);
    }, 10);
  }
  
  /**
   * Handle emoji selected from modal
   * @param {Event} event - Click event
   */
  async handleEmojiSelected(event) {
    const emoji = event.currentTarget.dataset.emoji;
    
    // Close the modal
    this.emojiReactionModal.classList.add('hide');
    
    // Send the emoji reaction
    try {
      const result = await hmsService.sendEmojiReaction(emoji);
      
      if (!result.success) {
        if (result.error === 'rate_limited') {
          showErrorMessage(result.message);
        } else {
          showErrorMessage('Failed to send reaction. Please try again.');
        }
      } else {
        // Disable the emoji reaction button
        if (this.emojiReactionBtn) {
          this.emojiReactionBtn.disabled = true;
          
          // Visual indication of cooldown
          this.emojiReactionBtn.innerHTML = '<span>⏱️</span>';
          
          // Reset after timeout
          setTimeout(() => {
            if (this.emojiReactionBtn) {
              this.emojiReactionBtn.disabled = false;
              this.emojiReactionBtn.innerHTML = '<span>😀</span>';
            }
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Error sending emoji reaction:', error);
    }
  }
  
  /**
   * Handle emoji reaction received
   * @param {CustomEvent} event - Emoji reaction event
   */
  handleEmojiReaction(event) {
    const { emoji, senderId, senderName } = event.detail;
    
    // Initialize tracking if not already done
    if (!this.emojiReactionTimeouts) {
      this.emojiReactionTimeouts = new Map();
    }
    if (!this.activeSenderContainers) {
      this.activeSenderContainers = new Map();
    }
    
    // Generate a unique reaction ID for tracking
    const reactionId = `${senderId}-${Date.now()}`;
    
    // IMPORTANT: Force cleanup of ALL existing emoji containers from this sender
    this.cleanupPreviousEmojis(senderId);
    
    // Create a new container with a random position
    const randomId = Date.now().toString();
    const containerId = `emoji-container-${randomId}`;
    const senderContainer = document.createElement('div');
    senderContainer.className = `reaction-container`;
    senderContainer.dataset.senderId = senderId || 'unknown';
    senderContainer.dataset.reactionId = reactionId;
    senderContainer.id = containerId;
    
    // Position container randomly along the width of the page
    const randomPosition = Math.floor(Math.random() * 85); // 0-85% across the width
    
    senderContainer.style.position = 'absolute';
    senderContainer.style.left = `${randomPosition}%`;
    senderContainer.style.bottom = '0';
    senderContainer.style.width = '180px'; // Wider container for more horizontal spread
    senderContainer.style.height = '500px';
    senderContainer.style.pointerEvents = 'none';
    
    // Track this container for this sender
    if (!this.activeSenderContainers.has(senderId)) {
      this.activeSenderContainers.set(senderId, new Set());
    }
    this.activeSenderContainers.get(senderId).add(containerId);
    
    // Add to DOM after cleanup is complete
    this.emojiContainer.appendChild(senderContainer);
    
    // Set timeout to remove container after animations complete
    const removalTimeout = setTimeout(() => {
      this.cleanupEmojiContainer(containerId, senderId);
    }, 6500);
    
    // Track this timeout for the sender
    if (!this.emojiReactionTimeouts.has(senderId)) {
      this.emojiReactionTimeouts.set(senderId, []);
    }
    this.emojiReactionTimeouts.get(senderId).push(removalTimeout);
    
    // Store the timeout ID on the container for future reference
    senderContainer.dataset.removalTimeout = removalTimeout;
    
    // Create batch of emojis for the reaction
    const count = Math.floor(Math.random() * 6) + 8; // 8-13 emojis
    
    // Create and add all elements immediately but with different animation delays
    for (let i = 0; i < count; i++) {
      // Create emoji element
      const emojiElement = document.createElement('div');
      emojiElement.className = 'flying-emoji';
      emojiElement.textContent = emoji;
      emojiElement.dataset.senderId = senderId;
      emojiElement.dataset.reactionId = reactionId;
      
      // Calculate random position with better distribution
      const xOffset = Math.random() * 160 - 80; // -80px to +80px from center
      emojiElement.style.left = `${xOffset}px`;
      
      // Randomize size slightly
      const size = Math.random() * 15 + 36; // 36-51px (less variation for consistency)
      emojiElement.style.fontSize = `${size}px`;
      
      // Add random rotation amount
      const rotateAmount = (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 20 + 5);
      emojiElement.style.setProperty('--rotate-amt', `${rotateAmount}deg`);
      
      // Set staggered animation delays
      const animDelay = (i / count) * 0.4;
      emojiElement.style.animationDelay = `${animDelay}s`;
      
      // Use consistent animation duration
      emojiElement.style.animationDuration = '5s';
      
      // Add to container immediately
      senderContainer.appendChild(emojiElement);
      
      // Remove emoji after animation completes
      const emojiTimeout = setTimeout(() => {
        if (emojiElement && emojiElement.parentNode) {
          emojiElement.remove();
        }
      }, 5000 + (animDelay * 1000) + 100);
      
      // Track this timeout for cleanup
      this.emojiReactionTimeouts.get(senderId).push(emojiTimeout);
    }
  }
  
  /**
   * Clean up previous emojis from a sender
   * @param {string} senderId - ID of the sender
   */
  cleanupPreviousEmojis(senderId) {
    // Step 1: Remove ALL containers for this sender
    const existingContainers = document.querySelectorAll(`.reaction-container[data-sender-id="${senderId}"]`);
    console.log(`Removing ${existingContainers.length} existing emoji containers for sender ${senderId}`);
    
    existingContainers.forEach(container => {
      // Clear any pending timeouts stored on the container
      if (container.dataset.removalTimeout) {
        clearTimeout(parseInt(container.dataset.removalTimeout));
      }
      
      // Remove the container completely
      container.remove();
    });
    
    // Step 2: Clear all timeouts for this sender
    if (this.emojiReactionTimeouts && this.emojiReactionTimeouts.has(senderId)) {
      const timeoutIds = this.emojiReactionTimeouts.get(senderId);
      timeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
      this.emojiReactionTimeouts.set(senderId, []); // Reset the array but keep the entry
    }
    
    // Step 3: Clear tracking for containers
    if (this.activeSenderContainers && this.activeSenderContainers.has(senderId)) {
      this.activeSenderContainers.set(senderId, new Set()); // Reset the set but keep the entry
    }
    
    // Step 4: Final check for any orphaned flying emojis from this sender
    const allFlyingEmojis = document.querySelectorAll(`.flying-emoji[data-sender-id="${senderId}"]`);
    allFlyingEmojis.forEach(emojiEl => {
      emojiEl.remove();
    });
  }
  
  /**
   * Clean up a specific emoji container
   * @param {string} containerId - ID of the container to clean up
   * @param {string} senderId - ID of the sender for tracking
   */
  cleanupEmojiContainer(containerId, senderId) {
    // Remove the container from the DOM
    const containerToRemove = document.getElementById(containerId);
    if (containerToRemove) {
      containerToRemove.remove();
    }
    
    // Remove from tracking
    if (this.activeSenderContainers && this.activeSenderContainers.has(senderId)) {
      this.activeSenderContainers.get(senderId).delete(containerId);
    }
  }
  
  /**
   * Handle emoji cooldown complete event
   * @param {CustomEvent} event - Emoji cooldown complete event
   */
  handleEmojiCooldownComplete(event) {
    console.log('[DEBUG] Conference received emoji cooldown complete event:', event.detail);
    this.renderPeers();
  }
  
  /**
   * Handle active speaker change event from HMS
   * @param {CustomEvent} event - Active speaker change event
   */
  handleActiveSpeakerChange(event) {
    const { activeSpeakerId, speakingPeers } = event.detail;
    
    console.log('Active speaker changed:', activeSpeakerId);
    
    // Update the UI to reflect the new speaking state
    // This is more efficient than re-rendering all peers
    
    // First, get all speaker avatars
    const speakerAvatars = document.querySelectorAll('.speaker-item .avatar');
    
    // Remove speaking class from all avatars
    speakerAvatars.forEach(avatar => {
      avatar.classList.remove('speaking');
    });
    
    // If there's an active speaker, add the speaking class to their avatar
    if (activeSpeakerId) {
      const activeSpeakerAvatar = document.querySelector(`.speaker-item[data-peer-id="${activeSpeakerId}"] .avatar`);
      if (activeSpeakerAvatar) {
        activeSpeakerAvatar.classList.add('speaking');
      }
    }
  }
  
  /**
   * Initialize chat state
   */
  initChatState() {
    // Initialize chat state
    this.unreadMessages = 0;
    this.isChatOpen = false;
    this.chatUsers = new Map(); // Map to store user info by peer ID
    this.chatTimestamps = new Set(); // Set to prevent duplicate messages
    
    // Update UI
    this.updateChatBadge();
  }
  
  /**
   * Handle close button click
   * @param {Event} event - Click event
   */
  handleCloseButtonClick(event) {
    // Make sure we stop event propagation to prevent other handlers from firing
    event.stopPropagation();
    
    const button = event.currentTarget;
    const modalId = button.dataset.modal;
    
    if (modalId) {
      const modalElement = document.getElementById(modalId);
      modalElement.classList.add('hide');
      
      // Clear selected peer if this is a peer action modal
      if (modalId === 'listener-action-modal') {
        hmsService.clearSelectedPeerId();
      }
      
      // Special handling for chat container
      if (modalId === 'chat-container') {
        this.isChatOpen = false;
        console.log('Chat closed by X button, isChatOpen set to:', this.isChatOpen);
        
        // Handle both class and inline style display
        modalElement.style.display = 'none';
        
        // Remove any existing outside click handler
        document.removeEventListener('click', this.closeOnOutsideClick);
      }
    }
  }

  /**
   * Handle chat button click
   * @param {Event} event - Click event
   */
  handleChatBtnClick(event) {
    event.preventDefault();
    
    console.log('Chat button clicked, current isChatOpen state:', this.isChatOpen);
    
    // Toggle chat container visibility
    this.isChatOpen = !this.isChatOpen;
    
    console.log('Chat button clicked, new isChatOpen state:', this.isChatOpen);
    
    if (this.isChatOpen) {
      // Handle both class and inline style display
      this.chatContainer.classList.remove('hide');
      this.chatContainer.style.display = '';
      
      // Reset unread count and update UI
      this.unreadMessages = 0;
      this.updateChatBadge();
      
      // Focus input field
      setTimeout(() => {
        if (this.chatInput) {
          this.chatInput.focus();
        }
      }, 300);
      
      // Scroll to bottom of messages
      this.scrollChatToBottom();
      
      // Remove any existing outside click handler first
      document.removeEventListener('click', this.closeOnOutsideClick);
      
      // Create the click-outside listener to close the chat
      this.closeOnOutsideClick = (event) => {
        // If the click was outside chat and not on the chat button
        if (!event.target.closest('#chat-container') && 
            !event.target.closest('#chat-btn') &&
            this.chatContainer && 
            !this.chatContainer.classList.contains('hide')) {
          this.chatContainer.classList.add('hide');
          this.chatContainer.style.display = 'none';
          this.isChatOpen = false;
          console.log('Chat closed by outside click, isChatOpen set to:', this.isChatOpen);
          document.removeEventListener('click', this.closeOnOutsideClick);
        }
      };
      
      // Add the listener after a small delay to avoid triggering immediately
      setTimeout(() => {
        document.addEventListener('click', this.closeOnOutsideClick);
      }, 100);
    } else {
      this.chatContainer.classList.add('hide');
      this.chatContainer.style.display = 'none';
    }
  }
  
  /**
   * Handle sending a chat message
   */
  async handleChatSend() {
    if (!this.chatInput || !this.chatInput.value.trim()) return;
    
    const messageText = this.chatInput.value.trim();
    
    try {
      // Try to send the message
      const result = await hmsService.sendChatMessage(messageText);
      
      if (result.success) {
        // Clear input field
        this.chatInput.value = '';
        this.chatInput.focus();
      } else if (result.error === 'rate_limited') {
        showErrorMessage(result.message);
      } else {
        showErrorMessage('Failed to send message. Please try again.');
      }
    } catch (error) {
      console.error('Error sending chat message:', error);
      showErrorMessage('Failed to send message. Please try again.');
    }
  }
  
  /**
   * Handle received chat message
   * @param {CustomEvent} event - Chat message event
   */
  handleChatMessage(event) {
    const { messageData, senderId, senderName, timestamp } = event.detail;
    
    // Check if this is a local message
    const localPeer = hmsService.getLocalPeer();
    const isLocalMessage = localPeer && localPeer.id === senderId;
    
    // Generate a unique message ID based on content and timestamp to avoid duplicates
    const messageId = `${senderId}-${timestamp}-${messageData.text.substring(0, 20)}`;
    
    // Check if we've already rendered this message
    if (this.chatTimestamps.has(messageId)) {
      return;
    }
    
    // Mark message as processed
    this.chatTimestamps.add(messageId);
    
    // Format the timestamp
    const messageTime = new Date(timestamp || messageData.timestamp || Date.now());
    const formattedTime = messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${isLocalMessage ? 'outgoing' : 'incoming'}`;
    
    // Store user info for this peer if not already stored
    if (senderId && !this.chatUsers.has(senderId)) {
      this.chatUsers.set(senderId, { 
        name: senderName || 'Unknown User',
        isLocalUser: isLocalMessage
      });
    }
    
    // Show sender name for incoming messages only
    if (!isLocalMessage) {
      const senderElement = document.createElement('div');
      senderElement.className = 'message-sender';
      senderElement.textContent = this.chatUsers.get(senderId)?.name || senderName || 'Unknown User';
      messageElement.appendChild(senderElement);
    }
    
    // Message content
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.textContent = messageData.text;
    messageElement.appendChild(contentElement);
    
    // Message timestamp
    const timeElement = document.createElement('div');
    timeElement.className = 'message-time';
    timeElement.textContent = formattedTime;
    messageElement.appendChild(timeElement);
    
    // Add to chat container
    this.chatMessages.appendChild(messageElement);
    
    // Increment unread count if chat is not open
    if (!this.isChatOpen) {
      this.unreadMessages++;
      this.updateChatBadge();
    }
    
    // Scroll to bottom
    this.scrollChatToBottom();
  }
  
  /**
   * Handle chat cooldown complete event
   * @param {CustomEvent} event - Chat cooldown complete event
   */
  handleChatCooldownComplete(event) {
    // No need to do anything here, the button is never disabled
  }
  
  /**
   * Scroll chat to bottom
   */
  scrollChatToBottom() {
    if (this.chatMessages) {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
  }
  
  /**
   * Update the chat badge with unread count
   */
  updateChatBadge() {
    if (!this.chatBadge) return;
    
    if (this.unreadMessages > 0) {
      this.chatBadge.textContent = this.unreadMessages > 99 ? '99+' : this.unreadMessages;
      this.chatBadge.classList.remove('hide');
      this.chatBtn.classList.add('chat-btn-active');
    } else {
      this.chatBadge.classList.add('hide');
      this.chatBtn.classList.remove('chat-btn-active');
    }
  }
  
  /**
   * Clean up chat state and DOM elements
   */
  cleanupChat() {
    // Clear message container
    if (this.chatMessages) {
      this.chatMessages.innerHTML = '';
    }
    
    // Reset state
    this.unreadMessages = 0;
    this.isChatOpen = false;
    this.chatUsers = new Map();
    this.chatTimestamps = new Set();
    
    // Update UI
    this.updateChatBadge();
    
    // Hide chat container using both class and inline style
    if (this.chatContainer) {
      this.chatContainer.classList.add('hide');
      this.chatContainer.style.display = 'none';
    }
    
    // Remove any click-outside listeners
    if (this.closeOnOutsideClick) {
      document.removeEventListener('click', this.closeOnOutsideClick);
    }
  }
  
  /**
   * Handle making a peer a cohost
   */
  async handleMakeCohost() {
    const selectedPeerId = hmsService.getSelectedPeerId();
    if (!selectedPeerId) return;
    
    try {
      // Close the modal first
      this.listenerActionModal.classList.add('hide');
      
      // Make the peer a cohost
      const success = await hmsService.makePeerCohost(selectedPeerId);
      
      if (success) {
        // Update the UI
        this.renderPeers();
      }
      
      // Clear the selected peer
      hmsService.clearSelectedPeerId();
    } catch (error) {
      console.error('Error making peer cohost:', error);
      showErrorMessage('Failed to make peer a cohost');
    }
  }
  
  /**
   * Handle removing cohost status from a peer
   */
  async handleRemoveCohost() {
    const selectedPeerId = hmsService.getSelectedPeerId();
    if (!selectedPeerId) return;
    
    try {
      // Close the modal first
      this.listenerActionModal.classList.add('hide');
      
      // Remove cohost status
      const success = await hmsService.removePeerCohost(selectedPeerId);
      
      if (success) {
        // Update the UI
        this.renderPeers();
      }
      
      // Clear the selected peer
      hmsService.clearSelectedPeerId();
    } catch (error) {
      console.error('Error removing peer cohost status:', error);
      showErrorMessage('Failed to update cohost status');
    }
  }
}

export default Conference; 