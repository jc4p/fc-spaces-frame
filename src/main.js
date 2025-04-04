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

  async joinRoom(roomId, fid) {
    const response = await fetch(`${API_CONFIG.BASE_URL}/join-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomId, fid }),
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
    
    // Check metadata to see if this user is the creator
    let isCreator = false;
    let metadata = {};
    
    try {
      if (localPeer.metadata) {
        metadata = JSON.parse(localPeer.metadata);
        isCreator = !!metadata.isCreator;
      }
    } catch (e) {
      console.warn('Failed to parse metadata when leaving:', e);
    }
    
    console.log('Leaving room, isCreator:', isCreator, 'metadata:', metadata);
    
    // If user is the creator, offer to disable the room
    if (isCreator) {
      // Get required info for disabling the room
      const roomId = localPeer.roomId;
      const fid = metadata.fid || window.userFid;
      const address = metadata.address || document.getElementById("eth-address")?.value;
      
      if (roomId && (fid || address)) {
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
  
  // Set room title based on the first streamer's name
  const streamer = peers.find(peer => peer.roleName === 'fariscope-streamer');
  if (streamer) {
    let streamerId = streamer.name;
    if (streamerId.startsWith('FID:')) {
      streamerId = streamerId.split('FID:')[1];
    }
    roomTitle.textContent = `Audio Room hosted by FID:${streamerId}`;
  }
  
  // Separate speakers (streamers) and listeners (viewers)
  const speakers = peers.filter(peer => peer.roleName === 'fariscope-streamer');
  const listeners = peers.filter(peer => peer.roleName === 'fariscope-viewer');
  
  // If the room is starting for the first time, set up the duration timer
  if (speakers.length && !roomStartTime) {
    startRoomTimer();
  }
  
  // Show/hide host controls if we're the streamer
  const isHost = localPeer?.roleName === 'fariscope-streamer';
  hostControls.classList.toggle('hide', !isHost);
  
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
    const isMuted = !speaker.audioEnabled;
    const isHost = true; // All speakers are hosts in this app
    const isSpeaking = speakingPeers.get(speaker.id); // Check if the peer is currently speaking
    
    // Check if we have a profile picture
    const hasPfp = profile && profile.pfpUrl;
    const avatarContent = hasPfp 
      ? `<img src="${profile.pfpUrl}" alt="${displayName}" />`
      : speaker.name.charAt(0).toUpperCase();
    
    // Only show mute badge if the speaker is actually muted
    // For the local user, check if they have mic permissions before showing the mute badge
    const showMuteBadge = isLocal 
      ? (isMuted && hasMicrophonePermission) // Only show mute badge for local user if they have mic permissions
      : isMuted; // For remote users, show based on their actual mute state
    
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
    const isMuted = !listener.audioEnabled;
    const isSpeaking = speakingPeers.get(listener.id); // Check if the peer is currently speaking
    
    // Check if we have a profile picture
    const hasPfp = profile && profile.pfpUrl;
    const avatarContent = hasPfp 
      ? `<img src="${profile.pfpUrl}" alt="${displayName}" />`
      : listener.name.charAt(0).toUpperCase();
    
    // Only show mute badge if the listener is actually muted
    // For the local user, check if they have mic permissions before showing the mute badge
    const showMuteBadge = isLocal 
      ? (isMuted && hasMicrophonePermission) // Only show mute badge for local user if they have mic permissions
      : isMuted; // For remote users, show based on their actual mute state
    
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
  
  peers.forEach(peer => {
    // Skip peers with no audio track or muted peers
    if (!peer.audioTrack || !peer.audioEnabled) {
      speakingPeers.set(peer.id, false);
      return;
    }
    
    try {
      // Get audio level for the peer
      const audioTrack = hmsStore.getState(selectAudioTrackByPeerID(peer.id));
      
      if (audioTrack && audioTrack.id) {
        // Get audio level - value between 0 and 1
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
    
    // If we still don't have permissions, ask for them
    if (!hasMicrophonePermission) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          hasMicrophonePermission = true;
        }
      } catch (err) {
        console.warn('Microphone permission request failed:', err);
        showErrorMessage('Please allow microphone access to unmute yourself.');
        return;
      }
    }
    
    // Toggle audio state
    const audioEnabled = !hmsStore.getState(selectIsLocalAudioEnabled);
    await hmsActions.setLocalAudioEnabled(audioEnabled);
    
    // Update button text
    const muteText = muteAudio.querySelector('span');
    if (muteText) {
      muteText.textContent = audioEnabled ? "Mute" : "Unmute";
    }
    
    // Force refresh the UI to update mute badges
    renderPeers();
  } catch (error) {
    console.error('Error toggling audio:', error);
    showErrorMessage('Failed to change audio state. Please try again.');
  }
};

// Share room to Warpcast
const shareWarpcastBtn = document.getElementById("share-warpcast");
if (shareWarpcastBtn) {
  shareWarpcastBtn.onclick = async () => {
    const localPeer = hmsStore.getState(selectLocalPeer);
    const roomId = localPeer?.roomId;
    const fid = window.userFid || (localPeer?.name.includes('FID:') ? localPeer.name.split('FID:')[1] : '');
    
    if (roomId) {
      const shareUrl = `${window.location.origin}/join?roomId=${roomId}`;
      const shareText = `Join my FC AUDIO CHAT room!${fid ? ' Hosted by FID:' + fid : ''}`;
      
      frameHelpers.shareToCast(shareText, shareUrl);
    }
  };
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
      
      // Get the required parameters
      // Try multiple ways to get the room ID
      let roomId = localPeer.roomId;
      
      // If roomId is not available directly, try to find it from other sources
      if (!roomId) {
        // Try to get room ID from metadata
        if (metadata?.roomId) {
          roomId = metadata.roomId;
        } else {
          // Try to find it from active room items in the DOM
          const roomsList = document.querySelectorAll('.room-item');
          for (const roomItem of roomsList) {
            if (roomItem.classList.contains('active-room')) {
              roomId = roomItem.dataset.roomId;
              break;
            }
          }
        }
        
        // If we still can't find it, show inline error instead of alert
        if (!roomId) {
          const errorDiv = document.createElement('div');
          errorDiv.className = 'error-message';
          errorDiv.textContent = 'Could not determine room ID. Please try rejoining the room.';
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
          
          throw new Error('Could not determine room ID');
        }
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
      // Use the 100ms SDK to change role directly
      await hmsActions.changeRoleOfPeer(selectedPeerId, 'fariscope-streamer', true);
      
      // Close the modal
      listenerActionModal.classList.add('hide');
      selectedPeerId = null;
      
      // Show success message
      showSuccessMessage('Successfully promoted to speaker! They can now talk in the room.');
      
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
    
    // Start the speaking detection interval
    if (!speakingUpdateInterval) {
      speakingUpdateInterval = setInterval(updateSpeakingStatus, 500);
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
    
    // Join the room directly without showing the form
    const { code, role: serverRole, isCreator: serverIsCreator } = await api.joinRoom(roomId, fid);
    
    console.log('Server response:', { code, serverRole, serverIsCreator });
    
    // Join with HMS
    const authToken = await hmsActions.getAuthTokenByRoomCode({ roomCode: code });
    
    const userName = userProfile?.username || `FID:${fid}`;
    
    // Check if this room was created by the current user
    // We need to examine the room information to determine this
    const creatorFid = roomItem.dataset.creatorFid;
    const creatorAddress = roomItem.dataset.creatorAddress;
    
    // Get the current user's ETH address if available
    let userAddress;
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
    const userRole = serverRole || (isCreatorJoining ? 'fariscope-streamer' : 'fariscope-viewer');
    
    // Store expected role in hidden input for debugging
    const expectedRoleInput = document.getElementById('expected-role') || 
                            document.createElement('input');
    expectedRoleInput.id = 'expected-role';
    expectedRoleInput.type = 'hidden';
    expectedRoleInput.value = userRole;
    document.body.appendChild(expectedRoleInput);
    
    // If joining as speaker, default to unmuted for audio
    const isJoiningAsSpeaker = userRole === 'fariscope-streamer';
    const defaultAudioMuted = !isJoiningAsSpeaker;
    
    console.log(`User with FID ${fid} is joining as ${userRole}`);
    
    await hmsActions.join({
      userName,
      authToken,
      role: userRole,
      // Debug all params
      debug: true,
      settings: {
        isAudioMuted: defaultAudioMuted,
        isVideoMuted: true, // Always keep video muted since this is audio-only
      },
      rememberDeviceSelection: true,
      metaData: JSON.stringify({
        fid: fid,
        isCreator: serverIsCreator !== undefined ? serverIsCreator : isCreatorJoining, // Use server value if available
        profile: userProfile || null
      })
    });
    
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
            <div class="room-title">Audio Room with FID: ${fid}</div>
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
    
    // Update pending state
    creatingRoomMessage.textContent = 'Room created! Preparing to join...';
    
    createRoomModal.classList.add('hide');
    
    // Check for microphone permission
    if (!hasMicrophonePermission) {
      // Try to request permission if we don't have it
      try {
        // Update pending message
        creatingRoomMessage.textContent = 'Requesting microphone access...';
        
        hasMicrophonePermission = await checkMicrophonePermission();
      } catch (err) {
        console.warn('Failed to get microphone permission:', err);
        // Show a warning but continue - audio-only rooms can work in listen-only mode
        showErrorMessage('Microphone access was denied. You may be able to listen only.');
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
    
    // No need for video preview since it's audio-only
    await hmsActions.join({
      userName,
      authToken,
      // Important: specify the role to ensure we join as a streamer (speaker)
      role: 'fariscope-streamer', // This ensures we join as a streamer/speaker
      settings: {
        isAudioMuted: false, // Streamer starts unmuted
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

// Also specifically listen for audio status changes to update mute badges
hmsStore.subscribe(() => {
  // Audio status changed, re-render peers to update mute badges
  renderPeers();
}, selectIsLocalAudioEnabled);

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
    
  } catch (error) {
    console.error('App initialization failed:', error);
  }
});
