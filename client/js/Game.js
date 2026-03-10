/**
 * Game - Main game class that ties everything together
 */
class Game {
  constructor() {
    this.network = new Network();
    this.input = new InputManager();
    this.renderer = new Renderer(
      document.getElementById('game-canvas'),
      document.getElementById('minimap')
    );
    this.offlineEngine = null;

    this.playerId = null;
    this.playerName = '';
    this.mode = null; // 'online' or 'offline'
    this.state = 'menu'; // menu, playing, gameover
    this.snapshot = null;
    this.effects = [];
    this.lastInputSendTime = 0;

    this.setupNetworkHandlers();
    this.gameLoop();
  }

  setupNetworkHandlers() {
    this.network.on(`msg_${MsgType.LOGIN_RES}`, (data) => {
      if (data.success) {
        this.playerId = data.playerId;
        this.playerName = data.playerName;
        // Auto-join first room
        if (data.rooms && data.rooms.length > 0) {
          this.network.joinRoom(data.rooms[0].id);
        }
      }
    });

    this.network.on(`msg_${MsgType.ROOM_STATE}`, () => {
      // Room state updated
    });

    this.network.on(`msg_${MsgType.ROOM_START}`, () => {
      this.state = 'playing';
      this.showScreen('game');
    });

    this.network.on(`msg_${MsgType.STATE_SNAPSHOT}`, (data) => {
      this.snapshot = data;
    });

    this.network.on(`msg_${MsgType.ATTACK_EVENT}`, (data) => {
      this.onAttackEvent(data);
    });

    this.network.on(`msg_${MsgType.GAME_OVER}`, (data) => {
      this.onGameOver(data);
    });

    this.network.on('disconnected', () => {
      if (this.state === 'playing') {
        this.showConnectionStatus('连接断开');
      }
    });
  }

  async startOnline(playerName, aiCount) {
    this.mode = 'online';
    this.playerName = playerName;

    const wsUrl = `ws://${window.location.host}`;
    this.showConnectionStatus('连接服务器...');

    try {
      await this.network.connect(wsUrl);
      this.hideConnectionStatus();
      this.network.login(playerName);

      // Wait for login response, then start
      this.network.on(`msg_${MsgType.LOGIN_RES}`, () => {
        // Give time for room join
        setTimeout(() => {
          this.network.startGame(aiCount);
        }, 500);
      });
    } catch (err) {
      console.error('Connection failed:', err.message || err);
      this.showConnectionStatus('连接失败，请使用离线模式');
      setTimeout(() => this.hideConnectionStatus(), 3000);
    }
  }

