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
  selectLocalPeerID,
  selectHasPeerHandRaised,
  HMSNotificationTypes,
  selectBroadcastMessages,
  selectDominantSpeaker,
  selectPeerMetadata,
} from "@100mslive/hms-video-store";

import { HMS_ROLES, USER_ROLES, SPEAKING_THRESHOLD, DELAYS, DEBUG_MODE, DEBUG_ROOM } from '../config.js';
import { showErrorMessage, showSuccessMessage } from '../utils/uiUtils.js';
import { getMicrophonePermission, unlockIOSAudio, isIOSBrowser } from '../utils/audioUtils.js';
import { generateMockUsers } from '../utils/mockData.js';

// Storage for current room state
let currentRoomId = null;
let roomStartTime = null;
let roomDurationInterval = null;
let roomCreatorFid = null;
const speakingPeers = new Map();
let speakingUpdateInterval;

// Debug mode variables
let debugMockPeers = [];
let isDebugRoomActive = false;

// Raised hand state
const raisedHandPeers = new Map();
const handRaiseTimers = new Map();
const HAND_RAISE_DURATION = 15000; // 15 seconds

// Emoji reaction rate limiting
const emojiReactionTimers = new Map();
const EMOJI_REACTION_TIMEOUT = 2000; // 2 seconds

