const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { GameRoom } = require('./GameRoom');
const { MsgType } = require('./protocol');

const PORT = process.env.PORT || 3000;

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// Create HTTP server to serve static client files
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;

  // Sanitize file path to prevent directory traversal
  const normalizedPath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(__dirname, '..', 'client', normalizedPath);
  const clientDir = path.join(__dirname, '..', 'client');

  // Ensure the resolved path is within the client directory
  if (!fullPath.startsWith(clientDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(fullPath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Game state
const rooms = new Map();
let playerIdCounter = 1;

// Create a default room
const defaultRoom = new GameRoom('竞技场 1');
rooms.set(defaultRoom.id, defaultRoom);

wss.on('connection', (ws) => {
  let playerId = null;
  let playerName = null;
  let currentRoom = null;

  console.log('Client connected');

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    switch (data.type) {
      case MsgType.LOGIN_REQ: {
        playerId = `player_${playerIdCounter++}`;
        playerName = (typeof data.name === 'string' && data.name.trim())
          ? data.name.trim().substring(0, 20)
          : `玩家${playerIdCounter}`;

        ws.send(JSON.stringify({
          type: MsgType.LOGIN_RES,
          success: true,
          playerId,
          playerName,
          rooms: Array.from(rooms.values()).map(r => ({
            id: r.id,
            name: r.name,
            playerCount: r.players.size,
            maxPlayers: r.maxPlayers,
            state: r.state,
          })),
        }));
        console.log(`Player logged in: ${playerName} (${playerId})`);
        break;
      }

      case MsgType.ROOM_JOIN: {
        if (!playerId) return;
        const room = rooms.get(data.roomId) || defaultRoom;
        if (room.addPlayer(ws, { id: playerId, name: playerName })) {
          currentRoom = room;
          console.log(`${playerName} joined room: ${room.name}`);
        }
        break;
      }

      case MsgType.ROOM_START: {
        if (!currentRoom) return;
        const aiCount = typeof data.aiCount === 'number'
          ? Math.min(Math.max(data.aiCount, 0), 5)
          : 2;
        currentRoom.startGame(aiCount);
        console.log(`Game started in room: ${currentRoom.name}`);
        break;
      }

      case MsgType.INPUT_FRAME: {
        if (!currentRoom) return;
        currentRoom.handleInput(ws, data.input);
        break;
      }

      case MsgType.PING: {
        ws.send(JSON.stringify({
          type: MsgType.PONG,
          timestamp: data.timestamp,
          serverTime: Date.now(),
        }));
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      currentRoom.removePlayer(ws);
    }
    console.log(`Client disconnected: ${playerName || 'unknown'}`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   暴走摩托：双人载具 - Road Rage Online      ║
║   Demo Server running on port ${PORT}          ║
║   Open http://localhost:${PORT} to play        ║
╚══════════════════════════════════════════════╝
  `);
});
