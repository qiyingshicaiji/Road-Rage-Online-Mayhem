using Unity.Netcode;
using UnityEngine;
using RoadRage.Config;

namespace RoadRage.Gameplay
{
    /// <summary>
    /// 攻击类型枚举
    /// </summary>
    public enum AttackType
    {
        None = 0,
        Kick = 1,       // 踢击
        BrakeGrab = 2,  // 抓刹车
        Smash = 3,      // 重击
    }

    /// <summary>
    /// 战斗系统 - 处理攻击检测和伤害结算（服务器权威）。
    /// 挂载到摩托车 Prefab 上。
    ///
    /// 三种攻击（设计文档规格）：
    /// 1. 踢击 (Kick): 距离 <1.5m, 角度 <30°, 相对速度 >5m/s
    /// 2. 抓刹车 (Brake Grab): 距离 <1.0m, 目标侧后方位置
    /// 3. 重击 (Smash): 距离 <2.0m, 前方 60° 锥形范围
    ///
    /// 所有攻击在服务器计算命中判定，客户端只发送攻击请求。
    /// </summary>
    public class CombatSystem : NetworkBehaviour
    {
        [Header("Config")]
        [SerializeField] private GameConfig config;

        // 冷却计时器（服务器端）
        private float attackCooldownTimer;

        // 组件引用
        private VehicleController vehicleController;
        private BalanceSystem balanceSystem;

        private void Awake()
        {
            vehicleController = GetComponent<VehicleController>();
            balanceSystem = GetComponent<BalanceSystem>();

            if (config == null)
            {
                config = ScriptableObject.CreateInstance<GameConfig>();
            }
        }

        private void Update()
        {
            if (IsServer)
            {
                // 服务器端冷却计时
                if (attackCooldownTimer > 0f)
                    attackCooldownTimer -= Time.deltaTime;
            }

            // 乘客输入（只有本地乘客可操作）
            if (!IsOwner || vehicleController == null) return;
            if (!vehicleController.IsPassenger()) return;

            HandlePassengerInput();
        }

        private void HandlePassengerInput()
        {
            // 1 键 = 踢击
            if (Input.GetKeyDown(KeyCode.Alpha1) || Input.GetKeyDown(KeyCode.Keypad1))
            {
                RequestAttackServerRpc(AttackType.Kick);
            }
            // 2 键 = 抓刹车
            else if (Input.GetKeyDown(KeyCode.Alpha2) || Input.GetKeyDown(KeyCode.Keypad2))
            {
                RequestAttackServerRpc(AttackType.BrakeGrab);
            }
            // 3 键 = 重击
            else if (Input.GetKeyDown(KeyCode.Alpha3) || Input.GetKeyDown(KeyCode.Keypad3))
            {
                RequestAttackServerRpc(AttackType.Smash);
            }
        }

        /// <summary>
        /// 乘客请求攻击 → 服务器处理
        /// </summary>
        [ServerRpc(RequireOwnership = false)]
        public void RequestAttackServerRpc(AttackType type, ServerRpcParams rpcParams = default)
        {
            if (type == AttackType.None) return;
            if (attackCooldownTimer > 0f) return; // 冷却中
            if (balanceSystem != null && balanceSystem.IsOutOfControl.Value) return;

            // 获取攻击参数
            float range = GetAttackRange(type);
            float angle = GetAttackAngle(type);
            float selfCost = GetSelfBalanceCost(type);
            float targetDamage = GetTargetBalanceDamage(type);
            float torque = GetAttackTorque(type);
            float speedLoss = GetAttackSpeedLoss(type);
            float cooldown = GetAttackCooldown(type);

            // 自身消耗平衡
            if (balanceSystem != null)
            {
                balanceSystem.ConsumeBalance(selfCost);
            }

            // 设置冷却
            attackCooldownTimer = cooldown;

            // 查找最近的敌方载具
            VehicleController target = FindNearestEnemy(range, angle, type);
            if (target == null)
            {
                // 未命中 - 通知客户端
                NotifyAttackResultClientRpc(type, false, 0);
                return;
            }

            // 命中! 对目标施加效果
            var targetBalance = target.GetComponent<BalanceSystem>();
            if (targetBalance != null)
            {
                targetBalance.ConsumeBalance(targetDamage);
            }
            target.ApplyDisturbance(torque, speedLoss);

            // 通知所有客户端攻击结果
            NotifyAttackResultClientRpc(type, true, target.NetworkObjectId);

            Debug.Log($"[CombatSystem] 攻击命中! 类型: {type}, " +
                $"目标: {target.NetworkObjectId}, 伤害: {targetDamage}");
        }

