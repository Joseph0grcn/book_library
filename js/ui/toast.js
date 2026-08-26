export function showToast(message, type = 'info', title = null) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    badge: '🏆'
  };

  const icon = iconMap[type] || 'ℹ';

  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">
      ${title ? `<strong class="toast-title">${escapeHtml(title)}</strong>` : ''}
      <span class="toast-message">${escapeHtml(message)}</span>
    </div>
    <button type="button" class="toast-close" aria-label="Kapat">&times;</button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => removeToast(toast));

  container.appendChild(toast);

  // Trigger entry animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });

  // Auto dismiss after 4 seconds
  setTimeout(() => {
    removeToast(toast);
  }, 4000);
}

function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.remove('toast-show');
  toast.classList.add('toast-hide');
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
