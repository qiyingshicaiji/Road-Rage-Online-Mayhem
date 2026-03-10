using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Unity.Services.Lobbies;
using Unity.Services.Lobbies.Models;
using Unity.Services.Authentication;
using UnityEngine;

namespace RoadRage.Network
{
    /// <summary>
    /// Unity Lobby 管理器 - 处理房间创建、加入、列表和心跳。
    /// UGS Lobby 服务免费套餐支持创建和管理游戏房间。
    ///
    /// 房间数据结构：
    /// - RoomName: 房间名称
    /// - RelayJoinCode: Relay join code（游戏开始后设置）
    /// - GameState: 房间状态 (Waiting/Playing/Finished)
    /// </summary>
    public class LobbyManager : MonoBehaviour
    {
        public static LobbyManager Instance { get; private set; }

        [Header("Lobby Settings")]
        [SerializeField] private float heartbeatInterval = 15f;
        [SerializeField] private float pollInterval = 2f;

        /// <summary>当前所在的 Lobby</summary>
        public Lobby CurrentLobby { get; private set; }

        /// <summary>是否是房主</summary>
        public bool IsHost => CurrentLobby != null &&
            CurrentLobby.HostId == AuthenticationService.Instance.PlayerId;

        /// <summary>当前房间列表</summary>
        public List<Lobby> AvailableLobbies { get; private set; } = new List<Lobby>();

        // 事件
        public event Action<Lobby> OnLobbyCreated;
        public event Action<Lobby> OnLobbyJoined;
        public event Action<List<Lobby>> OnLobbyListUpdated;
        public event Action<Lobby> OnLobbyUpdated;
        public event Action OnLobbyLeft;
        public event Action<string> OnError;

        // Lobby 数据 key 常量
        public const string KEY_RELAY_CODE = "RelayJoinCode";
        public const string KEY_GAME_STATE = "GameState";
        public const string KEY_ROOM_NAME = "RoomName";

        // 玩家数据 key 常量
        public const string KEY_PLAYER_NAME = "PlayerName";
        public const string KEY_PLAYER_ROLE = "PlayerRole";  // "Driver" 或 "Passenger"
        public const string KEY_PLAYER_VEHICLE = "VehicleId";

        private float heartbeatTimer;
        private float pollTimer;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        private void Update()
        {
            HandleHeartbeat();
            HandlePolling();
        }

        /// <summary>
        /// 创建游戏房间
        /// </summary>
        /// <param name="roomName">房间名称</param>
        /// <param name="maxPlayers">最大玩家数（默认 6 = 3 摩托车 × 2 人）</param>
        /// <param name="playerRole">创建者角色（Driver/Passenger）</param>
        public async Task<Lobby> CreateLobby(string roomName, int maxPlayers = 6,
            string playerRole = "Driver")
        {
            try
            {
                // 创建带有自定义数据的 Lobby
                var options = new CreateLobbyOptions
                {
                    IsPrivate = false,
                    Player = CreatePlayerData(playerRole),
                    Data = new Dictionary<string, DataObject>
                    {
                        {
                            KEY_RELAY_CODE,
                            new DataObject(DataObject.VisibilityOptions.Member, "")
                        },
                        {
                            KEY_GAME_STATE,
                            new DataObject(DataObject.VisibilityOptions.Public, "Waiting")
                        },
                        {
                            KEY_ROOM_NAME,
                            new DataObject(DataObject.VisibilityOptions.Public, roomName)
                        }
                    }
                };

                CurrentLobby = await LobbyService.Instance.CreateLobbyAsync(
                    roomName, maxPlayers, options);

                Debug.Log($"[LobbyManager] 房间已创建: {roomName} " +
                    $"(ID: {CurrentLobby.Id}, 最大人数: {maxPlayers})");

                OnLobbyCreated?.Invoke(CurrentLobby);
                return CurrentLobby;
            }
            catch (LobbyServiceException e)
            {
                Debug.LogError($"[LobbyManager] 创建房间失败: {e.Message}");
                OnError?.Invoke($"创建房间失败: {e.Message}");
                return null;
            }
        }

