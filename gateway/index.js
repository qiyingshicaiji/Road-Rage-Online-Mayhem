/**
 * WebSocket-to-TCP Gateway
 *
 * Bridges web clients (WebSocket) to the C++ game server (TCP).
 * Binary messages are forwarded transparently in both directions.
 * Also serves the HTML5 client files.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { WebSocketServer } = require('ws');

const WS_PORT = parseInt(process.env.WS_PORT || '3000', 10);
const TCP_HOST = process.env.TCP_HOST || '127.0.0.1';
const TCP_PORT = parseInt(process.env.TCP_PORT || '9527', 10);
const CLIENT_DIR = path.join(__dirname, '..', 'client');

// MIME types for serving static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

// HTTP server to serve static client files
const httpServer = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(CLIENT_DIR, filePath);

    // Security: prevent path traversal
    if (!filePath.startsWith(CLIENT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// WebSocket server
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
    console.log(`[Gateway] WebSocket client connected from ${req.socket.remoteAddress}`);

    // Create TCP connection to game server
    const tcp = new net.Socket();
    let tcpConnected = false;

    tcp.connect(TCP_PORT, TCP_HOST, () => {
        tcpConnected = true;
        console.log(`[Gateway] TCP connected to ${TCP_HOST}:${TCP_PORT}`);
    });

    // Forward TCP data → WebSocket
    tcp.on('data', (data) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(data);
        }
    });

    tcp.on('error', (err) => {
        console.error(`[Gateway] TCP error: ${err.message}`);
        ws.close(1011, 'Server connection error');
    });

    tcp.on('close', () => {
        tcpConnected = false;
        console.log('[Gateway] TCP connection closed');
        if (ws.readyState === ws.OPEN) {
            ws.close(1000, 'Server disconnected');
        }
    });

    // Forward WebSocket data → TCP
    ws.on('message', (data) => {
        if (tcpConnected) {
            // data is a Buffer (binary WebSocket message)
            tcp.write(data);
        }
    });

    ws.on('close', () => {
        console.log('[Gateway] WebSocket client disconnected');
        tcp.destroy();
    });

    ws.on('error', (err) => {
        console.error(`[Gateway] WebSocket error: ${err.message}`);
        tcp.destroy();
    });
});

httpServer.listen(WS_PORT, () => {
    console.log(`=== Road Rage Gateway ===`);
    console.log(`HTTP/WebSocket server: http://localhost:${WS_PORT}`);
    console.log(`Forwarding to TCP server: ${TCP_HOST}:${TCP_PORT}`);
    console.log(`Serving client files from: ${CLIENT_DIR}`);
});
