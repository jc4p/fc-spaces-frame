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

// Import the Farcaster Frame SDK
import * as frame from '@farcaster/frame-sdk';

// Global variable to store the user's FID
window.userFid = null;

// Initialize HMS Store
const hmsManager = new HMSReactiveStore();
hmsManager.triggerOnSubscribe();
const hmsStore = hmsManager.getStore();
const hmsActions = hmsManager.getActions();

// Configure HMS to handle permissions issues more gracefully
hmsActions.setLogLevel('warn'); // Reduce console noise

// Track if we have microphone permission
let hasMicrophonePermission = false;

// Helper function to check microphone permissions
async function checkMicrophonePermission() {
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

// HTML elements
const form = document.getElementById("join");
const joinBtn = document.getElementById("join-btn");
const roomsList = document.getElementById("rooms-list");
const conference = document.getElementById("conference");
const leaveBtn = document.getElementById("leave-room-btn");
const muteAudio = document.getElementById("mute-aud");
const controls = document.getElementById("controls");
const nameInput = document.getElementById("name");
const roomTitle = document.getElementById("room-title");
const roomDuration = document.getElementById("room-duration");
const speakersList = document.getElementById("speakers-list");
const listenersList = document.getElementById("listeners-list");
const listenersCount = document.getElementById("listeners-count");
const hostControls = document.getElementById("host-controls");
const endRoomBtn = document.getElementById("end-room");
const createRoomBtn = document.getElementById("create-room-btn");
const createRoomModal = document.getElementById("create-room-modal");
const createRoomForm = document.getElementById("create-room-form");
const roomsContainer = document.querySelector(".rooms-container");
const listenerActionModal = document.getElementById("listener-action-modal");
const listenerInitial = document.getElementById("listener-initial");
const listenerName = document.getElementById("listener-name");
const promoteListenerBtn = document.getElementById("promote-listener");
const demoteSpeakerBtn = document.getElementById("demote-speaker");

// Variables to track room state
let roomStartTime = null;
let roomDurationInterval = null;
let selectedPeerId = null;

// store peer IDs already rendered to avoid re-render on mute/unmute
const renderedPeerIDs = new Set();

// Store speaking states for peer avatars
const speakingPeers = new Map();

// Timer to update speaking status
let speakingUpdateInterval;

// Keep track of the room creator's FID
let roomCreatorFid = null;

// Helper function to show error messages (replacement for alerts)
function showErrorMessage(message, duration = 5000) {
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

// Helper function to show success messages
function showSuccessMessage(message, duration = 3000) {
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

// API configuration
const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'https://fc-audio-api.kasra.codes',
  NEYNAR_API_KEY: import.meta.env.VITE_NEYNAR_API_KEY || '',
};

// Store for user profiles
const userProfiles = new Map();

// Function to fetch user profile from Neynar API
async function fetchUserProfile(fid) {
  // Check if we already have this user's profile
  if (userProfiles.has(fid)) {
    return userProfiles.get(fid);
  }
  
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'x-api-key': API_CONFIG.NEYNAR_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch user profile: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.users && data.users.length > 0) {
      const user = data.users[0];
      // Store the profile
      const profile = {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
        bio: user.profile?.bio?.text || ''
      };
      
      userProfiles.set(fid, profile);
      return profile;
    }
    
    throw new Error('User not found');
  } catch (error) {
    console.error(`Error fetching user profile for FID ${fid}:`, error);
    return null;
  }
}

// Frame SDK helper functions
const frameHelpers = {
  // Open a URL in Warpcast
  async openURL(url) {
    try {
      await frame.sdk.actions.openUrl(url);
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  },
  
  // View a Farcaster profile
  async viewProfile(fid) {
    try {
      await frame.sdk.actions.viewProfile({ fid });
    } catch (error) {
      console.error('Failed to view profile:', error);
    }
  },
  
  // Share to Warpcast
  async shareToCast(text, url) {
    try {
      const finalUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
      await frame.sdk.actions.openUrl(finalUrl);
    } catch (error) {
      console.error('Failed to share to Warpcast:', error);
    }
  },
  
  // Get the connected wallet address
  async getWalletAddress() {
    try {
      const accounts = await frame.sdk.wallet.ethProvider.request({
        method: 'eth_requestAccounts'
      });
      
      if (accounts && accounts.length > 0) {
        return accounts[0];
      }
      return null;
    } catch (error) {
      console.error('Failed to get wallet address:', error);
      return null;
    }
  },
  
  // Check if connected to Base
  async checkChainId() {
    try {
      const chainId = await frame.sdk.wallet.ethProvider.request({
        method: 'eth_chainId'
      });
      
      console.log('Connected to network with chainId:', chainId);
      const chainIdDecimal = typeof chainId === 'number' ? chainId : parseInt(chainId, 16);
      
      return chainIdDecimal === 8453; // Base mainnet
    } catch (error) {
      console.error('Failed to check chain ID:', error);
      return false;
    }
  },
  
  // Switch to Base network
  async switchToBase() {
    try {
      await frame.sdk.wallet.ethProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x2105' }] // Base mainnet chainId
      });
      return true;
    } catch (error) {
      console.error('Failed to switch to Base:', error);
      return false;
    }
  }
};

// Add API helper functions
const api = {
  // Note: These endpoints aren't actually documented in SERVER_README.md
  // These are likely used for debugging only and should be removed in production
  // or confirmed with the server developer
  async getTemplateInfo() {
    console.warn('Warning: /template-info endpoint not documented in SERVER_README.md');
    const response = await fetch(`${API_CONFIG.BASE_URL}/template-info`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch template info');
    }
    return response.json();
  },
  
  // Note: This endpoint isn't actually documented in SERVER_README.md
  // This is likely used for debugging only and should be removed in production
  // or confirmed with the server developer
  async getRoomInfo(roomId) {
    console.warn('Warning: /room-info/${roomId} endpoint not documented in SERVER_README.md');
    const response = await fetch(`${API_CONFIG.BASE_URL}/room-info/${roomId}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch room info');
    }
    return response.json();
  },
  
  async listRooms() {
    const response = await fetch(`${API_CONFIG.BASE_URL}/rooms`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch rooms');
    }
    return response.json();
  },

  async createRoom(address, fid) {
    const response = await fetch(`${API_CONFIG.BASE_URL}/create-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address, fid }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create room');
    }
    return response.json();
  },

  async joinRoom(roomId, fid, address) {
    const response = await fetch(`${API_CONFIG.BASE_URL}/join-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomId, fid, address }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to join room');
    }
    return response.json();
  },
  
  async disableRoom(roomId, address, fid) {
    console.log('API call to disable room with params:', {roomId, address, fid});
    
    // Format the data according to the server expectations
    const requestData = {
      roomId: roomId.toString(),
      address: address.toString(), 
      fid: fid.toString()
    };
    
    const response = await fetch(`${API_CONFIG.BASE_URL}/disable-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });
    
    if (!response.ok) {
      // Try to get the error message
      try {
        const error = await response.json();
        throw new Error(error.error || `Failed to disable room: ${response.status}`);
      } catch (parseError) {
        // If we can't parse the error response
        throw new Error(`Failed to disable room: ${response.status}`);
      }
    }
    
    // After successfully disabling room on server, trigger a custom event
    // This will help non-creator peers detect that the room has been ended
    try {
      // Broadcast a special message to other peers in the room to let them know
      // the room has been ended by the creator
      const roomDisabledEvent = new CustomEvent('roomDisabled', {
        detail: { roomId, disabledBy: fid }
      });
      window.dispatchEvent(roomDisabledEvent);
      
      console.log('Room disabled event dispatched');
    } catch (eventError) {
      console.warn('Failed to dispatch room disabled event:', eventError);
    }
    
    return response.json();
  },
  
  // The role management is handled directly by 100ms SDK (hmsActions.changeRole)
};

// Update the join button handler to be audio-only for viewers
joinBtn.onclick = async () => {
  const roomCode = document.getElementById("room-code").value;
  let userName = nameInput.value || `FID:${window.userFid || 'Guest'}`;
  let userProfile = null;
  
  joinBtn.disabled = true;
  joinBtn.textContent = "Joining...";
  
  try {
    // Try to fetch the user's profile if we have an FID
    if (window.userFid) {
      userProfile = await fetchUserProfile(window.userFid);
      if (userProfile) {
        // Use the username from the profile instead of manual entry
        userName = userProfile.username || `FID:${window.userFid}`;
      }
    }
    
    const authToken = await hmsActions.getAuthTokenByRoomCode({ roomCode });
    
    // Try to check audio permissions first
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            // Release the devices immediately
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(err => {
            console.warn('Microphone access warning:', err);
            // We'll continue anyway, as viewers can still listen without mic
          });
      } catch (err) {
        console.warn('Media permissions check error:', err);
      }
    }
    
    await hmsActions.join({
      userName,
      authToken,
      // Explicitly specify the viewer/listener role
      role: 'fariscope-viewer', 
      settings: {
        isAudioMuted: true, // Viewers start muted
        isVideoMuted: true, // No video needed for audio rooms
      },
      rememberDeviceSelection: true,
      metaData: JSON.stringify({
        fid: window.userFid || 'guest',
        isCreator: false,
        profile: userProfile ? {
          username: userProfile.username,
          displayName: userProfile.displayName,
          pfpUrl: userProfile.pfpUrl
        } : null
      }),
      // Add error handling for permissions
      onError: (error) => {
        console.error("HMS join error:", error);
        joinBtn.textContent = "Error";
        setTimeout(() => {
          joinBtn.textContent = "Join";
          joinBtn.disabled = false;
        }, 2000);
      }
    });
  } catch (error) {
    console.error('Failed to join room:', error);
    nameInput.classList.add("error");
    joinBtn.textContent = "Invalid Room";
    setTimeout(() => {
      joinBtn.textContent = "Join";
      nameInput.classList.remove("error");
    }, 2000);
  } finally {
    joinBtn.disabled = false;
  }
};

