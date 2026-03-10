/**
 * Main - Application entry point. Connects screens, networking, and game loop.
 */

(function() {
    'use strict';

    // === DOM Elements ===
    const screens = {
        login: document.getElementById('screen-login'),
        lobby: document.getElementById('screen-lobby'),
        game: document.getElementById('screen-game'),
    };
    const elements = {
        username: document.getElementById('username'),
        password: document.getElementById('password'),
        btnLogin: document.getElementById('btn-login'),
        connectionStatus: document.getElementById('connection-status'),
        playerName: document.getElementById('player-name'),
        playerStats: document.getElementById('player-stats'),
        roomName: document.getElementById('room-name'),
        aiCount: document.getElementById('ai-count'),
        btnCreateRoom: document.getElementById('btn-create-room'),
        btnRefreshRooms: document.getElementById('btn-refresh-rooms'),
        roomList: document.getElementById('room-list'),
        canvas: document.getElementById('game-canvas'),
        hudSpeed: document.getElementById('hud-speed'),
        hudBalanceFill: document.getElementById('hud-balance-fill'),
        hudBalanceText: document.getElementById('hud-balance-text'),
        hudDistance: document.getElementById('hud-distance'),
        hudRole: document.getElementById('hud-role'),
        hudTick: document.getElementById('hud-tick'),
        gameMessage: document.getElementById('game-message'),
        gameOver: document.getElementById('game-over'),
        gameOverTitle: document.getElementById('game-over-title'),
        gameOverInfo: document.getElementById('game-over-info'),
        btnBackLobby: document.getElementById('btn-back-lobby'),
    };

    // === Core Objects ===
    const net = new NetworkClient();
    const input = new InputManager();
    const game = new GameState();
    let renderer = null;
    let gameLoopId = null;
    let lastFrameTime = 0;
    let inputInterval = null;

    // === Screen Management ===
    function showScreen(name) {
        for (const [key, el] of Object.entries(screens)) {
            el.classList.toggle('active', key === name);
        }
    }

    // === Connection ===
    function connect() {
        const wsUrl = `ws://${window.location.host}`;
        elements.connectionStatus.textContent = '连接中... / Connecting...';
        elements.connectionStatus.className = 'status connecting';
        net.connect(wsUrl);
    }

    net.onConnect = () => {
        elements.connectionStatus.textContent = '已连接 / Connected';
        elements.connectionStatus.className = 'status connected';
    };

    net.onDisconnect = () => {
        elements.connectionStatus.textContent = '未连接 / Disconnected';
        elements.connectionStatus.className = 'status disconnected';
        stopGameLoop();
        showScreen('login');
    };

    // === Message Handling ===
    net.onMessage = (msg) => {
        switch (msg.msgId) {
            case MsgType.MSG_LOGIN_RESP: handleLoginResp(msg); break;
            case MsgType.MSG_ROOM_INFO:  handleRoomInfo(msg); break;
            case MsgType.MSG_ROOM_LIST:  handleRoomList(msg); break;
            case MsgType.MSG_START_GAME: handleStartGame(msg); break;
            case MsgType.MSG_SNAPSHOT:   handleSnapshot(msg); break;
            case MsgType.MSG_ATTACK_EVENT: handleAttackEvent(msg); break;
            case MsgType.MSG_GAME_OVER:  handleGameOver(msg); break;
            case MsgType.MSG_PLAYER_LEFT: handlePlayerLeft(msg); break;
            case MsgType.MSG_PONG: break; // Ping response, ignore
            default:
                console.log('[Main] Unknown message:', msg.msgId.toString(16));
        }
    };

    function handleLoginResp(msg) {
        const reader = new ByteReader(msg.payload);
        const success = reader.readU8();
        const playerId = reader.readU32();
        const name = reader.readString();

        if (success) {
            game.myPlayerId = playerId;
            elements.playerName.textContent = `👤 ${name}`;
            elements.playerStats.textContent = `ID: ${playerId}`;
            showScreen('lobby');
            net.sendRoomList();
        } else {
            showMessage('登录失败 / Login failed');
        }
    }

    function handleRoomInfo(msg) {
        const reader = new ByteReader(msg.payload);
        const roomId = reader.readU32();
        if (roomId === 0) {
            showMessage('房间不存在 / Room not found');
            return;
        }

        game.roomId = roomId;
        const roomName = reader.readString();
        const state = reader.readU8();
        const playerCount = reader.readU8();
        const maxPlayers = reader.readU8();

        console.log(`[Main] Room ${roomId}: "${roomName}" - ${playerCount}/${maxPlayers} players, state=${state}`);

        // If we just created/joined, auto-start if we're the only human
        if (state === 0) {  // WAITING
            // Auto-start after a short delay
            setTimeout(() => {
                net.sendStartGame();
            }, 500);
        }
    }

    function handleRoomList(msg) {
        const reader = new ByteReader(msg.payload);
        const count = reader.readU16();

        let html = '';
        if (count === 0) {
            html = '<p class="hint">暂无房间 / No rooms available</p>';
        } else {
            for (let i = 0; i < count; i++) {
                const roomId = reader.readU32();
                const name = reader.readString();
                const state = reader.readU8();
                const players = reader.readU8();
                const stateStr = state === 0 ? '等待中' : state === 1 ? '游戏中' : '已结束';
                html += `<div class="room-item" data-room-id="${roomId}">
                    <span>${name}</span>
                    <span>${players} 人 | ${stateStr}</span>
                </div>`;
            }
        }
        elements.roomList.innerHTML = html;

        // Add click handlers
        document.querySelectorAll('.room-item').forEach(el => {
            el.addEventListener('click', () => {
                const rid = parseInt(el.dataset.roomId, 10);
                const role = parseInt(document.querySelector('input[name="role"]:checked').value, 10);
                net.sendJoinRoom(rid, role);
            });
        });
    }

    function handleStartGame(msg) {
        const reader = new ByteReader(msg.payload);
        const roomId = reader.readU32();
        const vehicleCount = reader.readU8();

        console.log(`[Main] Game started! Room ${roomId}, ${vehicleCount} vehicles`);

        // Read initial vehicle states
        game.vehicles = [];
        for (let i = 0; i < vehicleCount; i++) {
            const v = {
                vehicle_id: reader.readU32(),
                pos_x: reader.readFloat(),
                pos_y: reader.readFloat(),
                angle: reader.readFloat(),
                speed: reader.readFloat(),
                balance: reader.readFloat(),
                driver_id: reader.readU32(),
                passenger_id: reader.readU32(),
                render_x: 0, render_y: 0, render_angle: 0,
                distance: 0,
            };
            v.render_x = v.pos_x;
            v.render_y = v.pos_y;
            v.render_angle = v.angle;

            if (v.driver_id === game.myPlayerId || v.passenger_id === game.myPlayerId) {
                game.myVehicleId = v.vehicle_id;
                game.myRole = v.driver_id === game.myPlayerId ? PlayerRole.DRIVER : PlayerRole.PASSENGER;
            }
            game.vehicles.push(v);
        }

        game.playing = true;
        input.setRole(game.myRole);

        showScreen('game');
        elements.hudRole.textContent = game.myRole === PlayerRole.DRIVER ? '🏍️ Driver' : '👊 Passenger';
        showGameMessage('🏁 比赛开始! / Race Start!');
        startGameLoop();
    }

    function handleSnapshot(msg) {
        if (!game.playing) return;
        const reader = new ByteReader(msg.payload);
        game.applySnapshot(reader);
    }

    function handleAttackEvent(msg) {
        const reader = new ByteReader(msg.payload);
        const type = reader.readU8();
        const attackerId = reader.readU32();
        const targetId = reader.readU32();
        const hit = reader.readU8();
        const damage = reader.readFloat();

        if (hit) {
            const attacker = game.vehicles.find(v => v.vehicle_id === attackerId);
            const target = game.vehicles.find(v => v.vehicle_id === targetId);
            if (attacker && target && renderer) {
                renderer.addAttackEffect(
                    attacker.render_x, attacker.render_y,
                    target.render_x, target.render_y,
                    type
                );
            }

            const attackNames = { 1: '踢击/Kick', 2: '抓刹车/Grab', 3: '重击/Smash' };
            if (targetId === game.myVehicleId) {
                showGameMessage(`⚠ 被${attackNames[type] || '攻击'}! -${damage.toFixed(0)} 平衡`);
            }
        }
    }

    function handleGameOver(msg) {
        const reader = new ByteReader(msg.payload);
        const winVehicleId = reader.readU32();
        const winDriverId = reader.readU32();
        const winPassengerId = reader.readU32();

        game.playing = false;
        stopGameLoop();

        const isWinner = winVehicleId === game.myVehicleId;
        elements.gameOverTitle.textContent = isWinner
            ? '🏆 你赢了! / You Win!'
            : '💥 比赛结束 / Race Over';
        elements.gameOverInfo.textContent = `获胜载具 / Winner Vehicle: #${winVehicleId}`;
        elements.gameOver.classList.remove('hidden');
    }

    function handlePlayerLeft(msg) {
        const reader = new ByteReader(msg.payload);
        const playerId = reader.readU32();
        console.log(`[Main] Player ${playerId} left`);
    }

    // === Game Loop ===
    function startGameLoop() {
        renderer = new GameRenderer(elements.canvas);
        lastFrameTime = performance.now();

        // Send input at 20Hz (matches server tick rate)
        inputInterval = setInterval(sendInput, 50);

        // Render loop
        function frame(time) {
            const dt = Math.min(0.1, (time - lastFrameTime) / 1000);
            lastFrameTime = time;

            if (game.playing) {
                // Client-side prediction
                const myV = game.getMyVehicle();
                if (myV && game.myRole === PlayerRole.DRIVER) {
                    const nearest = game.getNearestEnemy();
                    const inputFrame = input.getInputFrame(nearest ? nearest.vehicle_id : 0);
                    game.predictLocal(inputFrame, dt);
                }

                // Camera follow
                const follow = game.getMyVehicle();
                if (follow) {
                    renderer.followVehicle({
                        pos_x: follow.render_x,
                        pos_y: follow.render_y,
                    });
                }

                // Render
                const renderState = {
                    vehicles: game.vehicles.map(v => ({
                        vehicle_id: v.vehicle_id,
                        pos_x: v.render_x,
                        pos_y: v.render_y,
                        angle: v.render_angle,
                        speed: v.speed,
                        balance: v.balance,
                        driver_id: v.driver_id,
                        passenger_id: v.passenger_id,
                        distance: v.distance || 0,
                    })),
                    myVehicleId: game.myVehicleId,
                    track: game.track,
                    dt: dt,
                };
                renderer.render(renderState);

                // Update HUD
                updateHUD();
            }

            gameLoopId = requestAnimationFrame(frame);
        }
        gameLoopId = requestAnimationFrame(frame);
    }

    function stopGameLoop() {
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
            gameLoopId = null;
        }
        if (inputInterval) {
            clearInterval(inputInterval);
            inputInterval = null;
        }
    }

    function sendInput() {
        if (!game.playing) return;
        const nearest = game.getNearestEnemy();
        const frame = input.getInputFrame(nearest ? nearest.vehicle_id : 0);
        net.sendInput(frame.throttle, frame.steering, frame.brake, frame.attack, frame.targetId);
    }

    function updateHUD() {
        const v = game.getMyVehicle();
        if (!v) return;

        const kmh = Math.round(v.speed * 3.6);
        elements.hudSpeed.textContent = kmh;
        elements.hudBalanceFill.style.width = `${v.balance}%`;
        elements.hudBalanceText.textContent = Math.round(v.balance);
        elements.hudDistance.textContent = Math.round(v.distance || 0);
        elements.hudTick.textContent = game.tick;
    }

    function showGameMessage(text) {
        elements.gameMessage.textContent = text;
        elements.gameMessage.style.animation = 'none';
        // Force reflow
        void elements.gameMessage.offsetWidth;
        elements.gameMessage.style.animation = 'fadeInOut 2s ease-in-out';
    }

    function showMessage(text) {
        alert(text);
    }

    // === Event Handlers ===
    elements.btnLogin.addEventListener('click', () => {
        const username = elements.username.value.trim();
        const password = elements.password.value.trim();
        if (!username) {
            elements.username.focus();
            return;
        }
        if (!password) {
            elements.password.focus();
            return;
        }
        net.sendLogin(username, password);
    });

    // Allow Enter key for login
    elements.password.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') elements.btnLogin.click();
    });
    elements.username.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') elements.password.focus();
    });

    elements.btnCreateRoom.addEventListener('click', () => {
        const name = elements.roomName.value.trim() || 'Race Room';
        const role = parseInt(document.querySelector('input[name="role"]:checked').value, 10);
        const aiCount = parseInt(elements.aiCount.value, 10);
        net.sendCreateRoom(name, role, aiCount);
    });

    elements.btnRefreshRooms.addEventListener('click', () => {
        net.sendRoomList();
    });

    elements.btnBackLobby.addEventListener('click', () => {
        elements.gameOver.classList.add('hidden');
        game.reset();
        net.sendLeaveRoom();
        showScreen('lobby');
        net.sendRoomList();
    });

    // === Initialize ===
    connect();

    // Ping every 5 seconds to keep connection alive
    setInterval(() => {
        if (net.connected) {
            net.sendPing();
        }
    }, 5000);

    // Reconnect on disconnect
    setInterval(() => {
        if (!net.connected) {
            connect();
        }
    }, 3000);

    console.log('Road Rage Online Mayhem - Client initialized');
})();
