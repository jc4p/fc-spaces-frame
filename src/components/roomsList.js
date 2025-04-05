import { DOM_IDS, ROOM_REFRESH_INTERVAL } from '../config.js';
import { HMS_ROLES } from '../config.js';
import apiService from '../services/apiService.js';
import farcasterService from '../services/farcasterService.js';
import userService from '../services/userService.js';
import hmsService from '../services/hmsService.js';
import { showErrorMessage, showSuccessMessage, setButtonLoading, restoreButton } from '../utils/uiUtils.js';
import { unlockIOSAudio, isIOSBrowser } from '../utils/audioUtils.js';

/**
 * RoomsList Component
 */
class RoomsList {
  constructor() {
    // DOM elements
    this.roomsContainer = document.querySelector('.rooms-container');
    this.refreshRoomsBtn = document.getElementById(DOM_IDS.REFRESH_ROOMS_BTN);
    this.createRoomBtn = document.getElementById(DOM_IDS.CREATE_ROOM_BTN);
    this.createRoomModal = document.getElementById(DOM_IDS.CREATE_ROOM_MODAL);
    this.createRoomForm = document.getElementById(DOM_IDS.CREATE_ROOM_FORM);
    this.roomCodeInput = document.getElementById(DOM_IDS.ROOM_CODE_INPUT);
    this.nameInput = document.getElementById(DOM_IDS.NAME_INPUT);
    this.form = document.getElementById(DOM_IDS.FORM);
    this.roomsList = document.getElementById(DOM_IDS.ROOMS_LIST);

    if (!this.roomCodeInput && this.form) {
      // Add hidden input for room code if it doesn't exist
      this.roomCodeInput = document.createElement('input');
      this.roomCodeInput.type = 'hidden';
      this.roomCodeInput.id = DOM_IDS.ROOM_CODE_INPUT;
      this.form.appendChild(this.roomCodeInput);
    }

    // Setup refresh interval
    this.refreshInterval = null;
    
    // Initialize
    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Refresh button
    if (this.refreshRoomsBtn) {
      this.refreshRoomsBtn.addEventListener('click', this.handleRefreshRooms.bind(this));
    }

    // Create room button
    if (this.createRoomBtn) {
      this.createRoomBtn.addEventListener('click', this.handleOpenCreateModal.bind(this));
    }

    // Create room form
    if (this.createRoomForm) {
      this.createRoomForm.addEventListener('submit', this.handleCreateRoom.bind(this));
    }

    // Close modal buttons
    document.querySelectorAll('.close-button').forEach(button => {
      button.addEventListener('click', (event) => {
        // Make sure we stop event propagation to prevent other handlers from firing
        event.stopPropagation();
        
        const modalId = button.dataset.modal;
        if (modalId) {
          document.getElementById(modalId).classList.add('hide');
        }
      });
    });
  }

  /**
   * Start the auto-refresh interval
   */
  startRefreshInterval() {
    this.stopRefreshInterval(); // Clear any existing interval
    this.refreshInterval = setInterval(() => {
      this.loadRooms();
    }, ROOM_REFRESH_INTERVAL);
  }