// Leaving the room
async function leaveRoom() {
  try {
    // Before leaving, check if the user is the creator of the room
    const localPeer = hmsStore.getState(selectLocalPeer);
    
    // If no local peer, just leave
    if (!localPeer) {
      await hmsActions.leave();
      return;
    }
    
    // Check multiple ways to determine if this user is the creator
    let isCreator = false;
    let metadata = {};
    
    try {
      // Method 1: Check metadata
      if (localPeer.metadata) {
        metadata = JSON.parse(localPeer.metadata);
        if (metadata.isCreator) {
          isCreator = true;
        }
      }
      
      // Method 2: Check role - streamers are likely creators
      if (localPeer.roleName === 'fariscope-streamer') {
        isCreator = true;
      }
      
      // Method 3: Check the room creator FID against window.userFid
      if (roomCreatorFid && window.userFid && 
          roomCreatorFid.toString() === window.userFid.toString()) {
        isCreator = true;
      }
      
    } catch (e) {
      console.warn('Failed to parse metadata when leaving:', e);
    }
    
    console.log('Leaving room, isCreator:', isCreator, 'metadata:', metadata, 'role:', localPeer.roleName);
    
    // If user is the creator, offer to disable the room
    if (isCreator) {
      // Get required info for disabling the room
      const roomId = localPeer.roomId;
      const fid = metadata.fid || window.userFid;
      
      // Get ETH address using multiple methods
      let address = '';
      try {
        // First try metadata
        if (metadata.address) {
          address = metadata.address;
        } 
        // Then try input field
        else if (document.getElementById("eth-address")?.value) {
          address = document.getElementById("eth-address").value;
        } 
        // Finally try the Frame SDK
        else {
          address = await frameHelpers.getWalletAddress() || '';
        }
        console.log('Got ETH address for room disabling:', address);
      } catch (e) {
        console.warn('Failed to get ETH address:', e);
      }
      
      if (roomId && fid) {
        // Ask user if they want to end the room for everyone
        const shouldDisable = confirm('Do you want to end this room for everyone? Click Cancel to leave without ending the room.');
        
        if (shouldDisable) {
          try {
            console.log('Disabling room with parameters:', { roomId, address, fid });
            await api.disableRoom(roomId, address, fid);
            showSuccessMessage('Room ended successfully for everyone.');
          } catch (disableError) {
            console.error('Failed to disable room:', disableError);
            showErrorMessage('Failed to end the room, but you have been disconnected.');
          }
        }
      }
    }
    
    // Leave the room
    await hmsActions.leave();
    
    // Clean up room timer
    if (roomDurationInterval) {
      clearInterval(roomDurationInterval);
      roomStartTime = null;
    }
    
    // Show room list
    roomsList.classList.remove("hide");
    form.classList.add("hide");
    conference.classList.add("hide");
    controls.classList.add("hide");
    
    // Refresh the rooms list
    loadRooms();
  } catch (error) {
    console.error('Error leaving room:', error);
  }
}

// Cleanup if user refreshes the tab or navigates away
window.onbeforeunload = leaveRoom;

// Add leave button handler
if (leaveBtn) {
  leaveBtn.onclick = leaveRoom;
}

// Helper function to create html elements
function createElementWithClass(tag, className) {
  const newElement = document.createElement(tag);
  newElement.className = className;
  return newElement;
}

// Update renderPeers to show speakers and listeners using Twitter Spaces UI
function renderPeers() {
  const peers = hmsStore.getState(selectPeers);
  const localPeer = hmsStore.getState(selectLocalPeer);
  
  if (!peers.length) return;
  
  // Set room title based on the room description if available
  const localPeerRoom = localPeer?.roomId;
  
  // Try to get the current room details from any active room element
  const activeRoomElement = document.querySelector('.room-item.active-room');
  if (activeRoomElement) {
    const roomDescription = activeRoomElement.querySelector('.room-title')?.textContent;
    if (roomDescription) {
      roomTitle.textContent = roomDescription;
      return;
    }
  }
  
  // Fallback to streamer name if no room description is available
  const streamer = peers.find(peer => peer.roleName === 'fariscope-streamer');
  if (streamer) {
    let streamerId = streamer.name;
    if (streamerId.startsWith('FID:')) {
      streamerId = streamerId.split('FID:')[1];
    }
    roomTitle.textContent = `Audio Room hosted by FID:${streamerId}`;
  }
  
  // Separate speakers (streamers) and listeners (viewers)
  // Check both the role and metadata to determine if someone should be a speaker
  const speakers = peers.filter(peer => {
    // Check role name
    if (peer.roleName === 'fariscope-streamer') return true;
    
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
    startRoomTimer();
  }
  
  // Check if we're the host (streamer role) AND the creator
  const isHost = localPeer?.roleName === 'fariscope-streamer';
  
  // Check if we're the creator of the room
  let isCreator = false;
  try {
    if (localPeer?.metadata) {
      const metadata = JSON.parse(localPeer.metadata);
      isCreator = !!metadata.isCreator;
    }
  } catch (e) {
    console.warn('Error parsing metadata when checking creator status:', e);
  }
  
  // Show host controls only if user is a streamer
  hostControls.classList.toggle('hide', !isHost);
  
  // Find and show/hide the End Room button for creators only 
  const endRoomBtn = document.getElementById("end-room");
  if (endRoomBtn) {
    // Only show End Room button if the user is the room creator
    endRoomBtn.classList.toggle('hide', !isCreator);
    console.log('End Room button visibility:', !isCreator ? 'hidden' : 'visible', 'isCreator:', isCreator);
  }
  
  // Render speakers list
  renderSpeakersList(speakers, localPeer);
  
  // Render listeners list
  renderListenersList(listeners, localPeer, isHost);
  
  // Update listeners count
  listenersCount.textContent = listeners.length;
}

// Helper function to extract profile info from peer metadata
function getProfileFromPeer(peer) {
  try {
    if (peer.metadata) {
      const metadata = JSON.parse(peer.metadata);
      return metadata.profile || null;
    }
  } catch (e) {
    console.warn('Error parsing peer metadata:', e);
  }
  return null;
}

// Helper function to get user's display name
function getDisplayName(peer) {
  try {
    // Try to extract from metadata first
    if (peer.metadata) {
      const metadata = JSON.parse(peer.metadata);
      if (metadata.profile?.username) {
        return metadata.profile.username;
      }
    }
    
    // Fall back to peer name
    const name = peer.name;
    
    // Check if it's a FID format
    if (name.startsWith('FID:')) {
      const fid = name.split('FID:')[1];
      // Try to get the profile from our cache
      const profile = userProfiles.get(fid);
      if (profile?.username) {
        return profile.username;
      }
      return `@${fid}`;
    }
    
    return name;
  } catch (e) {
    console.warn('Error getting display name:', e);
    return peer.name;
  }
}

// Render the speakers list
function renderSpeakersList(speakers, localPeer) {
  // Check if current user is room creator - used for special UI
  const userIsCreator = isRoomCreator();
  
  // Add a class to the speakers-list if the user is the creator
  if (userIsCreator) {
    speakersList.classList.add('room-creator');
  } else {
    speakersList.classList.remove('room-creator');
  }
  
  speakersList.innerHTML = speakers.map(speaker => {
    const profile = getProfileFromPeer(speaker);
    const displayName = getDisplayName(speaker);
    const isLocal = speaker.id === localPeer?.id;
    
    // Get accurate mute state - for local peer, use the global state selector
    let isMuted;
    if (isLocal) {
      // For local peer, use the most reliable source of truth
      isMuted = !hmsStore.getState(selectIsLocalAudioEnabled);
      console.log('Rendering local speaker, audio muted state:', isMuted);
    } else {
      // For remote peers, use their peer object state
      isMuted = !speaker.audioEnabled;
    }
    
    const isHost = true; // All speakers are hosts in this app
    const isSpeaking = speakingPeers.get(speaker.id); // Check if the peer is currently speaking
    
    // Check if we have a profile picture
    const hasPfp = profile && profile.pfpUrl;
    const avatarContent = hasPfp 
      ? `<img src="${profile.pfpUrl}" alt="${displayName}" />`
      : speaker.name.charAt(0).toUpperCase();
    
    // CHANGED: Only show mute badge for local user
    // This prevents showing remote peers as muted when they might not actually be
    // and avoids confusion when promoting listeners to speakers
    const showMuteBadge = isLocal && isMuted;
    
    // Only show interaction hint for non-local peers if user is creator
    const showInteractionHint = !isLocal && userIsCreator;
    
    return `
      <div class="speaker-item" data-peer-id="${speaker.id}" data-role="fariscope-streamer" title="${userIsCreator && !isLocal ? 'Click to manage this speaker' : ''}">
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
  if (localPeer?.roleName === 'fariscope-streamer') {
    document.querySelectorAll('.speaker-item').forEach(item => {
      item.addEventListener('click', handlePeerClick);
    });
  }
}

// Render the listeners list
function renderListenersList(listeners, localPeer, isHost) {
  // Check if current user is room creator - used for special UI
  const userIsCreator = isRoomCreator();
  
  // Add a class to the listeners-list if the user is the creator
  if (userIsCreator) {
    listenersList.classList.add('room-creator');
  } else {
    listenersList.classList.remove('room-creator');
  }
  
  listenersList.innerHTML = listeners.map(listener => {
    const profile = getProfileFromPeer(listener);
    const displayName = getDisplayName(listener);
    const isLocal = listener.id === localPeer?.id;
    
    // Get accurate mute state - for local peer, use the global state selector
    let isMuted;
    if (isLocal) {
      // For local peer, use the most reliable source of truth
      isMuted = !hmsStore.getState(selectIsLocalAudioEnabled);
      console.log('Rendering local listener, audio muted state:', isMuted);
    } else {
      // For remote peers, use their peer object state
      isMuted = !listener.audioEnabled;
    }
    
    const isSpeaking = speakingPeers.get(listener.id); // Check if the peer is currently speaking
    
    // Check if we have a profile picture
    const hasPfp = profile && profile.pfpUrl;
    const avatarContent = hasPfp 
      ? `<img src="${profile.pfpUrl}" alt="${displayName}" />`
      : listener.name.charAt(0).toUpperCase();
    
    // CHANGED: Only show mute badge for local user
    // This prevents showing remote peers as muted when they might not actually be
    const showMuteBadge = isLocal && isMuted;
    
    // Only show interaction hint for non-local peers if user is creator
    const showInteractionHint = !isLocal && userIsCreator;
    
    return `
      <div class="listener-item" data-peer-id="${listener.id}" data-role="fariscope-viewer" title="${userIsCreator && !isLocal ? 'Click to invite this listener to speak' : ''}">
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
      item.addEventListener('click', handlePeerClick);
    });
  }
}

