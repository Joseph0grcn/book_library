import { BADGES_KEY, getUserStorageKey } from '../core/config.js';
import { showToast } from '../ui/toast.js';

export const BADGE_DEFINITIONS = [
  {
    id: 'first_book',
    title: 'İlk Adım',
    icon: '📖',
    description: 'Kütüphanene ilk kitabını ekledin.',
    check: (books) => books.length >= 1
  },
  {
    id: 'book_worm',
    title: 'Kitap Kurdu',
    icon: '📚',
    description: 'Toplam 5 kitabı okumayı tamamladın.',
    check: (books) => books.filter((b) => b.status === 'read' || b.read).length >= 5
  },
  {
    id: 'marathon_reader',
    title: 'Maraton Okur',
    icon: '⚡',
    description: 'Toplam 10 kitabı başamayla tamamladın.',
    check: (books) => books.filter((b) => b.status === 'read' || b.read).length >= 10
  },
  {
    id: 'thousand_pages',
    title: 'Binler Kulübü',
    icon: '📜',
    description: 'Toplam 1000 sayfadan fazla kitap okudun.',
    check: (books) => {
      const readBooks = books.filter((b) => b.status === 'read' || b.read);
      const totalPages = readBooks.reduce((sum, b) => {
        const pages = Number(b.metadata?.pageCount || b.metadata?.number_of_pages || 0) || 0;
        return sum + pages;
      }, 0);
      return totalPages >= 1000;
    }
  },
  {
    id: 'diverse_reader',
    title: 'Çeşitli Okur',
    icon: '🎨',
    description: 'En az 3 farklı tür/etikette kitap okudun.',
    check: (books) => {
      const tags = new Set();
      books.forEach((b) => {
        (b.tags || []).forEach((t) => {
          const clean = t.trim().toLowerCase();
          if (clean && !['isbn', 'google-books', 'open-library'].includes(clean)) {
            tags.add(clean);
          }
        });
      });
      return tags.size >= 3;
    }
  },
  {
    id: 'critic',
    title: 'Eleştirmen',
    icon: '💬',
    description: 'En az 5 kitaba yorum veya not ekledin.',
    check: (books) => books.filter((b) => (b.review && b.review.trim()) || (b.notes && b.notes.trim())).length >= 5
  }
];

export function getUnlockedBadges() {
  try {
    const raw = localStorage.getItem(getUserStorageKey(BADGES_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUnlockedBadges(unlockedIds) {
  localStorage.setItem(getUserStorageKey(BADGES_KEY), JSON.stringify(unlockedIds));
}

export function evaluateBadges(books) {
  const currentUnlocked = new Set(getUnlockedBadges());
  let newUnlockOccurred = false;

  BADGE_DEFINITIONS.forEach((badge) => {
    if (!currentUnlocked.has(badge.id)) {
      if (badge.check(books)) {
        currentUnlocked.add(badge.id);
        newUnlockOccurred = true;
        showToast(`Tebrikler! "${badge.title}" rozetini kazandın!`, 'badge', `${badge.icon} Yeni Rozet Açıldı`);
      }
    }
  });

  if (newUnlockOccurred) {
    saveUnlockedBadges(Array.from(currentUnlocked));
  }

  return Array.from(currentUnlocked);
}

export function renderBadges(books) {
  const container = document.getElementById('badges-grid');
  if (!container) return;

  const unlockedIds = new Set(evaluateBadges(books));

  container.innerHTML = BADGE_DEFINITIONS.map((badge) => {
    const isUnlocked = unlockedIds.has(badge.id);
    return `
      <div class="badge-card ${isUnlocked ? 'badge-unlocked' : 'badge-locked'}" title="${isUnlocked ? 'Kazanıldı' : 'Kilitli'}">
        <div class="badge-icon">${badge.icon}</div>
        <div class="badge-info">
          <strong>${badge.title}</strong>
          <span>${badge.description}</span>
        </div>
        <span class="badge-status-pill">${isUnlocked ? 'Kazanıldı ✓' : 'Kilitli 🔒'}</span>
      </div>
    `;
  }).join('');
}
