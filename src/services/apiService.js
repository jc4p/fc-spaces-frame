import { API_CONFIG } from '../config.js';

/**
 * API client for interacting with the backend server
 */
class ApiService {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  /**
   * Lists all active rooms
   * @returns {Promise<Object>} - Server response with rooms data
   */
  async listRooms() {
    const response = await fetch(`${this.baseUrl}/rooms`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch rooms');
    }
    return response.json();
  }

  /**
   * Creates a new room
   * @param {string} address - ETH address of the creator
   * @param {string} fid - Farcaster ID of the creator
   * @returns {Promise<Object>} - Server response with room data
   */
  async createRoom(address, fid) {
    const response = await fetch(`${this.baseUrl}/create-room`, {
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
  }

  /**
   * Joins an existing room
   * @param {string} roomId - ID of the room to join
   * @param {string} fid - Farcaster ID of the user
   * @param {string} address - ETH address of the user
   * @returns {Promise<Object>} - Server response with join data
   */
  async joinRoom(roomId, fid, address) {
    const response = await fetch(`${this.baseUrl}/join-room`, {
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
  }
  
  /**
   * Disables/ends a room
   * @param {string} roomId - ID of the room to disable
   * @param {string} address - ETH address of the creator
   * @param {string} fid - Farcaster ID of the creator
   * @returns {Promise<Object>} - Server response
   */
  async disableRoom(roomId, address, fid) {
    console.log('API call to disable room with params:', {roomId, address, fid});
    
    // Format the data according to the server expectations
    const requestData = {
      roomId: roomId.toString(),
      address: address.toString(), 
      fid: fid.toString()
    };
    
    const response = await fetch(`${this.baseUrl}/disable-room`, {
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
  }
  
  /**
   * Gets template information (for debugging only)
   * @returns {Promise<Object>} - Server response with template info
   */
  async getTemplateInfo() {
    console.warn('Warning: /template-info endpoint not documented in SERVER_README.md');
    const response = await fetch(`${this.baseUrl}/template-info`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch template info');
    }
    return response.json();
  }
  
  /**
   * Gets room information (for debugging only)
   * @param {string} roomId - ID of the room to get info for
   * @returns {Promise<Object>} - Server response with room info
   */
  async getRoomInfo(roomId) {
    console.warn('Warning: /room-info/${roomId} endpoint not documented in SERVER_README.md');
    const response = await fetch(`${this.baseUrl}/room-info/${roomId}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch room info');
    }
    return response.json();
  }
}

// Create and export a singleton instance
const apiService = new ApiService(API_CONFIG.BASE_URL);
export default apiService; 