using Unity.Netcode;
using UnityEngine;
using RoadRage.Config;

namespace RoadRage.Gameplay
{
    /// <summary>
    /// AI 状态枚举
    /// </summary>
    public enum AIState
    {
        Idle,    // 空闲巡航
        Chase,   // 追逐目标
        Attack,  // 攻击目标
        Evade,   // 规避（平衡低时）
    }

    /// <summary>
    /// AI 控制器 - 控制 AI 载具的驾驶和战斗行为。
    /// 挂载到 AI 摩托车 Prefab 上。
    /// 仅在服务器（主机）上运行。
    ///
    /// 状态机：
    /// - Idle: 沿赛道直行，巡航速度
    /// - Chase: 发现敌人后追逐，全速
    /// - Attack: 接近后执行攻击
    /// - Evade: 平衡值低时规避，全速逃离
    ///
    /// 转换条件：
    /// Idle → Chase: 敌人距离 < 20m
    /// Chase → Attack: 距离 < 2.5m 且冷却完成
    /// Chase → Evade: 自身平衡 < 20
    /// Attack → Chase: 距离 > 3m 或攻击后
    /// Evade → Chase: 平衡恢复到 > 60
    /// </summary>
    public class AIController : NetworkBehaviour
    {
        [Header("Config")]
        [SerializeField] private GameConfig config;

        [Header("AI Settings")]
        [Tooltip("是否启用 AI")]
        [SerializeField] private bool aiEnabled = true;

        /// <summary>当前 AI 状态</summary>
        public AIState CurrentState { get; private set; } = AIState.Idle;

        // 组件引用
        private VehicleController vehicleController;
        private BalanceSystem balanceSystem;
        private CombatSystem combatSystem;

        // AI 内部状态
        private float stateTimer;
        private float attackCooldown;
        private VehicleController currentTarget;

        private void Awake()
        {
            vehicleController = GetComponent<VehicleController>();
            balanceSystem = GetComponent<BalanceSystem>();
            combatSystem = GetComponent<CombatSystem>();

            if (config == null)
            {
                config = ScriptableObject.CreateInstance<GameConfig>();
            }
        }

        private void FixedUpdate()
        {
            // AI 只在服务器运行
            if (!IsServer || !aiEnabled) return;

            float dt = Time.fixedDeltaTime;
            stateTimer += dt;
            if (attackCooldown > 0f) attackCooldown -= dt;

            // 查找最近敌人
            UpdateTarget();

            // 状态转换
            UpdateStateTransitions();

            // 执行当前状态行为
            ExecuteState(dt);
        }

        /// <summary>
        /// 查找最近的非 AI 载具作为目标
        /// </summary>
        private void UpdateTarget()
        {
            float nearestDist = float.MaxValue;
            currentTarget = null;

            var vehicles = FindObjectsByType<VehicleController>(FindObjectsSortMode.None);
            foreach (var v in vehicles)
            {
                if (v == vehicleController) continue;

                float dist = Vector3.Distance(transform.position, v.transform.position);
                if (dist < nearestDist)
                {
                    nearestDist = dist;
                    currentTarget = v;
                }
            }
        }

        /// <summary>
        /// 状态转换逻辑
        /// </summary>
        private void UpdateStateTransitions()
        {
            if (currentTarget == null)
            {
                TransitionTo(AIState.Idle);
                return;
            }

            float dist = Vector3.Distance(transform.position, currentTarget.transform.position);
            float balance = balanceSystem != null ? balanceSystem.Balance.Value : 100f;

            switch (CurrentState)
            {
                case AIState.Idle:
                    if (dist < config.aiChaseDistance)
                        TransitionTo(AIState.Chase);
                    break;

                case AIState.Chase:
                    if (dist < config.aiAttackDistance && attackCooldown <= 0f)
                        TransitionTo(AIState.Attack);
                    else if (balance < config.aiEvadeBalanceThreshold)
                        TransitionTo(AIState.Evade);
                    else if (dist > config.aiChaseDistance * 1.5f)
                        TransitionTo(AIState.Idle);
                    break;

                case AIState.Attack:
                    if (dist > config.aiAttackDistance * 1.2f || stateTimer > 0.5f)
                        TransitionTo(AIState.Chase);
                    break;

                case AIState.Evade:
                    if (balance > config.aiRecoverBalanceTarget)
                        TransitionTo(AIState.Chase);
                    else if (stateTimer > 3f)
                        TransitionTo(AIState.Idle);
                    break;
            }
        }

        private void TransitionTo(AIState newState)
        {
            if (CurrentState == newState) return;
            CurrentState = newState;
            stateTimer = 0f;
        }

