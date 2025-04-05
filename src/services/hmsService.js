import {
  HMSReactiveStore,
  selectIsLocalAudioEnabled,
  selectIsLocalVideoEnabled,
  selectPeers,
  selectIsConnectedToRoom,
  selectVideoTrackByID,
  selectLocalPeer,
  selectIsPeerAudioEnabled,
  selectAudioTrackByPeerID,
  selectPeerAudioByID,
} from "@100mslive/hms-video-store";

import { HMS_ROLES, SPEAKING_THRESHOLD, DELAYS } from '../config.js';
import { showErrorMessage, showSuccessMessage } from '../utils/uiUtils.js';
import { getMicrophonePermission, unlockIOSAudio, isIOSBrowser } from '../utils/audioUtils.js';

// Storage for current room state
let currentRoomId = null;
let roomStartTime = null;
let roomDurationInterval = null;
let roomCreatorFid = null;
const speakingPeers = new Map();
let speakingUpdateInterval;

/**
 * Service for 100ms integration
 */
class HMSService {
  constructor() {
    // Initialize HMS Store
    this.manager = new HMSReactiveStore();
    this.manager.triggerOnSubscribe();
    this.store = this.manager.getStore();
    this.actions = this.manager.getActions();
    
    // Configure HMS
    this.actions.setLogLevel('warn');
    
    // Setup internal state
    this.selectedPeerId = null;
    this.renderedPeerIDs = new Set();
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  /**
   * Setup internal event listeners
   */
  setupEventListeners() {
    // Listen for the custom 'roomDisabled' event
    window.addEventListener('roomDisabled', this.handleRoomDisabled.bind(this));
    
    // Listen for before unload to clean up
    window.onbeforeunload = this.leaveRoom.bind(this);
  }
  
  /**
   * Handles room disabled events
   * @param {CustomEvent} event - Room disabled event
   */
  async handleRoomDisabled(event) {
    console.log('Received roomDisabled event:', event.detail);
    
    try {
      // Only handle this if we're not the creator
      if (this.isRoomCreator()) {
        console.log('Ignoring roomDisabled event as we are the creator');
        return;
      }
      
      // Check if the disabled room matches our current room
      const localPeer = this.store.getState(selectLocalPeer);
      const ourRoomId = this.getCurrentRoomId() || localPeer?.roomId;
      
      if (ourRoomId && ourRoomId === event.detail.roomId) {
        console.log('Our current room has been ended by the host');
        
        // Show message to user
        showErrorMessage('The room has been ended by the host. You will be disconnected.');
        
        // Leave the room
        try {
          await this.actions.leave();
          console.log('Successfully left ended room');
          
          // Return to rooms list view is handled by the connection state subscription
        } catch (error) {
          console.error('Error leaving ended room:', error);
        }
      }
    } catch (error) {
      console.error('Error handling roomDisabled event:', error);
    }
  }

  /**
   * Join a room as a viewer/listener
   * @param {Object} params - Join parameters
   * @returns {Promise<void>}
   */
  async joinAsViewer({ roomCode, userName, metaData }) {
    try {
      const authToken = await this.actions.getAuthTokenByRoomCode({ roomCode });
      
      await this.actions.join({
        userName,
        authToken,
        role: HMS_ROLES.VIEWER,
        settings: {
          isAudioMuted: true, // Viewers start muted
          isVideoMuted: true, // No video needed for audio rooms
        },
        rememberDeviceSelection: true,
        metaData: JSON.stringify(metaData),
        onError: (error) => {
          console.error("HMS join error:", error);
          throw error;
        }
      });
      
      // Try to unlock iOS audio
      if (isIOSBrowser()) {
        unlockIOSAudio();
      }
    } catch (error) {
      console.error('Failed to join room:', error);
      throw error;
    }
  }

  /**
   * Join a room as a streamer/speaker
   * @param {Object} params - Join parameters
   * @returns {Promise<void>}
   */
  async joinAsStreamer({ roomCode, userName, metaData }) {
    try {
      const authToken = await this.actions.getAuthTokenByRoomCode({ roomCode });
      
      // For streamers, we start muted and then unmute after join
      // This helps avoid permissions and initialization issues
      await this.actions.join({
        userName,
        authToken,
        role: HMS_ROLES.STREAMER,
        settings: {
          isAudioMuted: true, // Start muted, will unmute after join
          isVideoMuted: true, // No video needed for audio rooms
        },
        rememberDeviceSelection: true,
        metaData: JSON.stringify(metaData),
        onError: (error) => {
          console.error("HMS join error:", error);
          throw error;
        }
      });
      
      // Try to unlock iOS audio
      if (isIOSBrowser()) {
        unlockIOSAudio();
      }
      
      // Wait for connection before trying to unmute for creators
      if (metaData.isCreator) {
        this.scheduleCreatorUnmute();
      }
    } catch (error) {
      console.error('Failed to join room:', error);
      throw error;
    }
  }
  
  /**
   * Schedule unmuting audio for a creator after joining
   */
  scheduleCreatorUnmute() {
    setTimeout(async () => {
      try {
        console.log('Starting delayed audio setup process...');
        
        // Ensure microphone permission is granted
        const hasPermission = await getMicrophonePermission();
        
        // Force unmute after getting permission
        await this.forceUnmute();
        
        // Add a final check after a delay
        setTimeout(async () => {
          const isAudioEnabled = this.store.getState(selectIsLocalAudioEnabled);
          console.log('Final audio state check:', isAudioEnabled ? 'UNMUTED' : 'MUTED');
          
          if (!isAudioEnabled) {
            console.log('Audio still muted after all unmute attempts, trying one more time');
            await this.actions.setLocalAudioEnabled(true);
          }
        }, 1000);
      } catch (error) {
        console.error('Post-join unmute error:', error);
        showErrorMessage('Unable to unmute automatically. Please click the Unmute button.');
      }
    }, DELAYS.CREATOR_UNMUTE);
  }
  
  /**
   * Force unmuting with multiple fallback strategies
   * @returns {Promise<boolean>} Whether unmute was successful
   */
  async forceUnmute() {
    console.log('Running force unmute operations');
    const localPeer = this.store.getState(selectLocalPeer);
    
    try {
      // Standard method
      await this.actions.setLocalAudioEnabled(true);
      console.log('Standard unmute method completed');
      
      // Track-specific method
      if (localPeer?.id) {
        const audioTrack = this.store.getState(selectAudioTrackByPeerID(localPeer.id));
        if (audioTrack?.id) {
          await this.actions.setEnabledTrack(audioTrack.id, true);
          console.log('Track-specific unmute completed');
        }
      }
      
      // Direct track access method
      if (localPeer?.audioTrack) {
        await this.actions.setEnabledTrack(localPeer.audioTrack, true);
        console.log('Direct track unmute completed');
      }
      
      // Force new publish if needed
      try {
        if (navigator.mediaDevices) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (stream && stream.getAudioTracks().length > 0) {
            const track = stream.getAudioTracks()[0];
            console.log('Got new audio track from getUserMedia');
            track.enabled = true;
            // Release the track after a short delay
            setTimeout(() => track.stop(), 500);
          }
        }
      } catch (mediaError) {
        console.warn('Error getting media stream:', mediaError);
      }
      
      console.log('Force unmute operations completed');
      
      // Check if successful
      const isEnabled = this.store.getState(selectIsLocalAudioEnabled);
      return isEnabled;
    } catch (error) {
      console.error('Force unmute error:', error);
      return false;
    }
  }

