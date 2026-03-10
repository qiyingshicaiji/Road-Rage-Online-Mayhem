using System;
using System.Threading.Tasks;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using Unity.Networking.Transport.Relay;
using Unity.Services.Relay;
using Unity.Services.Relay.Models;
using UnityEngine;

namespace RoadRage.Network
{
    /// <summary>
    /// Unity Relay 管理器 - 处理 Relay 分配和加入。
    /// UGS Relay 免费套餐支持 20 CCU（并发连接用户）。
    ///
    /// 工作流程：
    /// 1. 主机调用 CreateRelay() 获取 join code
    /// 2. 客户端调用 JoinRelay(joinCode) 连接到主机
    /// 3. 所有网络流量通过 Unity Relay 服务器中转（NAT 穿透）
    /// </summary>
    public class RelayManager : MonoBehaviour
    {
        public static RelayManager Instance { get; private set; }

        /// <summary>当前 Relay join code（主机创建后获得）</summary>
        public string JoinCode { get; private set; }

        /// <summary>是否已连接到 Relay</summary>
        public bool IsRelayConnected { get; private set; }

        /// <summary>事件：Relay 创建成功</summary>
        public event Action<string> OnRelayCreated;

        /// <summary>事件：Relay 加入成功</summary>
        public event Action OnRelayJoined;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        /// <summary>
        /// 创建 Relay 分配（主机调用）
        /// </summary>
        /// <param name="maxConnections">最大连接数（不包括主机自身）</param>
        /// <returns>Relay Allocation，失败返回 null</returns>
        public async Task<Allocation> CreateRelay(int maxConnections = 19)
        {
            try
            {
                // 请求 Relay 分配（免费套餐最多 20 CCU，主机占 1 个）
                Debug.Log($"[RelayManager] 正在创建 Relay 分配，最大连接数: {maxConnections}...");
                Allocation allocation = await RelayService.Instance.CreateAllocationAsync(maxConnections);

                // 获取 join code
                JoinCode = await RelayService.Instance.GetJoinCodeAsync(allocation.AllocationId);
                Debug.Log($"[RelayManager] Relay 创建成功，Join Code: {JoinCode}");

                // 配置 Unity Transport 使用 Relay
                var transport = NetworkManager.Singleton.GetComponent<UnityTransport>();
                if (transport != null)
                {
                    var relayServerData = new RelayServerData(allocation, "dtls");
                    transport.SetRelayServerData(relayServerData);
                }
                else
                {
                    Debug.LogError("[RelayManager] 未找到 UnityTransport 组件！");
                    return null;
                }

                IsRelayConnected = true;
                OnRelayCreated?.Invoke(JoinCode);
                return allocation;
            }
            catch (RelayServiceException e)
            {
                Debug.LogError($"[RelayManager] 创建 Relay 失败: {e.Message}");
                return null;
            }
        }

        /// <summary>
        /// 加入 Relay（客户端调用）
        /// </summary>
        /// <param name="joinCode">主机提供的 join code</param>
        /// <returns>是否成功</returns>
        public async Task<bool> JoinRelay(string joinCode)
        {
            try
            {
                Debug.Log($"[RelayManager] 正在加入 Relay，Join Code: {joinCode}...");
                JoinAllocation joinAllocation = await RelayService.Instance.JoinAllocationAsync(joinCode);

                // 配置 Unity Transport
                var transport = NetworkManager.Singleton.GetComponent<UnityTransport>();
                if (transport != null)
                {
                    var relayServerData = new RelayServerData(joinAllocation, "dtls");
                    transport.SetRelayServerData(relayServerData);
                }
                else
                {
                    Debug.LogError("[RelayManager] 未找到 UnityTransport 组件！");
                    return false;
                }

                JoinCode = joinCode;
                IsRelayConnected = true;
                OnRelayJoined?.Invoke();
                Debug.Log("[RelayManager] 成功加入 Relay");
                return true;
            }
            catch (RelayServiceException e)
            {
                Debug.LogError($"[RelayManager] 加入 Relay 失败: {e.Message}");
                return false;
            }
        }

        /// <summary>
        /// 断开 Relay 连接
        /// </summary>
        public void Disconnect()
        {
            JoinCode = null;
            IsRelayConnected = false;
        }
    }
}
