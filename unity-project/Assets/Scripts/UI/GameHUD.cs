using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Unity.Netcode;
using RoadRage.Gameplay;

namespace RoadRage.UI
{
    /// <summary>
    /// 游戏 HUD - 游戏中的信息显示。
    /// 挂载到 Game 场景的 Canvas 上。
    ///
    /// UI 结构（在 Unity Editor 中创建）：
    /// - Canvas (Screen Space - Overlay)
    ///   ├── TopLeftPanel
    ///   │   ├── SpeedText ("108 km/h")
    ///   │   ├── BalanceBar (Slider)
    ///   │   ├── BalanceText ("75")
    ///   │   └── DistanceText ("1200m")
    ///   ├── TopRightPanel
    ///   │   ├── RoleText ("🏍️ Driver")
    ///   │   └── LapText ("Lap 2/3")
    ///   ├── CenterPanel
    ///   │   └── MessageText (比赛开始! / 被攻击! 等)
    ///   ├── BottomPanel
    ///   │   ├── AttackSlot1 ("1 踢击")
    ///   │   ├── AttackSlot2 ("2 抓刹车")
    ///   │   └── AttackSlot3 ("3 重击")
    ///   └── MinimapPanel
    ///       └── MinimapImage
    /// </summary>
    public class GameHUD : MonoBehaviour
    {
        [Header("Speed & Distance")]
        [SerializeField] private TextMeshProUGUI speedText;
        [SerializeField] private TextMeshProUGUI distanceText;

        [Header("Balance")]
        [SerializeField] private Slider balanceSlider;
        [SerializeField] private Image balanceFill;
        [SerializeField] private TextMeshProUGUI balanceText;

        [Header("Info")]
        [SerializeField] private TextMeshProUGUI roleText;
        [SerializeField] private TextMeshProUGUI lapText;

        [Header("Messages")]
        [SerializeField] private TextMeshProUGUI messageText;
        [SerializeField] private float messageDuration = 2f;

        [Header("Attack Slots (Passenger)")]
        [SerializeField] private GameObject attackPanel;
        [SerializeField] private TextMeshProUGUI attack1Text;
        [SerializeField] private TextMeshProUGUI attack2Text;
        [SerializeField] private TextMeshProUGUI attack3Text;
        [SerializeField] private Image attack1CooldownFill;
        [SerializeField] private Image attack2CooldownFill;
        [SerializeField] private Image attack3CooldownFill;

        [Header("Track Config")]
        [SerializeField] private float trackLength = 2000f;
        [SerializeField] private int totalLaps = 3;

        // 引用的载具（本地玩家的载具）
        private VehicleController myVehicle;
        private BalanceSystem myBalance;
        private PassengerController myPassenger;
        private float messageTimer;
        private bool isPassenger;

        private void Start()
        {
            if (messageText != null)
                messageText.text = "";

            // 延迟查找本地载具（等待网络生成完成）
            InvokeRepeating(nameof(TryFindMyVehicle), 0.5f, 1f);
        }

        private void TryFindMyVehicle()
        {
            if (myVehicle != null) return;

            var vehicles = FindObjectsByType<VehicleController>(FindObjectsSortMode.None);
            foreach (var v in vehicles)
            {
                if (v.IsDriver() || v.IsPassenger())
                {
                    myVehicle = v;
                    myBalance = v.GetComponent<BalanceSystem>();
                    myPassenger = v.GetComponent<PassengerController>();
                    isPassenger = v.IsPassenger();

                    // 显示角色
                    if (roleText != null)
                    {
                        roleText.text = isPassenger ? "👊 乘客 / Passenger" : "🏍️ 驾驶员 / Driver";
                    }

                    // 乘客才显示攻击面板
                    if (attackPanel != null)
                    {
                        attackPanel.SetActive(isPassenger);
                    }

                    ShowMessage("🏁 比赛开始! / Race Start!");
                    CancelInvoke(nameof(TryFindMyVehicle));
                    return;
                }
            }
        }

        private void Update()
        {
            UpdateSpeedDisplay();
            UpdateBalanceDisplay();
            UpdateDistanceDisplay();
            UpdateAttackDisplay();
            UpdateMessage();
        }

