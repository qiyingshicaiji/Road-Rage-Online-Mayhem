using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Unity.Netcode;
using RoadRage.Network;
using RoadRage.Gameplay;

namespace RoadRage.UI
{
    /// <summary>
    /// 游戏结束 UI - 显示比赛结果。
    /// 挂载到 Game 场景的 Canvas 上（默认隐藏）。
    ///
    /// UI 结构：
    /// - GameOverPanel (默认 inactive)
    ///   ├── TitleText ("🏆 你赢了!" / "比赛结束")
    ///   ├── ResultText (排名信息)
    ///   └── BackButton (返回大厅)
    /// </summary>
    public class GameOverUI : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private GameObject gameOverPanel;
        [SerializeField] private TextMeshProUGUI titleText;
        [SerializeField] private TextMeshProUGUI resultText;
        [SerializeField] private Button backButton;

        [Header("Scene")]
        [SerializeField] private string lobbySceneName = "Lobby";

        private void Start()
        {
            gameOverPanel.SetActive(false);
            backButton.onClick.AddListener(OnBackToLobby);
        }

        /// <summary>
        /// 显示游戏结束界面
        /// </summary>
        /// <param name="winnerVehicleId">获胜载具的 NetworkObjectId</param>
        /// <param name="isLocalWinner">本地玩家是否获胜</param>
        public void ShowGameOver(ulong winnerVehicleId, bool isLocalWinner)
        {
            gameOverPanel.SetActive(true);

            if (isLocalWinner)
            {
                titleText.text = "🏆 你赢了!\nYou Win!";
                titleText.color = new Color(1f, 0.84f, 0f); // 金色
            }
            else
            {
                titleText.text = "🏁 比赛结束\nRace Over";
                titleText.color = Color.white;
            }

            resultText.text = $"获胜载具 ID: {winnerVehicleId}";

            // 收集所有载具的排名信息
            var vehicles = FindObjectsByType<VehicleController>(FindObjectsSortMode.None);
            string rankings = "\n--- 排名 / Rankings ---\n";
            int rank = 1;

            // 按距离排序（简单排名）
            System.Array.Sort(vehicles, (a, b) =>
                b.DistanceTraveled.Value.CompareTo(a.DistanceTraveled.Value));

            foreach (var v in vehicles)
            {
                float dist = v.DistanceTraveled.Value;
                string marker = v.NetworkObjectId == winnerVehicleId ? " 🏆" : "";
                rankings += $"#{rank}: 载具 {v.NetworkObjectId} - {dist:F0}m{marker}\n";
                rank++;
            }

            resultText.text += rankings;
        }

        private void OnBackToLobby()
        {
            // 断开网络连接
            GameNetworkManager.Instance?.Disconnect();

            // 离开 Lobby
            if (LobbyManager.Instance != null)
            {
                _ = LobbyManager.Instance.LeaveLobby();
            }

            // 返回大厅
            UnityEngine.SceneManagement.SceneManager.LoadScene(lobbySceneName);
        }

        private void OnDestroy()
        {
            backButton.onClick.RemoveAllListeners();
        }
    }
}
