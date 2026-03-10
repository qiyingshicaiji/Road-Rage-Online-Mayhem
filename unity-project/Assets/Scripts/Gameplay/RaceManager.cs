using System.Collections.Generic;
using Unity.Netcode;
using UnityEngine;
using RoadRage.Config;
using RoadRage.UI;

namespace RoadRage.Gameplay
{
    /// <summary>
    /// 比赛管理器 - 管理比赛流程（服务器权威）。
    /// 挂载到 Game 场景中的空 GameObject 上。
    ///
    /// 职责：
    /// 1. 比赛开始时生成载具（根据 Lobby 中玩家的角色分配）
    /// 2. 倒计时 → 比赛开始
    /// 3. 检测终点条件（圈数完成）
    /// 4. 生成 AI 载具
    /// 5. 广播比赛结束事件
    ///
    /// 场景层级结构：
    /// - RaceManager (this script)
    /// - NetworkManager (GameNetworkManager + RelayManager + LobbyManager)
    /// - GameCanvas (GameHUD + GameOverUI)
    /// - Track (赛道模型 + 碰撞体)
    /// - SpawnPoints (载具生成点)
    /// </summary>
    public class RaceManager : NetworkBehaviour
    {
        public static RaceManager Instance { get; private set; }

        [Header("Config")]
        [SerializeField] private GameConfig config;

        [Header("Prefabs")]
        [Tooltip("摩托车 Prefab（需要 NetworkObject）")]
        [SerializeField] private GameObject vehiclePrefab;

        [Tooltip("AI 摩托车 Prefab")]
        [SerializeField] private GameObject aiVehiclePrefab;

        [Header("Spawn Points")]
        [SerializeField] private Transform[] spawnPoints;

        [Header("UI References")]
        [SerializeField] private GameHUD gameHUD;
        [SerializeField] private GameOverUI gameOverUI;

        /// <summary>比赛是否正在进行</summary>
        public NetworkVariable<bool> IsRacing = new NetworkVariable<bool>(false);

        /// <summary>倒计时</summary>
        public NetworkVariable<float> CountdownTimer = new NetworkVariable<float>(3f);

        /// <summary>比赛进行时间</summary>
        public NetworkVariable<float> RaceTime = new NetworkVariable<float>(0f);

        // 生成的载具列表
        private List<VehicleController> spawnedVehicles = new List<VehicleController>();

        private void Awake()
        {
            Instance = this;

            if (config == null)
            {
                config = ScriptableObject.CreateInstance<GameConfig>();
            }
        }

        public override void OnNetworkSpawn()
        {
            if (IsServer)
            {
                // 服务器端：生成所有载具
                SpawnVehicles();

                // 开始倒计时
                CountdownTimer.Value = 3f;
                IsRacing.Value = false;
            }

            // 监听比赛状态变化
            IsRacing.OnValueChanged += OnRaceStateChanged;
        }

        private void Update()
        {
            if (!IsServer) return;

            // 倒计时
            if (CountdownTimer.Value > 0f && !IsRacing.Value)
            {
                CountdownTimer.Value -= Time.deltaTime;
                if (CountdownTimer.Value <= 0f)
                {
                    CountdownTimer.Value = 0f;
                    IsRacing.Value = true;
                    Debug.Log("[RaceManager] 比赛开始!");
                }
            }

            // 比赛计时
            if (IsRacing.Value)
            {
                RaceTime.Value += Time.deltaTime;
                CheckFinishCondition();
            }
        }

