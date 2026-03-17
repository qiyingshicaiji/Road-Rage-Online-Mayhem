using Unity.Netcode;
using UnityEngine;
using RoadRage.Config;

namespace RoadRage.Gameplay
{
    /// <summary>
    /// 平衡系统 - 管理载具平衡值（设计文档核心机制）。
    /// 挂载到摩托车 Prefab 上（与 VehicleController 同一 GameObject）。
    ///
    /// 平衡机制：
    /// - 范围: 0-100
    /// - 攻击消耗 10-20 点平衡
    /// - 低平衡 = 转向灵敏度降低，更容易失控
    /// - 平衡归零 → 触发失控状态（随机偏转，减速，持续 1 秒）
    /// - 稳定行驶时被动恢复 5 点/秒
    /// </summary>
    public class BalanceSystem : NetworkBehaviour
    {
        [Header("Config")]
        [SerializeField] private GameConfig config;

        /// <summary>当前平衡值 (0-100)</summary>
        public NetworkVariable<float> Balance =
            new NetworkVariable<float>(100f,
                NetworkVariableReadPermission.Everyone,
                NetworkVariableWritePermission.Server);

        /// <summary>是否处于失控状态</summary>
        public NetworkVariable<bool> IsOutOfControl =
            new NetworkVariable<bool>(false,
                NetworkVariableReadPermission.Everyone,
                NetworkVariableWritePermission.Server);

        // 失控计时器（服务器端）
        private float outOfControlTimer;

        private void Awake()
        {
            if (config == null)
            {
                config = ScriptableObject.CreateInstance<GameConfig>();
            }
        }

        public override void OnNetworkSpawn()
        {
            if (IsServer)
            {
                Balance.Value = config.maxBalance;
                IsOutOfControl.Value = false;
                outOfControlTimer = 0f;
            }
        }

        private void FixedUpdate()
        {
            if (!IsServer) return;

            float dt = Time.fixedDeltaTime;

            // 失控状态计时
            if (IsOutOfControl.Value)
            {
                outOfControlTimer -= dt;
                if (outOfControlTimer <= 0f)
                {
                    IsOutOfControl.Value = false;
                    Balance.Value = 10f; // 失控结束后恢复少量平衡
                    Debug.Log($"[BalanceSystem] 载具 {NetworkObjectId} 恢复控制");
                }
                return; // 失控期间不恢复
            }

            // 被动恢复（5 点/秒）
            if (Balance.Value < config.maxBalance)
            {
                Balance.Value = Mathf.Min(config.maxBalance,
                    Balance.Value + config.balanceRecoveryRate * dt);
            }
        }

        /// <summary>
        /// 消耗平衡值（服务器调用）
        /// </summary>
        /// <param name="amount">消耗量</param>
        public void ConsumeBalance(float amount)
        {
            if (!IsServer) return;

            Balance.Value -= amount;

            if (Balance.Value <= 0f)
            {
                Balance.Value = 0f;
                TriggerOutOfControl();
            }
        }

        /// <summary>
        /// 触发失控状态
        /// </summary>
        private void TriggerOutOfControl()
        {
            IsOutOfControl.Value = true;
            outOfControlTimer = config.outOfControlDuration;

            Debug.Log($"[BalanceSystem] 载具 {NetworkObjectId} 失控！" +
                $"持续 {config.outOfControlDuration} 秒");

            // 通知所有客户端播放失控特效
            TriggerOutOfControlClientRpc();
        }

        /// <summary>
        /// 客户端播放失控视觉/音效
        /// </summary>
        [ClientRpc]
        private void TriggerOutOfControlClientRpc()
        {
            Debug.Log($"[BalanceSystem] 客户端：载具 {NetworkObjectId} 失控动画触发");
            // TODO: 在此处触发失控动画、粒子效果、屏幕抖动等
        }

        /// <summary>
        /// 获取平衡因子 (0-1)，用于影响转向灵敏度
        /// </summary>
        public float GetBalanceFactor()
        {
            return Balance.Value / config.maxBalance;
        }
    }
}
