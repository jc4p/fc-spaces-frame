import { API_CONFIG, DEBUG_MODE, DEBUG_ROOM } from '../config.js';
import { generateMockRoom, generateMockRooms } from '../utils/mockData.js';

/**
 * API client for interacting with the backend server
 */
class ApiService {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.mockDebugRoom = DEBUG_ROOM.enabled ? generateMockRoom(DEBUG_ROOM.roomId, DEBUG_ROOM.roomName, DEBUG_ROOM.creatorFid) : null;
  }

  /**
   * Lists all active rooms
   * @returns {Promise<Object>} - Server response with rooms data
   */
  async listRooms() {
    // Use mock data in debug mode
    if (DEBUG_MODE) {
      console.log('[DEBUG] Using mock rooms data');
      const mockRooms = generateMockRooms(2);
      
      // Add our debug room to the list if enabled
      if (DEBUG_ROOM.enabled) {
        mockRooms.unshift({
          id: DEBUG_ROOM.roomId,
          name: DEBUG_ROOM.roomName,
          code: 'DEBUG',
          creator_fid: DEBUG_ROOM.creatorFid,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          participants_count: DEBUG_ROOM.participantCount
        });
      }
      
      return { limit: 10, data: mockRooms };
    }
    
    // Regular API call
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
    // Use mock data in debug mode
    if (DEBUG_MODE) {
      console.log('[DEBUG] Creating mock room');
      const mockRoom = generateMockRoom(`debug-room-created-${Date.now()}`, 'New Debug Room', fid);
      return { room: mockRoom, token: 'mock-token-for-debugging' };
    }
    
    // Regular API call
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
    // Use mock data in debug mode
    if (DEBUG_MODE) {
      console.log('[DEBUG] Joining mock room:', roomId);
      
      // If joining our specific debug room, return that
      if (DEBUG_ROOM.enabled && roomId === DEBUG_ROOM.roomId) {
        return { 
          room: this.mockDebugRoom,
          token: 'mock-token-for-debugging'
        };
      }
      
      // Otherwise generate a generic mock room
      const mockRoom = generateMockRoom(roomId, `Room ${roomId}`, '12345');
      return { room: mockRoom, token: 'mock-token-for-debugging' };
    }
    
    // Regular API call
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
    
    // Use mock data in debug mode
    if (DEBUG_MODE) {
      console.log('[DEBUG] Disabling mock room:', roomId);
      
      // Trigger room disabled event
      try {
        const roomDisabledEvent = new CustomEvent('roomDisabled', {
          detail: { roomId, disabledBy: fid }
        });
        window.dispatchEvent(roomDisabledEvent);
        console.log('[DEBUG] Room disabled event dispatched');
      } catch (eventError) {
        console.warn('Failed to dispatch room disabled event:', eventError);
      }
      
      return { success: true, message: 'Mock room disabled' };
    }
    
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