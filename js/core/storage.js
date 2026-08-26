import { STORAGE_KEY, PENDING_SYNC_KEY, supabaseClient, activeUser, getUserStorageKey, uid } from './config.js';
import { showToast } from '../ui/toast.js';

export function normalizeBook(rawBook = {}) {
  const status = ['unread', 'reading', 'read'].includes(rawBook.status)
    ? rawBook.status
    : (rawBook.read ? 'read' : 'unread');
  const progress = clampNumber(rawBook.progress, rawBook.read ? 100 : 0, 0, 100);
  const rating = clampNumber(rawBook.rating, 0, 0, 5);

  return {
    id: rawBook.id || uid(),
    title: rawBook.title || 'Başlıksız',
    author: rawBook.author || '',
    year: rawBook.year || '',
    tags: normalizeTags(rawBook.tags),
    read: status === 'read',
    status,
    progress: status === 'read' ? 100 : progress,
    rating,
    review: rawBook.review || '',
    notes: rawBook.notes || '',
    shelf: rawBook.shelf || 'owned',
    startDate: rawBook.startDate || rawBook.start_date || '',
    finishDate: rawBook.finishDate || rawBook.finish_date || '',
    isbn: rawBook.isbn || '',
    metadata: rawBook.metadata && typeof rawBook.metadata === 'object' && !Array.isArray(rawBook.metadata) ? rawBook.metadata : {},
    createdAt: validTimestamp(rawBook.createdAt) || Date.now()
  };
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  return [];
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function validTimestamp(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function loadBooks() {
  try {
    const raw = localStorage.getItem(getUserStorageKey(STORAGE_KEY));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalizeBook) : [];
  } catch (error) {
    console.error('Veri okunurken hata oluştu:', error);
    return [];
  }
}

export function saveBooks(books) {
  localStorage.setItem(getUserStorageKey(STORAGE_KEY), JSON.stringify(books));
}

export function createBook(bookData) {
  return normalizeBook({
    id: bookData.id || uid(),
    title: bookData.title || 'Başlıksız',
    author: bookData.author || '',
    year: bookData.year || '',
    tags: normalizeTags(bookData.tags),
    read: !!bookData.read,
    status: bookData.status || (bookData.read ? 'read' : 'unread'),
    progress: bookData.progress ?? 0,
    rating: bookData.rating ?? 0,
    review: bookData.review || '',
    notes: bookData.notes || '',
    shelf: bookData.shelf || 'owned',
    startDate: bookData.startDate || '',
    finishDate: bookData.finishDate || '',
    isbn: bookData.isbn || '',
    metadata: bookData.metadata || {},
    createdAt: bookData.createdAt || Date.now()
  });
}

export function queuePendingSync(books, options = {}) {
  localStorage.setItem(`${PENDING_SYNC_KEY}_${activeUser?.id || 'local'}`, JSON.stringify({
    version: 1,
    allowDelete: !!options.allowDelete,
    books
  }));
}

export async function flushPendingSync() {
  if (!activeUser || !supabaseClient || !navigator.onLine) return;
  const key = `${PENDING_SYNC_KEY}_${activeUser.id}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    const isLegacyQueue = Array.isArray(parsed);
    const books = isLegacyQueue ? parsed : parsed.books;
    if (!Array.isArray(books)) {
      localStorage.removeItem(key);
      return;
    }
    const result = await syncBooksToServer(books, { allowDelete: !isLegacyQueue && !!parsed.allowDelete });
    if (!result?.fallback) localStorage.removeItem(key);
  } catch (error) {}
}

export async function fetchAllBooksFromServer() {
  if (supabaseClient && activeUser) {
    const { data, error } = await supabaseClient.from('books').select('*').eq('user_id', activeUser.id).order('created_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      return data.map((book) => normalizeBook({ ...book, createdAt: book.created_at, startDate: book.start_date, finishDate: book.finish_date }));
    }
    showToast('Kütüphane sunucudan alınamadı. Yerel kayıtlar gösteriliyor.', 'info');
    return loadBooks();
  }
  return loadBooks();
}

export async function syncBooksToServer(books, options = {}) {
  const allowDelete = !!options.allowDelete;

  if (supabaseClient && activeUser) {
    const rows = books.map((book) => ({
      id: book.id,
      user_id: activeUser.id,
      title: book.title,
      author: book.author,
      year: book.year,
      tags: book.tags,
      read: book.read,
      status: book.status,
      progress: book.progress,
      rating: book.rating,
      review: book.review,
      notes: book.notes,
      shelf: book.shelf,
      start_date: book.startDate || '',
      finish_date: book.finishDate || '',
      isbn: book.isbn,
      metadata: book.metadata,
      created_at: new Date(validTimestamp(book.createdAt) || Date.now()).toISOString()
    }));
    let data = [];
    if (rows.length) {
      const { data: upsertedRows, error } = await supabaseClient.from('books').upsert(rows).select();
      if (error) {
        saveBooks(books);
        queuePendingSync(books, { allowDelete });
        return { fallback: true };
      }
      data = upsertedRows;
    }

    if (allowDelete) {
      const ids = books.map((book) => book.id);
      let deleteResult;
      if (ids.length) {
        deleteResult = await supabaseClient
          .from('books')
          .delete()
          .eq('user_id', activeUser.id)
          .not('id', 'in', `(${ids.map(formatPostgrestInValue).join(',')})`);
      } else {
        deleteResult = await supabaseClient.from('books').delete().eq('user_id', activeUser.id);
      }

      if (deleteResult?.error) {
        saveBooks(books);
        queuePendingSync(books, { allowDelete });
        return { fallback: true };
      }
    }

    return data;
  }
  saveBooks(books);
  queuePendingSync(books, { allowDelete });
  return { fallback: true };
}

function formatPostgrestInValue(value) {
  return JSON.stringify(String(value));
}

let realtimeChannel = null;

export function setupRealtimeSubscription(onUpdateCallback) {
  if (!supabaseClient || !activeUser) return;
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel('public:books')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'books', filter: `user_id=eq.${activeUser.id}` },
      async () => {
        const freshBooks = await fetchAllBooksFromServer();
        saveBooks(freshBooks);
        if (typeof onUpdateCallback === 'function') {
          onUpdateCallback(freshBooks);
        }
        showToast('Kütüphane canlı olarak güncellendi.', 'info');
      }
    )
    .subscribe();
}
