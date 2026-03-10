# 🏍️ Road Rage Online Mayhem — 暴走摩托：双人载具

Multiplayer online motorcycle racing + combat game featuring a unique dual-passenger vehicle mechanic.

![Gameplay Screenshot](https://github.com/user-attachments/assets/8f93e303-2fa9-4024-ba9a-a7b6bab3e7f5)

## Architecture

```
┌──────────────────┐     TCP (Binary)     ┌──────────────────────┐
│  Web Client      │◄──── WebSocket ────► │  Node.js Gateway     │
│  (HTML5 Canvas)  │                      │  (WS ↔ TCP bridge)   │
└──────────────────┘                      └──────────┬───────────┘
                                                     │ TCP
                                          ┌──────────▼───────────┐
                                          │  C++ Game Server     │
                                          │  (Boost.Asio)        │
                                          │  ┌────────────────┐  │
                                          │  │ Physics Engine  │  │
                                          │  │ Combat System   │  │
                                          │  │ Balance System  │  │
                                          │  │ AI Controller   │  │
                                          │  │ Room Management │  │
                                          │  └────────────────┘  │
                                          │         │            │
                                          │    ┌────▼─────┐      │
                                          │    │  SQLite   │      │
                                          │    └──────────┘      │
                                          └──────────────────────┘
```

## Features

- **C++17 Game Server** — Boost.Asio async TCP networking, authoritative physics at 50ms tick rate
- **Binary Protocol** — Custom message format: `[MsgID(2)][Seq(2)][DataLen(2)][Data]`
- **Vehicle Physics** — Throttle, steering, braking with friction and max speed clamping
- **Combat System** — Three attack types with distance/angle detection:
  - 🦶 **Kick** — Close range (1.5m), 30° cone, causes loss of control
  - 🤚 **Brake Grab** — Very close (1.0m), side-rear position, heavy deceleration
  - 🔨 **Smash** — Medium range (2.0m), 30° forward cone, strong stun
- **Balance System** — 0–100 points; attacks consume balance; depletion triggers 1s loss of control; passive 5 pts/sec recovery
- **AI Opponents** — State machine (idle → chase → attack → evade) with dynamic target selection
- **SQLite Persistence** — User accounts (auto-register), match history
- **Room Management** — Create/join rooms, configure AI opponents, role selection (driver/passenger)
- **Web Client** — HTML5 Canvas with top-down rendering, client-side prediction, HUD, minimap

## Prerequisites

- **C++ Server**: GCC 11+ or Clang 14+, CMake 3.16+, Boost 1.74+, SQLite3
- **Gateway/Client**: Node.js 18+

### Install dependencies (Ubuntu/Debian)

```bash
sudo apt-get install -y build-essential cmake libboost-all-dev libsqlite3-dev
```

## Build & Run

### 1. Build the C++ Game Server

```bash
cd server
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

### 2. Run Tests

```bash
cd server/build
./test_protocol   # Protocol serialization tests
./test_game       # Vehicle physics & combat tests
```

### 3. Start the Game Server

```bash
cd server/build
./road_rage_server 9527
```

### 4. Install Gateway Dependencies & Start

```bash
cd gateway
npm install
npm start          # Starts on port 3000, bridges to TCP port 9527
```

### 5. Play

Open **http://localhost:3000** in your browser.

1. Enter a username and password (new accounts auto-register)
2. Create a room — select your role (Driver/Passenger) and add AI opponents
3. Race! Use keyboard controls:

| Role | Control | Action |
|------|---------|--------|
| Driver | W / ↑ | Accelerate |
| Driver | S / ↓ | Brake |
| Driver | A / ← | Steer left |
| Driver | D / → | Steer right |
| Passenger | 1 | Kick (close range) |
| Passenger | 2 | Brake Grab (side-rear) |
| Passenger | 3 | Smash (forward cone) |

## Project Structure

```
├── server/                    # C++ Game Server
│   ├── CMakeLists.txt         # Build configuration
│   ├── src/
│   │   ├── main.cpp           # Server entry point & message routing
│   │   ├── network/
│   │   │   ├── protocol.h/cpp # Binary protocol & message types
│   │   │   ├── session.h/cpp  # Client TCP session
│   │   │   └── tcp_server.h/cpp # Boost.Asio acceptor
│   │   ├── game/
│   │   │   ├── vehicle.h/cpp  # Physics simulation
│   │   │   ├── combat.h/cpp   # Attack resolution
│   │   │   ├── game_room.h/cpp # Room + game loop
│   │   │   └── ai_controller.h/cpp # AI state machine
│   │   └── data/
│   │       └── database.h/cpp # SQLite persistence
│   └── tests/
│       ├── test_protocol.cpp  # Protocol unit tests
│       └── test_game.cpp      # Game logic unit tests
├── gateway/                   # WebSocket ↔ TCP Bridge
│   ├── package.json
│   └── index.js               # WS gateway + static file server
├── client/                    # HTML5 Prototype Client
│   ├── index.html             # Login/Lobby/Game screens
│   ├── css/style.css          # UI styling
│   └── js/
│       ├── protocol.js        # Binary protocol (matches C++ server)
│       ├── network.js         # WebSocket client
│       ├── input.js           # Keyboard input handling
│       ├── renderer.js        # Canvas rendering engine
│       ├── game.js            # Client game state & prediction
│       └── main.js            # App entry point & screen management
└── Introduction.md            # Original design document
```

## Design Document

See [Introduction.md](Introduction.md) for the full game design specification including:
- Detailed gameplay mechanics and balance design
- Network protocol specification
- Database schema
- Development roadmap (6 phases)

## Notes

- The C++ server is designed to also work with a Unity client (C#). The binary protocol is platform-agnostic. See Introduction.md for the Unity client module specification.
- The web client serves as a playable prototype demonstrating the full game loop.
- For production deployment, consider adding: TLS encryption, password hashing, rate limiting, and Redis caching as described in the design document.