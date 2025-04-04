# Fariscope Server

A Bun-powered server for managing 100ms audio-only rooms for Fariscope.

## Setup

1. Install dependencies:
```bash
bun install
```

2. Create a `.env` file with your 100ms credentials:
```
APP_ACCESS_KEY=your_100ms_app_access_key
APP_SECRET_KEY=your_100ms_app_secret_key
TEMPLATE_ID=your_100ms_template_id
```

3. Run the development server:
```bash
bun run dev
```

4. Run in production mode:
```bash
bun run start
```

The server will start on `http://0.0.0.0:8000`.

## API Documentation

### List Active Rooms
```http
GET /rooms
```

Returns a list of all active audio-only rooms filtered by the Fariscope template.

#### Response
```json
{
  "limit": 10,
  "data": [
    {
      "id": "room_id",
      "name": "fariscope-room-123456",
      "enabled": true,
      "description": "Fariscope room for FID: 123456",
      "metadata": {
        "fid": "123456",
        "address": "0x1234...",
        "roomName": "fariscope-room-123456",
        "createdAt": "2023-01-01T00:00:00.000Z",
        "lastActivity": "2023-01-01T00:00:00.000Z"
      }
    }
  ]
}
```

### Create Room
```http
POST /create-room
```

Create a new audio-only room with streamer permissions or re-enable an existing room.

#### Request Body
```json
{
  "address": "0x1234567890abcdef1234567890abcdef12345678",  // ETH address
  "fid": "123456"          // Farcaster ID
}
```

#### Response
```json
{
  "roomId": "room_id",
  "code": "abc-def-ghi",   // Room code for streamer
  "status": "created"      // or "existing" or "reenabled"
}
```

### Join Room
```http
POST /join-room
```

Join an existing room as a viewer (audio-only access).

#### Request Body
```json
{
  "roomId": "room_id",
  "fid": "123456"          // Farcaster ID
}
```

#### Response
```json
{
  "code": "xyz-uvw-rst"    // Room code for viewer
}
```

### Disable Room
```http
POST /disable-room
```

Disable an existing room. Only the original room creator can disable a room.

#### Request Body
```json
{
  "roomId": "room_id",
  "address": "0x1234567890abcdef1234567890abcdef12345678",  // ETH address
  "fid": "123456"          // Farcaster ID
}
```

#### Response
```json
{
  "status": "success",
  "message": "Room disabled successfully"
}
```

## Rate Limiting

The API is rate-limited to 120 requests per 4-minute window per IP address.

## Technical Details

- All rooms are created using a predefined template configured for audio-only access for viewers
- Room names follow the format `fariscope-room-{fid}`
- The server maintains an in-memory store of room data
- On startup, the server syncs with 100ms API to initialize the room store
- 100ms management tokens are generated at startup and automatically refreshed as needed when making API calls

## Error Handling

All endpoints return error responses in the following format:
```json
{
  "error": "Error message description"
}
```

## Input Validation

- ETH addresses must be valid and in the format `0x` followed by 40 hexadecimal characters
- FIDs must be positive integers