        /// <summary>
        /// 在服务器端生成载具
        /// </summary>
        private void SpawnVehicles()
        {
            if (vehiclePrefab == null)
            {
                Debug.LogError("[RaceManager] vehiclePrefab 未设置！");
                return;
            }

            // 获取已连接的客户端
            var clientIds = new List<ulong>(NetworkManager.Singleton.ConnectedClientsIds);
            Debug.Log($"[RaceManager] 已连接客户端: {clientIds.Count}");

            int spawnIndex = 0;

            // 为每对玩家（驾驶员+乘客）生成一辆载具
            // 简化版：每个客户端一辆载具
            foreach (var clientId in clientIds)
            {
                Vector3 spawnPos = GetSpawnPosition(spawnIndex);
                Quaternion spawnRot = Quaternion.identity;

                // 实例化载具
                var vehicleObj = Instantiate(vehiclePrefab, spawnPos, spawnRot);
                var vehicleNet = vehicleObj.GetComponent<NetworkObject>();
                var vehicleCtrl = vehicleObj.GetComponent<VehicleController>();

                if (vehicleNet != null)
                {
                    vehicleNet.SpawnWithOwnership(clientId);

                    if (vehicleCtrl != null)
                    {
                        vehicleCtrl.DriverClientId.Value = clientId;
                        spawnedVehicles.Add(vehicleCtrl);
                    }
                }

                spawnIndex++;
            }

            // 生成 AI 载具
            SpawnAIVehicles(spawnIndex);
        }

        /// <summary>
        /// 生成 AI 载具
        /// </summary>
        private void SpawnAIVehicles(int startIndex)
        {
            GameObject aiPrefab = aiVehiclePrefab != null ? aiVehiclePrefab : vehiclePrefab;
            if (aiPrefab == null) return;

            // 如果玩家少于 3 辆车，补充 AI
            int currentVehicles = spawnedVehicles.Count;
            int aiToSpawn = Mathf.Max(0, 3 - currentVehicles); // 至少 3 辆车参赛

            for (int i = 0; i < aiToSpawn; i++)
            {
                Vector3 spawnPos = GetSpawnPosition(startIndex + i);
                var aiObj = Instantiate(aiPrefab, spawnPos, Quaternion.identity);
                var aiNet = aiObj.GetComponent<NetworkObject>();

                if (aiNet != null)
                {
                    aiNet.Spawn(); // AI 归服务器所有

                    var aiCtrl = aiObj.GetComponent<AIController>();
                    var vehicleCtrl = aiObj.GetComponent<VehicleController>();

                    if (vehicleCtrl != null)
                    {
                        spawnedVehicles.Add(vehicleCtrl);
                    }
                }

                Debug.Log($"[RaceManager] AI 载具已生成 #{startIndex + i}");
            }
        }

        private Vector3 GetSpawnPosition(int index)
        {
            if (spawnPoints != null && index < spawnPoints.Length && spawnPoints[index] != null)
            {
                return spawnPoints[index].position;
            }

            // 默认位置：赛道起点，按车道排列
            float laneOffset = (index - 1) * config.laneWidth;
            return new Vector3(50f, 0f, laneOffset);
        }

        /// <summary>
        /// 检查是否有载具完成比赛
        /// </summary>
        private void CheckFinishCondition()
        {
            float finishDistance = config.trackLength * config.numLaps;

            foreach (var v in spawnedVehicles)
            {
                if (v == null) continue;

                if (v.DistanceTraveled.Value >= finishDistance)
                {
                    // 比赛结束！
                    IsRacing.Value = false;
                    NotifyGameOverClientRpc(v.NetworkObjectId);

                    Debug.Log($"[RaceManager] 比赛结束! 获胜者: {v.NetworkObjectId}, " +
                        $"用时: {RaceTime.Value:F1}s");
                    return;
                }
            }
        }

        private void OnRaceStateChanged(bool oldValue, bool newValue)
        {
            if (newValue)
            {
                // 比赛开始
                if (gameHUD != null)
                    gameHUD.ShowMessage("🏁 GO! GO! GO!");
            }
        }

        /// <summary>
        /// 通知所有客户端游戏结束
        /// </summary>
        [ClientRpc]
        private void NotifyGameOverClientRpc(ulong winnerVehicleId)
        {
            Debug.Log($"[RaceManager] 游戏结束通知! 获胜载具: {winnerVehicleId}");

            if (gameOverUI != null)
            {
                // 判断本地玩家是否获胜
                bool isWinner = false;
                foreach (var v in spawnedVehicles)
                {
                    if (v != null && v.NetworkObjectId == winnerVehicleId)
                    {
                        isWinner = v.IsDriver() || v.IsPassenger();
                        break;
                    }
                }

                gameOverUI.ShowGameOver(winnerVehicleId, isWinner);
            }
        }

        public override void OnNetworkDespawn()
        {
            IsRacing.OnValueChanged -= OnRaceStateChanged;
        }
    }
}
