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
import { showErrorMessage, showSuccessMessage, updateMuteButtonUI } from '../utils/uiUtils.js';

/**
 * Conference component for managing audio conference UI and interactions
 */
class Conference {
  constructor() {
    // DOM elements
    this.roomTitle = document.getElementById(DOM_IDS.ROOM_TITLE);
    this.roomDuration = document.getElementById(DOM_IDS.ROOM_DURATION);
    this.speakersList = document.getElementById(DOM_IDS.SPEAKERS_LIST);
    this.listenersList = document.getElementById(DOM_IDS.LISTENERS_LIST);
    this.listenersCount = document.getElementById(DOM_IDS.LISTENERS_COUNT);
    this.hostControls = document.getElementById(DOM_IDS.HOST_CONTROLS);
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
      const { isCreator, roomId } = await hmsService.leaveRoom();
      
      if (isCreator && roomId) {
        // Ask user if they want to end the room for everyone
        const shouldDisable = confirm('Do you want to end this room for everyone? Click Cancel to leave without ending the room.');
        
        if (shouldDisable) {
          try {
            const fid = farcasterService.getUserFid();
            const address = await farcasterService.getWalletAddress() || document.getElementById(DOM_IDS.ETH_ADDRESS_INPUT)?.value || '';
            
            if (!fid || !address) {
              throw new Error('Missing required credentials to end the room');
            }
            
            // This will be implemented by the caller
            const apiDisableResult = await window.apiService.disableRoom(roomId, address, fid);
            showSuccessMessage('Room ended successfully for everyone.');
          } catch (disableError) {
            console.error('Failed to disable room:', disableError);
            showErrorMessage('Failed to end the room, but you have been disconnected.');
          }
        }
      }
      
      // Leave the room
      await hmsService.actions.leave();
      hmsService.stopRoomTimer();
      
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
      const result = await hmsService.leaveRoom();
      
      // If user is creator, ask if they want to end room
      if (result && result.isCreator && result.roomId) {
        // Ask user if they want to end the room for everyone
        const shouldDisable = confirm('Do you want to end this room for everyone? Click Cancel to leave without ending the room.');
        
        if (shouldDisable) {
          try {
            const fid = farcasterService.getUserFid();
            const address = await farcasterService.getWalletAddress() || document.getElementById(DOM_IDS.ETH_ADDRESS_INPUT)?.value || '';
            
            if (!fid || !address) {
              throw new Error('Missing required credentials to end the room');
            }
            
            await window.apiService.disableRoom(result.roomId, address, fid);
            showSuccessMessage('Room ended successfully for everyone.');
          } catch (disableError) {
            console.error('Failed to disable room:', disableError);
            showErrorMessage('Failed to end the room, but you have been disconnected.');
          }
        }
      }
      
      // Leave the room
      await hmsService.actions.leave();
      
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
      form.classList.add("hide");
      roomsList.classList.add("hide");
      this.conferenceEl.classList.remove("hide");
      
      // Show/hide controls based on role
      this.updateControlsVisibility();
      
      // Start the speaking detection interval
      hmsService.startSpeakingDetection();
      
      // If we're on iOS, try to unlock audio again
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        setTimeout(() => {
          console.log('Attempting to unlock iOS audio after successful room join');
          window.unlockIOSAudio?.();
        }, 500);
      }
    } else {
      // Hide conference UI
      this.conferenceEl.classList.add("hide");
      this.controls.classList.add("hide");
      
      // Return to room list
      roomsList.classList.remove("hide");
      
      // Stop the speaking detection interval
      hmsService.stopSpeakingDetection();
      
      // Reset selected peer
      hmsService.clearSelectedPeerId();
      
      // Close any open modals
      document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.add('hide');
      });
      
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
    const peers = hmsService.store.getState(selectPeers);
    const localPeer = hmsService.store.getState(selectLocalPeer);
    
    if (!peers.length) return;
    
    // Set room title based on the room description if available
    const localPeerRoom = localPeer?.roomId;
    
    // Try to get the current room details from any active room element
    const activeRoomElement = document.querySelector('.room-item.active-room');
    if (activeRoomElement) {
      const roomDescription = activeRoomElement.querySelector('.room-title')?.textContent;
      if (roomDescription) {
        this.roomTitle.textContent = roomDescription;
      }
    }
    
    // Fallback to streamer name if no room description is available
    if (!this.roomTitle.textContent) {
      const streamer = peers.find(peer => peer.roleName === HMS_ROLES.STREAMER);
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
      // Check role name
      if (peer.roleName === HMS_ROLES.STREAMER) return true;
      
      // Check metadata for creator flag as fallback
      try {
        if (peer.metadata) {
          const metadata = JSON.parse(peer.metadata);
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
    if (speakers.length && !roomStartTime) {
      hmsService.startRoomTimer();
    }
    
    // Update room duration display
    this.roomDuration.textContent = hmsService.getRoomDuration();
    
    // Check if we're the host (streamer role) AND the creator
    const isHost = localPeer?.roleName === HMS_ROLES.STREAMER;
    
    // Check if we're the creator of the room
    const isCreator = hmsService.isRoomCreator();
    
    // Show host controls only if user is a streamer
    this.hostControls.classList.toggle('hide', !isHost);
    
    // Only show End Room button if the user is the room creator
    if (this.endRoomBtn) {
      this.endRoomBtn.classList.toggle('hide', !isCreator);
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
      const profile = userService.getProfileFromPeer(speaker);
      const displayName = userService.getDisplayName(speaker);
      const isLocal = speaker.id === localPeer?.id;
      
      // Get accurate mute state - for local peer, use the global state selector
      let isMuted;
      if (isLocal) {
        // For local peer, use the most reliable source of truth
        isMuted = !hmsService.store.getState(selectIsLocalAudioEnabled);
      } else {
        // For remote peers, use their peer object state
        isMuted = !speaker.audioEnabled;
      }
      
      const isHost = true; // All speakers are hosts in this app
      const isSpeaking = hmsService.isPeerSpeaking(speaker.id);
      
      // Check if we have a profile picture
      const hasPfp = profile && profile.pfpUrl;
      const avatarContent = hasPfp 
        ? `<img src="${profile.pfpUrl}" alt="${displayName}" />`
        : speaker.name.charAt(0).toUpperCase();
      
      // Only show mute badge for local user
      const showMuteBadge = isLocal && isMuted;
      
      // Only show interaction hint for non-local peers if user is creator
      const showInteractionHint = !isLocal && userIsCreator;
      
      return `
        <div class="speaker-item" data-peer-id="${speaker.id}" data-role="${HMS_ROLES.STREAMER}" title="${userIsCreator && !isLocal ? 'Click to manage this speaker' : ''}">
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
    if (localPeer?.roleName === HMS_ROLES.STREAMER) {
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
      const profile = userService.getProfileFromPeer(listener);
      const displayName = userService.getDisplayName(listener);
      const isLocal = listener.id === localPeer?.id;
      
      // Get accurate mute state - for local peer, use the global state selector
      let isMuted;
      if (isLocal) {
        // For local peer, use the most reliable source of truth
        isMuted = !hmsService.store.getState(selectIsLocalAudioEnabled);
      } else {
        // For remote peers, use their peer object state
        isMuted = !listener.audioEnabled;
      }
      
      const isSpeaking = hmsService.isPeerSpeaking(listener.id);
      
      // Check if we have a profile picture
      const hasPfp = profile && profile.pfpUrl;
      const avatarContent = hasPfp 
        ? `<img src="${profile.pfpUrl}" alt="${displayName}" />`
        : listener.name.charAt(0).toUpperCase();
      
      // Only show mute badge for local user
      const showMuteBadge = isLocal && isMuted;
      
      // Only show interaction hint for non-local peers if user is creator
      const showInteractionHint = !isLocal && userIsCreator;
      
      return `
        <div class="listener-item" data-peer-id="${listener.id}" data-role="${HMS_ROLES.VIEWER}" title="${userIsCreator && !isLocal ? 'Click to invite this listener to speak' : ''}">
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
}

export default Conference; 