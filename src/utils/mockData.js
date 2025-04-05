import { HMS_ROLES } from '../config.js';

/**
 * Generate a list of mock users for debug purposes
 * @param {number} count - The number of users to generate
 * @param {boolean} includeCreator - Whether to include the creator user as first user
 * @param {string} creatorFid - The creator's FID
 * @returns {Array} - Array of mock users
 */
export function generateMockUsers(count = 12, includeCreator = true, creatorFid = '12345') {
  const users = [];
  
  // Add creator if requested
  if (includeCreator) {
    users.push({
      id: 'creator-peer-id',
      name: 'Debug Creator',
      fid: creatorFid,
      isLocal: false,
      audioEnabled: true,
      videoEnabled: false,
      role: HMS_ROLES.STREAMER,
      username: 'debug_creator',
      displayName: 'Debug Creator',
      pfp: 'https://i.pravatar.cc/150?u=debugcreator',
      isCreator: true,
      isSpeaking: Math.random() > 0.7
    });
    count--; // Reduce count by one since we added the creator
  }
  
  // How many should be speakers vs listeners (roughly 1/3 speakers)
  const speakerCount = Math.max(1, Math.floor(count / 3));
  
  // Generate random users
  for (let i = 0; i < count; i++) {
    const isSpeaker = i < speakerCount;
    const userId = `mock-user-${i}`;
    const fid = (10000 + i).toString();
    
    users.push({
      id: userId,
      name: `User ${i}`,
      fid: fid,
      isLocal: i === 0 && !includeCreator, // First non-creator user is local
      audioEnabled: isSpeaker, // Speakers have audio enabled
      videoEnabled: false,
      role: isSpeaker ? HMS_ROLES.STREAMER : HMS_ROLES.VIEWER,
      username: `user_${i}`,
      displayName: `User ${i}`,
      pfp: `https://i.pravatar.cc/150?u=${userId}`,
      isCreator: false,
      isSpeaking: isSpeaker && Math.random() > 0.7 // Randomly set some speakers as speaking
    });
  }
  
  return users;
}

/**
 * Generate a mock room for debugging
 * @param {string} roomId - The room ID
 * @param {string} roomName - The room name
 * @param {string} creatorFid - The creator's FID
 * @returns {Object} - A mock room object
 */
export function generateMockRoom(roomId = 'debug-room-123', roomName = 'Debug Room', creatorFid = '12345') {
  return {
    id: roomId,
    description: roomName,
    code: 'DEBUG',
    creator_fid: creatorFid,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    participants: generateMockUsers(12, true, creatorFid),
    token: 'mock-token-for-debugging'
  };
}

/**
 * Generate a list of mock rooms
 * @param {number} count - Number of rooms to generate
 * @returns {Array} - Array of mock rooms
 */
export function generateMockRooms(count = 3) {
  const rooms = [];
  
  for (let i = 0; i < count; i++) {
    const roomId = `debug-room-${i}`;
    const randomParticipants = Math.floor(Math.random() * 15) + 3; // 3-18 participants
    
    rooms.push({
      id: roomId,
      description: `Debug Room ${i}`,
      code: `DBG${i}`,
      creator_fid: (10000 + i).toString(),
      active: true,
      created_at: new Date(Date.now() - Math.random() * 3600000).toISOString(), // Random start time in the last hour
      updated_at: new Date().toISOString(),
      participants_count: randomParticipants
    });
  }
  
  return rooms;
} 