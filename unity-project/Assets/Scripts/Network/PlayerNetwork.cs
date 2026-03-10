using Unity.Netcode;
using UnityEngine;

namespace RoadRage.Network
{
    /// <summary>
    /// 玩家网络行为 - 管理每个玩家的网络同步状态。
    /// 挂载到玩家 Prefab 上（作为 NetworkObject 子组件）。
    ///
    /// 同步数据：
    /// - PlayerName: 玩家名称
    /// - Role: 驾驶员/乘客
    /// - AssignedVehicleId: 分配的载具 ID
    /// - IsReady: 是否准备好开始游戏
    /// </summary>
    public class PlayerNetwork : NetworkBehaviour
    {
        /// <summary>玩家名称（网络同步）</summary>
        public NetworkVariable<FixedString64Bytes> PlayerName =
            new NetworkVariable<FixedString64Bytes>("Player",
                NetworkVariableReadPermission.Everyone,
                NetworkVariableWritePermission.Owner);

        /// <summary>玩家角色：1=驾驶员，2=乘客</summary>
        public NetworkVariable<int> Role =
            new NetworkVariable<int>(1,
                NetworkVariableReadPermission.Everyone,
                NetworkVariableWritePermission.Server);

        /// <summary>分配的载具网络 ID</summary>
        public NetworkVariable<ulong> AssignedVehicleId =
            new NetworkVariable<ulong>(0,
                NetworkVariableReadPermission.Everyone,
                NetworkVariableWritePermission.Server);

        /// <summary>玩家是否已准备</summary>
        public NetworkVariable<bool> IsReady =
            new NetworkVariable<bool>(false,
                NetworkVariableReadPermission.Everyone,
                NetworkVariableWritePermission.Owner);

        public override void OnNetworkSpawn()
        {
            if (IsOwner)
            {
                // 设置本地玩家名称
                string name = GameNetworkManager.Instance != null
                    ? GameNetworkManager.Instance.PlayerName
                    : $"Player_{OwnerClientId}";
                PlayerName.Value = name;

                Debug.Log($"[PlayerNetwork] 本地玩家已生成: {name} (ClientId: {OwnerClientId})");
            }

            // 监听变化
            PlayerName.OnValueChanged += OnPlayerNameChanged;
            Role.OnValueChanged += OnRoleChanged;
        }

        public override void OnNetworkDespawn()
        {
            PlayerName.OnValueChanged -= OnPlayerNameChanged;
            Role.OnValueChanged -= OnRoleChanged;
        }

        /// <summary>
        /// 请求服务器分配角色
        /// </summary>
        [ServerRpc]
        public void RequestRoleServerRpc(int requestedRole)
        {
            Role.Value = requestedRole;
            Debug.Log($"[PlayerNetwork] 玩家 {OwnerClientId} 角色设为: " +
                $"{(requestedRole == 1 ? "驾驶员" : "乘客")}");
        }

        /// <summary>
        /// 切换准备状态
        /// </summary>
        public void ToggleReady()
        {
            if (IsOwner)
            {
                IsReady.Value = !IsReady.Value;
            }
        }

        private void OnPlayerNameChanged(FixedString64Bytes oldVal, FixedString64Bytes newVal)
        {
            Debug.Log($"[PlayerNetwork] 玩家改名: {oldVal} -> {newVal}");
        }

        private void OnRoleChanged(int oldVal, int newVal)
        {
            string roleName = newVal == 1 ? "驾驶员/Driver" : "乘客/Passenger";
            Debug.Log($"[PlayerNetwork] 角色变更: {roleName}");
        }
    }
}
