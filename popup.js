document.addEventListener('DOMContentLoaded', async () => {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');

  try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const onChessCom = tab?.url?.includes('chess.com/game') ||
                         tab?.url?.includes('chess.com/play') ||
                         tab?.url?.includes('chess.com/live');

      if (onChessCom) {
          dot.classList.add('active');
          text.textContent = 'Active on chess.com';
      } else {
          dot.classList.add('inactive');
          text.textContent = 'Navigate to a chess.com game';
      }
  } catch {
      dot.classList.add('inactive');
      text.textContent = 'Could not detect tab';
  }
});