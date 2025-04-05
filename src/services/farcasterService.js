import * as frame from '@farcaster/frame-sdk';
import { API_CONFIG } from '../config.js';

/**
 * Service for Farcaster Frame SDK integration
 */
class FarcasterService {
  constructor() {
    this.userFid = null;
    this.frameInitialized = false;
  }

  /**
   * Initialize the Frame SDK
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initialize() {
    try {
      if (this.frameInitialized) return true;
      
      // Notify the frame that we're ready to display content
      await frame.sdk.actions.ready();
      console.log('Frame SDK ready');
      this.frameInitialized = true;
      
      // Try to get user's Farcaster ID
      await this.refreshUser();
      
      return true;
    } catch (error) {
      console.error('Frame SDK initialization failed:', error);
      return false;
    }
  }

  /**
   * Refresh user information from Frame SDK
   * @returns {Promise<Object|null>} - User object if available
   */
  async refreshUser() {
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
        
        // Set userFid
        this.userFid = user.fid;
        window.userFid = user.fid; // Set global for backward compatibility
        
        return user;
      }
      
      return null;
    } catch (error) {
      console.warn('Could not get Frame user context:', error);
      return null;
    }
  }

  /**
   * Get the current user's FID
   * @returns {string|null} - Farcaster ID if available
   */
  getUserFid() {
    return this.userFid;
  }

  /**
   * Open a URL in Warpcast
   * @param {string} url - URL to open
   * @returns {Promise<void>}
   */
  async openURL(url) {
    try {
      await frame.sdk.actions.openUrl(url);
    } catch (error) {
      console.error('Failed to open URL:', error);
      throw error;
    }
  }
  
  /**
   * View a Farcaster profile
   * @param {string} fid - Farcaster ID to view
   * @returns {Promise<void>}
   */
  async viewProfile(fid) {
    try {
      await frame.sdk.actions.viewProfile({ fid });
    } catch (error) {
      console.error('Failed to view profile:', error);
      throw error;
    }
  }
  
  /**
   * Share to Warpcast
   * @param {string} text - Text to share
   * @param {string} url - URL to embed
   * @returns {Promise<void>}
   */
  async shareToCast(text, url) {
    try {
      const finalUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
      await frame.sdk.actions.openUrl(finalUrl);
    } catch (error) {
      console.error('Failed to share to Warpcast:', error);
      throw error;
    }
  }
  
  /**
   * Get the connected wallet address
   * @returns {Promise<string|null>} - ETH address if available
   */
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
  }
  
  /**
   * Check if connected to Base blockchain
   * @returns {Promise<boolean>} - Whether connected to Base
   */
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
  }
  
  /**
   * Switch to Base network
   * @returns {Promise<boolean>} - Whether switch was successful
   */
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
}

// Create and export a singleton instance
const farcasterService = new FarcasterService();
export default farcasterService; 