        private void UpdateSpeedDisplay()
        {
            if (speedText == null || myVehicle == null) return;
            int kmh = Mathf.RoundToInt(myVehicle.GetSpeedKmh());
            speedText.text = $"{kmh} km/h";
        }

        private void UpdateBalanceDisplay()
        {
            if (myBalance == null) return;

            float balance = myBalance.Balance.Value;
            float maxBalance = 100f;
            float ratio = balance / maxBalance;

            if (balanceSlider != null)
                balanceSlider.value = ratio;

            if (balanceText != null)
                balanceText.text = Mathf.RoundToInt(balance).ToString();

            // 根据平衡值改变颜色
            if (balanceFill != null)
            {
                if (ratio > 0.5f)
                    balanceFill.color = Color.Lerp(Color.yellow, Color.green, (ratio - 0.5f) * 2f);
                else if (ratio > 0.2f)
                    balanceFill.color = Color.Lerp(Color.red, Color.yellow, (ratio - 0.2f) / 0.3f);
                else
                    balanceFill.color = Color.red;
            }

            // 失控提示
            if (myBalance.IsOutOfControl.Value)
            {
                ShowMessage("⚠ 失控中! / OUT OF CONTROL!");
            }
        }

        private void UpdateDistanceDisplay()
        {
            if (distanceText == null || myVehicle == null) return;

            float dist = myVehicle.DistanceTraveled.Value;
            distanceText.text = $"{Mathf.RoundToInt(dist)}m";

            // 圈数
            if (lapText != null)
            {
                int currentLap = Mathf.FloorToInt(dist / trackLength) + 1;
                currentLap = Mathf.Min(currentLap, totalLaps);
                lapText.text = $"Lap {currentLap}/{totalLaps}";
            }
        }

        private void UpdateAttackDisplay()
        {
            if (!isPassenger || myPassenger == null) return;

            // 冷却显示
            float cooldown = myPassenger.CooldownRemaining;
            float maxCooldown = 1.5f; // 最长冷却时间

            if (attack1CooldownFill != null)
            {
                float kickRatio = myPassenger.SelectedAttack == AttackType.Kick
                    ? Mathf.Clamp01(cooldown / 0.5f) : 0f;
                attack1CooldownFill.fillAmount = 1f - kickRatio;
            }

            if (attack2CooldownFill != null)
            {
                float grabRatio = myPassenger.SelectedAttack == AttackType.BrakeGrab
                    ? Mathf.Clamp01(cooldown / 1.0f) : 0f;
                attack2CooldownFill.fillAmount = 1f - grabRatio;
            }

            if (attack3CooldownFill != null)
            {
                float smashRatio = myPassenger.SelectedAttack == AttackType.Smash
                    ? Mathf.Clamp01(cooldown / 1.5f) : 0f;
                attack3CooldownFill.fillAmount = 1f - smashRatio;
            }

            // 目标锁定信息
            if (myPassenger.LockedTarget != null)
            {
                float targetDist = Vector3.Distance(
                    myVehicle.transform.position,
                    myPassenger.LockedTarget.transform.position);
                // 可以在此处显示目标距离指示器
            }
        }

        private void UpdateMessage()
        {
            if (messageText == null) return;

            if (messageTimer > 0f)
            {
                messageTimer -= Time.deltaTime;
                float alpha = Mathf.Clamp01(messageTimer / 0.5f);
                messageText.alpha = messageTimer < 0.5f ? alpha : 1f;
            }
            else
            {
                messageText.text = "";
            }
        }

        /// <summary>
        /// 显示游戏内消息
        /// </summary>
        public void ShowMessage(string message)
        {
            if (messageText == null) return;
            messageText.text = message;
            messageText.alpha = 1f;
            messageTimer = messageDuration;
        }

        /// <summary>
        /// 显示攻击受击消息
        /// </summary>
        public void ShowAttackMessage(AttackType type, bool isAttacker)
        {
            string typeName = PassengerController.GetAttackName(type);
            if (isAttacker)
            {
                ShowMessage($"✓ {typeName} 命中!");
            }
            else
            {
                ShowMessage($"⚠ 被 {typeName} 击中!");
            }
        }
    }
}
