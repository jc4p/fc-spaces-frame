// API configuration
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'https://fc-audio-api.kasra.codes',
  NEYNAR_API_KEY: import.meta.env.VITE_NEYNAR_API_KEY || '',
};

// HMS Role names
export const HMS_ROLES = {
  STREAMER: 'fariscope-streamer',
  VIEWER: 'fariscope-viewer',
};

// User profile cache timeout (in milliseconds)
export const PROFILE_CACHE_TIMEOUT = 1000 * 60 * 15; // 15 minutes

// Room refresh interval (in milliseconds)
export const ROOM_REFRESH_INTERVAL = 30000; // 30 seconds

// Debug mode
export const DEBUG_MODE = false;

// Debug room settings
export const DEBUG_ROOM = {
  enabled: false,
  roomId: 'debug-room-123',
  roomName: 'Debug Room',
  creatorFid: '12345',
  creatorName: 'Debug Creator',
  participantCount: 37,
  createdAt: new Date().toISOString(),
  active: true
};

// Speaking detection threshold
export const SPEAKING_THRESHOLD = 0.05;

// Speaking detection interval (in milliseconds)
export const SPEAKING_UPDATE_INTERVAL = 500; // 0.5 seconds

// Delays for various operations (in milliseconds)
export const DELAYS = {
  CREATOR_UNMUTE: 5000, // 5 seconds for creator unmute after join
  VIEWER_UNMUTE: 2000,  // 2 seconds for viewer unmute after join
  ROOM_END_CHECK: 3000, // 3 seconds to confirm room ended
  UI_REFRESH: 1000,     // 1 second for UI refresh
  TOAST_SUCCESS: 3000,  // 3 seconds for success toast
  TOAST_ERROR: 5000,    // 5 seconds for error toast
  IOS_AUDIO_UNLOCK: 10000 // 10 seconds for iOS audio unlock overlay
};

// DOM element IDs
export const DOM_IDS = {
  FORM: "join",
  JOIN_BTN: "join-btn",
  ROOMS_LIST: "rooms-list",
  CONFERENCE: "conference",
  LEAVE_BTN: "leave-room-btn",
  MUTE_AUDIO: "mute-audio",
  VIEWER_CONTROLS: "viewer-controls",
  HOST_CONTROLS: "host-controls",
  CONTROLS: "controls",
  NAME_INPUT: "name",
  ROOM_TITLE: "room-title",
  ROOM_DURATION: "room-duration",
  SPEAKERS_LIST: "speakers-list",
  LISTENERS_LIST: "listeners-list",
  LISTENERS_COUNT: "listeners-count",
  HOST_CONTROLS: "host-controls",
  END_ROOM_BTN: "end-room",
  CREATE_ROOM_BTN: "create-room-btn",
  CREATE_ROOM_MODAL: "create-room-modal",
  CREATE_ROOM_FORM: "create-room-form",
  LISTENER_ACTION_MODAL: "listener-action-modal",
  LISTENER_INITIAL: "listener-initial",
  LISTENER_NAME: "listener-name",
  PROMOTE_LISTENER_BTN: "promote-listener",
  DEMOTE_SPEAKER_BTN: "demote-speaker",
  SHARE_WARPCAST_BTN: "share-warpcast",
  REFRESH_ROOMS_BTN: "refresh-rooms-btn",
  ROOM_CODE_INPUT: "room-code",
  ETH_ADDRESS_INPUT: "eth-address",
  FID_INPUT: "fid",
  USER_GREETING: "user-greeting",
  FRAME_STATUS: "frame-status",
  FRAME_NOT_CONNECTED: "frame-not-connected",
  CREATE_ROOM_ACTIONS: "create-room-actions",
  RAISE_HAND_BTN: "raise-hand-btn",
  EMOJI_REACTION_BTN: "emoji-reaction-btn",
  EMOJI_REACTION_MODAL: "emoji-reaction-modal",
  EMOJI_CONTAINER: "emoji-container"
}; 