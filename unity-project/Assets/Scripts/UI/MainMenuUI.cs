using UnityEngine;
using UnityEngine.UI;
using TMPro;
using RoadRage.Network;

namespace RoadRage.UI
{
    /// <summary>
    /// 主菜单 UI - 处理登录和 UGS 初始化。
    /// 挂载到 MainMenu 场景的 Canvas 上。
    ///
    /// UI 结构（在 Unity Editor 中创建）：
    /// - Canvas
    ///   ├── TitlePanel
    ///   │   ├── TitleText ("暴走摩托：双人载具")
    ///   │   └── SubtitleText ("Road Rage Online Mayhem")
    ///   ├── LoginPanel
    ///   │   ├── PlayerNameInput (TMP_InputField)
    ///   │   ├── LoginButton (Button)
    ///   │   └── StatusText (TextMeshProUGUI)
    ///   └── VersionText
    /// </summary>
    public class MainMenuUI : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private TMP_InputField playerNameInput;
        [SerializeField] private Button loginButton;
        [SerializeField] private TextMeshProUGUI statusText;
        [SerializeField] private GameObject loginPanel;

        [Header("Scene Navigation")]
        [Tooltip("登录成功后加载的场景名")]
        [SerializeField] private string lobbySceneName = "Lobby";

        private void Start()
        {
            loginButton.onClick.AddListener(OnLoginClicked);

            // 默认玩家名
            playerNameInput.text = $"Player_{Random.Range(1000, 9999)}";

            statusText.text = "正在连接到 Unity Gaming Services...";
            InitializeServices();
        }

        private async void InitializeServices()
        {
            loginButton.interactable = false;

            var netManager = GameNetworkManager.Instance;
            if (netManager == null)
            {
                statusText.text = "错误: 未找到 GameNetworkManager！\n" +
                    "请确保场景中有带 GameNetworkManager 组件的 GameObject。";
                return;
            }

            await netManager.InitializeUGS();

            if (netManager.IsInitialized)
            {
                statusText.text = "已连接 ✓ UGS 免费套餐 (20 CCU)\n" +
                    $"Player ID: {netManager.PlayerId}";
                loginButton.interactable = true;
            }
            else
            {
                statusText.text = "连接失败，请检查网络后重试";
            }
        }

        private void OnLoginClicked()
        {
            string playerName = playerNameInput.text.Trim();
            if (string.IsNullOrEmpty(playerName))
            {
                statusText.text = "请输入玩家名称！";
                return;
            }

            // 设置玩家名称
            GameNetworkManager.Instance.PlayerName = playerName;

            statusText.text = $"欢迎, {playerName}! 正在进入大厅...";
            loginButton.interactable = false;

            // 加载大厅场景
            UnityEngine.SceneManagement.SceneManager.LoadScene(lobbySceneName);
        }

        private void OnDestroy()
        {
            loginButton.onClick.RemoveAllListeners();
        }
    }
}
