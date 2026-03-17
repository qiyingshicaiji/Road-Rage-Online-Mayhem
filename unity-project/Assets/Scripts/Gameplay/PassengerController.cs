using Unity.Netcode;
using UnityEngine;
using RoadRage.Config;

namespace RoadRage.Gameplay
{
    /// <summary>
    /// 乘客控制器 - 处理乘客的攻击输入和目标显示。
    /// 挂载到摩托车 Prefab 上（与 CombatSystem 配合使用）。
    ///
    /// 乘客职责：
    /// - 选择攻击类型（1=踢击, 2=抓刹车, 3=重击）
    /// - 显示攻击范围指示器
    /// - 显示冷却时间 UI
    /// - 目标锁定提示
    ///
    /// 注意：实际攻击逻辑在 CombatSystem 中由服务器处理。
    /// </summary>
    public class PassengerController : NetworkBehaviour
    {
        [Header("Config")]
        [SerializeField] private GameConfig config;

        [Header("UI References")]
        [Tooltip("攻击范围指示器（可选）")]
        [SerializeField] private GameObject attackRangeIndicator;

        [Tooltip("目标锁定标记（可选）")]
        [SerializeField] private GameObject targetLockIndicator;

        /// <summary>当前选中的攻击类型</summary>
        public AttackType SelectedAttack { get; private set; } = AttackType.None;

        /// <summary>当前锁定的目标</summary>
        public VehicleController LockedTarget { get; private set; }

        /// <summary>攻击冷却剩余时间</summary>
        public float CooldownRemaining { get; private set; }

        private VehicleController myVehicle;
        private CombatSystem combatSystem;

        private void Awake()
        {
            myVehicle = GetComponent<VehicleController>();
            combatSystem = GetComponent<CombatSystem>();

            if (config == null)
            {
                config = ScriptableObject.CreateInstance<GameConfig>();
            }
        }

        private void Update()
        {
            // 冷却计时
            if (CooldownRemaining > 0f)
            {
                CooldownRemaining -= Time.deltaTime;
            }

            // 只有本地乘客操作
            if (!IsOwner || myVehicle == null || !myVehicle.IsPassenger()) return;

            UpdateTargetLock();
            UpdateAttackSelection();
            UpdateIndicators();
        }

        /// <summary>
        /// 自动锁定最近的敌方载具
        /// </summary>
        private void UpdateTargetLock()
        {
            float searchRange = config.smashRange * 2f; // 搜索范围大于最大攻击范围
            VehicleController nearest = null;
            float nearestDist = float.MaxValue;

            var vehicles = FindObjectsByType<VehicleController>(FindObjectsSortMode.None);
            foreach (var v in vehicles)
            {
                if (v == myVehicle) continue;

                float dist = Vector3.Distance(transform.position, v.transform.position);
                if (dist < searchRange && dist < nearestDist)
                {
                    nearestDist = dist;
                    nearest = v;
                }
            }

            LockedTarget = nearest;
        }

        /// <summary>
        /// 监听攻击选择输入（用于 UI 高亮，实际攻击在 CombatSystem 处理）
        /// </summary>
        private void UpdateAttackSelection()
        {
            if (Input.GetKeyDown(KeyCode.Alpha1) || Input.GetKeyDown(KeyCode.Keypad1))
            {
                SelectedAttack = AttackType.Kick;
                CooldownRemaining = config.kickCooldown;
            }
            else if (Input.GetKeyDown(KeyCode.Alpha2) || Input.GetKeyDown(KeyCode.Keypad2))
            {
                SelectedAttack = AttackType.BrakeGrab;
                CooldownRemaining = config.brakeGrabCooldown;
            }
            else if (Input.GetKeyDown(KeyCode.Alpha3) || Input.GetKeyDown(KeyCode.Keypad3))
            {
                SelectedAttack = AttackType.Smash;
                CooldownRemaining = config.smashCooldown;
            }
        }

        /// <summary>
        /// 更新视觉指示器
        /// </summary>
        private void UpdateIndicators()
        {
            // 攻击范围指示器
            if (attackRangeIndicator != null)
            {
                bool showRange = SelectedAttack != AttackType.None && CooldownRemaining <= 0f;
                attackRangeIndicator.SetActive(showRange);

                if (showRange)
                {
                    float range = GetSelectedAttackRange();
                    attackRangeIndicator.transform.localScale =
                        Vector3.one * range * 2f;
                }
            }

            // 目标锁定标记
            if (targetLockIndicator != null)
            {
                if (LockedTarget != null)
                {
                    targetLockIndicator.SetActive(true);
                    targetLockIndicator.transform.position =
                        LockedTarget.transform.position + Vector3.up * 2f;
                }
                else
                {
                    targetLockIndicator.SetActive(false);
                }
            }
        }

        private float GetSelectedAttackRange() => SelectedAttack switch
        {
            AttackType.Kick => config.kickRange,
            AttackType.BrakeGrab => config.brakeGrabRange,
            AttackType.Smash => config.smashRange,
            _ => 0f,
        };

        /// <summary>
        /// 获取攻击名称（用于 UI 显示）
        /// </summary>
        public static string GetAttackName(AttackType type) => type switch
        {
            AttackType.Kick => "踢击 / Kick",
            AttackType.BrakeGrab => "抓刹车 / Brake Grab",
            AttackType.Smash => "重击 / Smash",
            _ => "",
        };
    }
}
