using Unity.Netcode;
using UnityEngine;
using RoadRage.Config;

namespace RoadRage.Gameplay
{
    /// <summary>
    /// 载具控制器 - 服务器权威物理模拟 + 客户端预测。
    /// 挂载到摩托车 Prefab 上（需要 NetworkObject、Rigidbody 组件）。
    ///
    /// 物理参数（来自设计文档）：
    /// - 最大速度: 30 m/s (≈108 km/h)
    /// - 加速度: 15 m/s²
    /// - 刹车减速: 25 m/s²
    /// - 摩擦力: 3 m/s²
    /// - 转向灵敏度: 2.5 rad/s（受平衡值影响）
    ///
    /// 网络同步：
    /// - 位置/旋转/速度通过 NetworkTransform 同步
    /// - 输入通过 ServerRpc 发送到服务器
    /// - 服务器执行权威物理计算
    /// </summary>
    public class VehicleController : NetworkBehaviour
    {
        [Header("Config")]
        [SerializeField] private GameConfig config;

        [Header("References")]
        [SerializeField] private Rigidbody rb;

        // === 网络同步变量 ===

        /// <summary>当前速度 (m/s)</summary>
        public NetworkVariable<float> Speed = new NetworkVariable<float>(0f);

        /// <summary>当前朝向角度 (弧度)</summary>
        public NetworkVariable<float> Heading = new NetworkVariable<float>(0f);

        /// <summary>驾驶员的 Client ID</summary>
        public NetworkVariable<ulong> DriverClientId =
            new NetworkVariable<ulong>(0,
                NetworkVariableReadPermission.Everyone,
                NetworkVariableWritePermission.Server);

        /// <summary>乘客的 Client ID</summary>
        public NetworkVariable<ulong> PassengerClientId =
            new NetworkVariable<ulong>(0,
                NetworkVariableReadPermission.Everyone,
                NetworkVariableWritePermission.Server);

        /// <summary>行驶总距离 (米)</summary>
        public NetworkVariable<float> DistanceTraveled = new NetworkVariable<float>(0f);

        // 本地输入缓存
        private float inputThrottle;
        private float inputSteering;
        private bool inputBrake;

        // 平衡系统引用
        private BalanceSystem balanceSystem;

        private void Awake()
        {
            if (rb == null) rb = GetComponent<Rigidbody>();
            balanceSystem = GetComponent<BalanceSystem>();

            // 使用默认配置（如果未赋值）
            if (config == null)
            {
                config = ScriptableObject.CreateInstance<GameConfig>();
            }
        }

        public override void OnNetworkSpawn()
        {
            if (IsServer)
            {
                // 初始化服务器状态
                Speed.Value = 0f;
                DistanceTraveled.Value = 0f;
            }
        }

        private void Update()
        {
            // 只有驾驶员可以输入
            if (!IsOwner || !IsDriver()) return;

            // 读取本地输入
            GatherInput();

            // 发送输入到服务器
            SendDriverInputServerRpc(inputThrottle, inputSteering, inputBrake);
        }

        private void FixedUpdate()
        {
            // 服务器权威物理更新
            if (!IsServer) return;

            float dt = Time.fixedDeltaTime;
            float speed = Speed.Value;
            float heading = Heading.Value;

            // 平衡系统影响
            float balanceFactor = 1f;
            if (balanceSystem != null)
            {
                balanceFactor = balanceSystem.Balance.Value / config.maxBalance;

                // 失控状态：随机偏转 + 减速
                if (balanceSystem.IsOutOfControl.Value)
                {
                    speed *= 0.95f;
                    heading += Random.Range(-1f, 1f) * 2f * dt;
                    ApplyMovement(speed, heading, dt);
                    return;
                }
            }

            // 对存储的输入值操作（由 ServerRpc 设置）
            float throttle = serverThrottle;
            float steering = serverSteering;
            bool brake = serverBrake;

            // 油门加速
            if (throttle > 0f && !brake)
            {
                speed += config.acceleration * throttle * dt;
            }

            // 刹车
            if (brake)
            {
                speed -= config.brakeDeceleration * dt;
                if (speed < 0f) speed = 0f;
            }

            // 摩擦力
            if (speed > 0f)
            {
                speed -= config.friction * dt;
                if (speed < 0f) speed = 0f;
            }

            // 限速
            speed = Mathf.Clamp(speed, 0f, config.maxSpeed);

            // 转向（只在有速度时有效，受平衡值影响）
            if (speed > 0.5f)
            {
                float effectiveSteering = config.steeringSensitivity * balanceFactor;
                heading += steering * effectiveSteering * dt;
                heading = NormalizeAngle(heading);
            }

            ApplyMovement(speed, heading, dt);
        }

