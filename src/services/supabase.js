const STORAGE_KEY = 'book_library_books';

function client() {
  if (typeof window === 'undefined') return null;
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
  if (window.SUPABASE_URL.includes('YOUR_')) return null;
  window.__bookLibrarySupabase ||= window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
  );
  return window.__bookLibrarySupabase;
}

export function hasSupabase() {
  return Boolean(client());
}

export async function getSession() {
  const supabase = client();
  if (!supabase) return { session: null };
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data;
}

export function onAuthChange(callback) {
  const supabase = client();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  const supabase = client();
  if (!supabase) throw new Error('Supabase yapılandırması bulunamadı.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp(email, password) {
  const supabase = client();
  if (!supabase) throw new Error('Supabase yapılandırması bulunamadı.');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const supabase = client();
  if (!supabase) throw new Error('Supabase yapılandırması bulunamadı.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/react.html?view=library' },
  });
  if (error) throw error;
}

export async function signOut() {
  const supabase = client();
  if (supabase) await supabase.auth.signOut();
}

function normalizeBook(book) {
  const status = ['unread', 'reading', 'read'].includes(book.status)
    ? book.status
    : book.read
      ? 'read'
      : 'unread';
  return {
    ...book,
    id: book.id || crypto.randomUUID(),
    title: book.title || 'Başlıksız',
    author: book.author || '',
    isbn: book.isbn || '',
    status,
    read: status === 'read',
    progress: status === 'read' ? 100 : Math.max(0, Math.min(100, Number(book.progress) || 0)),
    rating: Math.max(0, Math.min(5, Number(book.rating) || 0)),
    tags: Array.isArray(book.tags) ? book.tags : [],
    metadata: book.metadata && typeof book.metadata === 'object' ? book.metadata : {},
  };
}

export async function loadBooks(userId) {
  const supabase = client();
  if (!supabase || !userId) {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.map(normalizeBook) : [];
    } catch {
      return [];
    }
  }
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((book) => normalizeBook({ ...book, createdAt: book.created_at }));
}

