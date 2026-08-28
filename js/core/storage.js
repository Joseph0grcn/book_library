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
    username: String(rawProfile.username || '').trim().replace(/\s+/g, '').toLowerCase().slice(0, 30),
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

export async function searchProfiles(query) {
  if (!supabaseClient || !activeUser) return [];
  const term = String(query || '').trim();
  if (term.length < 2) return [];
  const escaped = term.replace(/[%(),]/g, '');
  if (!escaped) return [];
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('user_id, display_name, username, bio, avatar_url')
    .neq('user_id', activeUser.id)
    .or(`username.ilike.%${escaped}%,display_name.ilike.%${escaped}%`)
    .limit(8);
  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizeProfile) : [];
}

export async function fetchFriendships() {
  if (!supabaseClient || !activeUser) return { friends: [], incoming: [], outgoing: [] };
  const { data: rows, error } = await supabaseClient
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at')
    .or(`requester_id.eq.${activeUser.id},addressee_id.eq.${activeUser.id}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const relationships = Array.isArray(rows) ? rows : [];
  const ids = [...new Set(relationships.flatMap((row) => [row.requester_id, row.addressee_id]).filter((id) => id !== activeUser.id))];
  if (!ids.length) return { friends: [], incoming: [], outgoing: [] };
  const { data: profiles, error: profileError } = await supabaseClient
    .from('profiles')
    .select('user_id, display_name, username, bio, avatar_url')
    .in('user_id', ids);
  if (profileError) throw profileError;
  const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, normalizeProfile(profile)]));
  const decorate = (row) => ({
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    profile: profileMap.get(row.requester_id === activeUser.id ? row.addressee_id : row.requester_id) || normalizeProfile()
  });
  return {
    friends: relationships.filter((row) => row.status === 'accepted').map(decorate),
    incoming: relationships.filter((row) => row.status === 'pending' && row.addressee_id === activeUser.id).map(decorate),
    outgoing: relationships.filter((row) => row.status === 'pending' && row.requester_id === activeUser.id).map(decorate)
  };
}

export async function fetchFriendProfile(userId) {
  if (!supabaseClient || !activeUser || !userId) throw new Error('Arkadaş profili yalnızca çevrimiçi hesaplarla görüntülenebilir.');

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('user_id, display_name, username, bio, location, website, avatar_url, cover_url')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error('Bu profil bulunamadı.');

  const { data: books, error: booksError } = await supabaseClient
    .from('books')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (booksError) throw booksError;

  return {
    profile: normalizeProfile(profile),
    books: Array.isArray(books) ? books.map((book) => normalizeBook({ ...book, createdAt: book.created_at, startDate: book.start_date, finishDate: book.finish_date })) : []
  };
}

export async function sendFriendRequest(username) {
  if (!supabaseClient || !activeUser) throw new Error('Arkadaş eklemek için çevrimiçi hesapla giriş yapmalısınız.');
  const cleanUsername = String(username || '').trim().replace(/^@/, '').toLowerCase();
  if (!cleanUsername) throw new Error('Kullanıcı adı girin.');
  const { data: target, error: targetError } = await supabaseClient
    .from('profiles')
    .select('user_id')
    .eq('username', cleanUsername)
    .neq('user_id', activeUser.id)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) throw new Error('Bu kullanıcı adıyla bir profil bulunamadı.');
  const { data: existing, error: existingError } = await supabaseClient
    .from('friendships')
    .select('id, status')
    .or(`and(requester_id.eq.${activeUser.id},addressee_id.eq.${target.user_id}),and(requester_id.eq.${target.user_id},addressee_id.eq.${activeUser.id})`)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) throw new Error('Bu kullanıcıyla zaten bir arkadaşlık kaydınız var.');
  const { error } = await supabaseClient.from('friendships').insert({
    id: uid(),
    requester_id: activeUser.id,
    addressee_id: target.user_id,
    status: 'pending'
  });
  if (error) {
    if (error.code === '23505') throw new Error('Bu kullanıcıya zaten arkadaşlık isteği gönderilmiş.');
    throw error;
  }
}

export async function updateFriendship(id, status) {
  if (!supabaseClient || !activeUser) throw new Error('Bu işlem için çevrimiçi hesapla giriş yapmalısınız.');
  const nextStatus = ['accepted', 'declined'].includes(status) ? status : null;
  if (!nextStatus) throw new Error('Geçersiz arkadaşlık durumu.');
  const { error } = await supabaseClient.from('friendships').update({ status: nextStatus }).eq('id', id).eq('addressee_id', activeUser.id);
  if (error) throw error;
}

export async function removeFriendship(id) {
  if (!supabaseClient || !activeUser) throw new Error('Bu işlem için çevrimiçi hesapla giriş yapmalısınız.');
  const { error } = await supabaseClient.from('friendships').delete().eq('id', id);
  if (error) throw error;
}

function getFeedCoverUrls(book) {
  const links = book?.metadata?.imageLinks;
  if (links && typeof links === 'object') {
    const urls = [links.thumbnail, links.smallThumbnail].filter(Boolean).map((url) => String(url).replace(/^http:/, 'https:'));
    const large = String(links.extraLarge || links.large || links.medium || links.thumbnail || '').replace(/^http:/, 'https:');
    return { small: urls[0] || large, large };
  }
  const coverId = book?.metadata?.cover_i || book?.metadata?.covers?.[0];
  if (coverId) {
    return {
      small: `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-M.jpg`,
      large: `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-L.jpg`
    };
  }
  return { small: '', large: '' };
}

export async function createFeedPost(book, caption = '') {
  if (!supabaseClient || !activeUser) throw new Error('Akışta paylaşmak için çevrimiçi hesapla giriş yapmalısınız.');
  const coverUrls = getFeedCoverUrls(book);
  const { error } = await supabaseClient.from('feed_posts').insert({
    id: uid(),
    user_id: activeUser.id,
    title: String(book.title || '').trim(),
    author: String(book.author || '').trim(),
    year: String(book.year || '').trim(),
    isbn: String(book.isbn || '').trim(),
    cover_url: coverUrls.small,
    cover_large_url: coverUrls.large,
    rating: Number(book.rating) || 0,
    status: String(book.status || 'unread'),
    caption: String(caption || '').trim().slice(0, 500)
  });
  if (error) throw error;
}

export async function fetchFeedPosts() {
  if (!supabaseClient || !activeUser) return [];
  const { data: posts, error } = await supabaseClient
    .from('feed_posts')
    .select('id, user_id, title, author, year, isbn, cover_url, cover_large_url, rating, status, caption, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = Array.isArray(posts) ? posts : [];
  const userIds = [...new Set(rows.map((post) => post.user_id))];
  if (!userIds.length) return [];
  const { data: profiles, error: profileError } = await supabaseClient
    .from('profiles')
    .select('user_id, display_name, username, avatar_url')
    .in('user_id', userIds);
  if (profileError) throw profileError;
  const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, normalizeProfile(profile)]));
  const interactions = await fetchFeedInteractions(rows.map((post) => post.id));
  return rows.map((post) => ({
    ...post,
    profile: profileMap.get(post.user_id) || normalizeProfile(),
    ...(interactions.get(post.id) || { likeCount: 0, likedByMe: false, comments: [] })
  }));
}

async function fetchFeedInteractions(postIds) {
  const result = new Map();
  if (!postIds.length) return result;
  const [{ data: likes, error: likesError }, { data: comments, error: commentsError }] = await Promise.all([
    supabaseClient.from('feed_post_likes').select('post_id, user_id').in('post_id', postIds),
    supabaseClient.from('feed_comments').select('id, post_id, user_id, body, created_at').in('post_id', postIds).order('created_at', { ascending: true })
  ]);
  if (likesError) throw likesError;
  if (commentsError) throw commentsError;
  postIds.forEach((postId) => {
    const postLikes = (likes || []).filter((like) => like.post_id === postId);
    result.set(postId, {
      likeCount: postLikes.length,
      likedByMe: postLikes.some((like) => like.user_id === activeUser.id),
      comments: (comments || []).filter((comment) => comment.post_id === postId)
    });
  });
  return result;
}

export async function toggleFeedLike(postId, liked) {
  if (!supabaseClient || !activeUser) throw new Error('Beğenmek için giriş yapmalısınız.');
  const query = supabaseClient.from('feed_post_likes');
  const result = liked
    ? await query.delete().eq('post_id', postId).eq('user_id', activeUser.id)
    : await query.insert({ post_id: postId, user_id: activeUser.id });
  if (result.error) throw result.error;
}

export async function addFeedComment(postId, body) {
  if (!supabaseClient || !activeUser) throw new Error('Yorum yapmak için giriş yapmalısınız.');
  const text = String(body || '').trim().slice(0, 500);
  if (!text) throw new Error('Yorum boş bırakılamaz.');
  const { error } = await supabaseClient.from('feed_comments').insert({ id: uid(), post_id: postId, user_id: activeUser.id, body: text });
  if (error) throw error;
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