        /// <summary>
        /// 加入指定 Lobby
        /// </summary>
        public async Task<bool> JoinLobby(string lobbyId, string playerRole = "Passenger")
        {
            try
            {
                var options = new JoinLobbyByIdOptions
                {
                    Player = CreatePlayerData(playerRole)
                };

                CurrentLobby = await LobbyService.Instance.JoinLobbyByIdAsync(
                    lobbyId, options);

                Debug.Log($"[LobbyManager] 已加入房间: {CurrentLobby.Name}");
                OnLobbyJoined?.Invoke(CurrentLobby);
                return true;
            }
            catch (LobbyServiceException e)
            {
                Debug.LogError($"[LobbyManager] 加入房间失败: {e.Message}");
                OnError?.Invoke($"加入房间失败: {e.Message}");
                return false;
            }
        }

        /// <summary>
        /// 通过 Lobby Code 加入
        /// </summary>
        public async Task<bool> JoinLobbyByCode(string lobbyCode,
            string playerRole = "Passenger")
        {
            try
            {
                var options = new JoinLobbyByCodeOptions
                {
                    Player = CreatePlayerData(playerRole)
                };

                CurrentLobby = await LobbyService.Instance.JoinLobbyByCodeAsync(
                    lobbyCode, options);

                Debug.Log($"[LobbyManager] 已通过代码加入房间: {CurrentLobby.Name}");
                OnLobbyJoined?.Invoke(CurrentLobby);
                return true;
            }
            catch (LobbyServiceException e)
            {
                Debug.LogError($"[LobbyManager] 通过代码加入失败: {e.Message}");
                OnError?.Invoke($"加入失败: {e.Message}");
                return false;
            }
        }

        /// <summary>
        /// 刷新可用房间列表
        /// </summary>
        public async Task RefreshLobbyList()
        {
            try
            {
                var options = new QueryLobbiesOptions
                {
                    Count = 20,
                    Filters = new List<QueryFilter>
                    {
                        // 只显示等待中的房间
                        new QueryFilter(
                            QueryFilter.FieldOptions.S1,
                            "Waiting",
                            QueryFilter.OpOptions.EQ)
                    },
                    Order = new List<QueryOrder>
                    {
                        new QueryOrder(false, QueryOrder.FieldOptions.Created)
                    }
                };

                var response = await LobbyService.Instance.QueryLobbiesAsync(options);
                AvailableLobbies = response.Results;
                OnLobbyListUpdated?.Invoke(AvailableLobbies);

                Debug.Log($"[LobbyManager] 找到 {AvailableLobbies.Count} 个房间");
            }
            catch (LobbyServiceException e)
            {
                Debug.LogError($"[LobbyManager] 刷新房间列表失败: {e.Message}");
            }
        }

        /// <summary>
        /// 更新 Lobby 数据（房主调用，设置 Relay join code 和游戏状态）
        /// </summary>
        public async Task UpdateLobbyData(string relayJoinCode, string gameState)
        {
            if (CurrentLobby == null || !IsHost) return;

            try
            {
                var options = new UpdateLobbyOptions
                {
                    Data = new Dictionary<string, DataObject>
                    {
                        {
                            KEY_RELAY_CODE,
                            new DataObject(DataObject.VisibilityOptions.Member,
                                relayJoinCode)
                        },
                        {
                            KEY_GAME_STATE,
                            new DataObject(DataObject.VisibilityOptions.Public,
                                gameState)
                        }
                    }
                };

                CurrentLobby = await LobbyService.Instance.UpdateLobbyAsync(
                    CurrentLobby.Id, options);

                Debug.Log($"[LobbyManager] Lobby 数据已更新: State={gameState}");
                OnLobbyUpdated?.Invoke(CurrentLobby);
            }
            catch (LobbyServiceException e)
            {
                Debug.LogError($"[LobbyManager] 更新 Lobby 数据失败: {e.Message}");
            }
        }

        /// <summary>
        /// 更新玩家角色
        /// </summary>
        public async Task UpdatePlayerRole(string role)
        {
            if (CurrentLobby == null) return;

            try
            {
                var options = new UpdatePlayerOptions
                {
                    Data = new Dictionary<string, PlayerDataObject>
                    {
                        {
                            KEY_PLAYER_ROLE,
                            new PlayerDataObject(PlayerDataObject.VisibilityOptions.Member,
                                role)
                        }
                    }
                };

                CurrentLobby = await LobbyService.Instance.UpdatePlayerAsync(
                    CurrentLobby.Id,
                    AuthenticationService.Instance.PlayerId,
                    options);
            }
            catch (LobbyServiceException e)
            {
                Debug.LogError($"[LobbyManager] 更新玩家角色失败: {e.Message}");
            }
        }

