import { API_CONFIG, PROFILE_CACHE_TIMEOUT } from '../config.js';

/**
 * Service for managing user profiles
 */
class UserService {
  constructor() {
    // Store for user profiles
    this.userProfiles = new Map();
  }

  /**
   * Fetch user profile from Neynar API
   * @param {string} fid - Farcaster ID to fetch profile for
   * @returns {Promise<Object|null>} - User profile if available
   */
  async fetchUserProfile(fid) {
    // Return from cache if available and not expired
    if (this.userProfiles.has(fid)) {
      const cachedProfile = this.userProfiles.get(fid);
      if (cachedProfile.timestamp && (Date.now() - cachedProfile.timestamp < PROFILE_CACHE_TIMEOUT)) {
        return cachedProfile;
      }
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
        // Store the profile with timestamp
        const profile = {
          fid: user.fid,
          username: user.username,
          displayName: user.display_name,
          pfpUrl: user.pfp_url,
          bio: user.profile?.bio?.text || '',
          timestamp: Date.now()
        };
        
        this.userProfiles.set(fid, profile);
        return profile;
      }
      
      throw new Error('User not found');
    } catch (error) {
      console.error(`Error fetching user profile for FID ${fid}:`, error);
      return null;
    }
  }

  /**
   * Extract a displayable username from a peer
   * @param {Object} peer - HMS peer object
   * @returns {string} - Display name for the peer
   */
  getDisplayName(peer) {
    try {
      // Support for mock peers in debug mode
      if (peer.displayName) {
        return peer.displayName;
      }
      
      if (peer.username) {
        return peer.username;
      }
      
      // Try to extract from metadata first
      if (peer.metadata) {
        // Handle both string and object metadata
        const metadata = typeof peer.metadata === 'string' ? JSON.parse(peer.metadata) : peer.metadata;
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
        const profile = this.userProfiles.get(fid);
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

  /**
   * Extract profile info from peer metadata
   * @param {Object} peer - HMS peer object
   * @returns {Object|null} - Profile info if available
   */
  getProfileFromPeer(peer) {
    try {
      // Support for mock peers in debug mode
      if (peer.displayName && peer.pfp) {
        return {
          username: peer.username || peer.displayName,
          displayName: peer.displayName,
          pfpUrl: peer.pfp
        };
      }
      
      if (peer.metadata) {
        // Handle both string and object metadata
        const metadata = typeof peer.metadata === 'string' ? JSON.parse(peer.metadata) : peer.metadata;
        return metadata.profile || null;
      }
    } catch (e) {
      console.warn('Error parsing peer metadata:', e);
    }
    return null;
  }

  /**
   * Clear the profile cache
   */
  clearProfileCache() {
    this.userProfiles.clear();
  }

  /**
   * Get a profile from the cache by FID
   * @param {string} fid - Farcaster ID to get profile for
   * @returns {Object|null} - Cached profile if available
   */
  getCachedProfile(fid) {
    return this.userProfiles.get(fid) || null;
  }
}

// Create and export a singleton instance
const userService = new UserService();
export default userService; 