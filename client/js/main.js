/**
 * Main entry point - initializes the game and sets up UI event handlers
 */
(function () {
  const game = new Game();

  // Menu buttons
  document.getElementById('btn-start').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim() || '玩家';
    const aiCount = parseInt(document.getElementById('ai-count').value, 10) || 2;
    game.startOnline(name, aiCount);
  });

  document.getElementById('btn-offline').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim() || '玩家';
    const aiCount = parseInt(document.getElementById('ai-count').value, 10) || 2;
    game.startOffline(name, aiCount);
  });

  // Game over buttons
  document.getElementById('btn-restart').addEventListener('click', () => {
    game.restart();
    const name = document.getElementById('player-name').value.trim() || '玩家';
    const aiCount = parseInt(document.getElementById('ai-count').value, 10) || 2;
    game.startOffline(name, aiCount);
  });

  document.getElementById('btn-menu').addEventListener('click', () => {
    game.restart();
    game.showScreen('menu');
  });

  // Allow Enter to start
  document.getElementById('player-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btn-offline').click();
    }
  });
})();