// Handle click on peer avatar
function handlePeerClick(e) {
  const peerItem = e.currentTarget;
  const peerId = peerItem.dataset.peerId;
  const role = peerItem.dataset.role;
  const peers = hmsStore.getState(selectPeers);
  const localPeer = hmsStore.getState(selectLocalPeer);
  
  // Only streamers can see peer details
  if (localPeer?.roleName !== 'fariscope-streamer') return;
  
  // Don't allow actions on self
  if (peerId === localPeer.id) return;
  
  // Find the clicked peer
  const peer = peers.find(p => p.id === peerId);
  if (!peer) return;
  
  // Store selected peer ID for later use
  selectedPeerId = peerId;
  
  // Try to get profile information
  const profile = getProfileFromPeer(peer);
  const displayName = getDisplayName(peer);
  
  // Show appropriate action modal based on role
  listenerActionModal.classList.remove('hide');
  
  // Add click-outside listener to close the modal
  const closeModalOnOutsideClick = (event) => {
    // Check if the click was outside the modal content
    if (!event.target.closest('.modal-content') && event.target.classList.contains('modal')) {
      listenerActionModal.classList.add('hide');
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
    listenerInitial.textContent = peer.name.charAt(0).toUpperCase();
    listenerAvatar.classList.remove('with-image');
  }
  
  // Set the name display
  listenerName.textContent = displayName;
  
  // Check if the local user is the room creator
  const userIsCreator = isRoomCreator();
  
  // Show explanatory text if user is not a creator but is a streamer
  const creatorOnlyMessage = document.getElementById('creator-only-message');
  if (creatorOnlyMessage) {
    if (!userIsCreator && localPeer?.roleName === 'fariscope-streamer') {
      creatorOnlyMessage.classList.remove('hide');
    } else {
      creatorOnlyMessage.classList.add('hide');
    }
  }
  
  // Get the description elements
  const promoteDescription = document.getElementById('promote-description');
  const demoteDescription = document.getElementById('demote-description');
  
  // Show/hide appropriate buttons and descriptions based on role and creator status
  if (role === 'fariscope-viewer') {
    // Only room creator can promote to streamer
    promoteListenerBtn.classList.toggle('hide', !userIsCreator);
    demoteSpeakerBtn.classList.add('hide');
    
    // Show/hide appropriate descriptions
    if (promoteDescription) promoteDescription.classList.toggle('hide', !userIsCreator);
    if (demoteDescription) demoteDescription.classList.add('hide');
  } else {
    promoteListenerBtn.classList.add('hide');
    // Only room creator can demote speakers
    demoteSpeakerBtn.classList.toggle('hide', !userIsCreator);
    
    // Show/hide appropriate descriptions
    if (promoteDescription) promoteDescription.classList.add('hide');
    if (demoteDescription) demoteDescription.classList.toggle('hide', !userIsCreator);
  }
}

// Start room timer
function startRoomTimer() {
  roomStartTime = new Date();
  updateRoomDuration();
  
  // Update duration every second
  roomDurationInterval = setInterval(updateRoomDuration, 1000);
}

// Update room duration display
function updateRoomDuration() {
  if (!roomStartTime) return;
  
  const now = new Date();
  const diffMs = now - roomStartTime;
  const diffMins = Math.floor(diffMs / 60000);
  const diffSecs = Math.floor((diffMs % 60000) / 1000);
  
  roomDuration.textContent = `${diffMins.toString().padStart(2, '0')}:${diffSecs.toString().padStart(2, '0')}`;
}

// Update the controls visibility based on HMS role
function updateControlsVisibility() {
  const localPeer = hmsStore.getState(selectLocalPeer);
  // Check expected role first, then fall back to actual role
  const expectedRole = document.getElementById('expected-role')?.value;
  const isStreamer = expectedRole === 'fariscope-streamer' || localPeer?.roleName === 'fariscope-streamer';
  
  // Always log the visibility decision
  console.log('Controls visibility check:', {
    expectedRole,
    actualRole: localPeer?.roleName,
    isStreamer,
    controlsHidden: !isStreamer
  });
  
  // Never hide controls if expected role is streamer
  controls.classList.toggle('hide', !isStreamer);
  
  // Also make sure host controls are visible if user should be a streamer
  if (isStreamer) {
    hostControls.classList.remove('hide');
  }
}

// Function to check if the local user is the room creator
function isRoomCreator() {
  const localPeer = hmsStore.getState(selectLocalPeer);
  if (!localPeer || !localPeer.metadata) return false;
  
  try {
    const metadata = JSON.parse(localPeer.metadata);
    return metadata.isCreator === true;
  } catch (e) {
    console.warn('Error checking if user is room creator:', e);
    return false;
  }
}

// Function to update speaking status for peers
function updateSpeakingStatus() {
  const peers = hmsStore.getState(selectPeers);
  
  // Log peer info once per interval for debugging
  if (Math.random() < 0.05) { // Log roughly 5% of the time to avoid excessive logging
    console.log('Peers update:', peers.map(peer => ({
      name: peer.name,
      audioTrack: peer.audioTrack ? 'defined' : 'undefined',
      audioEnabled: peer.audioEnabled
    })));
  }
  
  peers.forEach(peer => {
    // For creators/streamers, skip the audio track check for the first 10 seconds after join
    // to avoid showing errors before the tracks are fully initialized
    const isStreamer = peer.roleName === 'fariscope-streamer';
    const peerJoinTime = peer.joinedAt ? peer.joinedAt.getTime() : 0;
    const currentTime = new Date().getTime();
    const timeSinceJoin = currentTime - peerJoinTime;
    const isRecentlyJoined = timeSinceJoin < 10000; // 10 seconds
    
    // Special handling for streamers who recently joined
    if (isStreamer && isRecentlyJoined && !peer.audioTrack) {
      // For recent streamers without audio tracks, don't show as muted yet
      // This prevents false "muted" indicators during initialization
      return;
    }
    
    // Skip peers with no audio track or muted peers
    if (!peer.audioTrack || !peer.audioEnabled) {
      speakingPeers.set(peer.id, false);
      return;
    }
    
    try {
      // Get audio level for the peer
      const audioTrack = hmsStore.getState(selectAudioTrackByPeerID(peer.id));
      
      // Try to get audio level even if audioTrack isn't fully initialized
      // The 100ms SDK sometimes has audioTrack undefined even when audio is working
      const audioLevel = hmsStore.getState(selectPeerAudioByID(peer.id)) || 0;
      
      // Consider speaking if audio level is above threshold (0.05)
      const isSpeaking = audioLevel > 0.05;
      
      // Update speaking state
      speakingPeers.set(peer.id, isSpeaking);
      
      // Update DOM if needed
      const peerAvatar = document.querySelector(`[data-peer-id="${peer.id}"] .avatar`);
      if (peerAvatar) {
        if (isSpeaking) {
          peerAvatar.classList.add('speaking');
        } else {
          peerAvatar.classList.remove('speaking');
        }
      }
    } catch (e) {
      console.warn(`Error checking audio for peer ${peer.id}:`, e);
    }
  });
  
  // Check for room creator - this helps keep track of who created the room
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

// Subscribe to role changes
hmsStore.subscribe(updateControlsVisibility, selectLocalPeer);

// Mute and unmute audio
muteAudio.onclick = async () => {
  try {
    // First check if we have permissions
    if (!hasMicrophonePermission) {
      hasMicrophonePermission = await checkMicrophonePermission();
    }
    
    // If we still don't have permissions, ask for them but don't show a toast
    if (!hasMicrophonePermission) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          hasMicrophonePermission = true;
        }
      } catch (err) {
        console.warn('Microphone permission request failed:', err);
        // Just log the error but don't show a toast to the user
        return;
      }
    }
    
    // Toggle audio state
    const currentlyEnabled = hmsStore.getState(selectIsLocalAudioEnabled);
    const audioEnabled = !currentlyEnabled;
    
    // Add logging to debug
    console.log('Toggling audio state:', {
      currentEnabled: currentlyEnabled,
      willSetTo: audioEnabled,
      localPeer: hmsStore.getState(selectLocalPeer)?.roleName
    });
    
    const localPeer = hmsStore.getState(selectLocalPeer);
    
    // For streamers (room creators), we need to use a different approach
    if (localPeer?.roleName === 'fariscope-streamer' && audioEnabled) {
      console.log('Special handling for streamer unmute');
      
      // Create a batch of operations to try multiple unmute strategies
      const unmuteBatch = async () => {
        try {
          // 1. First try the standard way
          await hmsActions.setLocalAudioEnabled(true);
          
          // 2. Try to get the audio track directly
          let audioTrack;
          try {
            audioTrack = hmsStore.getState(selectAudioTrackByPeerID(localPeer.id));
            if (audioTrack?.id) {
              console.log('Found audio track:', audioTrack.id);
              await hmsActions.setEnabledTrack(audioTrack.id, true);
            }
          } catch (e) {
            console.warn('Error enabling specific track:', e);
          }
          
          // 3. Try accessing audioTrack property of localPeer
          if (localPeer.audioTrack) {
            console.log('Using localPeer.audioTrack:', localPeer.audioTrack);
            await hmsActions.setEnabledTrack(localPeer.audioTrack, true);
          }
          
          // 4. Try forcing a new publish
          try {
            if (navigator.mediaDevices) {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              if (stream && stream.getAudioTracks().length > 0) {
                const track = stream.getAudioTracks()[0];
                console.log('Got new audio track from getUserMedia');
                // We don't actually use this track directly but getting it
                // can sometimes "wake up" the audio system
                track.enabled = true;
                // Release the track to avoid duplicate audio
                setTimeout(() => track.stop(), 500);
              }
            }
          } catch (mediaError) {
            console.warn('Error getting media stream:', mediaError);
          }
          
          console.log('Completed unmute operations batch');
        } catch (error) {
          console.error('Unmute batch operations failed:', error);
        }
      };
      
      // Run the batch operations
      unmuteBatch().then(() => {
        // Check success after a delay
        setTimeout(() => {
          const nowEnabled = hmsStore.getState(selectIsLocalAudioEnabled);
          if (nowEnabled) {
            console.log('Successfully unmuted audio');
            showSuccessMessage('Microphone unmuted');
          } else {
            console.warn('Failed to unmute audio');
            // One last desperate attempt
            hmsActions.setLocalAudioEnabled(true).catch(e => console.error('Final unmute attempt failed:', e));
          }
        }, 300);
      });
    } else {
      // Standard mute/unmute for regular operations (including muting for creators)
      try {
        await hmsActions.setLocalAudioEnabled(audioEnabled);
        
        if (!audioEnabled) {
          console.log('Successfully muted audio');
        }
      } catch (audioError) {
        console.error('Error setting audio enabled state:', audioError);
        showErrorMessage('Failed to change audio state. Trying alternative method...');
        
        // Try track-specific method as fallback
        try {
          if (localPeer.audioTrack) {
            await hmsActions.setEnabledTrack(localPeer.audioTrack, audioEnabled);
          }
        } catch (fallbackError) {
          console.error('Fallback audio toggle failed:', fallbackError);
        }
      }
    }
    
    // Check if toggle was successful
    setTimeout(() => {
      const currentState = hmsStore.getState(selectIsLocalAudioEnabled);
      console.log('After toggle, audio enabled state is:', currentState, 'expected:', audioEnabled);
      
      if (currentState !== audioEnabled) {
        console.warn('Audio state did not change as expected');
        if (audioEnabled && localPeer?.roleName === 'fariscope-streamer') {
          showErrorMessage('Audio unmute issue detected. If you still can\'t speak, try leaving and rejoining.');
          
          // Update UI to at least show correct state
          const muteButton = document.getElementById('mute-aud');
          if (muteButton) {
            const micIcon = muteButton.querySelector('.mic-icon');
            if (micIcon) {
              // Show muted microphone icon
              micIcon.innerHTML = `
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
            }
            const muteText = muteButton.querySelector('span');
            if (muteText) {
              muteText.textContent = 'Unmute';
            }
          }
        }
      }
    }, 800);
    
    // Update button text and icon
    const muteText = muteAudio.querySelector('span');
    if (muteText) {
      muteText.textContent = audioEnabled ? "Mute" : "Unmute";
    }
    
    // Update the microphone SVG based on mute state
    const micIcon = muteAudio.querySelector('.mic-icon');
    if (micIcon) {
      if (audioEnabled) {
        // Unmuted microphone
        micIcon.innerHTML = `
          <!-- Microphone body -->
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" 
                fill="currentColor" />
          <!-- Stand/base of microphone -->
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-0.49 6-3.39 6-6.92h-2z" 
                fill="currentColor" />
        `;
      } else {
        // Muted microphone with diagonal line
        micIcon.innerHTML = `
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
      }
    }
    
    // Force refresh the UI to update mute badges
    renderPeers();
    
    // Extra UI refresh with a small delay to ensure HMS SDK state has propagated
    setTimeout(() => {
      console.log('Delayed UI refresh after mute/unmute');
      // This ensures the UI reflects the final state after all HMS SDK operations are complete
      renderPeers();
    }, 300);
  } catch (error) {
    console.error('Error toggling audio:', error);
    showErrorMessage('Failed to change audio state. Please try again.');
  }
};

// Share room to Warpcast
const shareWarpcastBtn = document.getElementById("share-warpcast");
if (shareWarpcastBtn) {
  shareWarpcastBtn.onclick = async () => {
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
    
    shareWarpcastBtn.style.position = 'relative';
    shareWarpcastBtn.appendChild(successIndicator);
    
    // Call frameHelpers.shareToCast with the fixed message and URL
    console.log('Sharing to Warpcast:', { shareText, shareUrl });
    
    try {
      // The shareToCast function constructs the URL and opens it using the frame SDK
      await frameHelpers.shareToCast(shareText, shareUrl);
      
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
      if (shareWarpcastBtn.contains(successIndicator)) {
        shareWarpcastBtn.removeChild(successIndicator);
      }
    }, 2000);
  };
}

// Create a utility function to store current room ID
// We'll update this whenever we join a room
let currentRoomId = null;
function setCurrentRoomId(roomId) {
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

function getCurrentRoomId() {
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

// End Room button handler
if (endRoomBtn) {
  endRoomBtn.onclick = async () => {
    const localPeer = hmsStore.getState(selectLocalPeer);
    
    // Only host can end room
    if (localPeer?.roleName !== 'fariscope-streamer') return;
    
    try {
      // Extract metadata if available
      let metadata = {};
      try {
        if (localPeer.metadata) {
          metadata = JSON.parse(localPeer.metadata);
        }
      } catch (e) {
        console.warn('Failed to parse peer metadata:', e);
      }
      
      // Get the required parameters - try multiple reliable ways to get the room ID
      
      // APPROACH 1: Try from our global storage - this is the most reliable
      let roomId = getCurrentRoomId();
      console.log('Got room ID from global store:', roomId);
      
      // APPROACH 2: Try from peer object
      if (!roomId && localPeer?.roomId) {
        roomId = localPeer.roomId;
        console.log('Got room ID from peer object:', roomId);
      }
      
      // APPROACH 3: Try from metadata
      if (!roomId && metadata?.roomId) {
        roomId = metadata.roomId;
        console.log('Got room ID from metadata:', roomId);
      }
      
      // APPROACH 4: Try from active room element
      if (!roomId) {
        // Try all room items, not just active-room, since active-room might not be set correctly
        const roomItems = document.querySelectorAll('.room-item');
        
        // First try to find active room
        for (const roomItem of roomItems) {
          if (roomItem.classList.contains('active-room') && roomItem.dataset.roomId) {
            roomId = roomItem.dataset.roomId;
            console.log('Found room ID from active room item:', roomId);
            break;
          }
        }
        
        // If still not found, try to find a room that's marked as belonging to this user
        if (!roomId) {
          for (const roomItem of roomItems) {
            if (roomItem.dataset.isCreator === 'true' && roomItem.dataset.roomId) {
              roomId = roomItem.dataset.roomId;
              console.log('Found room ID from creator room item:', roomId);
              break;
            }
          }
        }
        
        // If still not found, as a last resort, just use the first room in the list
        if (!roomId && roomItems.length > 0) {
          roomId = roomItems[0].dataset.roomId;
          console.log('Using first available room as last resort:', roomId);
        }
      }
      
      // If we still can't find it after all approaches, show error
      if (!roomId) {
        console.error('All approaches to find room ID failed');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = 'Unable to determine room ID. Please try using the Leave Room button instead.';
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '10px';
        errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translateX(-50%)';
        errorDiv.style.padding = '10px 20px';
        errorDiv.style.backgroundColor = 'rgba(244, 67, 54, 0.9)';
        errorDiv.style.borderRadius = '4px';
        errorDiv.style.zIndex = '9999';
        
        document.body.appendChild(errorDiv);
        
        // Remove error after 5 seconds
        setTimeout(() => errorDiv.remove(), 5000);
        
        throw new Error('Could not determine room ID after trying all methods');
      }
      
      // Get ETH address from various sources
      let ethAddress;
      try {
        // Try inputs first
        ethAddress = document.getElementById("eth-address")?.value;
        
        // If not available, try from metadata
        if (!ethAddress && metadata.address) {
          ethAddress = metadata.address;
        }
        
        // If still not available, try from Frame SDK
        if (!ethAddress) {
          ethAddress = await frameHelpers.getWalletAddress();
        }
        
        // If still not found, throw error
        if (!ethAddress) {
          throw new Error('Could not determine wallet address');
        }
      } catch (walletError) {
        console.error('Failed to get wallet address:', walletError);
        throw new Error('Could not determine wallet address for room disabling');
      }
      
      // Get FID
      const fid = metadata.fid || window.userFid || (localPeer.name.startsWith('FID:') ? localPeer.name.split('FID:')[1] : null);
      
      if (!fid) {
        throw new Error('Could not determine FID');
      }
      
      console.log('Disabling room with parameters:', { roomId, ethAddress, fid });
      
      // Disable the room via API
      await api.disableRoom(roomId, ethAddress, fid);
      
      // Leave the room locally
      await hmsActions.leave();
      clearInterval(roomDurationInterval);
      roomStartTime = null;
      
      // Show confirmation and return to room list
      showSuccessMessage('Room ended successfully');
      roomsList.classList.remove('hide');
      conference.classList.add('hide');
      controls.classList.add('hide');
      
      // Refresh the room list
      loadRooms();
      
    } catch (error) {
      console.error('Failed to end room:', error);
      showErrorMessage('Failed to end room: ' + error.message);
    }
  };
}

// Promote listener to speaker
if (promoteListenerBtn) {
  promoteListenerBtn.onclick = async () => {
    if (!selectedPeerId) return;
    
    const localPeer = hmsStore.getState(selectLocalPeer);
    
    // Verify user is a streamer
    if (localPeer?.roleName !== 'fariscope-streamer') {
      showErrorMessage('Only streamers can manage participants');
      return;
    }
    
    // Verify user is the room creator
    if (!isRoomCreator()) {
      showErrorMessage('Only the room creator can promote listeners to speakers');
      return;
    }
    
    try {
      // Get the peer object before we change their role
      const peers = hmsStore.getState(selectPeers);
      const targetPeer = peers.find(peer => peer.id === selectedPeerId);
      
      if (!targetPeer) {
        throw new Error('Selected peer not found');
      }
      
      console.log('Promoting listener to speaker:', targetPeer.name);
      
      // First ensure the user is unmuted so they can talk after promotion
      try {
        // This ensures the user's audio track is enabled
        await hmsActions.setRemoteTrackEnabled(targetPeer.audioTrack, true);
        console.log('Enabled remote audio track for promoted user');
      } catch (audioError) {
        console.warn('Failed to enable audio track, continuing with role change:', audioError);
      }
      
      // Use the 100ms SDK to change role directly
      await hmsActions.changeRoleOfPeer(selectedPeerId, 'fariscope-streamer', true);
      
      // Close the modal
      listenerActionModal.classList.add('hide');
      selectedPeerId = null;
      
      // Show success message to room creator
      showSuccessMessage('Successfully promoted to speaker! They can now talk in the room.');
      
      // Force refresh the peer list to update UI
      setTimeout(() => {
        renderPeers();
      }, 1000);
      
    } catch (error) {
      console.error('Failed to promote listener:', error);
      showErrorMessage('Failed to promote listener: ' + error.message);
    }
  };
}

// Demote speaker to listener
if (demoteSpeakerBtn) {
  demoteSpeakerBtn.onclick = async () => {
    if (!selectedPeerId) return;
    
    const localPeer = hmsStore.getState(selectLocalPeer);
    
    // Verify user is a streamer
    if (localPeer?.roleName !== 'fariscope-streamer') {
      showErrorMessage('Only streamers can manage participants');
      return;
    }
    
    // Verify user is the room creator
    if (!isRoomCreator()) {
      showErrorMessage('Only the room creator can demote speakers to listeners');
      return;
    }
    
    try {
      // Use the 100ms SDK to change role directly
      await hmsActions.changeRoleOfPeer(selectedPeerId, 'fariscope-viewer', true);
      
      // Close the modal
      listenerActionModal.classList.add('hide');
      selectedPeerId = null;
      
      // Show success message
      showSuccessMessage('Successfully moved back to listener. They can no longer speak in the room.');
      
    } catch (error) {
      console.error('Failed to demote speaker:', error);
      showErrorMessage('Failed to demote speaker: ' + error.message);
    }
  };
}

// Update onConnection to use HMS roles
function onConnection(isConnected) {
  const localPeer = hmsStore.getState(selectLocalPeer);
  
  // Check expected role first, then fall back to actual role
  const expectedRole = document.getElementById('expected-role')?.value;
  const isStreamer = expectedRole === 'fariscope-streamer' || localPeer?.roleName === 'fariscope-streamer';
  
  console.log('Connection status changed:', {
    isConnected,
    expectedRole,
    actualRole: localPeer?.roleName,
    isStreamer
  });
  
  if (isConnected) {
    form.classList.add("hide");
    roomsList.classList.add("hide");
    conference.classList.remove("hide");
    
    if (isStreamer) {
      controls.classList.remove("hide");
      hostControls.classList.remove("hide");
    } else {
      controls.classList.remove("hide");
      hostControls.classList.add("hide");
    }
    
    // Try to unlock iOS audio again now that we've actually joined
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      console.log('Attempting to unlock iOS audio after successful room join');
      unlockIOSAudio();
      
      // For iOS, add a visible "Tap to enable audio" button if needed
      // This is a fallback in case the automatic unlocking doesn't work
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
        // Try to unlock audio
        unlockIOSAudio();
        
        // Remove the overlay
        document.body.removeChild(audioUnlockDiv);
      });
      
      // Auto-hide after 10 seconds if not clicked
      setTimeout(() => {
        if (document.getElementById('ios-audio-unlock')) {
          document.body.removeChild(audioUnlockDiv);
        }
      }, 10000);
    }
    
    // Start the speaking detection interval
    if (!speakingUpdateInterval) {
      speakingUpdateInterval = setInterval(updateSpeakingStatus, 500);
    }
    
    // Ensure proper audio permissions for streamers
    // This helps resolve issues where streamers can't be heard by others
    if (isStreamer) {
      console.log('Running post-connection audio setup for streamer');
      // Delay slightly to ensure HMS is fully initialized
      setTimeout(async () => {
        try {
          // Force audio track publishing for streamer
          const localPeer = hmsStore.getState(selectLocalPeer);
          
          // Check if the user actually has a published audio track
          const audioTrack = hmsStore.getState(selectAudioTrackByPeerID(localPeer?.id));
          
          if (!audioTrack || !audioTrack.id) {
            console.warn('Streamer has no audio track published, trying to republish');
            
            // First try to toggle mute to force track creation
            const isEnabled = hmsStore.getState(selectIsLocalAudioEnabled);
            // Toggle off then on
            await hmsActions.setLocalAudioEnabled(false);
            await new Promise(resolve => setTimeout(resolve, 300));
            await hmsActions.setLocalAudioEnabled(true);
            
            // Try to get the track again
            const newAudioTrack = hmsStore.getState(selectAudioTrackByPeerID(localPeer?.id));
            if (newAudioTrack && newAudioTrack.id) {
              console.log('Successfully created audio track after reconnection');
            }
          }
        } catch (error) {
          console.warn('Error in post-connection audio setup:', error);
        }
      }, 2000);
    }
  } else {
    // Clean up room timer
    if (roomDurationInterval) {
      clearInterval(roomDurationInterval);
      roomStartTime = null;
    }
    
    // Stop the speaking detection interval
    if (speakingUpdateInterval) {
      clearInterval(speakingUpdateInterval);
      speakingUpdateInterval = null;
    }
    
    // Reset selected peer
    selectedPeerId = null;
    
    // Clear speaking state
    speakingPeers.clear();
    
    // Show room list
    roomsList.classList.remove("hide");
    form.classList.add("hide");
    conference.classList.add("hide");
    controls.classList.add("hide");
    
    // Hide all modals
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.add('hide');
    });
  }
}

