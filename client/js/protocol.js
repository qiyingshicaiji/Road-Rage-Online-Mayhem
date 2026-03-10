/**
 * Protocol - Binary message encoding/decoding matching the C++ server protocol
 *
 * Message format: [MsgID(2)][Seq(2)][DataLen(2)][Data...]
 */

const MsgType = {
    MSG_LOGIN:        0x0001,
    MSG_LOGIN_RESP:   0x0002,
    MSG_CREATE_ROOM:  0x0003,
    MSG_JOIN_ROOM:    0x0004,
    MSG_ROOM_INFO:    0x0005,
    MSG_INPUT:        0x0006,
    MSG_SNAPSHOT:     0x0007,
    MSG_ATTACK_EVENT: 0x0008,
    MSG_START_GAME:   0x0009,
    MSG_LEAVE_ROOM:   0x000A,
    MSG_ROOM_LIST:    0x000B,
    MSG_PLAYER_LEFT:  0x000C,
    MSG_GAME_OVER:    0x000D,
    MSG_PING:         0x00FE,
    MSG_PONG:         0x00FF,
};

const AttackType = {
    NONE:       0,
    KICK:       1,
    BRAKE_GRAB: 2,
    SMASH:      3,
};

const PlayerRole = {
    NONE:      0,
    DRIVER:    1,
    PASSENGER: 2,
};

const HEADER_SIZE = 6;

class ByteWriter {
    constructor() {
        this.buffer = [];
    }

    writeU8(val) {
        this.buffer.push(val & 0xFF);
    }

    writeU16(val) {
        this.buffer.push((val >> 8) & 0xFF);
        this.buffer.push(val & 0xFF);
    }

    writeI16(val) {
        this.writeU16(val & 0xFFFF);
    }

    writeU32(val) {
        this.buffer.push((val >> 24) & 0xFF);
        this.buffer.push((val >> 16) & 0xFF);
        this.buffer.push((val >> 8) & 0xFF);
        this.buffer.push(val & 0xFF);
    }

    writeFloat(val) {
        const buf = new ArrayBuffer(4);
        new Float32Array(buf)[0] = val;
        const bytes = new Uint8Array(buf);
        // Convert to big-endian
        this.buffer.push(bytes[3]);
        this.buffer.push(bytes[2]);
        this.buffer.push(bytes[1]);
        this.buffer.push(bytes[0]);
    }

    writeString(str) {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(str);
        this.writeU16(encoded.length);
        for (let i = 0; i < encoded.length; i++) {
            this.buffer.push(encoded[i]);
        }
    }

    toUint8Array() {
        return new Uint8Array(this.buffer);
    }

    get length() {
        return this.buffer.length;
    }
}

class ByteReader {
    constructor(data) {
        this.data = new Uint8Array(data);
        this.pos = 0;
    }

    readU8() {
        return this.data[this.pos++];
    }

    readU16() {
        const val = (this.data[this.pos] << 8) | this.data[this.pos + 1];
        this.pos += 2;
        return val;
    }

    readI16() {
        const val = this.readU16();
        return val > 32767 ? val - 65536 : val;
    }

    readU32() {
        const val = ((this.data[this.pos] << 24) |
                     (this.data[this.pos + 1] << 16) |
                     (this.data[this.pos + 2] << 8) |
                      this.data[this.pos + 3]) >>> 0;
        this.pos += 4;
        return val;
    }

    readFloat() {
        // Big-endian to float
        const buf = new ArrayBuffer(4);
        const bytes = new Uint8Array(buf);
        bytes[3] = this.data[this.pos];
        bytes[2] = this.data[this.pos + 1];
        bytes[1] = this.data[this.pos + 2];
        bytes[0] = this.data[this.pos + 3];
        this.pos += 4;
        return new Float32Array(buf)[0];
    }

    readString() {
        const len = this.readU16();
        const decoder = new TextDecoder();
        const str = decoder.decode(this.data.slice(this.pos, this.pos + len));
        this.pos += len;
        return str;
    }

    get remaining() {
        return this.data.length - this.pos;
    }
}

// Build a complete message (header + payload)
function buildMessage(msgId, seq, payloadWriter) {
    const header = new ByteWriter();
    header.writeU16(msgId);
    header.writeU16(seq);

    const payloadData = payloadWriter ? payloadWriter.toUint8Array() : new Uint8Array(0);
    header.writeU16(payloadData.length);

    const result = new Uint8Array(HEADER_SIZE + payloadData.length);
    result.set(header.toUint8Array(), 0);
    result.set(payloadData, HEADER_SIZE);
    return result;
}

// Parse messages from a binary buffer (may contain multiple messages)
function parseMessages(data) {
    const messages = [];
    const bytes = new Uint8Array(data);
    let offset = 0;

    while (offset + HEADER_SIZE <= bytes.length) {
        const msgId = (bytes[offset] << 8) | bytes[offset + 1];
        const seq = (bytes[offset + 2] << 8) | bytes[offset + 3];
        const dataLen = (bytes[offset + 4] << 8) | bytes[offset + 5];

        if (offset + HEADER_SIZE + dataLen > bytes.length) break;

        const payload = bytes.slice(offset + HEADER_SIZE, offset + HEADER_SIZE + dataLen);
        messages.push({ msgId, seq, payload });
        offset += HEADER_SIZE + dataLen;
    }

    return { messages, remaining: bytes.slice(offset) };
}