// Chat message rate limiting
const chatMessageTimers = new Map();
const CHAT_MESSAGE_TIMEOUT = 1000; // 1 second

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
    this.actions.setLogLevel(DEBUG_MODE ? 'debug' : 'warn');
    
    // Setup internal state
    this.selectedPeerId = null;
    this.renderedPeerIDs = new Set();
    this.originalIdentity = null; // To track original user identity
    
    // Important subscription to track local peer data for safety
    this.store.subscribe(localPeer => {
      if (localPeer && localPeer.id) {
        // If we don't have the original identity yet, save it
        if (!this.originalIdentity && localPeer.metadata) {
          try {
            const metadata = typeof localPeer.metadata === 'string' ? 
              JSON.parse(localPeer.metadata) : localPeer.metadata;
            
            if (metadata.isCreator === true) {
              // Save the creator identity for protection
              this.originalIdentity = {
                id: localPeer.id,
                name: localPeer.name,
                isCreator: true,
                metadata: JSON.stringify(metadata)
              };
              console.log('Saved original creator identity:', this.originalIdentity);
            }
          } catch (e) {
            console.warn('Error parsing local peer metadata in constructor:', e);
          }
        }
      }
    }, selectLocalPeer);
    
    // Initialize debug mode
    if (DEBUG_MODE && DEBUG_ROOM.enabled) {
      this.initDebugMode();
    }
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Setup hand raise notifications
    this.setupHandRaiseNotifications();
    
    // Setup message listeners
    this.setupMessageListeners();
    
    // Setup active speaker detection
    this.setupActiveSpeakerDetection();
  }
  
  /**
   * Setup active speaker detection using ON_SPEAKER notifications
   */
  setupActiveSpeakerDetection() {
    if (DEBUG_MODE && DEBUG_ROOM.enabled) {
      // Debug mode doesn't need real HMS notifications
      return;
    }
    
    // Subscribe to ON_SPEAKER notifications via the dominant speaker selector
    this.store.subscribe(dominantSpeaker => {
      if (dominantSpeaker) {
        console.log('Dominant speaker changed:', dominantSpeaker);
        
        // Update the speakingPeers map based on dominant speaker
        const peers = this.getPeers();
        
        // Set all peers as not speaking
        peers.forEach(peer => {
          speakingPeers.set(peer.id, false);
        });
        
        // Set the dominant speaker as speaking
        speakingPeers.set(dominantSpeaker.id, true);
        
        // Dispatch an event to notify the conference component
        document.dispatchEvent(new CustomEvent('active-speaker-changed', {
          detail: { 
            activeSpeakerId: dominantSpeaker.id, // Use the id property directly instead of peerId
            speakingPeers: Array.from(speakingPeers.entries())
          }
        }));
      }
    }, selectDominantSpeaker);
  }
  
  /**
   * Initialize debug mode with mock peers
   */
  initDebugMode() {
    console.log('[DEBUG] Initializing debug mode for HMS service');
    
    // Generate mock peers for debug mode
    debugMockPeers = generateMockUsers(DEBUG_ROOM.participantCount, true, DEBUG_ROOM.creatorFid);
    
    // Make one peer local
    if (debugMockPeers.length > 1) {
      debugMockPeers[1].isLocal = true;
      debugMockPeers[1].name = 'You (Debug)';
      debugMockPeers[1].audioEnabled = true;
    }
    
    // Setup speaking detection simulation for debug mode
    if (DEBUG_MODE) {
      setInterval(() => {
        if (isDebugRoomActive) {
          this.simulateSpeakingForDebug();
        }
      }, 2000);
    }
  }
  
  /**
   * Simulate speaking indicators for debug mode
   */
  simulateSpeakingForDebug() {
    // Randomly toggle speaking status for a few peers
    debugMockPeers.forEach(peer => {
      if (peer.role === HMS_ROLES.STREAMER && Math.random() > 0.7) {
        peer.isSpeaking = !peer.isSpeaking;
        speakingPeers.set(peer.id, peer.isSpeaking);
      }
    });
    
    // Find any speaking peer
    const speakingSpeakers = debugMockPeers.filter(
      peer => peer.role === HMS_ROLES.STREAMER && peer.isSpeaking
    );
    
    // If we have speaking peers, dispatch an active-speaker-changed event
    if (speakingSpeakers.length > 0) {
      // Randomly select one of the speaking peers as the "dominant" speaker
      const randomIndex = Math.floor(Math.random() * speakingSpeakers.length);
      const dominantSpeaker = speakingSpeakers[randomIndex];
      
      document.dispatchEvent(new CustomEvent('active-speaker-changed', {
        detail: { 
          activeSpeakerId: dominantSpeaker.id,
          speakingPeers: Array.from(speakingPeers.entries())
        }
      }));
    }
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
      // Handle debug mode
      if (DEBUG_MODE && DEBUG_ROOM.enabled) {
        console.log('[DEBUG] Joining debug room as viewer');
        
        // Set room id and start time
        currentRoomId = DEBUG_ROOM.roomId;
        roomStartTime = new Date();
        isDebugRoomActive = true;
        
        // Start room timer
        this.startRoomTimer();
        
        // Start speaking detection
        this.startSpeakingDetection();
        
        // Ensure the local peer has isLocal set to true
        if (debugMockPeers.length > 0) {
          // Find a suitable peer to set as local
          const localPeerIndex = debugMockPeers.findIndex(p => !p.isCreator) || 0;
          if (localPeerIndex >= 0) {
            // Reset isLocal flag for all peers
            debugMockPeers.forEach(p => p.isLocal = false);
            // Set the selected peer as local
            debugMockPeers[localPeerIndex].isLocal = true;
            debugMockPeers[localPeerIndex].name = userName || 'You (Debug)';
            // Set role appropriately
            debugMockPeers[localPeerIndex].role = HMS_ROLES.VIEWER;
            debugMockPeers[localPeerIndex].roleName = HMS_ROLES.VIEWER;
          }
        }
        
        // Trigger connection change events to update UI
        const connectionChangeEvent = new Event('hms-connection-change');
        document.dispatchEvent(connectionChangeEvent);
        
        console.log('[DEBUG] Debug viewer join successful');
        
        // Instead of making an actual HMS API call, return a simulated success response
        return { success: true };
      }
      
      // Normal flow for production
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
      // Handle debug mode
      if (DEBUG_MODE && DEBUG_ROOM.enabled) {
        console.log('[DEBUG] Joining debug room as streamer');
        
        // Set room id and start time
        currentRoomId = DEBUG_ROOM.roomId;
        roomStartTime = new Date();
        isDebugRoomActive = true;
        
        // Set room creator FID if this is the creator
        if (metaData.isCreator) {
          roomCreatorFid = metaData.fid;
        }
        
        // Start room timer
        this.startRoomTimer();
        
        // Start speaking detection
        this.startSpeakingDetection();
        
        // Simulate connection success
        return { success: true };
      }
      
      // Normal flow for production
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
      // Handle debug mode
      if (DEBUG_MODE && isDebugRoomActive) {
        console.log('[DEBUG] Leaving debug room');
        
        // Check if the user is the creator
        const isCreator = this.isRoomCreator();
        
        // Clean up room timer
        this.stopRoomTimer();
        
        // Stop speaking detection
        this.stopSpeakingDetection();
        
        // Reset debug state
        isDebugRoomActive = false;
        
        // Clear room ID
        currentRoomId = null;
        
        return { isCreator, roomId: DEBUG_ROOM.roomId };
      }
      
      // Regular flow - check if the user is the creator
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
      // Check if going from viewer to streamer (promotion)
      const peers = this.getPeers();
      const peer = peers.find(p => p.id === peerId);
      const isPromotion = peer && peer.roleName === HMS_ROLES.VIEWER && newRole === HMS_ROLES.STREAMER;
      
      // Use the 100ms SDK to change role directly
      await this.actions.changeRoleOfPeer(peerId, newRole, true);
      
      // If this was a promotion and hand was raised, lower it
      if (isPromotion) {
        this.lowerHandOnPromotion(peerId);
      }
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
    // FIRST: Check if we have a saved identity record that shows we're the creator
    if (this.originalIdentity && this.originalIdentity.isCreator === true) {
      // Cross-check that this is still our peer ID
      const localPeerId = this.store.getState(selectLocalPeerID);
      if (localPeerId === this.originalIdentity.id) {
        // We have confirmed creator status from our stored identity
        return true;
      }
    }
    
    // SECOND: Standard check through metadata
    const localPeer = this.store.getState(selectLocalPeer);
    if (!localPeer || !localPeer.metadata) return false;
    
    try {
      const metadata = typeof localPeer.metadata === 'string' ? 
        JSON.parse(localPeer.metadata) : localPeer.metadata;
      
      const isCreator = metadata.isCreator === true;
      
      // If we're detecting creator status but don't have it saved, save it
      if (isCreator && !this.originalIdentity) {
        this.originalIdentity = {
          id: localPeer.id,
          name: localPeer.name,
          isCreator: true,
          metadata: typeof localPeer.metadata === 'string' ? 
            localPeer.metadata : JSON.stringify(metadata)
        };
        console.log('Saved creator identity in isRoomCreator check:', this.originalIdentity);
      }
      
      return isCreator;
    } catch (e) {
      console.warn('Error checking if user is room creator:', e);
      
      // THIRD: Emergency fallback - if we've been the creator before, assume we still are
      if (this.originalIdentity && this.originalIdentity.isCreator === true) {
        console.warn('Using emergency fallback for creator status after metadata parse error');
        return true;
      }
      
      return false;
    }
  }
  
  /**
   * Check if a peer has a specific role in the room
   * @param {string} peerId - ID of peer to check
   * @param {string} role - Role to check for (creator, cohost, etc)
   * @returns {boolean} Whether peer has the role
   */
  hasPeerRole(peerId, role) {
    const peers = this.getPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer || !peer.metadata) return false;
    
    try {
      // Handle both string and object metadata
      const metadata = typeof peer.metadata === 'string' ? JSON.parse(peer.metadata) : peer.metadata;
      
      // Check specific roles
      if (role === USER_ROLES.CREATOR) {
        return metadata.isCreator === true;
      } else if (role === USER_ROLES.COHOST) {
        return metadata.isCohost === true;
      }
      
      return false;
    } catch (e) {
      console.warn(`Error checking if peer has role ${role}:`, e);
      return false;
    }
  }
  
  /**
   * Check if the local user is a cohost
   * @returns {boolean} Whether local user is a cohost
   */
  isCohost() {
    const localPeer = this.store.getState(selectLocalPeer);
    if (!localPeer) return false;
    
    return this.hasPeerRole(localPeer.id, USER_ROLES.COHOST);
  }
  
  /**
   * Check if the local user can moderate (creator or cohost)
   * @returns {boolean} Whether local user can moderate
   */
  canModerate() {
    return this.isRoomCreator() || this.isCohost();
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
   * Make a peer a cohost
   * @param {string} peerId - ID of peer to make cohost
   * @returns {Promise<boolean>} Whether operation was successful
   */
  async makePeerCohost(peerId) {
    try {
      // Save the local peer identity for protection
      const localPeer = this.store.getState(selectLocalPeer);
      const localPeerId = localPeer?.id;
      
      // Save our original metadata to restore if needed
      let originalLocalMetadata = null;
      try {
        if (localPeer && localPeer.metadata) {
          originalLocalMetadata = typeof localPeer.metadata === 'string' ? 
            localPeer.metadata : JSON.stringify(localPeer.metadata);
          console.log('Saved original local metadata before cohost operation:', originalLocalMetadata);
        }
      } catch (e) {
        console.warn('Error saving original metadata:', e);
      }
      
      // IMPORTANT VALIDATION CHECKS
      // 1. Check if the local user is authorized to make cohosts
      if (!this.isRoomCreator()) {
        showErrorMessage('Only the room creator can assign cohosts');
        return false;
      }
      
      // 2. Make sure we have a valid peer ID
      if (!peerId) {
        console.error('No peer ID provided for making cohost');
        return false;
      }
      
      // 3. Make sure we're not trying to modify ourselves
      if (peerId === localPeerId) {
        console.error('Attempted to make local peer a cohost, but local peer is already the creator');
        return false;
      }
      
      // 4. Get the peer to update and validate they exist
      const peers = this.getPeers();
      const peer = peers.find(p => p.id === peerId);
      
      if (!peer) {
        console.error('Peer not found:', peerId);
        return false;
      }
      
      // 5. Check if peer is already a cohost
      if (this.hasPeerRole(peerId, USER_ROLES.COHOST)) {
        console.log('Peer is already a cohost:', peerId);
        return true;
      }
      
      // 6. Check if the peer is already a streamer role
      const isPeerSpeaker = peer.roleName === HMS_ROLES.STREAMER || peer.role === HMS_ROLES.STREAMER;
      if (!isPeerSpeaker) {
        showErrorMessage('Only speakers can be made cohosts. Promote to speaker first.');
        return false;
      }
      
      // PREPARATION - safely extract current peer metadata
      let metadata = {};
      try {
        if (peer.metadata) {
          metadata = typeof peer.metadata === 'string' ? JSON.parse(peer.metadata) : peer.metadata;
        }
      } catch (e) {
        console.warn('Error parsing metadata:', e);
        metadata = {}; // Reset to empty object on parse error
      }
      
      // 7. Don't overwrite creator status
      if (metadata.isCreator === true) {
        console.warn('Attempting to make a room creator a cohost, which is unnecessary');
        return true; // Creator already has all permissions
      }
      
      // IMPLEMENTATION - Create a new metadata object with cohost flag
      const newMetadata = {
        ...metadata,   // Preserve existing metadata
        isCohost: true // Add cohost flag
      };
      
      // CRITICAL: Use direct HMS SDK method with explicit target peer
      console.log(`Updating metadata for peer ${peerId} (${peer.name}) to make them a cohost`);
      
      // Log the metadata before and after for debugging
      console.log('Old metadata:', metadata);
      console.log('New metadata:', newMetadata);
      
      try {
        // CRITICAL FIX: Use the Raw HMS SDK APIs via directly accessing the internals
        // This bypasses the normal changeMetadata method which has issues in this SDK version
        if (this.actions._hmsActions && this.actions._hmsActions.changeRoleOfPeer) {
          // Method 1: Use a different, more reliable API that takes explicit peerId
          await this.actions._hmsActions.changeRemotePeerMetadata(peerId, JSON.stringify(newMetadata));
          console.log('Successfully updated metadata using changeRemotePeerMetadata');
        } else {
          // Method 2: Original method with explicit peer ID
          await this.actions.changeMetadata(JSON.stringify(newMetadata), peerId);
          console.log('Successfully updated metadata using standard changeMetadata');
        }
      } catch (error) {
        console.error('Error updating peer metadata:', error);
        
        // SAFETY CHECK: Verify if our own metadata was affected accidentally
        const afterLocalPeer = this.store.getState(selectLocalPeer);
        let localMetadataChanged = false;
        
        try {
          if (afterLocalPeer && afterLocalPeer.metadata) {
            const afterMetadata = typeof afterLocalPeer.metadata === 'string' ? 
              JSON.parse(afterLocalPeer.metadata) : afterLocalPeer.metadata;
            
            // Check if our metadata now reflects the other peer's info
            if (afterMetadata.fid === metadata.fid) {
              console.error('CRITICAL ERROR: Local metadata was changed to match target peer!');
              localMetadataChanged = true;
            }
          }
        } catch (e) {
          console.warn('Error checking if local metadata was affected:', e);
        }
        
        // If our metadata was changed, try to restore it
        if (localMetadataChanged && originalLocalMetadata) {
          console.log('Attempting to restore original local metadata:', originalLocalMetadata);
          try {
            await this.actions.changeMetadata(originalLocalMetadata);
            console.log('Successfully restored local metadata');
          } catch (restoreError) {
            console.error('Failed to restore local metadata:', restoreError);
          }
        }
        
        throw error; // Re-throw the original error
      }
      
      // Force a delay before notification to allow HMS to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // SAFETY CHECK: Verify if our own metadata was affected accidentally
      const afterLocalPeer = this.store.getState(selectLocalPeer);
      let localMetadataChanged = false;
      
      try {
        if (afterLocalPeer && afterLocalPeer.metadata) {
          const afterMetadata = typeof afterLocalPeer.metadata === 'string' ? 
            JSON.parse(afterLocalPeer.metadata) : afterLocalPeer.metadata;
          
          // Check if our metadata now reflects the other peer's info
          if (afterMetadata.fid === metadata.fid) {
            console.error('CRITICAL ERROR: Local metadata was changed to match target peer!');
            localMetadataChanged = true;
          }
        }
      } catch (e) {
        console.warn('Error checking if local metadata was affected:', e);
      }
      
      // If our metadata was changed, try to restore it
      if (localMetadataChanged && originalLocalMetadata) {
        console.log('Attempting to restore original local metadata:', originalLocalMetadata);
        try {
          await this.actions.changeMetadata(originalLocalMetadata);
          console.log('Successfully restored local metadata');
        } catch (restoreError) {
          console.error('Failed to restore local metadata:', restoreError);
        }
      }
      
      // Show success message
      showSuccessMessage(`${peer.name} is now a cohost`);
      
      return true;
    } catch (error) {
      console.error('Error making peer cohost:', error);
      showErrorMessage('Failed to update cohost status');
      return false;
    }
  }
  
  /**
   * Remove cohost status from a peer
   * @param {string} peerId - ID of peer to remove cohost status from
   * @returns {Promise<boolean>} Whether operation was successful
   */
  async removePeerCohost(peerId) {
    try {
      // Save the local peer identity for protection
      const localPeer = this.store.getState(selectLocalPeer);
      const localPeerId = localPeer?.id;
      
      // Save our original metadata to restore if needed
      let originalLocalMetadata = null;
      try {
        if (localPeer && localPeer.metadata) {
          originalLocalMetadata = typeof localPeer.metadata === 'string' ? 
            localPeer.metadata : JSON.stringify(localPeer.metadata);
          console.log('Saved original local metadata before removing cohost status:', originalLocalMetadata);
        }
      } catch (e) {
        console.warn('Error saving original metadata:', e);
      }
      
      // IMPORTANT VALIDATION CHECKS
      // 1. Check if the local user is authorized to manage cohosts
      if (!this.isRoomCreator()) {
        showErrorMessage('Only the room creator can manage cohosts');
        return false;
      }
      
      // 2. Make sure we have a valid peer ID
      if (!peerId) {
        console.error('No peer ID provided for removing cohost status');
        return false;
      }
      
      // 3. Make sure we're not trying to modify ourselves
      if (peerId === localPeerId) {
        console.error('Attempted to remove cohost status from local peer, which is the creator');
        return false;
      }
      
      // 4. Get the peer to update and validate they exist
      const peers = this.getPeers();
      const peer = peers.find(p => p.id === peerId);
      
      if (!peer) {
        console.error('Peer not found:', peerId);
        return false;
      }
      
      // 5. Check if peer is a cohost
      if (!this.hasPeerRole(peerId, USER_ROLES.COHOST)) {
        console.log('Peer is not a cohost:', peerId);
        return true; // Already not a cohost, so technically success
      }
      
      // PREPARATION - safely extract current peer metadata
      let metadata = {};
      try {
        if (peer.metadata) {
          metadata = typeof peer.metadata === 'string' ? JSON.parse(peer.metadata) : peer.metadata;
        }
      } catch (e) {
        console.warn('Error parsing metadata:', e);
        metadata = {}; // Reset to empty object on parse error
      }
      
      // 6. Don't modify a room creator's status accidentally
      if (metadata.isCreator === true) {
        console.warn('Attempting to modify a room creator\'s cohost status, skipping');
        return true; // Creator already has inherent permissions
      }
      
      // IMPLEMENTATION - Create a new metadata object without cohost flag
      const newMetadata = {
        ...metadata,     // Preserve existing metadata
        isCohost: false  // Remove cohost flag
      };
      
      // CRITICAL: Use direct HMS SDK method with explicit target peer
      console.log(`Updating metadata for peer ${peerId} (${peer.name}) to remove cohost status`);
      
      // Log the metadata before and after for debugging
      console.log('Old metadata:', metadata);
      console.log('New metadata:', newMetadata);
      
      try {
        // CRITICAL FIX: Try to use the HMS SDK's internal methods first for more reliability
        if (this.actions._hmsActions && this.actions._hmsActions.changeRemotePeerMetadata) {
          // Method 1: Use a different, more reliable API that takes explicit peerId
          await this.actions._hmsActions.changeRemotePeerMetadata(peerId, JSON.stringify(newMetadata));
          console.log('Successfully removed cohost status using changeRemotePeerMetadata');
        } else {
          // Method 2: Original method with explicit peer ID
          await this.actions.changeMetadata(JSON.stringify(newMetadata), peerId);
          console.log('Successfully removed cohost status using standard changeMetadata');
        }
      } catch (error) {
        console.error('Error updating peer metadata:', error);
        
        // SAFETY CHECK: Verify if our own metadata was affected accidentally
        const afterLocalPeer = this.store.getState(selectLocalPeer);
        let localMetadataChanged = false;
        
        try {
          if (afterLocalPeer && afterLocalPeer.metadata) {
            const afterMetadata = typeof afterLocalPeer.metadata === 'string' ? 
              JSON.parse(afterLocalPeer.metadata) : afterLocalPeer.metadata;
            
            // Check if our metadata now reflects the other peer's info
            if (afterMetadata.fid === metadata.fid) {
              console.error('CRITICAL ERROR: Local metadata was changed to match target peer!');
              localMetadataChanged = true;
            }
          }
        } catch (e) {
          console.warn('Error checking if local metadata was affected:', e);
        }
        
        // If our metadata was changed, try to restore it
        if (localMetadataChanged && originalLocalMetadata) {
          console.log('Attempting to restore original local metadata:', originalLocalMetadata);
          try {
            await this.actions.changeMetadata(originalLocalMetadata);
            console.log('Successfully restored local metadata');
          } catch (restoreError) {
            console.error('Failed to restore local metadata:', restoreError);
          }
        }
        
        throw error; // Re-throw the original error
      }
      
      // Force a delay before notification to allow HMS to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // SAFETY CHECK: Verify if our own metadata was affected accidentally
      const afterLocalPeer = this.store.getState(selectLocalPeer);
      let localMetadataChanged = false;
      
      try {
        if (afterLocalPeer && afterLocalPeer.metadata) {
          const afterMetadata = typeof afterLocalPeer.metadata === 'string' ? 
            JSON.parse(afterLocalPeer.metadata) : afterLocalPeer.metadata;
          
          // Check if our metadata now reflects the other peer's info
          if (afterMetadata.fid === metadata.fid) {
            console.error('CRITICAL ERROR: Local metadata was changed to match target peer!');
            localMetadataChanged = true;
          }
        }
      } catch (e) {
        console.warn('Error checking if local metadata was affected:', e);
      }
      
      // If our metadata was changed, try to restore it
      if (localMetadataChanged && originalLocalMetadata) {
        console.log('Attempting to restore original local metadata:', originalLocalMetadata);
        try {
          await this.actions.changeMetadata(originalLocalMetadata);
          console.log('Successfully restored local metadata');
        } catch (restoreError) {
          console.error('Failed to restore local metadata:', restoreError);
        }
      }
      
      // Show success message
      showSuccessMessage(`${peer.name} is no longer a cohost`);
      
      return true;
    } catch (error) {
      console.error('Error removing peer cohost status:', error);
      showErrorMessage('Failed to update cohost status');
      return false;
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
   * Note: This uses audio level detection as a fallback method.
   * For production environments, the ON_SPEAKER notification is preferred through
   * the setupActiveSpeakerDetection method.
   */
  updateSpeakingStatus() {
    // This method will be used mainly in DEBUG_MODE or as a fallback
    // when the ON_SPEAKER notification is not available
    
    // In non-debug mode, don't use this method when selectDominantSpeaker is available
    if (!DEBUG_MODE) {
      // Try to check if we have dominant speaker updates already
      const dominantSpeaker = this.store.getState(selectDominantSpeaker);
      if (dominantSpeaker) {
        // Let the dominant speaker detection handle it
        return;
      }
    }
    
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
  
  /**
   * Get the list of peers (supports debug mode)
   * @returns {Array} List of peers
   */
  getPeers() {
    // In debug mode, return mock peers if debug room is active
    if (DEBUG_MODE && isDebugRoomActive) {
      return debugMockPeers;
    }
    
    // Otherwise get peers from HMS store
    return this.store.getState(selectPeers) || [];
  }
  
  /**
   * Check if we're connected to a room (supports debug mode)
   * @returns {boolean} Whether connected to a room
   */
  isConnectedToRoom() {
    // In debug mode, return true if debug room is active
    if (DEBUG_MODE && isDebugRoomActive) {
      return true;
    }
    
    // Otherwise check HMS store
    return this.store.getState(selectIsConnectedToRoom);
  }
  
  /**
   * Get local peer (supports debug mode)
   * @returns {Object|null} Local peer if available
   */
  getLocalPeer() {
    // In debug mode, return the first peer with isLocal set to true
    if (DEBUG_MODE && isDebugRoomActive) {
      return debugMockPeers.find(peer => peer.isLocal) || null;
    }
    
    // Otherwise get from HMS store
    return this.store.getState(selectLocalPeer);
  }
  
  /**
   * Check if local audio is enabled (supports debug mode)
   * @returns {boolean} Whether local audio is enabled
   */
  isLocalAudioEnabled() {
    // In debug mode, get from the local mock peer
    if (DEBUG_MODE && isDebugRoomActive) {
      const localPeer = debugMockPeers.find(peer => peer.isLocal);
      return localPeer ? localPeer.audioEnabled : false;
    }
    
    // Otherwise check HMS store
    return this.store.getState(selectIsLocalAudioEnabled);
  }

  /**
   * Setup notification listeners for hand raise events and peer join/leave updates
   */
  setupHandRaiseNotifications() {
    if (DEBUG_MODE && DEBUG_ROOM.enabled) {
      // Debug mode doesn't need real HMS notifications
      return;
    }
    
    // Listen for hand raise notifications and peer join/leave events
    this.store.subscribe(notification => {
      switch (notification.type) {
        case HMSNotificationTypes.HAND_RAISE_CHANGED:
          const peer = notification.data;
          const isHandRaised = peer.isHandRaised;
          
          if (isHandRaised && !peer.isLocal) {
            // Someone else raised their hand
            console.log(`${peer.name} raised their hand`);
            
            // Show notification to everyone
            showSuccessMessage(`${peer.name} raised their hand`);
            
            // Additional notification to room creator
            if (this.isRoomCreator()) {
              // Wait a moment to avoid overlapping notifications
              setTimeout(() => {
                showSuccessMessage(`${peer.name} would like to speak. You can invite them by clicking on their profile.`);
              }, 3000);
            }
            
            // Store the raised hand state
            raisedHandPeers.set(peer.id, true);
            
            // Setup auto-lower timer
            this.setupHandLowerTimer(peer.id);
          } else if (!isHandRaised && !peer.isLocal) {
            // Someone else lowered their hand
            raisedHandPeers.set(peer.id, false);
            
            // Clear any existing timer
            if (handRaiseTimers.has(peer.id)) {
              clearTimeout(handRaiseTimers.get(peer.id));
              handRaiseTimers.delete(peer.id);
            }
          }
          
          // Trigger a UI update
          document.dispatchEvent(new CustomEvent('hand-raise-changed', {
            detail: { peerId: peer.id, isRaised: isHandRaised }
          }));
          break;
          
        case HMSNotificationTypes.PEER_LIST:
          console.log(`${notification.data.length} peers are in the room:`, notification.data.map(p => p.name));
          break;
          
        case HMSNotificationTypes.PEER_JOINED:
          console.log(`${notification.data.name} joined`);
          document.dispatchEvent(new CustomEvent('peer-joined', {
            detail: { peer: notification.data }
          }));
          break;
          
        case HMSNotificationTypes.PEER_LEFT:
          console.log(`${notification.data.name} left`);
          document.dispatchEvent(new CustomEvent('peer-left', {
            detail: { peer: notification.data }
          }));
          break;
      }
    }, selectBroadcastMessages);
  }
  
  /**
   * Setup timer to automatically lower hand after duration
   * @param {string} peerId - ID of peer whose hand is raised
   */
  setupHandLowerTimer(peerId) {
    // Clear any existing timer
    if (handRaiseTimers.has(peerId)) {
      clearTimeout(handRaiseTimers.get(peerId));
    }
    
    // Set new timer
    const timerId = setTimeout(async () => {
      // If this is the local peer, lower hand
      const localPeerId = this.store.getState(selectLocalPeerID);
      if (peerId === localPeerId) {
        await this.lowerHand();
      }
      
      // Clear from raised hands map
      raisedHandPeers.set(peerId, false);
      handRaiseTimers.delete(peerId);
      
      // Trigger a UI update
      document.dispatchEvent(new CustomEvent('hand-raise-changed', {
        detail: { peerId, isRaised: false }
      }));
    }, HAND_RAISE_DURATION);
    
    // Store timer ID
    handRaiseTimers.set(peerId, timerId);
  }
  
  /**
   * Raise hand for local peer
   * @returns {Promise<boolean>} Whether operation was successful
   */
  async raiseHand() {
    try {
      // Handle debug mode
      if (DEBUG_MODE && isDebugRoomActive) {
        console.log('[DEBUG] Raising hand in debug mode');
        
        // Find local peer
        const localPeer = debugMockPeers.find(peer => peer.isLocal);
        if (!localPeer) return false;
        
        // Set hand raised
        localPeer.isHandRaised = true;
        raisedHandPeers.set(localPeer.id, true);
        
        // Setup auto-lower timer
        const timerId = setTimeout(() => {
          localPeer.isHandRaised = false;
          raisedHandPeers.set(localPeer.id, false);
          document.dispatchEvent(new CustomEvent('hand-raise-changed', {
            detail: { peerId: localPeer.id, isRaised: false }
          }));
        }, HAND_RAISE_DURATION);
        
        handRaiseTimers.set(localPeer.id, timerId);
        
        // Notify other peers via our debug handler
        // Finding peers that aren't the local peer
        const otherPeers = debugMockPeers.filter(p => p.id !== localPeer.id);
        if (otherPeers.length > 0) {
          // For debug mode, just pick a random peer to simulate as having seen the hand raise
          const randomPeer = otherPeers[Math.floor(Math.random() * otherPeers.length)];
          this.handleDebugHandRaise(localPeer.id, true);
        }
        
        return true;
      }
      
      // Production mode - use HMS SDK
      await this.actions.raiseLocalPeerHand();
      
      // Get local peer ID
      const localPeerId = this.store.getState(selectLocalPeerID);
      
      // Mark as raised in our local state
      raisedHandPeers.set(localPeerId, true);
      
      // Setup auto-lower timer
      this.setupHandLowerTimer(localPeerId);
      
      return true;
    } catch (error) {
      console.error('Error raising hand:', error);
      return false;
    }
  }
  
  /**
   * Lower hand for local peer
   * @returns {Promise<boolean>} Whether operation was successful
   */
  async lowerHand() {
    try {
      // Handle debug mode
      if (DEBUG_MODE && isDebugRoomActive) {
        console.log('[DEBUG] Lowering hand in debug mode');
        
        // Find local peer
        const localPeer = debugMockPeers.find(peer => peer.isLocal);
        if (!localPeer) return false;
        
        // Set hand lowered
        localPeer.isHandRaised = false;
        raisedHandPeers.set(localPeer.id, false);
        
        // Clear any existing timer
        if (handRaiseTimers.has(localPeer.id)) {
          clearTimeout(handRaiseTimers.get(localPeer.id));
          handRaiseTimers.delete(localPeer.id);
        }
        
        // Trigger UI update
        document.dispatchEvent(new CustomEvent('hand-raise-changed', {
          detail: { peerId: localPeer.id, isRaised: false }
        }));
        
        return true;
      }
      
      // Production mode - use HMS SDK
      await this.actions.lowerLocalPeerHand();
      
      // Get local peer ID
      const localPeerId = this.store.getState(selectLocalPeerID);
      
      // Mark as lowered in our local state
      raisedHandPeers.set(localPeerId, false);
      
      // Clear any existing timer
      if (handRaiseTimers.has(localPeerId)) {
        clearTimeout(handRaiseTimers.get(localPeerId));
        handRaiseTimers.delete(localPeerId);
      }
      
      return true;
    } catch (error) {
      console.error('Error lowering hand:', error);
      return false;
    }
  }
  
  /**
   * Check if a peer has their hand raised
   * @param {string} peerId - ID of peer to check
   * @returns {boolean} Whether peer has hand raised
   */
  isPeerHandRaised(peerId) {
    // Try from local state first
    if (raisedHandPeers.has(peerId)) {
      return raisedHandPeers.get(peerId);
    }
    
    // Handle debug mode
    if (DEBUG_MODE && isDebugRoomActive) {
      const peer = debugMockPeers.find(p => p.id === peerId);
      return peer ? !!peer.isHandRaised : false;
    }
    
    // Use HMS SDK
    try {
      return this.store.getState(selectHasPeerHandRaised(peerId)) || false;
    } catch (error) {
      console.warn('Error checking hand raised status:', error);
      return false;
    }
  }
  
  /**
   * Get peers sorted with raised hands first
   * @returns {Array} Sorted list of peers
   */
  getSortedPeers() {
    const peers = this.getPeers();
    
    // Sort by hand raised status (raised hands first)
    return [...peers].sort((a, b) => {
      const aRaised = this.isPeerHandRaised(a.id);
      const bRaised = this.isPeerHandRaised(b.id);
      
      if (aRaised && !bRaised) return -1;
      if (!aRaised && bRaised) return 1;
      return 0;
    });
  }
  
  /**
   * Lower hand when promoted to speaker
   * @param {string} peerId - ID of peer being promoted
   */
  lowerHandOnPromotion(peerId) {
    // If hand was raised, lower it
    if (this.isPeerHandRaised(peerId)) {
      // If it's local peer, use the lowerHand method
      const localPeerId = this.store.getState(selectLocalPeerID);
      
      if (peerId === localPeerId) {
        this.lowerHand();
      }
      
      // Update our local state
      raisedHandPeers.set(peerId, false);
      
      // Clear timer if exists
      if (handRaiseTimers.has(peerId)) {
        clearTimeout(handRaiseTimers.get(peerId));
        handRaiseTimers.delete(peerId);
      }
    }
  }

  /**
   * Set up message listeners for emoji reactions and chat messages
   */
  setupMessageListeners() {
    // Set up broadcast message listener
    this.store.subscribe((messages) => {
      messages.forEach(message => {
        // Check message type and handle accordingly
        if (message.type === 'EMOJI_REACTION') {
          this.handleEmojiReaction(message.message, message.sender);
        } else if (message.type === 'CHAT_MESSAGE') {
          this.handleChatMessage(message.message, message.sender);
        }
      });
    }, selectBroadcastMessages);
  }
  
  /**
   * Handle emoji reaction
   * @param {string} emoji - The emoji that was sent
   * @param {Object} sender - The peer who sent the emoji
   */
  handleEmojiReaction(emoji, sender) {
    // Create event for emoji display
    const event = new CustomEvent('emoji-reaction', {
      detail: {
        emoji,
        senderId: sender?.id,
        senderName: sender?.name
      }
    });
    
    // Dispatch event for UI components to handle
    document.dispatchEvent(event);
    
    // Handle debug mode separately
    if (DEBUG_MODE && isDebugRoomActive) {
      console.log(`[DEBUG] Emoji reaction received: ${emoji} from ${sender?.name}`);
    }
  }
  
  /**
   * Send emoji reaction
   * @param {string} emoji - The emoji to send
   * @returns {Promise<boolean|object>} Success indicator or error with timeout info
   */
  async sendEmojiReaction(emoji) {
    try {
      // Get local peer ID
      const localPeerId = this.store.getState(selectLocalPeerID) || 
                         (DEBUG_MODE && isDebugRoomActive ? 
                           debugMockPeers.find(peer => peer.isLocal)?.id : null);
      
      // Check if user is in timeout
      if (localPeerId && emojiReactionTimers.has(localPeerId)) {
        const timeLeft = Math.ceil((emojiReactionTimers.get(localPeerId) - Date.now()) / 1000);
        return { 
          success: false, 
          error: 'rate_limited',
          timeLeft: timeLeft > 0 ? timeLeft : 5, // Failsafe if timer calculation is off
          message: `Please wait ${timeLeft} seconds before sending another reaction`
        };
      }
      
      // Handle debug mode
      if (DEBUG_MODE && isDebugRoomActive) {
        console.log('[DEBUG] Sending emoji reaction:', emoji);
        
        // Find local peer for sender info
        const localPeer = debugMockPeers.find(peer => peer.isLocal);
        
        // Set rate limiting timeout
        if (localPeer?.id) {
          emojiReactionTimers.set(localPeer.id, Date.now() + EMOJI_REACTION_TIMEOUT);
          
          // Clear timeout after duration
          setTimeout(() => {
            emojiReactionTimers.delete(localPeer.id);
            // Dispatch event to notify UI that cooldown is complete
            document.dispatchEvent(new CustomEvent('emoji-cooldown-complete', {
              detail: { peerId: localPeer.id }
            }));
          }, EMOJI_REACTION_TIMEOUT);
        }
        
        // Create and dispatch an event with emoji information
        this.handleEmojiReaction(emoji, localPeer);
        
        return { success: true };
      }
      
      // Set rate limiting timeout for production mode
      if (localPeerId) {
        emojiReactionTimers.set(localPeerId, Date.now() + EMOJI_REACTION_TIMEOUT);
        
        // Clear timeout after duration
        setTimeout(() => {
          emojiReactionTimers.delete(localPeerId);
          // Dispatch event to notify UI that cooldown is complete
          document.dispatchEvent(new CustomEvent('emoji-cooldown-complete', {
            detail: { peerId: localPeerId }
          }));
        }, EMOJI_REACTION_TIMEOUT);
      }
      
      // Send broadcast message with emoji and type
      await this.actions.sendBroadcastMessage(emoji, 'EMOJI_REACTION');
      return { success: true };
    } catch (error) {
      console.error('Error sending emoji reaction:', error);
      return { success: false, error: 'sending_failed', message: error.message };
    }
  }
  
  /**
   * Check if user is in emoji reaction timeout
   * @param {string} peerId - ID of peer to check
   * @returns {object|null} Timeout info or null if not in timeout
   */
  getEmojiReactionTimeoutInfo(peerId) {
    if (!peerId || !emojiReactionTimers.has(peerId)) {
      return null;
    }
    
    const timeLeft = Math.ceil((emojiReactionTimers.get(peerId) - Date.now()) / 1000);
    if (timeLeft <= 0) {
      emojiReactionTimers.delete(peerId);
      return null;
    }
    
    return {
      timeLeft,
      expiresAt: emojiReactionTimers.get(peerId)
    };
  }
  
  /**
   * Handle chat message from a peer
   * @param {string} message - The chat message
   * @param {Object} sender - The peer who sent the message
   */
  handleChatMessage(message, sender) {
    try {
      // Get the local peer ID to check if this is our own message
      const localPeerId = this.store.getState(selectLocalPeerID);
      
      let messageData;
      
      // Parse the message if it's a JSON string
      if (typeof message === 'string' && message.startsWith('{')) {
        try {
          messageData = JSON.parse(message);
          
          // IMPORTANT: Check if this is our own message using senderId in the message
          // This is more reliable than checking sender.id which might not always match
          if (messageData.senderId === localPeerId) {
            console.log('Ignoring chat message from self (detected by embedded senderId)');
            return;
          }
        } catch (e) {
          console.warn('Failed to parse chat message JSON:', e);
          messageData = { text: message };
        }
      } else {
        messageData = { text: message };
      }
      
      // Also use the traditional sender check as a fallback
      if (sender && sender.id === localPeerId) {
        console.log('Ignoring chat message from self (detected by sender.id)');
        return;
      }
      
      // Try to get a more descriptive sender name
      let senderName = sender?.name || 'Unknown User';
      
      // Check if senderName is provided directly in the message data (our enhanced format)
      if (messageData.senderName) {
        senderName = messageData.senderName;
      } else if (sender && sender.metadata) {
        // Try to extract name from peer metadata
        try {
          const metadata = typeof sender.metadata === 'string' ? 
            JSON.parse(sender.metadata) : sender.metadata;
          
          // Prefer username over displayName when available
          if (metadata.profile && metadata.profile.username) {
            senderName = metadata.profile.username;
          } else if (metadata.profile && metadata.profile.displayName) {
            senderName = metadata.profile.displayName;
          }
        } catch (e) {
          console.warn('Error extracting sender name from metadata:', e);
        }
      }
      
      console.log('Chat message received:', { message: messageData.text, sender: senderName });
      
      // Create event for chat message display
      const event = new CustomEvent('chat-message', {
        detail: {
          messageData,
          senderId: messageData.senderId || sender?.id, // Prefer the embedded senderId if available
          senderName: senderName,
          timestamp: messageData.timestamp || new Date().toISOString()
        }
      });
      
      // Dispatch event for UI components to handle
      document.dispatchEvent(event);
      
      // Handle debug mode separately
      if (DEBUG_MODE && isDebugRoomActive) {
        console.log(`[DEBUG] Chat message received: "${messageData.text}" from ${senderName}`);
      }
    } catch (error) {
      console.error('Error handling chat message:', error);
    }
  }
  
  /**
   * Send chat message
   * @param {string} text - The text message to send
   * @param {Object} [metadata] - Optional metadata to include with the message
   * @returns {Promise<boolean|object>} Success indicator or error with timeout info
   */
  async sendChatMessage(text, metadata = {}) {
    try {
      if (!text || text.trim() === '') {
        return {
          success: false,
          error: 'empty_message',
          message: 'Cannot send empty message'
        };
      }
      
      // Get local peer ID
      const localPeerId = this.store.getState(selectLocalPeerID) || 
                         (DEBUG_MODE && isDebugRoomActive ? 
                           debugMockPeers.find(peer => peer.isLocal)?.id : null);
      
      // Check if user is in timeout
      if (localPeerId && chatMessageTimers.has(localPeerId)) {
        const timeLeft = Math.ceil((chatMessageTimers.get(localPeerId) - Date.now()) / 1000);
        return { 
          success: false, 
          error: 'rate_limited',
          timeLeft: timeLeft > 0 ? timeLeft : 2, // Failsafe if timer calculation is off
          message: `Please wait ${timeLeft} second${timeLeft !== 1 ? 's' : ''} before sending another message`
        };
      }
      
      // Get local peer for adding sender info
      const localPeer = this.getLocalPeer();
      if (!localPeer) {
        return {
          success: false,
          error: 'not_connected',
          message: 'Not connected to a room'
        };
      }
      
      // Get the local peer's proper name
      let senderName = localPeer.name;
      try {
        if (localPeer.metadata) {
          const metadata = typeof localPeer.metadata === 'string' ? 
            JSON.parse(localPeer.metadata) : localPeer.metadata;
          
          // Prefer username over displayName when available
          if (metadata.profile && metadata.profile.username) {
            senderName = metadata.profile.username;
          } else if (metadata.profile && metadata.profile.displayName) {
            senderName = metadata.profile.displayName;
          }
        }
      } catch (e) {
        console.warn('Error extracting sender name from metadata:', e);
      }
      
      // Create message data object with text and metadata
      const messageData = {
        text: text.trim(),
        ...metadata,
        senderName: senderName, // Include sender name directly in message data
        timestamp: new Date().toISOString(),
        senderId: localPeerId // Include the sender's ID for later filtering
      };
      
      // Handle debug mode
      if (DEBUG_MODE && isDebugRoomActive) {
        console.log('[DEBUG] Sending chat message:', messageData);
        
        // Set rate limiting timeout
        if (localPeer?.id) {
          chatMessageTimers.set(localPeer.id, Date.now() + CHAT_MESSAGE_TIMEOUT);
          
          // Clear timeout after duration
          setTimeout(() => {
            chatMessageTimers.delete(localPeer.id);
            // Dispatch event to notify UI that cooldown is complete
            document.dispatchEvent(new CustomEvent('chat-cooldown-complete', {
              detail: { peerId: localPeer.id }
            }));
          }, CHAT_MESSAGE_TIMEOUT);
        }
        
        // For debug mode, we create our own event
        // Create event for chat message display
        const event = new CustomEvent('chat-message', {
          detail: {
            messageData,
            senderId: localPeer.id,
            senderName: senderName,
            timestamp: messageData.timestamp
          }
        });
        document.dispatchEvent(event);
        
        return { success: true };
      }
      
      // Set rate limiting timeout for production mode
      if (localPeerId) {
        chatMessageTimers.set(localPeerId, Date.now() + CHAT_MESSAGE_TIMEOUT);
        
        // Clear timeout after duration
        setTimeout(() => {
          chatMessageTimers.delete(localPeerId);
          // Dispatch event to notify UI that cooldown is complete
          document.dispatchEvent(new CustomEvent('chat-cooldown-complete', {
            detail: { peerId: localPeerId }
          }));
        }, CHAT_MESSAGE_TIMEOUT);
      }
      
      console.log('Sending broadcast message with HMS SDK:', messageData);
      
      // First, directly show the message in the UI for immediate feedback
      // Create event for chat message display
      const event = new CustomEvent('chat-message', {
        detail: {
          messageData,
          senderId: localPeer.id,
          senderName: senderName,
          timestamp: messageData.timestamp
        }
      });
      document.dispatchEvent(event);
      
      // Then send through HMS (we'll ignore the echo when it comes back)
      await this.actions.sendBroadcastMessage(JSON.stringify(messageData), 'CHAT_MESSAGE');
      
      return { success: true };
    } catch (error) {
      console.error('Error sending chat message:', error);
      return { success: false, error: 'sending_failed', message: error.message };
    }
  }
  
  /**
   * Check if user is in chat message timeout
   * @param {string} peerId - ID of peer to check
   * @returns {object|null} Timeout info or null if not in timeout
   */
  getChatMessageTimeoutInfo(peerId) {
    if (!peerId || !chatMessageTimers.has(peerId)) {
      return null;
    }
    
    const timeLeft = Math.ceil((chatMessageTimers.get(peerId) - Date.now()) / 1000);
    if (timeLeft <= 0) {
      chatMessageTimers.delete(peerId);
      return null;
    }
    
    return {
      timeLeft,
      expiresAt: chatMessageTimers.get(peerId)
    };
  }

  /**
   * Handle debug hand raise event for local UI
   * @param {string} peerId - ID of peer who raised hand
   * @param {boolean} isRaised - Whether hand is raised
   */
  handleDebugHandRaise(peerId, isRaised) {
    // Get peer info
    const peer = debugMockPeers.find(p => p.id === peerId);
    if (!peer) return;
    
    if (isRaised) {
      console.log(`[DEBUG] ${peer.name} raised their hand`);
      
      // Show notification to everyone
      showSuccessMessage(`${peer.name} raised their hand`);
      
      // Additional notification to room creator if the local peer is the creator
      const localPeer = debugMockPeers.find(p => p.isLocal);
      if (localPeer && (localPeer.isCreator || localPeer.metadata?.isCreator)) {
        // Wait a moment to avoid overlapping notifications
        setTimeout(() => {
          showSuccessMessage(`${peer.name} would like to speak. You can invite them by clicking on their profile.`);
        }, 3000);
      }
    }
    
    // Dispatch event to update UI
    document.dispatchEvent(new CustomEvent('hand-raise-changed', {
      detail: { peerId, isRaised }
    }));
  }
}

// Create and export a singleton instance
const hmsService = new HMSService();
export default hmsService; 