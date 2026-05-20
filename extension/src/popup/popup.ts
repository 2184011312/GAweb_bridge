// extension/src/popup/popup.ts
document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'Status: Connected';
    statusEl.className = 'status connected';
  }
});
