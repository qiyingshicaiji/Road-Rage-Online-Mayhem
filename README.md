# 🏍️ Road Rage Online Mayhem — 暴走摩托：双人载具

多人在线摩托车竞速+战斗游戏，采用独特的双人载具机制。

Multiplayer online motorcycle racing + combat game featuring a unique dual-passenger vehicle mechanic.

## 架构 / Architecture

```
┌─────────────────────────────────────────────────┐
│              Unity Client (C#)                  │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Vehicle   │ │ Combat   │ │ UI (Login,     │  │
│  │ Physics   │ │ System   │ │  Lobby, HUD)   │  │
│  ├──────────┤ ├──────────┤ ├────────────────┤  │
│  │ Balance   │ │ AI       │ │ Race Manager   │  │
│  │ System    │ │ Control  │ │                │  │
│  └──────────┘ └──────────┘ └────────────────┘  │
│       │             │                           │
│  ┌────▼─────────────▼──────────────────────┐    │
│  │  Netcode for GameObjects (Host/Client)  │    │
│  └────────────────┬────────────────────────┘    │
└───────────────────┼─────────────────────────────┘
                    │ DTLS (加密 UDP)
          ┌─────────▼─────────┐
          │  Unity Relay      │  ← UGS 免费套餐
          │  (20 CCU Free)    │     20人同时在线
          └─────────┬─────────┘
          ┌─────────▼─────────┐
          │  Unity Lobby      │  ← 房间管理
          │  (Room System)    │
          └───────────────────┘
```

**联机方案：Unity Gaming Services (UGS) 免费套餐**
- **Unity Relay**: NAT 穿透，免费支持 20 CCU（并发连接用户）
- **Unity Lobby**: 房间创建/加入/管理
- **Netcode for GameObjects**: 主机/客户端模式，服务器权威

## 游戏特性 / Features

- **载具物理** — 油门/转向/刹车，摩擦力，最大速度 108 km/h
- **战斗系统** — 三种攻击类型（服务器权威判定）：
  - 🦶 **踢击 / Kick** — 1.5m, 30°锥形, 造成失控
  - 🤚 **抓刹车 / Brake Grab** — 1.0m, 侧后方, 大幅减速
  - 🔨 **重击 / Smash** — 2.0m, 30°前方锥形, 强力眩晕
- **平衡系统** — 0–100 分；攻击消耗 10-20 分；归零触发 1 秒失控；被动 5 分/秒恢复
- **AI 对手** — 状态机（空闲 → 追逐 → 攻击 → 规避）
- **UGS 联机** — Unity Relay + Lobby，免费 20 人同时在线
- **双人载具** — 驾驶员控制方向，乘客执行攻击

## 开发前提 / Prerequisites

- **Unity 2022.3 LTS** 或更新版本
- Unity Hub 已安装
- Unity 账户（用于 UGS 服务）

## 快速开始 / Quick Start

### 1. 用 Unity Hub 打开项目

```
Unity Hub → Open → 选择 unity-project/ 目录
```

### 2. 安装 UGS 依赖

`Packages/manifest.json` 中已声明所有必需包，Unity 会自动安装：
- `com.unity.netcode.gameobjects` — Netcode for GameObjects
- `com.unity.services.relay` — Unity Relay
- `com.unity.services.lobby` — Unity Lobby
- `com.unity.services.authentication` — Unity Authentication
- `com.unity.transport` — Unity Transport (with Relay support)

### 3. 配置 UGS

1. 在 Unity Editor 中：`Edit → Project Settings → Services`
2. 连接到 Unity Dashboard 中的项目
3. 启用 **Relay** 和 **Lobby** 服务
4. UGS 免费套餐自动生效（20 CCU）

### 4. 创建场景

需要创建 3 个场景：

**MainMenu 场景：**
- 创建 Canvas → 添加 `MainMenuUI` 脚本
- 创建空 GameObject → 添加 `GameNetworkManager`、`RelayManager`、`LobbyManager`
- 添加 `NetworkManager` 和 `UnityTransport` 组件

**Lobby 场景：**
- 创建 Canvas → 添加 `LobbyUI` 脚本
- 配置房间列表 UI、创建房间面板、等待面板

**Game 场景：**
- 创建 Canvas → 添加 `GameHUD` 和 `GameOverUI` 脚本
- 创建空 GameObject → 添加 `RaceManager` 脚本
- 创建赛道（3D 模型 + 碰撞体）
- 配置生成点 (SpawnPoints)

### 5. 创建载具 Prefab

