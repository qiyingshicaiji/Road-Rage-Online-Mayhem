using UnityEngine;

namespace RoadRage.Config
{
    /// <summary>
    /// 游戏配置 - 定义所有游戏参数常量。
    /// 作为 ScriptableObject 使用，可在 Unity Inspector 中调整。
    ///
    /// 创建方法：Unity 菜单 → Assets → Create → RoadRage → GameConfig
    /// </summary>
    [CreateAssetMenu(fileName = "GameConfig", menuName = "RoadRage/GameConfig")]
    public class GameConfig : ScriptableObject
    {
        [Header("=== 载具物理 / Vehicle Physics ===")]

        [Tooltip("最大速度 (m/s)，约 108 km/h")]
        public float maxSpeed = 30f;

        [Tooltip("加速度 (m/s²)")]
        public float acceleration = 15f;

        [Tooltip("刹车减速度 (m/s²)")]
        public float brakeDeceleration = 25f;

        [Tooltip("摩擦力减速度 (m/s²)")]
        public float friction = 3f;

        [Tooltip("转向灵敏度 (rad/s)")]
        public float steeringSensitivity = 2.5f;

        [Header("=== 平衡系统 / Balance System ===")]

        [Tooltip("最大平衡值")]
        public float maxBalance = 100f;

        [Tooltip("平衡恢复速度 (点/秒)")]
        public float balanceRecoveryRate = 5f;

        [Tooltip("失控持续时间 (秒)")]
        public float outOfControlDuration = 1f;

        [Header("=== 踢击 / Kick ===")]

        [Tooltip("踢击距离 (米)")]
        public float kickRange = 1.5f;

        [Tooltip("踢击角度 (度)")]
        public float kickAngle = 30f;

        [Tooltip("踢击对目标的平衡伤害")]
        public float kickBalanceDamage = 15f;

        [Tooltip("踢击对自身的平衡消耗")]
        public float kickSelfCost = 10f;

        [Tooltip("踢击造成的方向偏移 (弧度)")]
        public float kickTorque = 0.3f;

        [Tooltip("踢击造成的速度损失 (m/s)")]
        public float kickSpeedLoss = 2f;

        [Tooltip("踢击冷却时间 (秒)")]
        public float kickCooldown = 0.5f;

        [Header("=== 抓刹车 / Brake Grab ===")]

        [Tooltip("抓刹车距离 (米)")]
        public float brakeGrabRange = 1.0f;

        [Tooltip("抓刹车角度 (度)")]
        public float brakeGrabAngle = 45f;

        [Tooltip("抓刹车对目标的平衡伤害")]
        public float brakeGrabBalanceDamage = 10f;

        [Tooltip("抓刹车对自身的平衡消耗")]
        public float brakeGrabSelfCost = 15f;

        [Tooltip("抓刹车造成的方向偏移")]
        public float brakeGrabTorque = 0.1f;

        [Tooltip("抓刹车造成的速度损失")]
        public float brakeGrabSpeedLoss = 8f;

        [Tooltip("抓刹车冷却时间 (秒)")]
        public float brakeGrabCooldown = 1.0f;

        [Header("=== 重击 / Smash ===")]

        [Tooltip("重击距离 (米)")]
        public float smashRange = 2.0f;

        [Tooltip("重击角度 (度)")]
        public float smashAngle = 30f;

        [Tooltip("重击对目标的平衡伤害")]
        public float smashBalanceDamage = 25f;

        [Tooltip("重击对自身的平衡消耗")]
        public float smashSelfCost = 20f;

        [Tooltip("重击造成的方向偏移")]
        public float smashTorque = 0.5f;

        [Tooltip("重击造成的速度损失")]
        public float smashSpeedLoss = 5f;

        [Tooltip("重击冷却时间 (秒)")]
        public float smashCooldown = 1.5f;

        [Header("=== 赛道 / Track ===")]

        [Tooltip("赛道长度 (米)")]
        public float trackLength = 2000f;

        [Tooltip("赛道宽度 (米)")]
        public float trackWidth = 12f;

        [Tooltip("车道宽度 (米)")]
        public float laneWidth = 3f;

        [Tooltip("圈数")]
        public int numLaps = 3;

        [Header("=== AI ===")]

        [Tooltip("AI 追逐距离阈值 (米)")]
        public float aiChaseDistance = 20f;

        [Tooltip("AI 攻击距离阈值 (米)")]
        public float aiAttackDistance = 2.5f;

        [Tooltip("AI 撤退平衡阈值")]
        public float aiEvadeBalanceThreshold = 20f;

        [Tooltip("AI 恢复平衡目标")]
        public float aiRecoverBalanceTarget = 60f;

        [Header("=== 网络 / Network ===")]

        [Tooltip("服务器 tick 率 (次/秒)")]
        public int tickRate = 20;

        [Tooltip("UGS 免费套餐最大 CCU")]
        public int maxCCU = 20;
    }
}
