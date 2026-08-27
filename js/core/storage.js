import { STORAGE_KEY, PROFILE_KEY, PENDING_SYNC_KEY, SYNC_STATE_KEY, supabaseClient, activeUser, getUserStorageKey, uid } from './config.js';
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
  setSyncState('pending');
  localStorage.setItem(`${PENDING_SYNC_KEY}_${activeUser?.id || 'local'}`, JSON.stringify({
    version: 1,
    allowDelete: !!options.allowDelete,
    books
  }));
}

export function normalizeProfile(rawProfile = {}) {
  return {
    id: rawProfile.id || activeUser?.id || 'local-profile',
    userId: rawProfile.userId || rawProfile.user_id || activeUser?.id || '',
    displayName: String(rawProfile.displayName || rawProfile.display_name || '').trim(),
    username: String(rawProfile.username || '').trim().replace(/\s+/g, '').slice(0, 30),
    bio: String(rawProfile.bio || '').trim().slice(0, 500),
    location: String(rawProfile.location || '').trim().slice(0, 100),
    website: String(rawProfile.website || '').trim().slice(0, 200),
    avatarUrl: String(rawProfile.avatarUrl || rawProfile.avatar_url || '').trim().slice(0, 500),
    coverUrl: String(rawProfile.coverUrl || rawProfile.cover_url || '').trim().slice(0, 500),
    createdAt: validTimestamp(rawProfile.createdAt || rawProfile.created_at) || Date.now(),
    updatedAt: validTimestamp(rawProfile.updatedAt || rawProfile.updated_at) || Date.now()
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(getUserStorageKey(PROFILE_KEY));
    return normalizeProfile(raw ? JSON.parse(raw) : {});
  } catch (error) {
    console.error('Profil okunurken hata oluştu:', error);
    return normalizeProfile();
  }
}

export function saveProfile(profile) {
  const normalized = normalizeProfile(profile);
  localStorage.setItem(getUserStorageKey(PROFILE_KEY), JSON.stringify(normalized));
  return normalized;
}

export async function fetchProfileFromServer() {
  if (!supabaseClient || !activeUser) return loadProfile();
  const { data, error } = await supabaseClient.from('profiles').select('*').eq('user_id', activeUser.id).maybeSingle();
  if (error) throw error;
  return data ? normalizeProfile(data) : loadProfile();
}

export async function syncProfileToServer(profile) {
  const normalized = saveProfile(profile);
  if (!supabaseClient || !activeUser) return { fallback: true, profile: normalized };

  const { data, error } = await supabaseClient.from('profiles').upsert({
    user_id: activeUser.id,
    display_name: normalized.displayName,
    username: normalized.username,
    bio: normalized.bio,
    location: normalized.location,
    website: normalized.website,
    avatar_url: normalized.avatarUrl,
    cover_url: normalized.coverUrl,
    updated_at: new Date(normalized.updatedAt).toISOString()
  }, { onConflict: 'user_id' }).select().single();

  if (error) throw error;
  return { profile: normalizeProfile(data) };
}

export function getSyncState() {
  try {
    return JSON.parse(localStorage.getItem(getUserStorageKey(SYNC_STATE_KEY)) || '{}');
  } catch {
    return {};
  }
}

function setSyncState(status, error = '') {
  const state = { status, updatedAt: new Date().toISOString(), error };
  localStorage.setItem(getUserStorageKey(SYNC_STATE_KEY), JSON.stringify(state));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('book-library:sync-status', { detail: state }));
  }
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
  } catch (error) {
    setSyncState('error', error.message);
  }
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
    setSyncState('syncing');
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
        setSyncState('error', error.message);
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
        setSyncState('error', deleteResult.error.message);
        return { fallback: true };
      }
    }

    setSyncState('synced');
    return data;
  }
  saveBooks(books);
  setSyncState('local');
  return { fallback: true };
}

function formatPostgrestInValue(value) {
  return JSON.stringify(String(value));
}

let realtimeChannel = null;
let realtimeRefreshTimer = null;
let realtimeRefreshInFlight = false;
let realtimeRefreshQueued = false;

export function setupRealtimeSubscription(onUpdateCallback) {
  if (!supabaseClient || !activeUser) return;
  if (realtimeRefreshTimer) {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = null;
  }
  realtimeRefreshQueued = false;
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  const refreshFromRealtime = async () => {
    if (realtimeRefreshInFlight) {
      realtimeRefreshQueued = true;
      return;
    }

    realtimeRefreshInFlight = true;
    try {
      const freshBooks = await fetchAllBooksFromServer();
      saveBooks(freshBooks);
      if (typeof onUpdateCallback === 'function') {
        onUpdateCallback(freshBooks);
      }
      showToast('Kütüphane canlı olarak güncellendi.', 'info');
    } finally {
      realtimeRefreshInFlight = false;
      if (realtimeRefreshQueued) {
        realtimeRefreshQueued = false;
        scheduleRealtimeRefresh();
      }
    }
  };

  const scheduleRealtimeRefresh = () => {
    if (realtimeRefreshInFlight) {
      realtimeRefreshQueued = true;
      return;
    }
    if (realtimeRefreshTimer) return;
    realtimeRefreshTimer = setTimeout(() => {
      realtimeRefreshTimer = null;
      refreshFromRealtime();
    }, 300);
  };

  realtimeChannel = supabaseClient
    .channel('public:books')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'books', filter: `user_id=eq.${activeUser.id}` },
      scheduleRealtimeRefresh
    )
    .subscribe();
}