摩托车 Prefab 需要以下组件：
- `NetworkObject`
- `NetworkTransform`
- `Rigidbody`
- `VehicleController`
- `BalanceSystem`
- `CombatSystem`
- `PassengerController`
- 3D 模型 + Collider

AI 载具额外添加 `AIController` 组件。

### 6. 创建 GameConfig

```
Assets → Create → RoadRage → GameConfig
```

所有游戏参数可在 Inspector 中调整。

## 操作方式 / Controls

| 角色 | 按键 | 动作 |
|------|------|------|
| 驾驶员 / Driver | W / ↑ | 加速 / Accelerate |
| 驾驶员 / Driver | S / ↓ | 刹车 / Brake |
| 驾驶员 / Driver | A / ← | 左转 / Steer left |
| 驾驶员 / Driver | D / → | 右转 / Steer right |
| 乘客 / Passenger | 1 | 踢击 / Kick |
| 乘客 / Passenger | 2 | 抓刹车 / Brake Grab |
| 乘客 / Passenger | 3 | 重击 / Smash |

## 项目结构 / Project Structure

```
├── unity-project/                        # Unity 客户端项目
│   ├── Packages/
│   │   └── manifest.json                 # UGS + Netcode 包依赖
│   └── Assets/
│       └── Scripts/
│           ├── Network/                  # 网络层
│           │   ├── GameNetworkManager.cs # UGS 初始化 + 认证 + 连接管理
│           │   ├── RelayManager.cs       # Unity Relay 管理（20 CCU 免费）
│           │   ├── LobbyManager.cs       # Unity Lobby 房间管理
│           │   └── PlayerNetwork.cs      # 玩家网络同步
│           ├── Gameplay/                 # 游戏逻辑
│           │   ├── VehicleController.cs  # 载具物理（服务器权威）
│           │   ├── BalanceSystem.cs      # 平衡系统 (0-100)
│           │   ├── CombatSystem.cs       # 战斗系统（踢击/抓刹车/重击）
│           │   ├── PassengerController.cs# 乘客控制 + 目标锁定
│           │   ├── AIController.cs       # AI 状态机
│           │   └── RaceManager.cs        # 比赛流程管理
│           ├── UI/                       # UI 脚本
│           │   ├── MainMenuUI.cs         # 登录界面
│           │   ├── LobbyUI.cs            # 大厅界面
│           │   ├── GameHUD.cs            # 游戏 HUD
│           │   └── GameOverUI.cs         # 游戏结束界面
│           └── Config/
│               └── GameConfig.cs         # ScriptableObject 游戏配置
├── server/                               # C++ 参考服务器（可选）
│   ├── CMakeLists.txt
│   ├── src/                              # 网络/游戏/数据模块
│   └── tests/                            # 单元测试
└── Introduction.md                       # 原始设计文档
```

## 联机流程 / Online Flow

```
1. 启动游戏 → MainMenuUI
2. 自动登录 UGS (匿名认证)
3. 进入大厅 → LobbyUI
4. 房主创建 Lobby → 其他玩家加入
5. 房主点击"开始" → 创建 Relay 分配 → 获取 Join Code
6. Join Code 通过 Lobby 数据同步给所有玩家
7. 所有玩家通过 Relay 连接 → Netcode 启动
8. 主机加载 Game 场景（NetworkManager 同步）
9. RaceManager 生成载具 → 倒计时 → 比赛开始
10. 服务器权威物理 + 战斗判定
11. 到达终点 → GameOverUI → 返回大厅
```

## UGS 免费套餐说明 / UGS Free Tier

| 服务 | 免费额度 | 用途 |
|------|----------|------|
| **Relay** | 20 CCU | NAT 穿透，玩家间通信 |
| **Lobby** | 免费 | 房间创建和管理 |
| **Authentication** | 免费 | 匿名登录 |

> 20 CCU = 最多 20 人同时在线游戏。对于本项目（每场 2-6 人），足够同时运行 3-10 场比赛。

## C++ 参考服务器 / C++ Reference Server

`server/` 目录包含独立的 C++ 游戏服务器（Boost.Asio TCP），用于：
- 学习服务器端游戏物理实现
- 对比 Unity Netcode 与自定义服务器架构
- 可作为未来专用服务器的基础

构建方法：
```bash
cd server && mkdir build && cd build && cmake .. && make -j$(nproc)
./test_protocol && ./test_game  # 运行测试
```

## 设计文档 / Design Document

详见 [Introduction.md](Introduction.md)，包含：
- 详细游戏机制和平衡设计
- 网络协议规格
- 数据库设计
- 6 阶段开发路线图
