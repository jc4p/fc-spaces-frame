import { DEBUG_MODE, DEBUG_ROOM } from '../config.js';
import hmsService from '../services/hmsService.js';

/**
 * Debug helper utility for managing debug state and UI
 */
class DebugHelper {
  constructor() {
    this.isDebugMode = DEBUG_MODE;
    this.debugRoom = DEBUG_ROOM;
    this.isCollapsed = false;
    this.debugContainer = null;
    this.contentContainer = null;
  }
  
  /**
   * Initialize debug mode, adding debug controls if necessary
   */
  init() {
    if (!this.isDebugMode) return;
    
    console.log('[DEBUG] Debug helper initializing...');
    
    // Add debug controls to the page with a short delay to ensure DOM is fully loaded
    setTimeout(() => {
      console.log('[DEBUG] Debug helper adding controls...');
      this.addDebugControls();
      console.log('[DEBUG] Debug helper initialized');
    }, 2000);
  }
  
  /**
   * Add debug controls to the UI
   */
  addDebugControls() {
    // Create debug controls container
    const debugContainer = document.createElement('div');
    this.debugContainer = debugContainer;
    debugContainer.className = 'debug-controls';
    debugContainer.style.position = 'fixed';
    debugContainer.style.bottom = '10px';
    debugContainer.style.right = '10px';
    debugContainer.style.background = 'rgba(0, 0, 0, 0.8)';
    debugContainer.style.color = 'white';
    debugContainer.style.padding = '10px';
    debugContainer.style.borderRadius = '5px';
    debugContainer.style.zIndex = '9999';
    debugContainer.style.fontSize = '12px';
    debugContainer.style.fontFamily = 'monospace';
    debugContainer.style.transition = 'all 0.3s ease';
    
    // Create header row with title and collapse button
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';
    headerRow.style.marginBottom = '5px';
    
    // Add header text
    const headerText = document.createElement('div');
    headerText.textContent = '🐞 DEBUG CONTROLS';
    headerText.style.fontWeight = 'bold';
    headerText.style.flex = '1';
    
    // Add collapse/expand button
    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = '🔼';
    collapseBtn.style.background = 'transparent';
    collapseBtn.style.border = 'none';
    collapseBtn.style.color = 'white';
    collapseBtn.style.cursor = 'pointer';
    collapseBtn.style.fontSize = '10px';
    collapseBtn.style.padding = '2px 5px';
    collapseBtn.title = 'Collapse debug menu';
    
    collapseBtn.addEventListener('click', () => {
      this.toggleCollapse();
    });
    
    // Add elements to header row
    headerRow.appendChild(headerText);
    headerRow.appendChild(collapseBtn);
    
    // Add header row to debug container
    debugContainer.appendChild(headerRow);
    
    // Create content container for collapsible elements
    const contentContainer = document.createElement('div');
    this.contentContainer = contentContainer;
    contentContainer.className = 'debug-content';
    contentContainer.style.transition = 'all 0.3s ease';
    
    // Add status text
    const statusText = document.createElement('div');
    statusText.textContent = 'Status: Ready';
    statusText.className = 'debug-status';
    statusText.style.marginBottom = '5px';
    statusText.style.fontSize = '10px';
    statusText.style.color = '#4CAF50';
    statusText.style.textAlign = 'center';
    contentContainer.appendChild(statusText);
    
    // Add join debug room button
    const joinRoomBtn = document.createElement('button');
    joinRoomBtn.textContent = 'Join Debug Room';
    joinRoomBtn.className = 'debug-btn join-debug-room';
    joinRoomBtn.style.padding = '5px';
    joinRoomBtn.style.margin = '5px';
    joinRoomBtn.style.width = '100%';
    joinRoomBtn.style.cursor = 'pointer';
    joinRoomBtn.addEventListener('click', () => {
      // Update status
      statusText.textContent = 'Status: Joining room...';
      statusText.style.color = '#FFC107';
      
      // Disable button during join
      joinRoomBtn.disabled = true;
      joinRoomBtn.style.opacity = '0.5';
      
      // Set a small delay to ensure all components are initialized
      setTimeout(() => {
        this.joinDebugRoom();
        
        // Re-enable button after a short delay
        setTimeout(() => {
          joinRoomBtn.disabled = false;
          joinRoomBtn.style.opacity = '1';
          statusText.textContent = 'Status: Ready';
          statusText.style.color = '#4CAF50';
        }, 2000);
      }, 1000);
    });
    contentContainer.appendChild(joinRoomBtn);
    
    // Add toggle speakers button
    const toggleSpeakersBtn = document.createElement('button');
    toggleSpeakersBtn.textContent = 'Toggle Random Speaker';
    toggleSpeakersBtn.className = 'debug-btn toggle-speakers';
    toggleSpeakersBtn.style.padding = '5px';
    toggleSpeakersBtn.style.margin = '5px';
    toggleSpeakersBtn.style.width = '100%';
    toggleSpeakersBtn.style.cursor = 'pointer';
    toggleSpeakersBtn.addEventListener('click', () => {
      this.toggleRandomSpeaker();
    });
    contentContainer.appendChild(toggleSpeakersBtn);
    
    // Add leave room button
    const leaveRoomBtn = document.createElement('button');
    leaveRoomBtn.textContent = 'Leave Debug Room';
    leaveRoomBtn.className = 'debug-btn leave-debug-room';
    leaveRoomBtn.style.padding = '5px';
    leaveRoomBtn.style.margin = '5px';
    leaveRoomBtn.style.width = '100%';
    leaveRoomBtn.style.cursor = 'pointer';
    leaveRoomBtn.addEventListener('click', () => {
      this.leaveDebugRoom();
    });
    contentContainer.appendChild(leaveRoomBtn);
    
    // Add the content container to the main container
    debugContainer.appendChild(contentContainer);
    
    // Add to document
    document.body.appendChild(debugContainer);
  }
  
