import { FrameRequest, getFrameMessage, validateMessage } from '@farcaster/frame-sdk';
import crypto from 'crypto';

// Frame integration for Fariscope
export const onRequest = async (context) => {
  try {
    // Handle POST requests from the frame
    if (context.request.method === 'POST') {
      const body = await context.request.json();
      
      // Parse and validate the frame message
      const { message } = body;
      if (!message) {
        return new Response(JSON.stringify({ error: 'Invalid request: No message provided' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Validate the message
      const { isValid, message: validatedMessage } = await validateMessage(message);
      if (!isValid) {
        return new Response(JSON.stringify({ error: 'Invalid frame message' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Parse the message
      const frameMessage = await getFrameMessage(validatedMessage);
      if (!frameMessage) {
        return new Response(JSON.stringify({ error: 'Could not parse frame message' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Extract user info
      const { fid, buttonIndex, inputText } = frameMessage;
      
      // Handle button index
      if (buttonIndex === 1) {
        // User clicked "Join Live Audio"
        // Return a frame that shows active rooms
        
        // Fetch active rooms from API
        const apiUrl = process.env.API_BASE_URL || 'http://localhost:8000';
        const roomsResponse = await fetch(`${apiUrl}/rooms`);
        const roomsData = await roomsResponse.json();
        
        if (!roomsData.data || roomsData.data.length === 0) {
          // No active rooms
          return createFrameResponse({
            image: 'https://i.seadn.io/gae/2cLE8IkDQG0iGaedeE4KvY4zIPvDPEw47oyOhR6uzIAudFMWKP0i-c0trrIBFI0s8veuzPICebd0_S-8DDulZvgUbgwLC3n8zpt6Fw?auto=format&dpr=1&w=384',
            textInput: 'Enter your Farcaster ID',
            buttons: [
              { label: "Create Room", action: "post_redirect" },
              { label: "Back", action: "post" }
            ],
            state: { action: 'back' },
            text: 'No active rooms found. Create your own room to start broadcasting!'
          });
        }
        
        // Show the first room and allow navigation
        const room = roomsData.data[0];
        return createFrameResponse({
          image: 'https://i.seadn.io/gae/2cLE8IkDQG0iGaedeE4KvY4zIPvDPEw47oyOhR6uzIAudFMWKP0i-c0trrIBFI0s8veuzPICebd0_S-8DDulZvgUbgwLC3n8zpt6Fw?auto=format&dpr=1&w=384',
          textInput: 'Enter your Farcaster ID',
          buttons: [
            { label: `Join Room: ${room.name}`, action: "post_redirect" },
            { label: "Back", action: "post" }
          ],
          state: { action: 'join', roomId: room.id },
          text: `Room by FID: ${room.metadata?.fid || 'Unknown'}`
        });
      } else if (buttonIndex === 2) {
        // User clicked "Create Room" or redirect button
        
        // Check if we have state that indicates we're joining a room
        let state = {};
        try {
          state = JSON.parse(frameMessage.state || '{}');
        } catch (e) {
          // Invalid state, ignore
        }
        
        if (state.action === 'join' && state.roomId) {
          // We're joining an existing room
          if (!inputText) {
            return createFrameResponse({
              image: 'https://i.seadn.io/gae/2cLE8IkDQG0iGaedeE4KvY4zIPvDPEw47oyOhR6uzIAudFMWKP0i-c0trrIBFI0s8veuzPICebd0_S-8DDulZvgUbgwLC3n8zpt6Fw?auto=format&dpr=1&w=384',
              textInput: 'Enter your Farcaster ID',
              buttons: [
                { label: "Join Room", action: "post_redirect" },
                { label: "Back", action: "post" }
              ],
              state: { action: 'join', roomId: state.roomId },
              text: 'Please enter your Farcaster ID to join this room.'
            });
          }
          
          // We have a room ID and user FID, generate a join URL
          return new Response(JSON.stringify({
            version: 'vNext',
            image: 'https://i.seadn.io/gae/2cLE8IkDQG0iGaedeE4KvY4zIPvDPEw47oyOhR6uzIAudFMWKP0i-c0trrIBFI0s8veuzPICebd0_S-8DDulZvgUbgwLC3n8zpt6Fw?auto=format&dpr=1&w=384',
            action: 'redirect',
            target: `https://fariscope-frame.vercel.app/join?roomId=${state.roomId}&fid=${inputText}`,
            post_url: 'https://fariscope-frame.vercel.app/api/frame'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } else if (state.action === 'back') {
          // Return to initial frame
          return createFrameResponse({
            image: 'https://i.seadn.io/gae/2cLE8IkDQG0iGaedeE4KvY4zIPvDPEw47oyOhR6uzIAudFMWKP0i-c0trrIBFI0s8veuzPICebd0_S-8DDulZvgUbgwLC3n8zpt6Fw?auto=format&dpr=1&w=384',
            buttons: [
              { label: "Join Live Audio", action: "post" },
              { label: "Create Room", action: "post_redirect" }
            ],
            text: 'Welcome to Fariscope - Live Audio Rooms'
          });
        } else {
          // We're creating a new room
          if (!inputText) {
            return createFrameResponse({
              image: 'https://i.seadn.io/gae/2cLE8IkDQG0iGaedeE4KvY4zIPvDPEw47oyOhR6uzIAudFMWKP0i-c0trrIBFI0s8veuzPICebd0_S-8DDulZvgUbgwLC3n8zpt6Fw?auto=format&dpr=1&w=384',
              textInput: 'Enter your Farcaster ID',
              buttons: [
                { label: "Create Room", action: "post_redirect" },
                { label: "Back", action: "post" }
              ],
              state: { action: 'create' },
              text: 'Please enter your Farcaster ID to create a room.'
            });
          }
          
          // We have the user's FID, redirect to the create room page
          return new Response(JSON.stringify({
            version: 'vNext',
            image: 'https://i.seadn.io/gae/2cLE8IkDQG0iGaedeE4KvY4zIPvDPEw47oyOhR6uzIAudFMWKP0i-c0trrIBFI0s8veuzPICebd0_S-8DDulZvgUbgwLC3n8zpt6Fw?auto=format&dpr=1&w=384',
            action: 'redirect',
            target: `https://fariscope-frame.vercel.app/create?fid=${inputText}`,
            post_url: 'https://fariscope-frame.vercel.app/api/frame'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Default response
      return createFrameResponse({
        image: 'https://i.seadn.io/gae/2cLE8IkDQG0iGaedeE4KvY4zIPvDPEw47oyOhR6uzIAudFMWKP0i-c0trrIBFI0s8veuzPICebd0_S-8DDulZvgUbgwLC3n8zpt6Fw?auto=format&dpr=1&w=384',
        buttons: [
          { label: "Join Live Audio", action: "post" },
          { label: "Create Room", action: "post_redirect" }
        ],
        text: 'Welcome to Fariscope - Live Audio Rooms'
      });
    }
    
    // Default response for GET requests
    return createFrameResponse({
      image: 'https://i.seadn.io/gae/2cLE8IkDQG0iGaedeE4KvY4zIPvDPEw47oyOhR6uzIAudFMWKP0i-c0trrIBFI0s8veuzPICebd0_S-8DDulZvgUbgwLC3n8zpt6Fw?auto=format&dpr=1&w=384',
      buttons: [
        { label: "Join Live Audio", action: "post" },
        { label: "Create Room", action: "post_redirect" }
      ],
      text: 'Welcome to Fariscope - Live Audio Rooms'
    });
  } catch (error) {
    console.error('Frame API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Helper function to create frame responses
function createFrameResponse(options) {
  const { 
    image, 
    buttons = [], 
    textInput = null, 
    state = null, 
    text = null 
  } = options;
  
  const response = {
    version: 'vNext',
    image: image,
    buttons: buttons.map(button => ({
      label: button.label,
      action: button.action
    })),
    post_url: 'https://fariscope-frame.vercel.app/api/frame'
  };
  
  if (textInput) {
    response.input = { text: textInput };
  }
  
  if (state) {
    response.state = JSON.stringify(state);
  }
  
  if (text) {
    response.text = text;
  }
  
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}