using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Unity.Services.Lobbies.Models;
using RoadRage.Network;

namespace RoadRage.UI
{
    /// <summary>
    /// 大厅 UI - 房间创建、加入和管理。
    /// 挂载到 Lobby 场景的 Canvas 上。
    ///
    /// UI 结构（在 Unity Editor 中创建）：
    /// - Canvas
    ///   ├── HeaderPanel
    ///   │   ├── PlayerInfoText
    ///   │   └── BackButton
    ///   ├── CreateRoomPanel
    ///   │   ├── RoomNameInput
    ///   │   ├── RoleToggle (Driver/Passenger)
    ///   │   ├── AICountDropdown
    ///   │   └── CreateButton
    ///   ├── RoomListPanel
    ///   │   ├── RoomListContent (ScrollView)
    ///   │   ├── RefreshButton
    ///   │   └── JoinCodeInput + JoinByCodeButton
    ///   └── WaitingPanel (进入房间后显示)
    ///       ├── RoomInfoText
    ///       ├── PlayerListText
    ///       ├── StartButton (仅房主可见)
    ///       └── LeaveButton
    /// </summary>
    public class LobbyUI : MonoBehaviour
    {
        [Header("Create Room")]
        [SerializeField] private TMP_InputField roomNameInput;
        [SerializeField] private Toggle driverToggle;
        [SerializeField] private Toggle passengerToggle;
        [SerializeField] private TMP_Dropdown aiCountDropdown;
        [SerializeField] private Button createButton;

        [Header("Room List")]
        [SerializeField] private Transform roomListContent;
        [SerializeField] private GameObject roomItemPrefab;
        [SerializeField] private Button refreshButton;
        [SerializeField] private TMP_InputField joinCodeInput;
        [SerializeField] private Button joinByCodeButton;
        [SerializeField] private TextMeshProUGUI noRoomsText;

        [Header("Waiting Room")]
        [SerializeField] private GameObject waitingPanel;
        [SerializeField] private TextMeshProUGUI roomInfoText;
        [SerializeField] private TextMeshProUGUI playerListText;
        [SerializeField] private Button startButton;
        [SerializeField] private Button leaveButton;

        [Header("General")]
        [SerializeField] private TextMeshProUGUI playerInfoText;
        [SerializeField] private TextMeshProUGUI statusText;

        [Header("Scene")]
        [SerializeField] private string gameSceneName = "Game";
        [SerializeField] private string mainMenuSceneName = "MainMenu";

        private LobbyManager lobbyManager;

        private void Start()
        {
            lobbyManager = LobbyManager.Instance;

            // 设置默认值
            roomNameInput.text = $"Race Room {Random.Range(1, 100)}";

            // 按钮事件
            createButton.onClick.AddListener(OnCreateRoom);
            refreshButton.onClick.AddListener(OnRefreshRooms);
            joinByCodeButton.onClick.AddListener(OnJoinByCode);
            startButton.onClick.AddListener(OnStartGame);
            leaveButton.onClick.AddListener(OnLeaveRoom);

            // Lobby 事件
            lobbyManager.OnLobbyCreated += OnLobbyCreated;
            lobbyManager.OnLobbyJoined += OnLobbyJoined;
            lobbyManager.OnLobbyUpdated += OnLobbyUpdated;
            lobbyManager.OnLobbyListUpdated += OnLobbyListUpdated;
            lobbyManager.OnLobbyLeft += OnLobbyLeft;
            lobbyManager.OnError += OnLobbyError;

            // 初始状态
            waitingPanel.SetActive(false);
            UpdatePlayerInfo();

            // 自动刷新房间列表
            OnRefreshRooms();
        }

        private void UpdatePlayerInfo()
        {
            var netManager = GameNetworkManager.Instance;
            if (netManager != null)
            {
                playerInfoText.text = $"👤 {netManager.PlayerName}  |  " +
                    $"ID: {netManager.PlayerId?[..8]}...";
            }
        }

