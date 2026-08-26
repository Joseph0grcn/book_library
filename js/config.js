export const STORAGE_KEY = 'book_library_books';
export const PENDING_SYNC_KEY = 'book_library_pending_sync';
export const QUOTES_KEY = 'book_library_quotes';
export const BADGES_KEY = 'book_library_badges';
export const THEME_KEY = 'book_library_theme';
export const ANNUAL_GOAL_KEY = 'book_library_annual_goal';

export const supabaseClient = (
  window.supabase &&
  window.SUPABASE_URL &&
  window.SUPABASE_ANON_KEY &&
  !window.SUPABASE_URL.includes('YOUR_')
) ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;

export let activeUser = null;

export function setActiveUser(user) {
  activeUser = user;
}

export function getUserStorageKey(baseKey = STORAGE_KEY) {
  return activeUser ? `${baseKey}_${activeUser.id}` : baseKey;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