// Listen to the connection state
hmsStore.subscribe(onConnection, selectIsConnectedToRoom);

// Add a listener for room state changes to detect when room is ended
hmsStore.subscribe(async (peers) => {
  try {
    const isConnected = hmsStore.getState(selectIsConnectedToRoom);
    if (!isConnected) return; // Skip if we're not connected
    
    const localPeer = hmsStore.getState(selectLocalPeer);
    if (!localPeer) return; // Skip if no local peer
    
    // We're only interested in rooms with the local user as a non-creator
    // Look for creator in the peers list
    const isLocalUserCreator = isRoomCreator();
    
    if (isLocalUserCreator) return; // We only want to handle the non-creator case here
    
    // Check if there's any streamer/creator in the room
    const streamers = peers.filter(peer => peer.roleName === 'fariscope-streamer');
    const hasStreamers = streamers.length > 0;
    
    console.log('Room state check: streamers present?', hasStreamers, 'streamers count:', streamers.length);
    
    // If there are no streamers and we're connected, the creator likely ended the room
    // We should leave the room too as it's non-functional
    if (!hasStreamers && peers.length > 0) {
      console.log('No streamers detected in room - room may have been ended by creator');
      
      // Brief timeout to prevent false triggers during role changes
      setTimeout(async () => {
        // Double-check that we're still connected and still no streamers
        const stillConnected = hmsStore.getState(selectIsConnectedToRoom);
        const currentPeers = hmsStore.getState(selectPeers);
        const stillNoStreamers = !currentPeers.some(peer => peer.roleName === 'fariscope-streamer');
        
        if (stillConnected && stillNoStreamers) {
          console.log('Confirmed: Room has no streamers. Auto-leaving ended room...');
          
          // Show a message to the user
          showErrorMessage('The room has been ended by the host. You will be disconnected.');
          
          // Leave the room
          try {
            await hmsActions.leave();
            console.log('Successfully left ended room');
            
            // Go back to the rooms list
            roomsList.classList.remove('hide');
            conference.classList.add('hide');
            controls.classList.add('hide');
            
            // Refresh the rooms list
            loadRooms();
          } catch (error) {
            console.error('Error leaving ended room:', error);
          }
        }
      }, 3000); // Wait 3 seconds to confirm room was actually ended
    }
  } catch (error) {
    console.error('Error in room state change handler:', error);
  }
}, selectPeers);