        private void ApplyMovement(float speed, float heading, float dt)
        {
            Speed.Value = speed;
            Heading.Value = heading;

            // 计算移动
            Vector3 direction = new Vector3(Mathf.Cos(heading), 0f, Mathf.Sin(heading));
            Vector3 newPos = transform.position + direction * speed * dt;

            // 赛道边界检测
            float halfWidth = config.trackWidth / 2f;
            newPos.z = Mathf.Clamp(newPos.z, -halfWidth, halfWidth);

            // 应用位置和旋转
            if (rb != null)
            {
                rb.MovePosition(newPos);
                rb.MoveRotation(Quaternion.Euler(0f, -heading * Mathf.Rad2Deg, 0f));
            }
            else
            {
                transform.position = newPos;
                transform.rotation = Quaternion.Euler(0f, -heading * Mathf.Rad2Deg, 0f);
            }

            // 累计距离
            DistanceTraveled.Value += speed * dt;
        }

        // === 输入处理 ===

        private void GatherInput()
        {
            // 油门: W / ↑
            inputThrottle = 0f;
            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow))
                inputThrottle = 1f;

            // 转向: A/D / ← →
            inputSteering = 0f;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow))
                inputSteering = -1f;
            else if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow))
                inputSteering = 1f;

            // 刹车: S / ↓
            inputBrake = Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow);
        }

        // 服务器端存储的输入值
        private float serverThrottle;
        private float serverSteering;
        private bool serverBrake;

        /// <summary>
        /// 驾驶员输入 → 服务器
        /// </summary>
        [ServerRpc]
        private void SendDriverInputServerRpc(float throttle, float steering, bool brake)
        {
            serverThrottle = throttle;
            serverSteering = steering;
            serverBrake = brake;
        }

        // === 外部接口 ===

        /// <summary>
        /// 施加干扰力（来自战斗系统）
        /// </summary>
        public void ApplyDisturbance(float torque, float speedLoss)
        {
            if (!IsServer) return;
            Heading.Value += torque;
            Speed.Value = Mathf.Max(0f, Speed.Value - speedLoss);
        }

        /// <summary>
        /// 判断本地玩家是否是此载具的驾驶员
        /// </summary>
        public bool IsDriver()
        {
            return DriverClientId.Value == NetworkManager.Singleton.LocalClientId;
        }

        /// <summary>
        /// 判断本地玩家是否是此载具的乘客
        /// </summary>
        public bool IsPassenger()
        {
            return PassengerClientId.Value == NetworkManager.Singleton.LocalClientId;
        }

        /// <summary>
        /// 获取当前速度 (km/h)
        /// </summary>
        public float GetSpeedKmh()
        {
            return Speed.Value * 3.6f;
        }

        /// <summary>
        /// 角度归一化到 [-π, π]
        /// </summary>
        private static float NormalizeAngle(float angle)
        {
            while (angle > Mathf.PI) angle -= 2f * Mathf.PI;
            while (angle < -Mathf.PI) angle += 2f * Mathf.PI;
            return angle;
        }
    }
}