        // === 创建房间 ===

        private async void OnCreateRoom()
        {
            string roomName = roomNameInput.text.Trim();
            if (string.IsNullOrEmpty(roomName)) roomName = "Race Room";

            string role = driverToggle.isOn ? "Driver" : "Passenger";
            int maxPlayers = 6; // 3 摩托车 × 2 人

            createButton.interactable = false;
            statusText.text = "正在创建房间...";

            await lobbyManager.CreateLobby(roomName, maxPlayers, role);
            createButton.interactable = true;
        }

        // === 房间列表 ===

        private async void OnRefreshRooms()
        {
            refreshButton.interactable = false;
            statusText.text = "刷新中...";
            await lobbyManager.RefreshLobbyList();
            refreshButton.interactable = true;
            statusText.text = "";
        }

        private void OnLobbyListUpdated(List<Lobby> lobbies)
        {
            // 清除旧列表
            foreach (Transform child in roomListContent)
            {
                Destroy(child.gameObject);
            }

            if (lobbies.Count == 0)
            {
                if (noRoomsText != null) noRoomsText.gameObject.SetActive(true);
                return;
            }

            if (noRoomsText != null) noRoomsText.gameObject.SetActive(false);

            // 创建房间列表项
            foreach (var lobby in lobbies)
            {
                CreateRoomListItem(lobby);
            }
        }

        private void CreateRoomListItem(Lobby lobby)
        {
            if (roomItemPrefab == null)
            {
                Debug.LogWarning("[LobbyUI] roomItemPrefab 未设置，使用日志输出");
                Debug.Log($"  房间: {lobby.Name} ({lobby.Players.Count}/{lobby.MaxPlayers})");
                return;
            }

            GameObject item = Instantiate(roomItemPrefab, roomListContent);

            // 设置房间信息（假设 prefab 有 TextMeshProUGUI 子组件）
            var texts = item.GetComponentsInChildren<TextMeshProUGUI>();
            if (texts.Length >= 2)
            {
                texts[0].text = lobby.Name;
                texts[1].text = $"{lobby.Players.Count}/{lobby.MaxPlayers}";
            }

            // 点击加入
            var button = item.GetComponent<Button>();
            if (button != null)
            {
                string lobbyId = lobby.Id;
                button.onClick.AddListener(() => OnJoinRoom(lobbyId));
            }
        }

        private async void OnJoinRoom(string lobbyId)
        {
            string role = driverToggle.isOn ? "Driver" : "Passenger";
            statusText.text = "正在加入房间...";
            await lobbyManager.JoinLobby(lobbyId, role);
        }

        private async void OnJoinByCode()
        {
            string code = joinCodeInput.text.Trim();
            if (string.IsNullOrEmpty(code))
            {
                statusText.text = "请输入房间代码！";
                return;
            }

            string role = driverToggle.isOn ? "Driver" : "Passenger";
            statusText.text = "正在通过代码加入...";
            await lobbyManager.JoinLobbyByCode(code, role);
        }

        // === 等待房间 ===

        private void OnLobbyCreated(Lobby lobby)
        {
            statusText.text = $"房间已创建: {lobby.Name}";
            ShowWaitingRoom(lobby);
        }

        private void OnLobbyJoined(Lobby lobby)
        {
            statusText.text = $"已加入: {lobby.Name}";
            ShowWaitingRoom(lobby);
        }

        private void ShowWaitingRoom(Lobby lobby)
        {
            waitingPanel.SetActive(true);
            startButton.gameObject.SetActive(lobbyManager.IsHost);
            UpdateWaitingRoomInfo(lobby);
        }