  startOffline(playerName, aiCount) {
    this.mode = 'offline';
    this.playerName = playerName || '玩家';
    this.playerId = 'player_1';
    this.state = 'playing';

    this.offlineEngine = new OfflineEngine();
    this.offlineEngine.addVehicle(this.playerId, this.playerName, false);

    const aiNames = ['暴走骑士', '狂风车手', '铁拳飞车', '闪电摩托', '钢铁暴徒'];
    for (let i = 0; i < aiCount; i++) {
      this.offlineEngine.addVehicle(`ai_${i + 1}`, aiNames[i % aiNames.length], true);
    }

    this.offlineEngine.start((snapshot) => {
      this.snapshot = snapshot;

      // Process attack events
      for (const event of this.offlineEngine.getAttackEvents()) {
        this.onAttackEvent(event);
      }

      // Check game over
      const aliveCount = this.offlineEngine.getAliveCount();
      const playerVehicle = snapshot.vehicles.find(v => v.id === this.playerId);
      if (aliveCount <= 1 || (playerVehicle && playerVehicle.eliminated)) {
        this.offlineEngine.stop();

        let winner = null;
        let topScore = -1;
        for (const v of snapshot.vehicles) {
          if (v.score > topScore || (!v.eliminated && topScore === -1)) {
            topScore = v.score;
            winner = v;
          }
        }

        this.onGameOver({
          type: MsgType.GAME_OVER,
          winner: winner ? { id: winner.id, name: winner.name, score: winner.score } : null,
          standings: [...snapshot.vehicles]
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
    });

    this.showScreen('game');
  }

  gameLoop() {
    requestAnimationFrame(() => this.gameLoop());

    if (this.state !== 'playing') return;

    // Get input
    const input = this.input.getInput();

    // Send input
    if (this.mode === 'online') {
      const now = Date.now();
      if (now - this.lastInputSendTime >= 33) { // ~30Hz input rate
        this.network.sendInput(input);
        this.lastInputSendTime = now;
      }
    } else if (this.mode === 'offline' && this.offlineEngine) {
      this.offlineEngine.applyInput(this.playerId, input);
    }

    // Update attack button indicators
    this.updateAttackIndicators();

    // Update HUD
    this.updateHUD();

    // Render
    if (this.snapshot) {
      this.renderer.render(this.snapshot, this.playerId, this.effects);
    }
  }

  onAttackEvent(data) {
    // Find target vehicle position for effect
    if (!this.snapshot) return;
    const target = this.snapshot.vehicles.find(v => v.id === data.targetId);
    if (target) {
      this.effects.push(
        this.renderer.addEffect(data.attackType, target.x, target.y, {
          damage: data.damage,
          duration: 600,
        })
      );
      // Also add damage number
      this.effects.push(
        this.renderer.addEffect('damage', target.x, target.y, {
          damage: data.damage,
          duration: 800,
        })
      );
    }
  }

  onGameOver(data) {
    this.state = 'gameover';

    const titleEl = document.getElementById('gameover-title');
    const standingsEl = document.getElementById('standings-list');

    if (data.winner) {
      const isWinner = data.winner.id === this.playerId;
      titleEl.textContent = isWinner ? '🏆 你赢了! 🏆' : '游戏结束';
      titleEl.style.color = isWinner ? '#ffaa00' : '#ff4444';
    }

    standingsEl.innerHTML = '';
    for (const s of data.standings) {
      const div = document.createElement('div');
      div.className = 'standing-item' + (s.rank === 1 ? ' winner' : '');
      div.innerHTML = `
        <span class="standing-rank">${s.rank}</span>
        <span class="standing-name">${this.escapeHtml(s.name)}${s.id === this.playerId ? ' (你)' : ''}</span>
        <span class="standing-score">${s.score} 分</span>
        <span class="standing-status">${s.eliminated ? '💀' : `❤️ ${s.health}`}</span>
      `;
      standingsEl.appendChild(div);
    }

    this.showScreen('gameover');
  }

  updateHUD() {
    if (!this.snapshot) return;
    const player = this.snapshot.vehicles.find(v => v.id === this.playerId);
    if (!player) return;

    const speedPercent = Math.abs(player.speed) / 300 * 100;
    const balancePercent = Math.max(0, player.balance);
    const healthPercent = Math.max(0, player.health);

    document.getElementById('speed-bar').style.width = `${speedPercent}%`;
    document.getElementById('speed-value').textContent = Math.round(Math.abs(player.speed));
    document.getElementById('balance-bar').style.width = `${balancePercent}%`;
    document.getElementById('balance-value').textContent = Math.round(balancePercent);
    document.getElementById('health-bar').style.width = `${healthPercent}%`;
    document.getElementById('health-value').textContent = Math.round(healthPercent);
    document.getElementById('score-value').textContent = player.score;
  }

  updateAttackIndicators() {
    const attacks = ['kick', 'brake_pinch', 'weapon'];
    const elements = [
      document.getElementById('attack-kick'),
      document.getElementById('attack-brake'),
      document.getElementById('attack-weapon'),
    ];

    for (let i = 0; i < attacks.length; i++) {
      if (this.input.isAttackKeyDown(attacks[i])) {
        elements[i].classList.add('active');
      } else {
        elements[i].classList.remove('active');
      }
    }
  }

  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`${name}-screen`).classList.add('active');
  }

  showConnectionStatus(msg) {
    const el = document.getElementById('connection-status');
    el.textContent = msg;
    el.style.display = 'block';
  }

  hideConnectionStatus() {
    document.getElementById('connection-status').style.display = 'none';
  }

  restart() {
    this.state = 'menu';
    this.snapshot = null;
    this.effects = [];
    if (this.offlineEngine) {
      this.offlineEngine.stop();
      this.offlineEngine = null;
    }
    this.network.disconnect();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
