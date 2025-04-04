# Fariscope Frame

A Farcaster Frame application for audio-only rooms powered by 100ms.

## Features

- Farcaster Frame integration for easy sharing and access
- Audio-only rooms for Farcaster users
- Creation and joining of rooms via Frame or web interface
- Real-time streaming with 100ms

## Tech Stack

- Frontend: Vanilla JS with Vite
- Backend: Bun server with 100ms integration
- Farcaster: Frame SDK for integration

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime
- 100ms account with API credentials

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/fariscope-frame.git
cd fariscope-frame
```

2. Install dependencies
```bash
bun install
```

3. Create a `.env` file based on `.env.example`
```bash
cp .env.example .env
```

4. Update the `.env` file with your 100ms credentials:
```
APP_ACCESS_KEY=your_100ms_app_access_key
APP_SECRET_KEY=your_100ms_app_secret_key
TEMPLATE_ID=your_100ms_template_id
```

### Running the Application

1. Start the frontend development server:
```bash
bun run dev
```

2. Start the API server:
```bash
bun run dev:server
```

The frontend will be available at `http://localhost:5173` and the API server at `http://localhost:8000`.

### Production

1. Build the frontend:
```bash
bun run build
```

2. Run the production server:
```bash
bun run start
```

## Frame Integration

Fariscope integrates with Farcaster Frames, allowing users to:

1. Open the app directly from Farcaster clients
2. Auto-populate their Farcaster ID when creating rooms
3. Share rooms with other Farcaster users

## Project Structure

- `/api` - Frame API handlers
- `/docs` - Documentation
- `/public` - Static assets
- `/src` - Frontend code
  - `/utils` - Utility functions and validators
- `server.js` - API server for room management

## License

MIT