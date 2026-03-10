// Popup script
document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  
  // Check if on chess.com
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (tab.url && tab.url.includes('chess.com')) {
    statusEl.textContent = '✓ Active on chess.com';
    statusEl.style.background = 'rgba(76, 175, 80, 0.3)';
  } else {
    statusEl.textContent = '○ Not on chess.com';
    statusEl.style.background = 'rgba(255, 152, 0, 0.3)';
  }
});