// Debug logging function to check if roles are working
function checkRolesAfterJoin() {
  const localPeer = hmsStore.getState(selectLocalPeer);
  if (!localPeer) return;
  
  console.log('ROLE CHECK: Local peer role after connection:', {
    expectedRole: document.getElementById('expected-role')?.value,
    actualRole: localPeer.roleName
  });
  
  // If expected role is streamer but actual role is different, force UI to show streamer controls
  const expectedRole = document.getElementById('expected-role')?.value;
  const shouldBeStreamer = expectedRole === 'fariscope-streamer';
  
  if (shouldBeStreamer) {
    console.log('Forcing streamer UI controls to show regardless of HMS role');
    hostControls.classList.remove('hide');
    controls.classList.remove('hide');
  }
}

// Extra listener for connection to check roles immediately
hmsStore.subscribe((isConnected) => {
  if (isConnected) {
    // Check roles after a short delay to ensure peer data is loaded
    setTimeout(checkRolesAfterJoin, 1000);
  }
}, selectIsConnectedToRoom);

// Close listener action modal when clicking close button
document.querySelectorAll('.close-button').forEach(button => {
  button.onclick = (event) => {
    // Make sure we stop event propagation to prevent other handlers from firing
    event.stopPropagation();
    
    const modalId = button.dataset.modal;
    if (modalId) {
      document.getElementById(modalId).classList.add('hide');
      selectedPeerId = null;
    }
  };
});

// Update validation to only check username
function validateInputs() {
  const userName = nameInput.value.trim();
  joinBtn.disabled = !userName;
}

// Remove roomCodeInput listener and only keep nameInput
nameInput.addEventListener("input", validateInputs);

// Add hidden input for room code
const roomCodeInput = document.createElement('input');
roomCodeInput.type = 'hidden';
roomCodeInput.id = 'room-code';
form.appendChild(roomCodeInput);