  /**
   * Stop the auto-refresh interval
   */
  stopRefreshInterval() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Load the rooms list
   */
  async loadRooms() {
    try {
      const { data: rooms } = await apiService.listRooms();
      
      if (!rooms?.length) {
        this.roomsContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🎙️</div>
            <h3>No audio rooms are live right now</h3>
            <p>Create a room to start talking!</p>
          </div>
        `;
        return;
      }
      
      // Sort rooms by participant count (highest first)
      const sortedRooms = [...rooms].sort((a, b) => {
        const countA = a.participant_count || 0;
        const countB = b.participant_count || 0;
        return countB - countA;
      });
      
      this.roomsContainer.innerHTML = sortedRooms.map(room => {
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
        const currentUserFid = farcasterService.getUserFid();
        const ethAddressInput = document.getElementById(DOM_IDS.ETH_ADDRESS_INPUT);
        const ethAddress = ethAddressInput?.value || '';
        
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
                ${room.participant_count !== undefined ? `<span class="participant-count">${room.participant_count} ${room.participant_count === 1 ? 'person' : 'people'}</span>` : ''}
              </div>
            </div>
            <button class="btn-primary join-room-btn">${isCurrentUserRoom ? 'Resume Room' : 'Join Room'}</button>
          </div>
        `;
      }).join('');
      
      // Add click handlers to the join/resume room buttons
      document.querySelectorAll('.join-room-btn').forEach(btn => {
        btn.addEventListener('click', this.handleJoinRoom.bind(this));
      });
      
    } catch (error) {
      console.error('Failed to load rooms:', error);
      this.roomsContainer.innerHTML = `
        <div class="empty-state error">
          <div class="empty-state-icon">⚠️</div>
          <h3>Error loading rooms</h3>
          <p>Please try again later</p>
        </div>
      `;
    }
  }

  /**
   * Handle refresh rooms button click
   */
  async handleRefreshRooms() {
    // Show loading state on the button
    const originalContent = setButtonLoading(this.refreshRoomsBtn, 'Refreshing...');
    
    try {
      await this.loadRooms();
      console.log('Rooms refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh rooms:', error);
    } finally {
      // Restore button state after a short delay to ensure loading is visible
      restoreButton(this.refreshRoomsBtn, originalContent, 500);
    }
  }

  /**
   * Handle opening the create room modal
   */
  async handleOpenCreateModal() {
    this.createRoomModal.classList.remove('hide');
    
    // Check Frame connection status
    const frameStatus = document.getElementById('frame-status');
    const statusIndicator = frameStatus?.querySelector('.status-indicator');
    const statusText = frameStatus?.querySelector('.status-text');
    const frameNotConnected = document.getElementById('frame-not-connected');
    const createRoomActions = document.getElementById('create-room-actions');
    
    if (statusIndicator && statusText) {
      statusIndicator.className = 'status-indicator';
      statusText.textContent = 'Checking Farcaster connection...';
    }
    
    // Hide error section initially
    if (frameNotConnected) {
      frameNotConnected.classList.add('hide');
    }
    
    try {
      // Ensure Farcaster SDK is initialized
      await farcasterService.initialize();
      
      // Check for user's FID
      const fid = farcasterService.getUserFid();
      
      if (fid) {
        if (statusIndicator && statusText) {
          statusIndicator.classList.add('connected');
          statusText.textContent = 'Connected to Farcaster Frame';
        }
        
        // Try to get wallet
        const address = await farcasterService.getWalletAddress();
        
        // Update hidden inputs
        document.getElementById('fid').value = fid;
        if (address) {
          document.getElementById(DOM_IDS.ETH_ADDRESS_INPUT).value = address;
        }
        
        // Enable create button
        if (createRoomActions) {
          createRoomActions.classList.remove('hide');
        }
      } else {
        if (statusIndicator && statusText) {
          statusIndicator.classList.add('disconnected');
          statusText.textContent = 'Not connected to Farcaster Frame';
        }
        
        // Show error message
        if (frameNotConnected) {
          frameNotConnected.classList.remove('hide');
        }
        
        // Disable create button if no FID
        if (createRoomActions) {
          createRoomActions.classList.add('hide');
        }
      }
    } catch (error) {
      console.error('Error checking Frame connection:', error);
      if (statusIndicator && statusText) {
        statusIndicator.classList.add('disconnected');
        statusText.textContent = 'Error checking Farcaster connection';
      }
      
      // Show error message
      if (frameNotConnected) {
        frameNotConnected.classList.remove('hide');
      }
      
      // Disable create button
      if (createRoomActions) {
        createRoomActions.classList.add('hide');
      }
    }
  }

  /**
   * Handle create room form submission
   * @param {Event} e - Form submission event
   */
  async handleCreateRoom(e) {
    e.preventDefault();
    
    // Try to unlock iOS audio on this user interaction
    if (isIOSBrowser()) {
      console.log('Attempting to unlock iOS audio on create room submit');
      unlockIOSAudio();
    }
    
    // Get values from hidden inputs which should be populated by Frame SDK
    let address = document.getElementById(DOM_IDS.ETH_ADDRESS_INPUT).value;
    let fid = document.getElementById('fid').value || farcasterService.getUserFid();
    
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
        
        address = await farcasterService.getWalletAddress();
        
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
      const { data: rooms } = await apiService.listRooms();
      
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
        this.createRoomModal.classList.add('hide');
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
      
      const { code, roomId } = await apiService.createRoom(address, fid);
      
      // Save the room ID to HMS service for reliable access later
      hmsService.setCurrentRoomId(roomId);
      
      // Update pending state
      creatingRoomMessage.textContent = 'Room created! Preparing to join...';
      
      this.createRoomModal.classList.add('hide');
  
      // Try to fetch the user's profile for better display
      let userProfile = null;
      try {
        userProfile = await userService.fetchUserProfile(fid);
      } catch (profileError) {
        console.warn('Failed to fetch user profile:', profileError);
        // Continue anyway, we'll use FID as fallback
      }
      
      // Use username from profile if available
      const userName = userProfile?.username || `FID:${fid}`;
      
      // Update pending message before joining
      creatingRoomMessage.textContent = 'Joining room...';
      
      // Join as streamer with creator metadata
      await hmsService.joinAsStreamer({
        roomCode: code,
        userName,
        metaData: {
          fid: fid,
          isCreator: true, // Mark as room creator
          address: address, // Include address in metadata for room ownership verification
          profile: userProfile ? {
            username: userProfile.username,
            displayName: userProfile.displayName,
            pfpUrl: userProfile.pfpUrl
          } : null
        }
      });
      
      // Remove pending message after successful join
      creatingRoomMessage.style.opacity = '0';
      creatingRoomMessage.style.transition = 'opacity 0.5s ease';
      setTimeout(() => {
        if (document.body.contains(creatingRoomMessage)) {
          document.body.removeChild(creatingRoomMessage);
        }
      }, 500);
      
      // Show success message
      showSuccessMessage('Room created successfully! You are now speaking.');
      
      // Add a hidden input for expected role
      const expectedRoleInput = document.getElementById('expected-role') || 
                             document.createElement('input');
      expectedRoleInput.id = 'expected-role';
      expectedRoleInput.type = 'hidden';
      expectedRoleInput.value = HMS_ROLES.STREAMER;
      document.body.appendChild(expectedRoleInput);
  
    } catch (error) {
      console.error('Failed to create/join room:', error);
      showErrorMessage('Failed to create room: ' + error.message);
      
      // Clean up pending message if it's still there
      const pendingMessage = document.querySelector('.frame-pending-message');
      if (pendingMessage && document.body.contains(pendingMessage)) {
        document.body.removeChild(pendingMessage);
      }
    }
  }

  /**
   * Handle join room button click
   * @param {Event} event - Click event
   */
  async handleJoinRoom(event) {
    console.log('Join/Resume button clicked', event.target);
    
    // Try to unlock iOS audio on this user interaction
    if (isIOSBrowser()) {
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
    const fid = farcasterService.getUserFid();
    
    console.log('Joining room with ID:', roomId, 'as FID:', fid);
    console.log('Button text:', event.target.textContent);
    
    if (!fid) {
      console.log('No FID found, showing error message');
      showErrorMessage('Please connect with Farcaster first');
      
      // Reset room item
      roomItem.classList.remove('active-room');
      
      return;
    }
    
    try {
      // Show joining indicator
      event.target.disabled = true;
      const originalContent = setButtonLoading(event.target, 'Joining...');
      
      // Fetch user profile
      let userProfile = null;
      try {
        userProfile = await userService.fetchUserProfile(fid);
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
        userAddress = document.getElementById(DOM_IDS.ETH_ADDRESS_INPUT)?.value || '';
        if (!userAddress) {
          console.log('No ETH address in input field, trying to get from frame SDK');
          userAddress = await farcasterService.getWalletAddress() || '';
        }
        console.log('Got user ETH address:', userAddress);
        userAddress = userAddress.toLowerCase();
      } catch (e) {
        console.warn('Failed to get wallet address:', e);
        userAddress = '';
      }
      
      // Join the room directly without showing the form
      const { code, role: serverRole, serverIsCreator } = await apiService.joinRoom(roomId, fid, userAddress);
      
      // Save the room ID to HMS service for reliable access later
      hmsService.setCurrentRoomId(roomId);
      
      console.log('Server response:', { code, serverRole, serverIsCreator });
      
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
      const userRole = serverRole || (isLikelyCreator ? HMS_ROLES.STREAMER : HMS_ROLES.VIEWER);
      
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
      
      // Use username from profile if available
      const userName = userProfile?.username || `FID:${fid}`;
      
      const metaData = {
        fid: fid,
        isCreator: serverIsCreator !== undefined ? serverIsCreator : isCreatorJoining, // Use server value if available
        address: userAddress || '', // Include address in metadata
        profile: userProfile || null
      };
      
      try {
        if (userRole === HMS_ROLES.STREAMER) {
          await hmsService.joinAsStreamer({
            roomCode: code,
            userName,
            metaData
          });
        } else {
          await hmsService.joinAsViewer({
            roomCode: code,
            userName,
            metaData
          });
        }
        
        // Success will be handled by the connection state subscription
      } catch (joinError) {
        console.error('Error in final join stage:', joinError);
        showErrorMessage('Failed to join room: ' + joinError.message);
        
        // Reset room item
        roomItem.classList.remove('active-room');
        
        // Restore button
        restoreButton(event.target, originalContent);
      }
      
    } catch (error) {
      console.error('Failed to join room:', error);
      showErrorMessage('Failed to join room: ' + error.message);
      
      // Reset room item
      roomItem.classList.remove('active-room');
      
      // Reset button
      event.target.disabled = false;
      event.target.textContent = 'Join Room';
    }
  }

  /**
   * Initialize the component
   */
  init() {
    // Load rooms initially
    this.loadRooms();
    
    // Start auto-refresh
    this.startRefreshInterval();
  }

  /**
   * Cleanup when component is destroyed
   */
  destroy() {
    // Stop auto-refresh
    this.stopRefreshInterval();
    
    // Remove event listeners
    if (this.refreshRoomsBtn) {
      this.refreshRoomsBtn.removeEventListener('click', this.handleRefreshRooms.bind(this));
    }
    
    if (this.createRoomBtn) {
      this.createRoomBtn.removeEventListener('click', this.handleOpenCreateModal.bind(this));
    }
    
    if (this.createRoomForm) {
      this.createRoomForm.removeEventListener('submit', this.handleCreateRoom.bind(this));
    }
  }
}

export default RoomsList; 