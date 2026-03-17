/**
 * Network - WebSocket client for server communication
 */
class Network {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.playerId = null;
    this.handlers = {};
    this.latency = 0;
    this.pingInterval = null;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }

      this.ws.onopen = () => {
        this.connected = true;
        this.startPing();
        resolve();
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.stopPing();
        this.emit('disconnected');
      };

      this.ws.onerror = (err) => {
        if (!this.connected) reject(err);
        this.emit('error', err);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };
    });
  }

  handleMessage(data) {
    switch (data.type) {
      case MsgType.PONG:
        this.latency = Date.now() - data.timestamp;
        break;
    }
    this.emit('message', data);
    if (data.type !== undefined) {
      this.emit(`msg_${data.type}`, data);
    }
  }

  send(data) {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(data));
    }
  }

  login(name) {
    this.send({ type: MsgType.LOGIN_REQ, name });
  }

  joinRoom(roomId) {
    this.send({ type: MsgType.ROOM_JOIN, roomId });
  }

  startGame(aiCount) {
    this.send({ type: MsgType.ROOM_START, aiCount });
  }

  sendInput(input) {
    this.send({ type: MsgType.INPUT_FRAME, input });
  }

  startPing() {
    this.pingInterval = setInterval(() => {
      this.send({ type: MsgType.PING, timestamp: Date.now() });
    }, 2000);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  on(event, handler) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  emit(event, data) {
    if (this.handlers[event]) {
      for (const handler of this.handlers[event]) {
        handler(data);
      }
    }
  }

  disconnect() {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