// Direct join room function to skip the form
async function directJoinRoom(event) {
  console.log('Join/Resume button clicked', event.target);
  
  // Try to unlock iOS audio on this user interaction
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    console.log('Attempting to unlock iOS audio on room join click');
    unlockIOSAudio();
  }
  
  const roomItem = event.target.closest('.room-item');
  console.log('Found room item:', roomItem);
  if (!roomItem || !event.target.classList.contains('join-room-btn')) {
    console.log('Early return: invalid click target');
    return;
  }
  
  // Remove active-room class from all room items
  document.querySelectorAll('.room-item').forEach(item => {
    item.classList.remove('active-room');
  });
  
  // Mark this room as active
  roomItem.classList.add('active-room');
  
  const roomId = roomItem.dataset.roomId;
  const fid = window.userFid;
  
  console.log('Joining room with ID:', roomId, 'as FID:', fid);
  console.log('Button text:', event.target.textContent);
  
  if (!fid) {
    console.log('No FID found, showing error message');
    // Create inline error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = 'Please connect with Farcaster first';
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '10px';
    errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translateX(-50%)';
    errorDiv.style.padding = '10px 20px';
    errorDiv.style.backgroundColor = 'rgba(244, 67, 54, 0.9)';
    errorDiv.style.borderRadius = '4px';
    errorDiv.style.zIndex = '9999';
    
    document.body.appendChild(errorDiv);
    
    // Remove error after 5 seconds
    setTimeout(() => errorDiv.remove(), 5000);
    
    // Reset room item
    roomItem.classList.remove('active-room');
    
    return;
  }
  
  try {
    // Show joining indicator
    event.target.disabled = true;
    event.target.textContent = 'Joining...';
    
    // Fetch user profile
    let userProfile = null;
    try {
      userProfile = await fetchUserProfile(fid);
    } catch (err) {
      console.warn('Failed to fetch profile, will continue anyway:', err);
    }
    
    // Check if this room was created by the current user
    // We need to examine the room information to determine this
    const creatorFid = roomItem.dataset.creatorFid;
    const creatorAddress = roomItem.dataset.creatorAddress;
    
    // Get the current user's ETH address if available
    let userAddress = '';
    try {
      userAddress = document.getElementById("eth-address")?.value || '';
      if (!userAddress) {
        console.log('No ETH address in input field, trying to get from frame SDK');
        userAddress = await frameHelpers.getWalletAddress() || '';
      }
      console.log('Got user ETH address:', userAddress);
      userAddress = userAddress.toLowerCase();
    } catch (e) {
      console.warn('Failed to get wallet address:', e);
      userAddress = '';
    }
    
    // Join the room directly without showing the form
    const { code, role: serverRole, serverIsCreator } = await api.joinRoom(roomId, fid, userAddress);
    
    // Save the room ID to our global store for reliable access later
    setCurrentRoomId(roomId);
    
    console.log('Server response:', { code, serverRole, serverIsCreator });
    
    // Join with HMS
    const authToken = await hmsActions.getAuthTokenByRoomCode({ roomCode: code });
    
    const userName = userProfile?.username || `FID:${fid}`;
    
    // Check if either FID or ETH address matches
    const fidMatches = creatorFid && fid && fid.toString() === creatorFid.toString();
    const addressMatches = userAddress && creatorAddress && 
                           userAddress.toLowerCase() === creatorAddress.toLowerCase();
    
    // User is the creator if either credential matches
    // IMPORTANT: Force isCreatorJoining to true if button says "Resume Room" or data-is-creator is true
    const buttonText = event.target.textContent.trim();
    const isCreatorFromButton = buttonText === 'Resume Room';
    const isCreatorFromData = roomItem.dataset.isCreator === 'true';
    const forcedCreator = isCreatorFromButton || isCreatorFromData;
    const isCreatorJoining = fidMatches || addressMatches || forcedCreator;
    
    console.log('Room creator check:', { 
      fidMatches, 
      addressMatches, 
      isCreatorFromButton,
      isCreatorFromData,
      forcedCreator,
      buttonText,
      isCreatorJoining, 
      userFid: fid, 
      creatorFid, 
      userAddress, 
      creatorAddress,
      dataIsCreator: roomItem.dataset.isCreator
    });
    
    // Use role from server if available, otherwise use our own logic
    // Force streamer role if any creator indicator is true
    // First check if server explicitly told us the user is a creator
    // If serverIsCreator is defined, trust it as the definitive source
    // Otherwise, fall back to client-side checks
    const isLikelyCreator = (serverIsCreator !== undefined) 
                          ? serverIsCreator 
                          : (isCreatorJoining || 
                             isCreatorFromButton || 
                             isCreatorFromData || 
                             fidMatches || 
                             addressMatches ||
                             buttonText === 'Resume Room');
                          
    // Trust serverRole if provided, otherwise determine based on creator status
    const userRole = serverRole || (isLikelyCreator ? 'fariscope-streamer' : 'fariscope-viewer');
    
    console.log('Final role decision:', {
      isLikelyCreator,
      userRole,
      serverRole,
      serverIsCreator,
      isCreatorJoining
    });
    
    // Store expected role in hidden input for debugging
    const expectedRoleInput = document.getElementById('expected-role') || 
                            document.createElement('input');
    expectedRoleInput.id = 'expected-role';
    expectedRoleInput.type = 'hidden';
    expectedRoleInput.value = userRole;
    document.body.appendChild(expectedRoleInput);
    
    // Check if user is joining as the room creator or a regular speaker
    const isJoiningAsSpeaker = userRole === 'fariscope-streamer';
    const isJoiningAsCreator = isLikelyCreator || serverIsCreator || isCreatorFromData || buttonText === 'Resume Room';
    
    console.log(`User with FID ${fid} is joining as ${userRole}, isCreator: ${isJoiningAsCreator}`);
    
    // For all users, we start muted to avoid HMS bugs, then auto-unmute creators
    // This prevents issues with audio permissions and ensures consistent behavior
    const initialAudioMuted = true; // Always start muted to avoid HMS bugs
    
    await hmsActions.join({
      userName,
      authToken,
      role: userRole,
      // Debug all params
      debug: true,
      settings: {
        isAudioMuted: initialAudioMuted,
        isVideoMuted: true, // Always keep video muted since this is audio-only
      },
      rememberDeviceSelection: true,
      metaData: JSON.stringify({
        fid: fid,
        isCreator: serverIsCreator !== undefined ? serverIsCreator : isCreatorJoining, // Use server value if available
        address: userAddress || '', // Include address in metadata
        profile: userProfile || null
      })
    });
    
    // For streamers or creators, ensure audio permissions and unmute after a delay
    if (isJoiningAsSpeaker || isJoiningAsCreator) {
      // Only auto-unmute creators
      const shouldAutoUnmute = isJoiningAsCreator;
      console.log('User is joining as speaker/creator, will force unmute after delay:', shouldAutoUnmute);
      
      // Longer delay for creators (5 seconds) to ensure HMS SDK has fully initialized
      // This helps prevent premature errors about audio tracks not being ready
      const unmutingDelay = isJoiningAsCreator ? 5000 : 2000;
      console.log(`Setting unmuting delay to ${unmutingDelay}ms to ensure audio tracks are ready`);
      
      // Force unmute after a delay to ensure HMS is fully initialized
      setTimeout(async () => {
        try {
          console.log('Starting delayed audio setup process...');
          
          // Ensure microphone permission is granted - silently
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              if (stream) {
                stream.getTracks().forEach(track => track.stop());
                hasMicrophonePermission = true;
                console.log('Microphone permission confirmed');
              }
            } catch (permError) {
              console.warn('Could not get microphone permission:', permError);
              // Continue anyway - don't show an error toast
            }
          }
          
          // Only continue with unmuting if this is a creator
          if (!shouldAutoUnmute) {
            console.log('Not auto-unmuting as user is not the creator');
            return;
          }
          
          // Batch of unmute operations similar to our unmute function
          const forceUnmute = async () => {
            console.log('Running force unmute for creator after join');
            const localPeer = hmsStore.getState(selectLocalPeer);
            console.log('Local peer state:', {
              id: localPeer?.id,
              audioTrack: localPeer?.audioTrack ? 'defined' : 'undefined',
              roleName: localPeer?.roleName
            });
            
            try {
              // Standard method
              await hmsActions.setLocalAudioEnabled(true);
              console.log('Standard unmute method completed');
              
              // Track-specific method
              if (localPeer?.id) {
                const audioTrack = hmsStore.getState(selectAudioTrackByPeerID(localPeer.id));
                console.log('Audio track state:', audioTrack ? 'found' : 'not found', 
                            audioTrack?.id ? 'with ID' : 'without ID');
                            
                if (audioTrack?.id) {
                  await hmsActions.setEnabledTrack(audioTrack.id, true);
                  console.log('Track-specific unmute completed');
                }
              }
              
              // Direct track access method
              if (localPeer?.audioTrack) {
                await hmsActions.setEnabledTrack(localPeer.audioTrack, true);
                console.log('Direct track unmute completed');
              }
              
              console.log('Force unmute completed - creator should now be audible');
              
              // Update UI to show unmuted state
              const muteText = muteAudio.querySelector('span');
              if (muteText) {
                muteText.textContent = "Mute";
              }
              
              // Force refresh the UI
              renderPeers();
              
              // Add a final check after a short delay to make sure audio is enabled
              setTimeout(async () => {
                const isAudioEnabled = hmsStore.getState(selectIsLocalAudioEnabled);
                console.log('Final audio state check:', isAudioEnabled ? 'UNMUTED' : 'MUTED');
                
                if (!isAudioEnabled) {
                  console.log('Audio still muted after all unmute attempts, trying one more time');
                  await hmsActions.setLocalAudioEnabled(true);
                }
              }, 1000);
            } catch (error) {
              console.error('Force unmute error:', error);
            }
          };
          
          // Run the unmute operations
          forceUnmute();
          
        } catch (error) {
          console.error('Post-join unmute error:', error);
        }
      }, unmutingDelay); // Increased delay to ensure HMS is fully initialized
    }
    
    // Note: This debug call uses an endpoint that doesn't exist in SERVER_README.md
    // Commenting it out since it's for debugging only and the endpoint may not exist
    /*
    try {
      setTimeout(async () => {
        const roomInfo = await api.getRoomInfo(roomId);
        console.log('Room info after joining:', roomInfo);
      }, 3000); // Wait 3 seconds for joining to complete
    } catch (e) {
      console.warn('Failed to get room info:', e);
    }
    */
  } catch (error) {
    console.error('Failed to join room:', error);
    showErrorMessage('Failed to join room: ' + error.message);
    
    // Reset button
    event.target.disabled = false;
    event.target.textContent = 'Join Room';
    
    // Remove active-room class since join failed
    roomItem.classList.remove('active-room');
  }
}