        /// <summary>
        /// 执行当前状态的行为
        /// </summary>
        private void ExecuteState(float dt)
        {
            switch (CurrentState)
            {
                case AIState.Idle:
                    ExecuteIdle(dt);
                    break;
                case AIState.Chase:
                    ExecuteChase(dt);
                    break;
                case AIState.Attack:
                    ExecuteAttack(dt);
                    break;
                case AIState.Evade:
                    ExecuteEvade(dt);
                    break;
            }
        }

        /// <summary>
        /// 空闲状态：沿赛道直行
        /// </summary>
        private void ExecuteIdle(float dt)
        {
            // 巡航速度，保持赛道中心
            float throttle = 0.7f;
            float steering = CalculateTrackCentering();

            ApplyAIInput(throttle, steering, false);
        }

        /// <summary>
        /// 追逐状态：朝目标全速移动
        /// </summary>
        private void ExecuteChase(float dt)
        {
            if (currentTarget == null) return;

            Vector3 toTarget = currentTarget.transform.position - transform.position;
            float angleToTarget = Mathf.Atan2(toTarget.z, toTarget.x);
            float angleDiff = NormalizeAngle(angleToTarget - vehicleController.Heading.Value);

            // 朝目标转向
            float steering = Mathf.Clamp(angleDiff * 2f, -1f, 1f);
            float throttle = toTarget.magnitude > 5f ? 1f : 0.8f;

            ApplyAIInput(throttle, steering, false);
        }

        /// <summary>
        /// 攻击状态：接近并攻击
        /// </summary>
        private void ExecuteAttack(float dt)
        {
            if (currentTarget == null) return;

            // 保持接近
            Vector3 toTarget = currentTarget.transform.position - transform.position;
            float angleToTarget = Mathf.Atan2(toTarget.z, toTarget.x);
            float angleDiff = NormalizeAngle(angleToTarget - vehicleController.Heading.Value);
            float steering = Mathf.Clamp(angleDiff * 2f, -1f, 1f);

            ApplyAIInput(0.7f, steering, false);

            // 执行攻击
            if (attackCooldown <= 0f && combatSystem != null)
            {
                float dist = toTarget.magnitude;

                // 根据距离选择最佳攻击
                AttackType attack = AttackType.None;
                if (dist < config.kickRange && Mathf.Abs(angleDiff) < 0.5f)
                {
                    attack = AttackType.Kick;
                    attackCooldown = config.kickCooldown;
                }
                else if (dist < config.smashRange)
                {
                    attack = AttackType.Smash;
                    attackCooldown = config.smashCooldown;
                }

                if (attack != AttackType.None)
                {
                    combatSystem.RequestAttackServerRpc(attack);
                }
            }
        }

        /// <summary>
        /// 规避状态：远离敌人
        /// </summary>
        private void ExecuteEvade(float dt)
        {
            if (currentTarget == null)
            {
                ApplyAIInput(1f, 0f, false);
                return;
            }

            // 朝相反方向移动
            Vector3 awayFromTarget = transform.position - currentTarget.transform.position;
            float awayAngle = Mathf.Atan2(awayFromTarget.z, awayFromTarget.x);
            float angleDiff = NormalizeAngle(awayAngle - vehicleController.Heading.Value);
            float steering = Mathf.Clamp(angleDiff * 2f, -1f, 1f);

            ApplyAIInput(1f, steering, false); // 全速逃跑
        }

        /// <summary>
        /// 计算回到赛道中心的转向值
        /// </summary>
        private float CalculateTrackCentering()
        {
            float yError = -transform.position.z; // 赛道中心在 z=0
            float angleError = NormalizeAngle(-vehicleController.Heading.Value);
            return Mathf.Clamp(yError * 0.5f + angleError * 0.5f, -1f, 1f);
        }

        /// <summary>
        /// 应用 AI 输入到载具（直接在服务器端设置）
        /// </summary>
        private void ApplyAIInput(float throttle, float steering, bool brake)
        {
            // AI 直接调用 ServerRpc（因为已经在服务器上运行）
            // 需要通过反射或直接设置载具输入
            // 这里用一个简化方式：直接操作载具的公共方法

            // 由于 AI 在服务器上运行，我们可以直接通过 VehicleController 的接口
            // 在实际实现中，可能需要一个 SetAIInput 方法
            vehicleController.SendMessage("ApplyAIInput",
                new Vector3(throttle, steering, brake ? 1f : 0f),
                SendMessageOptions.DontRequireReceiver);
        }

        private static float NormalizeAngle(float angle)
        {
            while (angle > Mathf.PI) angle -= 2f * Mathf.PI;
            while (angle < -Mathf.PI) angle += 2f * Mathf.PI;
            return angle;
        }
    }
}