export async function saveBooks(userId, books) {
  const normalized = books.map(normalizeBook);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  const supabase = client();
  if (!supabase || !userId) return normalized;
  const rows = normalized.map((book) => ({
    id: book.id,
    user_id: userId,
    title: book.title,
    author: book.author,
    year: book.year || '',
    tags: book.tags || [],
    read: book.read,
    status: book.status,
    progress: book.progress,
    rating: book.rating,
    review: book.review || '',
    notes: book.notes || '',
    shelf: book.shelf || 'owned',
    isbn: book.isbn || '',
    metadata: book.metadata || {},
  }));
  if (rows.length) {
    const { error } = await supabase.from('books').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  return normalized;
}

export async function deleteBook(userId, bookId) {
  const supabase = client();
  if (!supabase || !userId) return;
  const { error } = await supabase.from('books').delete().eq('id', bookId).eq('user_id', userId);
  if (error) throw error;
}

export async function loadProfile(userId) {
  const supabase = client();
  if (!supabase || !userId) return {};
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || {};
}

export async function saveProfile(userId, profile) {
  const supabase = client();
  if (!supabase || !userId) return profile;
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        display_name: profile.display_name || profile.displayName || '',
        username: profile.username || '',
        bio: profile.bio || '',
        location: profile.location || '',
        website: profile.website || '',
        avatar_url: profile.avatar_url || profile.avatarUrl || '',
        cover_url: profile.cover_url || profile.coverUrl || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function loadFriends(userId) {
  const supabase = client();
  if (!supabase || !userId) return { friends: [], incoming: [] };
  const { data: rows, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ids = [
    ...new Set(
      (rows || [])
        .flatMap((row) => [row.requester_id, row.addressee_id])
        .filter((id) => id !== userId),
    ),
  ];
  if (!ids.length) return { friends: [], incoming: [] };
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .in('user_id', ids);
  if (profileError) throw profileError;
  const map = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
  const decorate = (row) => ({
    ...row,
    profile: map.get(row.requester_id === userId ? row.addressee_id : row.requester_id) || {},
  });
  return {
    friends: (rows || []).filter((row) => row.status === 'accepted').map(decorate),
    incoming: (rows || [])
      .filter((row) => row.status === 'pending' && row.addressee_id === userId)
      .map(decorate),
  };
}

export async function searchProfiles(userId, query) {
  const supabase = client();
  const term = String(query || '')
    .trim()
    .replace(/[%(),]/g, '');
  if (!supabase || !userId || term.length < 2) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('user_id', userId)
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(8);
  if (error) throw error;
  return data || [];
}

export async function sendFriendRequest(userId, username) {
  const supabase = client();
  if (!supabase || !userId) throw new Error('Arkadaş eklemek için giriş yapın.');
  const { data: target, error: targetError } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('username', username.replace(/^@/, '').toLowerCase())
    .neq('user_id', userId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) throw new Error('Kullanıcı bulunamadı.');
  const { error } = await supabase.from('friendships').insert({
    id: crypto.randomUUID(),
    requester_id: userId,
    addressee_id: target.user_id,
    status: 'pending',
  });
  if (error) throw error;
}

export async function respondFriendRequest(userId, id, status) {
  const supabase = client();
  if (!supabase) return;
  const { error } = await supabase
    .from('friendships')
    .update({ status })
    .eq('id', id)
    .eq('addressee_id', userId);
  if (error) throw error;
}

export async function loadFeed(userId) {
  const supabase = client();
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('feed_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const posts = data || [];
  const ids = [...new Set(posts.map((post) => post.user_id))];
  const { data: profiles, error: profileError } = ids.length
    ? await supabase
        .from('profiles')
        .select('user_id, display_name, username, avatar_url')
        .in('user_id', ids)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
  const postIds = posts.map((post) => post.id);
  if (!postIds.length) return [];
  const [{ data: likes, error: likesError }, { data: comments, error: commentsError }] =
    await Promise.all([
      supabase.from('feed_post_likes').select('post_id, user_id').in('post_id', postIds),
      supabase
        .from('feed_comments')
        .select('id, post_id, user_id, body, created_at')
        .in('post_id', postIds)
        .order('created_at', { ascending: true }),
    ]);
  if (likesError) throw likesError;
  if (commentsError) throw commentsError;
  return posts.map((post) => ({
    ...post,
    profile: profileMap.get(post.user_id) || {},
    likes: (likes || []).filter((like) => like.post_id === post.id),
    comments: (comments || []).filter((comment) => comment.post_id === post.id),
  }));
}

export async function loadFriendProfile(userId, friendId) {
  const supabase = client();
  if (!supabase || !userId || !friendId) throw new Error('Profil bulunamadı.');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', friendId)
    .maybeSingle();
  if (profileError) throw profileError;
  const { data: books, error: booksError } = await supabase
    .from('books')
    .select('*')
    .eq('user_id', friendId)
    .order('created_at', { ascending: false });
  if (booksError) throw booksError;
  return { profile: profile || {}, books: books || [] };
}

export async function toggleLike(userId, postId, liked) {
  const supabase = client();
  if (!supabase || !userId) throw new Error('Beğenmek için giriş yapın.');
  const result = liked
    ? await supabase.from('feed_post_likes').delete().eq('post_id', postId).eq('user_id', userId)
    : await supabase.from('feed_post_likes').insert({ post_id: postId, user_id: userId });
  if (result.error) throw result.error;
}

export async function addComment(userId, postId, body) {
  const supabase = client();
  const text = String(body || '').trim();
  if (!supabase || !userId) throw new Error('Yorum yapmak için giriş yapın.');
  if (!text) throw new Error('Yorum boş bırakılamaz.');
  const { error } = await supabase.from('feed_comments').insert({
    id: crypto.randomUUID(),
    post_id: postId,
    user_id: userId,
    body: text.slice(0, 500),
  });
  if (error) throw error;
}

export async function loadNotifications(userId) {
  const supabase = client();
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data || [];
}

export async function markNotificationsRead(userId) {
  const supabase = client();
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
}

export function subscribeToRealtime(userId, onChange) {
  const supabase = client();
  if (!supabase || !userId) return () => {};
  const channel = supabase
    .channel(`react-library-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_post_likes' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_comments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, onChange)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function shareBook(userId, book, caption) {
  const supabase = client();
  if (!supabase || !userId) throw new Error('Paylaşmak için giriş yapın.');
  const links = book.metadata?.imageLinks || {};
  const { error } = await supabase.from('feed_posts').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    title: book.title,
    author: book.author || '',
    year: book.year || '',
    isbn: book.isbn || '',
    cover_url: links.thumbnail || '',
    cover_large_url: links.large || links.medium || '',
    rating: book.rating || 0,
    status: book.status || 'unread',
    caption: caption || '',
  });
  if (error) throw error;
}

export async function lookupIsbn(isbn) {
  const clean = String(isbn || '').replace(/[^0-9Xx]/g, '');
  if (!clean) throw new Error('Geçerli bir ISBN girin.');
  const response = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(clean)}`,
  );
  if (!response.ok) throw new Error('Kitap bilgisi alınamadı.');
  const data = await response.json();
  const info = data.items?.[0]?.volumeInfo;
  if (!info) throw new Error('Bu ISBN için kitap bulunamadı.');
  return {
    title: info.title || '',
    author: (info.authors || []).join(', '),
    year: info.publishedDate?.slice(0, 4) || '',
    isbn: clean,
    metadata: {
      imageLinks: info.imageLinks || {},
      description: info.description || '',
      pageCount: info.pageCount || 0,
    },
  };
}
