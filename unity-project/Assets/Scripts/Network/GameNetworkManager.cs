using System;
using System.Threading.Tasks;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using Unity.Services.Core;
using Unity.Services.Authentication;
using UnityEngine;

namespace RoadRage.Network
{
    /// <summary>
    /// 游戏网络管理器 - 初始化 UGS 服务并管理 Netcode 生命周期。
    /// 挂载到场景中带有 NetworkManager 和 UnityTransport 组件的 GameObject 上。
    /// 使用 Unity Gaming Services (UGS) 免费套餐，支持 20 人同时在线。
    /// </summary>
    public class GameNetworkManager : MonoBehaviour
    {
        public static GameNetworkManager Instance { get; private set; }

        [Header("UGS Settings")]
        [Tooltip("最大玩家数 (UGS 免费套餐支持 20 CCU)")]
        [SerializeField] private int maxPlayers = 20;

        [Header("Game Settings")]
        [Tooltip("每辆摩托车的玩家数")]
        [SerializeField] private int playersPerVehicle = 2;
        [Tooltip("最大摩托车数量")]
        [SerializeField] private int maxVehicles = 3;

        /// <summary>当前玩家 ID（UGS Authentication）</summary>
        public string PlayerId { get; private set; }
        /// <summary>当前玩家名称</summary>
        public string PlayerName { get; set; } = "Player";
        /// <summary>UGS 是否已初始化</summary>
        public bool IsInitialized { get; private set; }

        /// <summary>事件：UGS 初始化完成</summary>
        public event Action OnInitialized;
        /// <summary>事件：认证完成</summary>
        public event Action<string> OnAuthenticated;
        /// <summary>事件：网络错误</summary>
        public event Action<string> OnNetworkError;

        private NetworkManager networkManager;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            networkManager = GetComponent<NetworkManager>();
            if (networkManager == null)
            {
                Debug.LogError("[GameNetworkManager] 缺少 NetworkManager 组件！");
            }
        }

        /// <summary>
        /// 初始化 Unity Gaming Services (Authentication, Relay, Lobby)
        /// </summary>
        public async Task InitializeUGS()
        {
            if (IsInitialized) return;

            try
            {
                Debug.Log("[GameNetworkManager] 正在初始化 Unity Gaming Services...");
                await UnityServices.InitializeAsync();
                Debug.Log("[GameNetworkManager] UGS 初始化完成");

                // 匿名登录
                if (!AuthenticationService.Instance.IsSignedIn)
                {
                    await AuthenticationService.Instance.SignInAnonymouslyAsync();
                }

                PlayerId = AuthenticationService.Instance.PlayerId;
                Debug.Log($"[GameNetworkManager] 已登录，PlayerId: {PlayerId}");

                IsInitialized = true;
                OnInitialized?.Invoke();
                OnAuthenticated?.Invoke(PlayerId);
            }
            catch (Exception e)
            {
                Debug.LogError($"[GameNetworkManager] UGS 初始化失败: {e.Message}");
                OnNetworkError?.Invoke($"UGS 初始化失败: {e.Message}");
            }
        }

        /// <summary>
        /// 作为主机启动游戏（通过 Relay 分配）
        /// </summary>
        public async Task<bool> StartHost(string joinCode = null)
        {
            if (networkManager == null) return false;

            try
            {
                if (string.IsNullOrEmpty(joinCode))
                {
                    // 创建 Relay 分配
                    var allocation = await RelayManager.Instance.CreateRelay(maxPlayers);
                    if (allocation == null) return false;
                }

                networkManager.StartHost();
                Debug.Log("[GameNetworkManager] 主机已启动");
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError($"[GameNetworkManager] 启动主机失败: {e.Message}");
                OnNetworkError?.Invoke($"启动主机失败: {e.Message}");
                return false;
            }
        }

        /// <summary>
        /// 作为客户端加入游戏（通过 Relay join code）
        /// </summary>
        public async Task<bool> StartClient(string joinCode)
        {
            if (networkManager == null || string.IsNullOrEmpty(joinCode)) return false;

            try
            {
                bool joined = await RelayManager.Instance.JoinRelay(joinCode);
                if (!joined) return false;

                networkManager.StartClient();
                Debug.Log("[GameNetworkManager] 客户端已连接");
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError($"[GameNetworkManager] 加入游戏失败: {e.Message}");
                OnNetworkError?.Invoke($"加入游戏失败: {e.Message}");
                return false;
            }
        }

        /// <summary>
        /// 断开网络连接
        /// </summary>
        public void Disconnect()
        {
            if (networkManager != null && networkManager.IsListening)
            {
                networkManager.Shutdown();
                Debug.Log("[GameNetworkManager] 已断开连接");
            }
        }

        private void OnDestroy()
        {
            Disconnect();
        }
    }
}
