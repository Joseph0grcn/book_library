import { getUserStorageKey } from '../core/config.js';

const NOTIFICATIONS_KEY = 'book_library_notifications';

export function renderNotifications({ incomingFriends = [], books = [] } = {}) {
  const list = document.getElementById('notifications-list');
  const badge = document.getElementById('notifications-count');
  if (!list || !badge) return;
  const saved = loadNotifications();
  const next = incomingFriends.map((friend) => ({
    id: `friend-${friend.id}`,
    type: 'Arkadaşlık',
    text: `${friend.displayName || friend.username || 'Bir kullanıcı'} arkadaşlık isteği gönderdi.`,
  }));
  books.forEach((book) => {
    const due = book.metadata?.loanDueDate;
    if (!book.metadata?.loanedTo || !due) return;
    const days = Math.ceil((new Date(`${due}T00:00:00`) - new Date()) / 86400000);
    if (days >= 0 && days <= 7) next.push({ id: `loan-${book.id}-${due}`, type: 'Ödünç', text: `${book.title} için iade tarihi ${days === 0 ? 'bugün' : `${days} gün sonra`}.` });
  });
  const notifications = next.map((item) => ({ ...item, read: saved.find((old) => old.id === item.id)?.read || false }));
  saveNotifications(notifications);
  const unread = notifications.filter((item) => !item.read).length;
  badge.textContent = String(unread);
  badge.classList.toggle('hidden', unread === 0);
  list.innerHTML = notifications.length ? notifications.map((item) => `<li class="notification-item${item.read ? ' is-read' : ''}"><span class="notification-type">${item.type}</span><span>${item.text}</span></li>`).join('') : '<li class="notification-empty">Yeni bildirim yok.</li>';
}

export function markNotificationsRead() {
  saveNotifications(loadNotifications().map((item) => ({ ...item, read: true })));
}

function loadNotifications() {
  try { return JSON.parse(localStorage.getItem(getUserStorageKey(NOTIFICATIONS_KEY)) || '[]'); } catch { return []; }
}

function saveNotifications(items) {
  localStorage.setItem(getUserStorageKey(NOTIFICATIONS_KEY), JSON.stringify(items));
}