// Add room management functions
async function loadRooms() {
  try {
    const { data: rooms } = await api.listRooms();
    
    if (!rooms?.length) {
      roomsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎙️</div>
          <h3>No audio rooms are live right now</h3>
          <p>Create a room to start talking!</p>
        </div>
      `;
      return;
    }
    
    roomsContainer.innerHTML = rooms.map(room => {
      // Extract FID from room description or metadata
      let fid = '';
      if (room.description && room.description.includes('FID:')) {
        fid = room.description.split('FID: ')[1];
      } else if (room.metadata && room.metadata.fid) {
        fid = room.metadata.fid;
      }
      
      // Format the created time if available
      let createdAt = '';
      if (room.metadata && room.metadata.createdAt) {
        const date = new Date(room.metadata.createdAt);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 60) {
          createdAt = `${diffMins}m ago`;
        } else {
          const diffHours = Math.floor(diffMins / 60);
          createdAt = `${diffHours}h ago`;
        }
      }
      
      // Determine if this room belongs to the current user by checking both FID and ETH address
      const currentUserFid = window.userFid;
      const ethAddress = document.getElementById("eth-address")?.value || '';
      
      // Get creator eth address from metadata if available
      let creatorAddress = '';
      if (room.metadata && room.metadata.address) {
        creatorAddress = room.metadata.address.toLowerCase();
      }
      
      // Check if either FID or ETH address matches
      const fidMatches = currentUserFid && currentUserFid.toString() === fid.toString();
      const addressMatches = ethAddress && creatorAddress && ethAddress.toLowerCase() === creatorAddress.toLowerCase();
      
      // User is the creator if either credential matches
      const isCurrentUserRoom = fidMatches || addressMatches;
      
      return `
        <div class="room-item" 
          data-room-id="${room.id}" 
          data-creator-fid="${fid}" 
          data-creator-address="${creatorAddress}"
          data-is-creator="${isCurrentUserRoom ? 'true' : 'false'}">
          <div class="room-info">
            <div class="room-title">${room.description || `Audio Room with FID: ${fid}`}</div>
            <div class="room-details">
              <span class="live-badge">LIVE</span>
              ${createdAt ? `<span class="created-at">${createdAt}</span>` : ''}
              <span class="listeners-info">${isCurrentUserRoom ? 'Join as Speaker (Your Room)' : 'Join as Listener'}</span>
            </div>
          </div>
          <button class="btn-primary join-room-btn">${isCurrentUserRoom ? 'Resume Room' : 'Join Room'}</button>
        </div>
      `;
    }).join('');
    
    // Add click handlers to the join/resume room buttons
    document.querySelectorAll('.join-room-btn').forEach(btn => {
      btn.addEventListener('click', directJoinRoom);
    });
    
  } catch (error) {
    console.error('Failed to load rooms:', error);
    roomsContainer.innerHTML = `
      <div class="empty-state error">
        <div class="empty-state-icon">⚠️</div>
        <h3>Error loading rooms</h3>
        <p>Please try again later</p>
      </div>
    `;
  }
}

// Update the create room form handler for audio-only rooms
createRoomForm.onsubmit = async (e) => {
  e.preventDefault();
  
  // Try to unlock iOS audio on this user interaction
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    console.log('Attempting to unlock iOS audio on create room submit');
    unlockIOSAudio();
  }
  
  // Get values from hidden inputs which should be populated by Frame SDK
  let address = document.getElementById("eth-address").value;
  let fid = document.getElementById("fid").value || window.userFid;
  
  // If no FID is available, we can't create a room
  if (!fid) {
    console.error('No Farcaster ID available. Please connect via Farcaster Frame.');
    showErrorMessage('Please connect your Farcaster account first.');
    return;
  }
  
  // If no wallet address is available, get it again
  if (!address) {
    try {
      // Show pending state
      const pendingMessage = document.createElement('div');
      pendingMessage.className = 'frame-pending-message';
      pendingMessage.textContent = 'Connecting to wallet...';
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
      
      address = await frameHelpers.getWalletAddress();
      
      // Remove pending message
      pendingMessage.remove();
      
      if (!address) {
        console.error('No wallet address available');
        showErrorMessage('Please connect your wallet first.');
        return;
      }
    } catch (error) {
      console.error('Failed to get wallet address:', error);
      showErrorMessage('Failed to get wallet address. Please try again.');
      return;
    }
  }
  
  try {
    // Check if the user already has an active room
    const { data: rooms } = await api.listRooms();
    
    // Look for an active room where either the FID or ETH address matches
    const existingRoom = rooms.find(room => {
      const roomFid = room.metadata?.fid?.toString();
      const roomAddress = room.metadata?.address?.toLowerCase();
      const fidMatches = roomFid && fid && roomFid === fid.toString();
      const addressMatches = roomAddress && address && roomAddress === address.toString().toLowerCase();
      return fidMatches || addressMatches;
    });
    
    if (existingRoom) {
      showErrorMessage('You already have an active room. Please join your existing room or end it before creating a new one.');
      createRoomModal.classList.add('hide');
      // Auto-join the existing room
      const roomItem = document.querySelector(`[data-room-id="${existingRoom.id}"]`);
      if (roomItem) {
        const joinButton = roomItem.querySelector('.join-room-btn');
        if (joinButton) {
          joinButton.click();
        }
      }
      return;
    }
    
    // Show creating room pending state
    const creatingRoomMessage = document.createElement('div');
    creatingRoomMessage.className = 'frame-pending-message';
    creatingRoomMessage.textContent = 'Creating room...';
    creatingRoomMessage.style.position = 'fixed';
    creatingRoomMessage.style.top = '10px';
    creatingRoomMessage.style.left = '50%';
    creatingRoomMessage.style.transform = 'translateX(-50%)';
    creatingRoomMessage.style.padding = '10px 20px';
    creatingRoomMessage.style.backgroundColor = 'rgba(33, 150, 243, 0.9)';
    creatingRoomMessage.style.color = 'white';
    creatingRoomMessage.style.borderRadius = '4px';
    creatingRoomMessage.style.zIndex = '9999';
    creatingRoomMessage.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    
    document.body.appendChild(creatingRoomMessage);
    
    const { code, roomId } = await api.createRoom(address, fid);
    
    // Save the room ID to our global store for reliable access later
    setCurrentRoomId(roomId);
    
    // Update pending state
    creatingRoomMessage.textContent = 'Room created! Preparing to join...';
    
    createRoomModal.classList.add('hide');
    
    // Check for microphone permission (silently - no toast)
    if (!hasMicrophonePermission) {
      try {
        // Update pending message but don't show it in a toast
        creatingRoomMessage.textContent = 'Preparing your audio room...';
        
        // Try to request permission without alarming the user
        hasMicrophonePermission = await checkMicrophonePermission();
      } catch (err) {
        console.warn('Failed to get microphone permission:', err);
        // Don't show an error - just log it and continue
      }
    }

    // Join room directly as streamer
    const authToken = await hmsActions.getAuthTokenByRoomCode({ roomCode: code });

    // Try to fetch the user's profile for better display
    let userProfile = null;
    try {
      userProfile = await fetchUserProfile(fid);
    } catch (profileError) {
      console.warn('Failed to fetch user profile:', profileError);
      // Continue anyway, we'll use FID as fallback
    }
    
    // Use username from profile if available
    const userName = userProfile?.username || `FID:${fid}`;
    
    // Update pending message before joining
    creatingRoomMessage.textContent = 'Joining room...';
    
    // Use same approach as room joining - start muted then force unmute
    // This avoids the bug where streamer can't unmute
    await hmsActions.join({
      userName,
      authToken,
      // Important: specify the role to ensure we join as a streamer (speaker)
      role: 'fariscope-streamer', // This ensures we join as a streamer/speaker
      settings: {
        isAudioMuted: true, // Start muted and then force unmute
        isVideoMuted: true,  // No video for audio rooms
      },
      rememberDeviceSelection: true,
      metaData: JSON.stringify({
        fid: fid,
        isCreator: true, // Mark as room creator
        address: address, // Include address in metadata for room ownership verification
        profile: userProfile ? {
          username: userProfile.username,
          displayName: userProfile.displayName,
          pfpUrl: userProfile.pfpUrl
        } : null
      }),
      // Add error handling for permissions
      onError: (error) => {
        console.error("HMS join error:", error);
        showErrorMessage("Failed to join with audio. You may need to grant microphone permissions.");
      }
    });
    
    // Force unmute after a short delay to ensure proper initialization
    console.log('User is creating a room, will force unmute after delay');
    setTimeout(async () => {
      try {
        // Batch of unmute operations similar to our unmute function
        const forceUnmute = async () => {
          console.log('Running force unmute for room creator');
          const localPeer = hmsStore.getState(selectLocalPeer);
          
          try {
            // Standard method first
            await hmsActions.setLocalAudioEnabled(true);
            
            // Track-specific method
            if (localPeer?.id) {
              const audioTrack = hmsStore.getState(selectAudioTrackByPeerID(localPeer.id));
              if (audioTrack?.id) {
                console.log('Found audio track:', audioTrack.id);
                await hmsActions.setEnabledTrack(audioTrack.id, true);
              }
            }
            
            // Direct track access method
            if (localPeer?.audioTrack) {
              console.log('Using localPeer.audioTrack:', localPeer.audioTrack);
              await hmsActions.setEnabledTrack(localPeer.audioTrack, true);
            }
            
            // Try forcing a new publish
            try {
              if (navigator.mediaDevices) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (stream && stream.getAudioTracks().length > 0) {
                  const track = stream.getAudioTracks()[0];
                  console.log('Got new audio track from getUserMedia');
                  // We don't use this directly but it can help "wake up" the audio
                  track.enabled = true;
                  // Release the track to avoid duplicate audio
                  setTimeout(() => track.stop(), 500);
                }
              }
            } catch (mediaError) {
              console.warn('Error getting media stream:', mediaError);
            }
            
            console.log('Room creator force unmute completed');
            
            // Update UI to show unmuted state
            const muteText = muteAudio.querySelector('span');
            if (muteText) {
              muteText.textContent = "Mute";
            }
            
            // Force refresh the UI
            renderPeers();
          } catch (error) {
            console.error('Room creator force unmute error:', error);
          }
        };
        
        // Run the unmute operations
        forceUnmute();
        
        // Check success after a delay
        setTimeout(() => {
          const audioEnabled = hmsStore.getState(selectIsLocalAudioEnabled);
          if (audioEnabled) {
            console.log('Successfully unmuted audio for room creator');
            showSuccessMessage('You are now unmuted and can speak!');
          } else {
            console.warn('Failed to unmute room creator');
            showErrorMessage('Having trouble with your microphone. Try clicking the Unmute button or rejoining the room.');
          }
        }, 500);
      } catch (error) {
        console.error('Post-join unmute error for room creator:', error);
      }
    }, 2000); // 2-second delay to ensure HMS is fully initialized
    
    // Remove pending message after successful join
    creatingRoomMessage.style.opacity = '0';
    creatingRoomMessage.style.transition = 'opacity 0.5s ease';
    setTimeout(() => creatingRoomMessage.remove(), 500);
    
    // Show success message
    showSuccessMessage('Room created successfully! You are now speaking.');

    // Start the room timer
    startRoomTimer();

  } catch (error) {
    console.error('Failed to create/join room:', error);
    showErrorMessage('Failed to create room: ' + error.message);
    
    // Clean up pending message if it's still there
    if (document.querySelector('.frame-pending-message')) {
      document.querySelector('.frame-pending-message').remove();
    }
  }
};

// Modal handlers
createRoomBtn.onclick = async () => {
  createRoomModal.classList.remove('hide');
  
  // Check Frame connection status
  const frameStatus = document.getElementById('frame-status');
  const statusIndicator = frameStatus.querySelector('.status-indicator');
  const statusText = frameStatus.querySelector('.status-text');
  const frameNotConnected = document.getElementById('frame-not-connected');
  const createRoomActions = document.getElementById('create-room-actions');
  
  statusIndicator.className = 'status-indicator';
  statusText.textContent = 'Checking Farcaster connection...';
  
  // Hide error section initially
  frameNotConnected.classList.add('hide');
  
  try {
    // Try to get user info to verify connection
    let user;
    try {
      user = await frame.sdk.context.user;
    } catch (e) {
      user = null;
    }
    
    let fid = null;
    
    if (user && (user.fid || (user.user && user.user.fid))) {
      // Handle nested user object
      fid = user.fid || (user.user && user.user.fid);
      
      statusIndicator.classList.add('connected');
      statusText.textContent = 'Connected to Farcaster Frame';
      
      // Try to get wallet
      const address = await frameHelpers.getWalletAddress();
      
      // Update hidden inputs
      document.getElementById('fid').value = fid;
      if (address) {
        document.getElementById('eth-address').value = address;
      }
      
      // Enable create button
      createRoomActions.classList.remove('hide');
    } else {
      statusIndicator.classList.add('disconnected');
      statusText.textContent = 'Not connected to Farcaster Frame';
      
      // Show error message
      frameNotConnected.classList.remove('hide');
      
      // Disable create button if no FID
      createRoomActions.classList.add('hide');
    }
  } catch (error) {
    console.error('Error checking Frame connection:', error);
    statusIndicator.classList.add('disconnected');
    statusText.textContent = 'Error checking Farcaster connection';
    
    // Show error message
    frameNotConnected.classList.remove('hide');
    
    // Disable create button
    createRoomActions.classList.add('hide');
  }
};

document.querySelectorAll('.close-button').forEach(button => {
  button.onclick = () => {
    const modalId = button.dataset.modal;
    document.getElementById(modalId).classList.add('hide');
  };
});

// Load rooms on page load
loadRooms();

// Refresh rooms list periodically
setInterval(loadRooms, 30000); // Every 30 seconds

// Subscribe to peer updates
hmsStore.subscribe(renderPeers, selectPeers);

// Listen for audio status changes to update mute badges - added multiple selectors to ensure UI updates 
hmsStore.subscribe(() => {
  console.log('Local audio state changed, re-rendering UI');
  renderPeers();
}, selectIsLocalAudioEnabled);

// Also listen for any peer audio track changes
hmsStore.subscribe(() => {
  console.log('Peer audio track changes detected, re-rendering UI');
  renderPeers();
  
  // Force update UI for local peer specifically
  const localPeer = hmsStore.getState(selectLocalPeer);
  if (localPeer) {
    const isEnabled = hmsStore.getState(selectIsLocalAudioEnabled);
    console.log('Local peer audio state:', isEnabled ? 'UNMUTED' : 'MUTED');
    
    // Force update the mute/unmute button text
    const muteText = muteAudio.querySelector('span');
    if (muteText) {
      muteText.textContent = isEnabled ? "Mute" : "Unmute";
    }
    
    // Update the microphone SVG based on mute state
    const micIcon = muteAudio.querySelector('.mic-icon');
    if (micIcon) {
      if (isEnabled) {
        // Unmuted microphone
        micIcon.innerHTML = `
          <!-- Microphone body -->
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" 
                fill="currentColor" />
          <!-- Stand/base of microphone -->
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-0.49 6-3.39 6-6.92h-2z" 
                fill="currentColor" />
        `;
      } else {
        // Muted microphone with diagonal line
        micIcon.innerHTML = `
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
      }
    }
  }
}, selectAudioTrackByPeerID);

