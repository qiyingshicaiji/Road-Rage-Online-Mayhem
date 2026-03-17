const { GameEngine } = require('./GameEngine');
const { MsgType } = require('./protocol');

let roomIdCounter = 1;

class GameRoom {
  constructor(name, maxPlayers = 6) {
    this.id = roomIdCounter++;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.players = new Map(); // ws -> { id, name }
    this.engine = new GameEngine(this);
    this.state = 'waiting'; // waiting, playing, finished
    this.aiCount = 0;
  }

  addPlayer(ws, playerInfo) {
    if (this.players.size >= this.maxPlayers) return false;
    this.players.set(ws, playerInfo);
    this.engine.addVehicle(playerInfo.id, playerInfo.name);

    // Notify all players
    this.broadcast({
      type: MsgType.ROOM_STATE,
      roomId: this.id,
      roomName: this.name,
      state: this.state,
      players: this.getPlayerList(),
    });

    return true;
  }

  removePlayer(ws) {
    const player = this.players.get(ws);
    if (player) {
      this.engine.removeVehicle(player.id);
      this.players.delete(ws);

      this.broadcast({
        type: MsgType.ROOM_STATE,
        roomId: this.id,
        roomName: this.name,
        state: this.state,
        players: this.getPlayerList(),
      });
    }

    // If empty, stop game
    if (this.players.size === 0) {
      this.stop();
    }
  }

  addAI(name) {
    this.aiCount++;
    const aiId = `ai_${this.aiCount}_${Date.now()}`;
    this.engine.addVehicle(aiId, name || `Bot ${this.aiCount}`, true);
    return aiId;
  }

  startGame(aiCount = 2) {
    if (this.state === 'playing') return;

    // Add AI opponents
    const aiNames = ['暴走骑士', '狂风车手', '铁拳飞车', '闪电摩托', '钢铁暴徒'];
    for (let i = 0; i < aiCount; i++) {
      this.addAI(aiNames[i % aiNames.length]);
    }

    this.state = 'playing';
    this.engine.start();

    this.broadcast({
      type: MsgType.ROOM_START,
      roomId: this.id,
    });

    // Send state snapshots
    this.snapshotInterval = setInterval(() => {
      if (this.state !== 'playing') return;
      const snapshot = this.engine.getSnapshot();
      this.broadcast(snapshot);

      // Check for game over
      const aliveCount = this.engine.getAliveCount();
      const humanAlive = Array.from(this.engine.vehicles.values())
        .filter(v => !v.isAI && !v.eliminated).length;

      if (aliveCount <= 1 || humanAlive === 0) {
        this.endGame();
      }
    }, 50); // 20 Hz snapshot rate
  }

  endGame() {
    this.state = 'finished';
    this.engine.stop();

    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    // Find winner
    let winner = null;
    let topScore = -1;
    for (const v of this.engine.vehicles.values()) {
      if (v.score > topScore || (!v.eliminated && topScore === -1)) {
        topScore = v.score;
        winner = v;
      }
    }

    this.broadcast({
      type: MsgType.GAME_OVER,
      winner: winner ? { id: winner.id, name: winner.name, score: winner.score } : null,
      standings: Array.from(this.engine.vehicles.values())
        .sort((a, b) => b.score - a.score)
        .map((v, i) => ({
          rank: i + 1,
          id: v.id,
          name: v.name,
          score: v.score,
          health: v.health,
          eliminated: v.eliminated,
        })),
    });
  }

  stop() {
    this.engine.stop();
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
  }

  handleInput(ws, input) {
    const player = this.players.get(ws);
    if (!player) return;
    this.engine.applyInput(player.id, input);
  }

  broadcast(data) {
    const msg = JSON.stringify(data);
    for (const ws of this.players.keys()) {
      if (ws.readyState === 1) { // OPEN
        ws.send(msg);
      }
    }
  }

  getPlayerList() {
    const list = [];
    for (const p of this.players.values()) {
      list.push({ id: p.id, name: p.name });
    }
    // Add AI
    for (const v of this.engine.vehicles.values()) {
      if (v.isAI) {
        list.push({ id: v.id, name: v.name, isAI: true });
      }
    }
    return list;
  }
}

module.exports = { GameRoom };