        private void OnLobbyUpdated(Lobby lobby)
        {
            if (waitingPanel.activeSelf)
            {
                UpdateWaitingRoomInfo(lobby);

                // 检查游戏是否已开始（非房主检测 Relay join code）
                if (!lobbyManager.IsHost)
                {
                    string relayCode = lobbyManager.GetRelayJoinCode();
                    string gameState = lobbyManager.GetGameState();
                    if (gameState == "Playing" && !string.IsNullOrEmpty(relayCode))
                    {
                        JoinGameAsClient(relayCode);
                    }
                }
            }
        }

        private void UpdateWaitingRoomInfo(Lobby lobby)
        {
            roomInfoText.text = $"🏠 {lobby.Name}\n" +
                $"Lobby Code: {lobby.LobbyCode}\n" +
                $"玩家: {lobby.Players.Count}/{lobby.MaxPlayers}\n" +
                $"状态: {lobbyManager.GetGameState()}";

            // 玩家列表
            string playerList = "";
            foreach (var player in lobby.Players)
            {
                string name = "Unknown";
                string role = "Unknown";

                if (player.Data != null)
                {
                    if (player.Data.TryGetValue(LobbyManager.KEY_PLAYER_NAME, out var nameData))
                        name = nameData.Value;
                    if (player.Data.TryGetValue(LobbyManager.KEY_PLAYER_ROLE, out var roleData))
                        role = roleData.Value;
                }

                string isHost = player.Id == lobby.HostId ? " 👑" : "";
                string roleIcon = role == "Driver" ? "🏍️" : "👊";
                playerList += $"  {roleIcon} {name}{isHost}\n";
            }
            playerListText.text = playerList;
        }

        // === 开始游戏 ===

        private async void OnStartGame()
        {
            if (!lobbyManager.IsHost) return;

            startButton.interactable = false;
            statusText.text = "正在启动游戏（创建 Relay 连接）...";

            // 1. 创建 Relay
            bool hostStarted = await GameNetworkManager.Instance.StartHost();
            if (!hostStarted)
            {
                statusText.text = "启动失败，请重试";
                startButton.interactable = true;
                return;
            }

            // 2. 获取 Relay join code 并更新 Lobby
            string relayCode = RelayManager.Instance.JoinCode;
            await lobbyManager.UpdateLobbyData(relayCode, "Playing");

            statusText.text = "游戏启动中...";

            // 3. 加载游戏场景（通过 NetworkManager 同步加载）
            Unity.Netcode.NetworkManager.Singleton.SceneManagement.LoadScene(
                gameSceneName, UnityEngine.SceneManagement.LoadSceneMode.Single);
        }

        private async void JoinGameAsClient(string relayCode)
        {
            statusText.text = "正在连接到游戏服务器...";

            bool joined = await GameNetworkManager.Instance.StartClient(relayCode);
            if (!joined)
            {
                statusText.text = "连接失败";
            }
            // 场景切换由主机通过 NetworkManager 同步控制
        }

        // === 离开 ===

        private async void OnLeaveRoom()
        {
            await lobbyManager.LeaveLobby();
        }

        private void OnLobbyLeft()
        {
            waitingPanel.SetActive(false);
            statusText.text = "已离开房间";
            OnRefreshRooms();
        }

        private void OnLobbyError(string error)
        {
            statusText.text = $"⚠ {error}";
        }

        private void OnDestroy()
        {
            createButton.onClick.RemoveAllListeners();
            refreshButton.onClick.RemoveAllListeners();
            joinByCodeButton.onClick.RemoveAllListeners();
            startButton.onClick.RemoveAllListeners();
            leaveButton.onClick.RemoveAllListeners();

            if (lobbyManager != null)
            {
                lobbyManager.OnLobbyCreated -= OnLobbyCreated;
                lobbyManager.OnLobbyJoined -= OnLobbyJoined;
                lobbyManager.OnLobbyUpdated -= OnLobbyUpdated;
                lobbyManager.OnLobbyListUpdated -= OnLobbyListUpdated;
                lobbyManager.OnLobbyLeft -= OnLobbyLeft;
                lobbyManager.OnError -= OnLobbyError;
            }
        }
    }
}