// Add debug logging for peer updates
hmsStore.subscribe((peers) => {
  console.log('Peers update:', peers);
  peers.forEach(peer => {
    console.log(`Peer ${peer.name}:`, {
      role: peer.roleName,
      isLocal: peer.isLocal,
      videoTrack: peer.videoTrack,
      audioTrack: peer.audioTrack,
      audioEnabled: peer.audioEnabled
    });
  });
}, selectPeers);

// Debug local peer role specifically
hmsStore.subscribe((localPeer) => {
  if (localPeer) {
    const expectedRole = document.getElementById('expected-role')?.value;
    
    console.log('LOCAL PEER UPDATE:', {
      id: localPeer.id,
      name: localPeer.name,
      roleName: localPeer.roleName,
      expectedRole: expectedRole || 'unknown',
      mismatch: expectedRole && localPeer.roleName !== expectedRole,
      isLocal: localPeer.isLocal,
      metadata: localPeer.metadata ? JSON.parse(localPeer.metadata) : null
    });
    
    // If there's a role mismatch, try to force proper UI
    if (expectedRole === 'fariscope-streamer' && localPeer.roleName !== 'fariscope-streamer') {
      console.warn('ROLE MISMATCH! Expected streamer but got viewer role.');
      
      // Maybe HMS is using wrong role name internally but UI should still work
      const tryForceUi = () => {
        hostControls.classList.remove('hide');
        controls.classList.remove('hide');
      };
      
      // Try forcing UI update a few times to ensure it takes
      tryForceUi();
      setTimeout(tryForceUi, 500);
      setTimeout(tryForceUi, 2000);
    }
  }
}, selectLocalPeer);

// Helper function to unlock iOS audio
function unlockIOSAudio() {
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

// Listen for the custom 'roomDisabled' event
window.addEventListener('roomDisabled', async (event) => {
  console.log('Received roomDisabled event:', event.detail);
  
  try {
    // Only handle this if we're not the creator
    if (isRoomCreator()) {
      console.log('Ignoring roomDisabled event as we are the creator');
      return;
    }
    
    // Check if the disabled room matches our current room
    const localPeer = hmsStore.getState(selectLocalPeer);
    const currentRoomId = getCurrentRoomId() || localPeer?.roomId;
    
    if (currentRoomId && currentRoomId === event.detail.roomId) {
      console.log('Our current room has been disabled by the creator');
      
      // Show message to user
      showErrorMessage('The room has been ended by the host. You will be disconnected.');
      
      // Leave the room
      try {
        await hmsActions.leave();
        console.log('Successfully left disabled room');
        
        // Go back to the rooms list
        roomsList.classList.remove('hide');
        conference.classList.add('hide');
        controls.classList.add('hide');
        
        // Refresh the rooms list
        loadRooms();
      } catch (error) {
        console.error('Error leaving disabled room:', error);
      }
    }
  } catch (error) {
    console.error('Error handling roomDisabled event:', error);
  }
});

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Note: This debug call uses an endpoint that doesn't exist in SERVER_README.md
    // Commenting it out since it's for debugging only and the endpoint may not exist
    /*
    try {
      const templateInfo = await api.getTemplateInfo();
      console.log('100ms Template Info:', templateInfo);
    } catch (e) {
      console.warn('Failed to fetch template info:', e);
    }
    */
    
    // Check for microphone permission early
    hasMicrophonePermission = await checkMicrophonePermission();
    console.log('Microphone permission:', hasMicrophonePermission ? 'granted' : 'denied/undetermined');
    
    // Add iOS audio unlock
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      console.log('iOS device detected, will unlock audio on user interaction');
    }
    
    // Initialize Frame SDK
    try {
      // Notify the frame that we're ready to display content
      await frame.sdk.actions.ready();
      console.log('Frame SDK ready');
      
      // Try to get user's Farcaster ID
      try {
        let user;
        try {
          user = await frame.sdk.context.user;
        } catch (e) {
          console.warn('Could not get user context:', e);
          user = null;
        }
        
        // Handle the known issue where user might be nested inside user object
        if (user && user.user) {
          user = user.user;
        }
        
        if (user?.fid) {
          console.log('Frame user authenticated:', user);
          
          // Set global userFid
          window.userFid = user.fid;
          
          // Fetch user profile from Neynar
          let userProfile = null;
          try {
            userProfile = await fetchUserProfile(user.fid);
            console.log('Fetched user profile:', userProfile);
          } catch (profileError) {
            console.warn('Failed to fetch user profile:', profileError);
          }
          
          // Update greeting with username if available
          const userGreeting = document.getElementById('user-greeting');
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
            const address = await frameHelpers.getWalletAddress();
            if (address) {
              const addressInput = document.getElementById('eth-address');
              if (addressInput) {
                addressInput.value = address;
              }
            }
          } catch (walletError) {
            console.warn('Could not get wallet address:', walletError);
          }
        }
      } catch (error) {
        console.warn('Could not get Frame user context:', error);
      }
    } catch (error) {
      console.error('Frame SDK initialization failed:', error);
    }
    
    // Load rooms regardless of Frame status
    loadRooms();
    
    // Set up refresh button event listener
    const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
    if (refreshRoomsBtn) {
      refreshRoomsBtn.addEventListener('click', async () => {
        // Show loading state on the button
        const originalContent = refreshRoomsBtn.innerHTML;
        refreshRoomsBtn.innerHTML = `<svg class="rotating" width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" 
                fill="currentColor" />
        </svg>`;
        refreshRoomsBtn.disabled = true;
        
        // Add rotating animation style if it doesn't exist
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
        
        try {
          // Load rooms
          await loadRooms();
          console.log('Rooms refreshed successfully');
        } catch (error) {
          console.error('Failed to refresh rooms:', error);
        } finally {
          // Restore button state
          setTimeout(() => {
            refreshRoomsBtn.innerHTML = originalContent;
            refreshRoomsBtn.disabled = false;
          }, 500); // Small delay to ensure the loading animation is visible
        }
      });
    }
    
  } catch (error) {
    console.error('App initialization failed:', error);
  }
});