        /// <summary>
        /// 离开当前房间
        /// </summary>
        public async Task LeaveLobby()
        {
            if (CurrentLobby == null) return;

            try
            {
                string lobbyId = CurrentLobby.Id;

                if (IsHost)
                {
                    await LobbyService.Instance.DeleteLobbyAsync(lobbyId);
                    Debug.Log("[LobbyManager] 房间已删除（房主离开）");
                }
                else
                {
                    await LobbyService.Instance.RemovePlayerAsync(
                        lobbyId, AuthenticationService.Instance.PlayerId);
                    Debug.Log("[LobbyManager] 已离开房间");
                }

                CurrentLobby = null;
                OnLobbyLeft?.Invoke();
            }
            catch (LobbyServiceException e)
            {
                Debug.LogError($"[LobbyManager] 离开房间失败: {e.Message}");
                CurrentLobby = null;
            }
        }

        /// <summary>
        /// 获取 Relay join code（从 Lobby 数据中）
        /// </summary>
        public string GetRelayJoinCode()
        {
            if (CurrentLobby?.Data == null) return null;
            if (CurrentLobby.Data.TryGetValue(KEY_RELAY_CODE, out var data))
            {
                return string.IsNullOrEmpty(data.Value) ? null : data.Value;
            }
            return null;
        }

        /// <summary>
        /// 获取游戏状态
        /// </summary>
        public string GetGameState()
        {
            if (CurrentLobby?.Data == null) return "Unknown";
            if (CurrentLobby.Data.TryGetValue(KEY_GAME_STATE, out var data))
            {
                return data.Value;
            }
            return "Unknown";
        }

        // --- 私有方法 ---

        private Player CreatePlayerData(string role)
        {
            string playerName = GameNetworkManager.Instance != null
                ? GameNetworkManager.Instance.PlayerName
                : "Player";

            return new Player
            {
                Data = new Dictionary<string, PlayerDataObject>
                {
                    {
                        KEY_PLAYER_NAME,
                        new PlayerDataObject(PlayerDataObject.VisibilityOptions.Member,
                            playerName)
                    },
                    {
                        KEY_PLAYER_ROLE,
                        new PlayerDataObject(PlayerDataObject.VisibilityOptions.Member,
                            role)
                    },
                    {
                        KEY_PLAYER_VEHICLE,
                        new PlayerDataObject(PlayerDataObject.VisibilityOptions.Member, "0")
                    }
                }
            };
        }

        /// <summary>
        /// Lobby 心跳（房主每 15 秒发送一次，防止 Lobby 过期）
        /// </summary>
        private async void HandleHeartbeat()
        {
            if (CurrentLobby == null || !IsHost) return;

            heartbeatTimer -= Time.deltaTime;
            if (heartbeatTimer <= 0f)
            {
                heartbeatTimer = heartbeatInterval;
                try
                {
                    await LobbyService.Instance.SendHeartbeatPingAsync(CurrentLobby.Id);
                }
                catch (LobbyServiceException e)
                {
                    Debug.LogWarning($"[LobbyManager] 心跳失败: {e.Message}");
                }
            }
        }

        /// <summary>
        /// 轮询 Lobby 更新（所有成员每 2 秒获取最新数据）
        /// </summary>
        private async void HandlePolling()
        {
            if (CurrentLobby == null) return;

            pollTimer -= Time.deltaTime;
            if (pollTimer <= 0f)
            {
                pollTimer = pollInterval;
                try
                {
                    CurrentLobby = await LobbyService.Instance.GetLobbyAsync(
                        CurrentLobby.Id);
                    OnLobbyUpdated?.Invoke(CurrentLobby);
                }
                catch (LobbyServiceException e)
                {
                    Debug.LogWarning($"[LobbyManager] 轮询失败: {e.Message}");
                    // Lobby 可能已被删除
                    if (e.Reason == LobbyExceptionReason.LobbyNotFound)
                    {
                        CurrentLobby = null;
                        OnLobbyLeft?.Invoke();
                    }
                }
            }
        }

        private async void OnDestroy()
        {
            await LeaveLobby();
        }
    }
}