        /// <summary>
        /// 查找在攻击范围和角度内的最近敌方载具
        /// </summary>
        private VehicleController FindNearestEnemy(float range, float angleThreshold,
            AttackType type)
        {
            VehicleController nearest = null;
            float nearestDist = float.MaxValue;

            // 遍历所有载具
            var vehicles = FindObjectsByType<VehicleController>(FindObjectsSortMode.None);
            foreach (var v in vehicles)
            {
                if (v == vehicleController) continue; // 跳过自身

                Vector3 toTarget = v.transform.position - transform.position;
                float dist = toTarget.magnitude;

                // 距离检测
                if (dist > range) continue;

                // 角度检测
                float angleToTarget = Mathf.Atan2(toTarget.z, toTarget.x);
                float angleDiff = Mathf.Abs(NormalizeAngle(
                    angleToTarget - vehicleController.Heading.Value));

                // 特殊检测：抓刹车需要目标在侧后方
                if (type == AttackType.BrakeGrab)
                {
                    float relativeAngle = NormalizeAngle(
                        angleToTarget - vehicleController.Heading.Value);
                    if (Mathf.Abs(relativeAngle) < 1.0f || Mathf.Abs(relativeAngle) > 2.6f)
                        continue; // 不在侧后方范围
                }
                else
                {
                    if (angleDiff > angleThreshold * Mathf.Deg2Rad)
                        continue;
                }

                if (dist < nearestDist)
                {
                    nearestDist = dist;
                    nearest = v;
                }
            }

            return nearest;
        }

        /// <summary>
        /// 通知客户端攻击结果（用于播放动画和音效）
        /// </summary>
        [ClientRpc]
        private void NotifyAttackResultClientRpc(AttackType type, bool hit,
            ulong targetNetworkObjectId)
        {
            string resultText = hit ? "命中!" : "未命中";
            string typeName = type switch
            {
                AttackType.Kick => "踢击",
                AttackType.BrakeGrab => "抓刹车",
                AttackType.Smash => "重击",
                _ => "未知"
            };

            Debug.Log($"[CombatSystem] {typeName} - {resultText}");

            // TODO: 播放攻击动画和音效
            // TODO: 如果命中，在目标位置播放受击特效
        }

        // === 攻击参数查询 ===

        private float GetAttackRange(AttackType type) => type switch
        {
            AttackType.Kick => config.kickRange,
            AttackType.BrakeGrab => config.brakeGrabRange,
            AttackType.Smash => config.smashRange,
            _ => 0f,
        };

        private float GetAttackAngle(AttackType type) => type switch
        {
            AttackType.Kick => config.kickAngle,
            AttackType.BrakeGrab => config.brakeGrabAngle,
            AttackType.Smash => config.smashAngle,
            _ => 0f,
        };

        private float GetSelfBalanceCost(AttackType type) => type switch
        {
            AttackType.Kick => config.kickSelfCost,
            AttackType.BrakeGrab => config.brakeGrabSelfCost,
            AttackType.Smash => config.smashSelfCost,
            _ => 0f,
        };

        private float GetTargetBalanceDamage(AttackType type) => type switch
        {
            AttackType.Kick => config.kickBalanceDamage,
            AttackType.BrakeGrab => config.brakeGrabBalanceDamage,
            AttackType.Smash => config.smashBalanceDamage,
            _ => 0f,
        };

        private float GetAttackTorque(AttackType type) => type switch
        {
            AttackType.Kick => config.kickTorque,
            AttackType.BrakeGrab => config.brakeGrabTorque,
            AttackType.Smash => config.smashTorque,
            _ => 0f,
        };

        private float GetAttackSpeedLoss(AttackType type) => type switch
        {
            AttackType.Kick => config.kickSpeedLoss,
            AttackType.BrakeGrab => config.brakeGrabSpeedLoss,
            AttackType.Smash => config.smashSpeedLoss,
            _ => 0f,
        };

        private float GetAttackCooldown(AttackType type) => type switch
        {
            AttackType.Kick => config.kickCooldown,
            AttackType.BrakeGrab => config.brakeGrabCooldown,
            AttackType.Smash => config.smashCooldown,
            _ => 0f,
        };

        private static float NormalizeAngle(float angle)
        {
            while (angle > Mathf.PI) angle -= 2f * Mathf.PI;
            while (angle < -Mathf.PI) angle += 2f * Mathf.PI;
            return angle;
        }
    }
}