  /**
   * Leave the current room
   * @returns {Promise<void>}
   */
  async leaveRoom() {
    try {
      // Before leaving, check if the user is the creator of the room
      const localPeer = this.store.getState(selectLocalPeer);
      
      // If no local peer, just leave
      if (!localPeer) {
        await this.actions.leave();
        return;
      }
      
      // Check multiple ways to determine if this user is the creator
      let isCreator = this.isRoomCreator();
      
      // If user is the creator, offer to disable the room
      if (isCreator) {
        // Get required info for disabling the room
        const roomId = localPeer.roomId;
        
        // This will be handled by the component that calls leaveRoom
        // The component will be responsible for calling the api to disable the room
        // if the user chooses to do so
        return { isCreator, roomId };
      }
      
      // Leave the room
      await this.actions.leave();
      
      // Clean up room timer
      this.stopRoomTimer();
      
      return { isCreator: false };
    } catch (error) {
      console.error('Error leaving room:', error);
      throw error;
    }
  }

  /**
   * Toggle audio mute state
   * @returns {Promise<boolean>} New audio state
   */
  async toggleAudio() {
    try {
      // Check current state
      const currentlyEnabled = this.store.getState(selectIsLocalAudioEnabled);
      const audioEnabled = !currentlyEnabled;
      
      // Get local peer
      const localPeer = this.store.getState(selectLocalPeer);
      const isStreamer = localPeer?.roleName === HMS_ROLES.STREAMER;
      
      // Special handling for unmuting streamers
      if (isStreamer && audioEnabled) {
        console.log('Special handling for streamer unmute');
        
        // Try to unmute with all available methods
        const success = await this.forceUnmute();
        
        if (success) {
          showSuccessMessage('Microphone unmuted');
        } else {
          showErrorMessage('Audio unmute issue detected. Try leaving and rejoining if you still can\'t speak.');
        }
        
        return success;
      } else {
        // Standard mute/unmute for regular operations
        await this.actions.setLocalAudioEnabled(audioEnabled);
        
        // Verify the operation worked
        const newState = this.store.getState(selectIsLocalAudioEnabled);
        return newState;
      }
    } catch (error) {
      console.error('Error toggling audio:', error);
      showErrorMessage('Failed to change audio state. Please try again.');
      return this.store.getState(selectIsLocalAudioEnabled);
    }
  }