  /**
   * Toggle collapse/expand state of the debug menu
   */
  toggleCollapse() {
    if (!this.debugContainer || !this.contentContainer) return;
    
    this.isCollapsed = !this.isCollapsed;
    
    if (this.isCollapsed) {
      // Collapse the menu
      this.contentContainer.style.display = 'none';
      this.debugContainer.style.opacity = '0.7';
      
      // Update collapse button
      const collapseBtn = this.debugContainer.querySelector('button');
      if (collapseBtn) {
        collapseBtn.textContent = '🔽';
        collapseBtn.title = 'Expand debug menu';
      }
    } else {
      // Expand the menu
      this.contentContainer.style.display = 'block';
      this.debugContainer.style.opacity = '1';
      
      // Update collapse button
      const collapseBtn = this.debugContainer.querySelector('button');
      if (collapseBtn) {
        collapseBtn.textContent = '🔼';
        collapseBtn.title = 'Collapse debug menu';
      }
    }
  }
  
  /**
   * Join the debug room (triggers the same events as a normal join)
   */
  joinDebugRoom() {
    if (!this.isDebugMode) return;
    
    console.log('[DEBUG] Manually joining debug room');
    
    // Directly trigger the debug join event
    // This is more reliable than trying to find and click DOM elements
    const joinEvent = new CustomEvent('debugJoinRoom', {
      detail: { 
        roomId: this.debugRoom.roomId
      }
    });
    document.dispatchEvent(joinEvent);
  }
  
  /**
   * Toggle a random speaker's speaking state
   */
  toggleRandomSpeaker() {
    if (!this.isDebugMode) return;
    
    const peers = hmsService.getPeers();
    const speakers = peers.filter(peer => 
      peer.role === 'fariscope-streamer' && !peer.isLocal);
    
    if (speakers.length > 0) {
      // Pick a random speaker
      const randomIndex = Math.floor(Math.random() * speakers.length);
      const speaker = speakers[randomIndex];
      
      // Toggle speaking state
      speaker.isSpeaking = !speaker.isSpeaking;
      
      console.log(`[DEBUG] Toggled speaking for ${speaker.name}: ${speaker.isSpeaking ? 'speaking' : 'not speaking'}`);
      
      // Make sure the speaking peers map is updated
      const speakingPeers = hmsService.getSpeakingPeers();
      speakingPeers.set(speaker.id, speaker.isSpeaking);
      
      // Trigger an update in the UI
      const updateEvent = new CustomEvent('debugSpeakingUpdate', {
        detail: { peerId: speaker.id, isSpeaking: speaker.isSpeaking }
      });
      document.dispatchEvent(updateEvent);
    } else {
      console.log('[DEBUG] No speakers found to toggle');
    }
  }
  
  /**
   * Leave the debug room
   */
  leaveDebugRoom() {
    if (!this.isDebugMode) return;
    
    console.log('[DEBUG] Manually leaving debug room');
    
    // Click the leave room button if available
    const leaveBtn = document.getElementById('leave-room-btn');
    if (leaveBtn) {
      leaveBtn.click();
    } else {
      // Otherwise trigger a leave event directly
      hmsService.leaveRoom();
      
      // Trigger a custom event to update the UI
      const leaveEvent = new CustomEvent('debugLeaveRoom');
      document.dispatchEvent(leaveEvent);
    }
  }
}

// Create and export a singleton instance
const debugHelper = new DebugHelper();
export default debugHelper; 