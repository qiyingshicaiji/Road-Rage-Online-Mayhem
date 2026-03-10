// Message types matching the protocol spec from Introduction.md
const MsgType = {
  // Connection
  LOGIN_REQ: 0x0001,
  LOGIN_RES: 0x0002,

  // Room management
  ROOM_CREATE: 0x0101,
  ROOM_JOIN: 0x0102,
  ROOM_LEAVE: 0x0103,
  ROOM_STATE: 0x0104,
  ROOM_START: 0x0105,

  // Game state
  INPUT_FRAME: 0x0201,
  STATE_SNAPSHOT: 0x0202,
  GAME_OVER: 0x0203,

  // Combat
  ATTACK_EVENT: 0x0301,
  DAMAGE_EVENT: 0x0302,

  // System
  PING: 0xFF01,
  PONG: 0xFF02,
};

module.exports = { MsgType };