  /**
   * Change role of a peer
   * @param {string} peerId - ID of peer to change role
   * @param {string} newRole - New role to assign
   * @returns {Promise<void>}
   */
  async changeRole(peerId, newRole) {
    try {
      // Use the 100ms SDK to change role directly
      await this.actions.changeRoleOfPeer(peerId, newRole, true);
    } catch (error) {
      console.error(`Failed to change role to ${newRole}:`, error);
      throw error;
    }
  }

  /**
   * Check if the local user is the room creator
   * @returns {boolean} Whether local user is room creator
   */
  isRoomCreator() {
    const localPeer = this.store.getState(selectLocalPeer);
    if (!localPeer || !localPeer.metadata) return false;
    
    try {
      const metadata = JSON.parse(localPeer.metadata);
      return metadata.isCreator === true;
    } catch (e) {
      console.warn('Error checking if user is room creator:', e);
      return false;
    }
  }

  /**
   * Enable remote track
   * @param {string} trackId - ID of track to enable
   * @param {boolean} enabled - Whether to enable or disable
   * @returns {Promise<void>}
   */
  async setRemoteTrackEnabled(trackId, enabled) {
    if (!trackId) return;
    
    try {
      await this.actions.setRemoteTrackEnabled(trackId, enabled);
    } catch (error) {
      console.error('Failed to set remote track enabled:', error);
    }
  }

  /**
   * Start the speaking detection interval
   */
  startSpeakingDetection() {
    if (speakingUpdateInterval) {
      clearInterval(speakingUpdateInterval);
    }
    
    speakingUpdateInterval = setInterval(() => {
      this.updateSpeakingStatus();
    }, 500);
  }

  /**
   * Stop the speaking detection interval
   */
  stopSpeakingDetection() {
    if (speakingUpdateInterval) {
      clearInterval(speakingUpdateInterval);
      speakingUpdateInterval = null;
    }
    
    // Clear speaking state
    speakingPeers.clear();
  }

