# 🏍️ 暴走摩托：双人载具 — Road Rage Online Mayhem

多人在线摩托车竞技对战游戏 Demo

## 游戏特色

- **双人载具机制** — 驾驶员控制方向，乘客执行攻击
- **三种攻击方式** — 踢击、捏刹车、武器攻击
- **平衡系统** — 攻击消耗平衡值，驾驶中自动恢复
- **AI 对手** — 状态机驱动的智能对手（追击→攻击→闪避）
- **多人联机** — WebSocket 实时同步（也支持离线单机）

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务器（含静态文件服务 + WebSocket）
npm start

# 打开浏览器访问
# http://localhost:3000
```

## 操作说明

| 操作 | 按键 |
|------|------|
| 加速 | `W` / `↑` |
| 刹车 | `S` / `↓` |
| 左转 | `A` / `←` |
| 右转 | `D` / `→` |
| 踢击 | `J` |
| 捏刹车 | `K` |
| 武器攻击 | `L` |

## 项目结构

```
├── server/            # Node.js 游戏服务器
│   ├── index.js       # HTTP + WebSocket 服务器入口
│   ├── GameEngine.js  # 服务器端游戏引擎（物理、战斗、AI）
│   ├── GameRoom.js    # 房间管理
│   └── protocol.js    # 网络协议定义
├── client/            # HTML5 Canvas 游戏客户端
│   ├── index.html     # 游戏主页
│   ├── css/style.css  # 样式
│   └── js/
│       ├── main.js         # 入口
│       ├── Game.js         # 游戏主类
│       ├── Renderer.js     # Canvas 渲染器
│       ├── InputManager.js # 输入管理
│       ├── Network.js      # WebSocket 客户端
│       ├── OfflineEngine.js # 离线模式引擎
│       └── protocol.js     # 协议常量
├── Introduction.md    # 项目技术规格文档
└── package.json
```

## 技术架构

- **服务器**: Node.js + WebSocket (`ws`) — 权威服务器模式
- **客户端**: HTML5 Canvas + 原生 JavaScript — 无框架依赖
- **网络**: JSON over WebSocket（TCP），20Hz 状态同步
- **物理**: 简化 2D 物理引擎，服务器/客户端双端运行