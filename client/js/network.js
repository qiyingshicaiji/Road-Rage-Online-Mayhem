/**
 * Network - WebSocket connection to the gateway
 */

class NetworkClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.seq = 0;
        this.recvBuffer = new Uint8Array(0);

        // Callbacks
        this.onConnect = null;
        this.onDisconnect = null;
        this.onMessage = null;
    }

    connect(url) {
        if (this.ws) {
            this.ws.close();
        }

        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            this.connected = true;
            this.recvBuffer = new Uint8Array(0);
            console.log('[Network] Connected to', url);
            if (this.onConnect) this.onConnect();
        };

        this.ws.onclose = () => {
            this.connected = false;
            console.log('[Network] Disconnected');
            if (this.onDisconnect) this.onDisconnect();
        };

        this.ws.onerror = (err) => {
            console.error('[Network] Error:', err);
        };

        this.ws.onmessage = (event) => {
            this.handleData(event.data);
        };
    }

    handleData(data) {
        // Append to receive buffer
        const newData = new Uint8Array(data);
        const combined = new Uint8Array(this.recvBuffer.length + newData.length);
        combined.set(this.recvBuffer, 0);
        combined.set(newData, this.recvBuffer.length);

        const { messages, remaining } = parseMessages(combined);
        this.recvBuffer = remaining;

        for (const msg of messages) {
            if (this.onMessage) {
                this.onMessage(msg);
            }
        }
    }

    send(msgId, payloadWriter) {
        if (!this.connected) return;
        const data = buildMessage(msgId, this.seq++, payloadWriter);
        this.ws.send(data.buffer);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    // === High-level message senders ===

    sendLogin(username, password) {
        const w = new ByteWriter();
        w.writeString(username);
        w.writeString(password);
        this.send(MsgType.MSG_LOGIN, w);
    }

    sendCreateRoom(name, role, aiCount) {
        const w = new ByteWriter();
        w.writeString(name);
        w.writeU8(role);
        w.writeU8(aiCount);
        this.send(MsgType.MSG_CREATE_ROOM, w);
    }

    sendJoinRoom(roomId, role) {
        const w = new ByteWriter();
        w.writeU32(roomId);
        w.writeU8(role);
        this.send(MsgType.MSG_JOIN_ROOM, w);
    }

    sendStartGame() {
        this.send(MsgType.MSG_START_GAME);
    }

    sendInput(throttle, steering, brake, attack, targetId) {
        const w = new ByteWriter();
        w.writeU8(throttle);
        w.writeU8(steering & 0xFF);  // int8 as uint8
        w.writeU8(brake ? 1 : 0);
        w.writeU8(attack);
        w.writeU32(targetId || 0);
        this.send(MsgType.MSG_INPUT, w);
    }

    sendLeaveRoom() {
        this.send(MsgType.MSG_LEAVE_ROOM);
    }

    sendRoomList() {
        this.send(MsgType.MSG_ROOM_LIST);
    }

    sendPing() {
        this.send(MsgType.MSG_PING);
    }
}