  /**
   * Update speaking status for all peers
   */
  updateSpeakingStatus() {
    const peers = this.store.getState(selectPeers);
    
    peers.forEach(peer => {
      // For creators/streamers, skip the audio track check for the first 10 seconds
      const isStreamer = peer.roleName === HMS_ROLES.STREAMER;
      const peerJoinTime = peer.joinedAt ? peer.joinedAt.getTime() : 0;
      const currentTime = new Date().getTime();
      const timeSinceJoin = currentTime - peerJoinTime;
      const isRecentlyJoined = timeSinceJoin < 10000; // 10 seconds
      
      // Special handling for streamers who recently joined
      if (isStreamer && isRecentlyJoined && !peer.audioTrack) {
        // Don't show as muted yet during initialization
        return;
      }
      
      // Skip peers with no audio track or muted peers
      if (!peer.audioTrack || !peer.audioEnabled) {
        speakingPeers.set(peer.id, false);
        return;
      }
      
      try {
        // Get audio level for the peer
        const audioLevel = this.store.getState(selectPeerAudioByID(peer.id)) || 0;
        
        // Consider speaking if audio level is above threshold
        const isSpeaking = audioLevel > SPEAKING_THRESHOLD;
        
        // Update speaking state
        speakingPeers.set(peer.id, isSpeaking);
      } catch (e) {
        console.warn(`Error checking audio for peer ${peer.id}:`, e);
      }
    });
    
    // Check for room creator
    if (!roomCreatorFid) {
      peers.forEach(peer => {
        try {
          if (peer.metadata) {
            const metadata = JSON.parse(peer.metadata);
            if (metadata.isCreator === true && metadata.fid) {
              roomCreatorFid = metadata.fid.toString();
              console.log(`Room creator identified: FID ${roomCreatorFid}`);
            }
          }
        } catch (e) {
          // Ignore parsing errors
        }
      });
    }
  }

  /**
   * Start room timer
   */
  startRoomTimer() {
    if (roomStartTime) return; // Already started
    
    roomStartTime = new Date();
    this.updateRoomDuration();
    
    // Update duration every second
    roomDurationInterval = setInterval(() => {
      this.updateRoomDuration();
    }, 1000);
  }

  /**
   * Stop room timer
   */
  stopRoomTimer() {
    if (roomDurationInterval) {
      clearInterval(roomDurationInterval);
      roomDurationInterval = null;
    }
    roomStartTime = null;
  }

  /**
   * Update room duration
   */
  updateRoomDuration() {
    if (!roomStartTime) return;
    
    const now = new Date();
    const diffMs = now - roomStartTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    const formattedDuration = `${diffMins.toString().padStart(2, '0')}:${diffSecs.toString().padStart(2, '0')}`;
    
    // Return the formatted duration - UI will handle display
    return formattedDuration;
  }

  /**
   * Store current room ID
   * @param {string} roomId - Room ID to store
   */
  setCurrentRoomId(roomId) {
    if (roomId) {
      console.log('Setting current room ID:', roomId);
      currentRoomId = roomId;
      
      // Also save to localStorage as backup
      try {
        localStorage.setItem('fariscope_current_room_id', roomId);
      } catch (e) {
        console.warn('Could not save room ID to localStorage:', e);
      }
    }
  }

  /**
   * Get current room ID
   * @returns {string|null} Current room ID if available
   */
  getCurrentRoomId() {
    // If we have currentRoomId in memory, use that first
    if (currentRoomId) {
      return currentRoomId;
    }
    
    // Try to get from localStorage as backup
    try {
      const savedRoomId = localStorage.getItem('fariscope_current_room_id');
      if (savedRoomId) {
        console.log('Recovered room ID from localStorage:', savedRoomId);
        return savedRoomId;
      }
    } catch (e) {
      console.warn('Could not get room ID from localStorage:', e);
    }
    
    return null;
  }

  /**
   * Get room duration for UI
   * @returns {string} Formatted room duration
   */
  getRoomDuration() {
    return this.updateRoomDuration() || '00:00';
  }

  /**
   * Check if a peer is speaking
   * @param {string} peerId - ID of peer to check
   * @returns {boolean} Whether peer is speaking
   */
  isPeerSpeaking(peerId) {
    return speakingPeers.get(peerId) || false;
  }

  /**
   * Get the speaking peers map
   * @returns {Map<string, boolean>} Map of peer IDs to speaking state
   */
  getSpeakingPeers() {
    return speakingPeers;
  }

  /**
   * Set the selected peer ID for moderation
   * @param {string} peerId - ID of peer to select
   */
  setSelectedPeerId(peerId) {
    this.selectedPeerId = peerId;
  }

  /**
   * Get the selected peer ID
   * @returns {string|null} Selected peer ID if available
   */
  getSelectedPeerId() {
    return this.selectedPeerId;
  }

  /**
   * Clear the selected peer ID
   */
  clearSelectedPeerId() {
    this.selectedPeerId = null;
  }
}

// Create and export a singleton instance
const hmsService = new HMSService();
export default hmsService; 