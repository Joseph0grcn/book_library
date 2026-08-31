import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addComment,
  deleteBook,
  getSession,
  hasSupabase,
  loadBooks as loadServerBooks,
  loadFeed,
  loadFriendProfile,
  loadFriends,
  loadNotifications,
  loadProfile,
  lookupIsbn,
  onAuthChange,
  respondFriendRequest,
  saveBooks as saveServerBooks,
  saveProfile,
  searchProfiles,
  sendFriendRequest,
  shareBook,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  subscribeToRealtime,
  markNotificationsRead,
  toggleLike,
} from './services/supabase.js';

const STORAGE_KEY = 'book_library_books';
const QUOTES_KEY = 'book_library_quotes';
const PROFILE_KEY = 'book_library_profile';
const THEME_KEY = 'book_library_theme';
const navigation = [
  { id: 'feed', label: 'Akış' },
  { id: 'library', label: 'Kitaplığım' },
  { id: 'add', label: 'Kitap ekle' },
  { id: 'stats', label: 'İstatistikler' },
  { id: 'quotes', label: 'Alıntılar' },
  { id: 'profile', label: 'Profilim' },
  { id: 'friends', label: 'Arkadaşlar' },
];

function pageFromLocation() {
  const path = window.location.pathname.replace(/^\/+/, '').split('/')[0];
  return navigation.some((item) => item.id === path)
    ? path
    : new URLSearchParams(window.location.search).get('view') || 'library';
}

function readBooks() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function coverFor(book) {
  const links = book.metadata?.imageLinks;
  return links?.large || links?.medium || links?.thumbnail || links?.smallThumbnail || '';
}

function App() {
  const [page, setPage] = useState(pageFromLocation);
  const [books, setBooks] = useState(readBooks);
  const [selectedBook, setSelectedBook] = useState(null);
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState({});
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem(THEME_KEY) ||
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => {
    let mounted = true;
    getSession()
      .then(({ session: current }) => mounted && setSession(current))
      .catch((error) => setNotice(error.message));
    const unsubscribe = onAuthChange((next) => mounted && setSession(next));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session?.user?.id) return;
    Promise.all([loadServerBooks(session.user.id), loadProfile(session.user.id)])
      .then(([serverBooks, serverProfile]) => {
        setBooks(serverBooks);
        setProfile(serverProfile);
      })
      .catch((error) => setNotice(error.message));
  }, [session]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#002b36' : '#176b5b');
  }, [theme]);
  useEffect(() => {
    if (!session?.user?.id) return undefined;
    const refresh = () => {
      window.dispatchEvent(new CustomEvent('react-library:realtime'));
      return loadNotifications(session.user.id)
        .then(setNotifications)
        .catch((error) => setNotice(error.message));
    };
    refresh();
    return subscribeToRealtime(session.user.id, refresh);
  }, [session]);
  useEffect(() => {
    const onPopState = () => setPage(pageFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = (nextPage) => {
    window.history.pushState({}, '', `/${nextPage}`);
    setPage(nextPage);
    setSelectedBook(null);
  };
  const saveBooks = (nextBooks) => {
    try {
      const previous = JSON.parse(localStorage.getItem('book_library_backup_history') || '[]');
      localStorage.setItem(
        'book_library_backup_history',
        JSON.stringify(
          [
            { createdAt: Date.now(), books: nextBooks },
            ...(Array.isArray(previous) ? previous : []),
          ].slice(0, 5),
        ),
      );
    } catch {
      /* Yedekleme hatası kitap kaydını durdurmamalı. */
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextBooks));
    setBooks(nextBooks);
    if (session?.user?.id)
      saveServerBooks(session.user.id, nextBooks).catch((error) => setNotice(error.message));
  };
  if (session === undefined) return <div className="react-loading">Uygulama yükleniyor...</div>;
  if (hasSupabase() && !session)
    return (
      <AuthPage onSignIn={signIn} onSignUp={signUp} onGoogle={signInWithGoogle} notice={notice} />
    );
  return (
    <div className="react-shell">
      <header className="react-header">
        <div>
          <p className="eyebrow">KİŞİSEL KOLEKSİYON</p>
          <h1>Kitap Kütüphanem</h1>
          <p className="intro">
            Kitaplarını düzenle, okuma durumunu takip et ve koleksiyonunu keşfet.
          </p>
        </div>
        <div className="header-actions">
          <span className="status-badge">{session ? 'Çevrimiçi' : 'Yerel mod'}</span>
          <button
            type="button"
            className="secondary-action theme-toggle"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Açık mod' : 'Koyu mod'}
          </button>
          {session && (
            <>
              <button
                type="button"
                className="secondary-action"
                onClick={async () => {
                  const next = !notificationsOpen;
                  setNotificationsOpen(next);
                  if (next) {
                    await markNotificationsRead(session.user.id);
                    setNotifications((items) => items.map((item) => ({ ...item, read: true })));
                  }
                }}
              >
                Bildirimler ({notifications.filter((item) => !item.read).length})
              </button>
              <button type="button" className="secondary-action" onClick={() => signOut()}>
                Çıkış
              </button>
            </>
          )}
        </div>
      </header>
      <nav className="react-nav" aria-label="React uygulama gezinme">
        {navigation.map((item) => (
          <button
            className={page === item.id ? 'active' : ''}
            key={item.id}
            type="button"
            onClick={() => navigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main>
        {page === 'feed' && <FeedPage userId={session?.user?.id} onNotice={setNotice} />}
        {page === 'library' && (
          <LibraryPage
            books={books}
            onSelect={setSelectedBook}
            onNavigate={navigate}
            onUpdate={(updated) => {
              const next = books.map((book) => (book.id === updated.id ? updated : book));
              saveBooks(next);
              setSelectedBook(updated);
            }}
            onDelete={async (id) => {
              saveBooks(books.filter((book) => book.id !== id));
              if (session?.user?.id) {
                try {
                  await deleteBook(session.user.id, id);
                } catch (error) {
                  setNotice(error.message);
                }
              }
            }}
          />
        )}
        {page === 'add' && (
          <AddPage
            userId={session?.user?.id}
            onNotice={setNotice}
            onSave={async (book) => {
              saveBooks([book, ...books]);
              if (book.share && session?.user?.id) {
                try {
                  await shareBook(session.user.id, book, book.caption);
                } catch (error) {
                  setNotice(error.message);
                }
              }
              navigate('library');
            }}
          />
        )}
        {page === 'stats' && <StatsPage books={books} />}
        {page === 'quotes' && <QuotesPage />}
        {page === 'profile' && (
          <ProfilePage
            profile={profile}
            userId={session?.user?.id}
            onSaved={setProfile}
            onNotice={setNotice}
          />
        )}
        {page === 'friends' && <FriendsPage userId={session?.user?.id} onNotice={setNotice} />}
      </main>
      {notice && (
        <div className="react-notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice('')}>
            Kapat
          </button>
        </div>
      )}
      {selectedBook && (
        <BookDetail
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          onUpdate={(updated) => {
            const next = books.map((book) => (book.id === updated.id ? updated : book));
            saveBooks(next);
            setSelectedBook(updated);
          }}
        />
      )}
    </div>
  );
}

function AuthPage({ onSignIn, onSignUp, onGoogle, notice }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [register, setRegister] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    try {
      const result = register
        ? await onSignUp(form.email, form.password)
        : await onSignIn(form.email, form.password);
      if (register && !result.session)
        alert('E-posta adresinizi doğruladıktan sonra giriş yapabilirsiniz.');
    } catch (error) {
      alert(error.message);
    }
  };
  return (
    <main className="auth-page">
      <section className="react-page narrow-page">
        <p className="eyebrow">KİŞİSEL KOLEKSİYON</p>
        <h1>Kitap Kütüphanem</h1>
        <p>Kitaplarını kaydetmek ve arkadaşlarınla paylaşmak için giriş yap.</p>
        <form className="react-form" onSubmit={submit}>
          <label>
            E-posta
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Şifre
            <input
              type="password"
              required
              minLength="6"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <button type="submit">{register ? 'Kayıt ol' : 'Giriş yap'}</button>
        </form>
        <button className="secondary-action auth-google" type="button" onClick={() => onGoogle()}>
          Google ile devam et
        </button>
        <button className="text-action" type="button" onClick={() => setRegister(!register)}>
          {register ? 'Zaten hesabım var' : 'Yeni hesap oluştur'}
        </button>
        {notice && <p role="alert">{notice}</p>}
      </section>
    </main>
  );
}

function LibraryPage({ books, onSelect, onNavigate, onUpdate, onDelete }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const visibleBooks = useMemo(
    () =>
      books.filter((book) => {
        const matchesText = `${book.title} ${book.author}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const current = book.status || (book.read ? 'read' : 'unread');
        return matchesText && (status === 'all' || current === status);
      }),
    [books, query, status],
  );
  return (
    <section className="react-page">
      <div className="react-page-heading">
        <div>
          <p className="eyebrow">KOLEKSİYON</p>
          <h2>Kitaplığım</h2>
        </div>
        <button type="button" onClick={() => onNavigate('add')}>
          + Kitap ekle
        </button>
      </div>
      <label className="react-search">
        <span className="sr-only">Kitaplarda ara</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Başlık veya yazar ara"
        />
      </label>
      <label className="react-filter">
        <span>Durum</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Tümü</option>
          <option value="unread">Okunacak</option>
          <option value="reading">Okunuyor</option>
          <option value="read">Okundu</option>
        </select>
      </label>
      {visibleBooks.length ? (
        <div className="book-grid">
          {visibleBooks.map((book) => (
            <article className="book-tile" key={book.id}>
              <button className="book-tile-main" type="button" onClick={() => onSelect(book)}>
                {coverFor(book) ? (
                  <img src={coverFor(book)} alt="" loading="lazy" />
                ) : (
                  <span className="book-tile-placeholder">Kitap</span>
                )}
                <strong>{book.title || 'Başlıksız'}</strong>
                <span>{book.author || 'Yazar bilinmiyor'}</span>
                <small>
                  {book.status === 'read' || book.read
                    ? 'Okundu'
                    : book.status === 'reading'
                      ? 'Okunuyor'
                      : 'Okunacak'}
                </small>
              </button>
              <div className="book-tile-actions">
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      ...book,
                      status: book.status === 'read' ? 'unread' : 'read',
                      read: book.status !== 'read',
                      progress: book.status === 'read' ? book.progress : 100,
                    })
                  }
                >
                  {book.status === 'read' ? 'Okunmadı' : 'Okundu'}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => onSelect({ ...book, editing: true })}
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  className="danger-action"
                  onClick={() =>
                    window.confirm('Bu kitabı silmek istediğine emin misin?') && onDelete(book.id)
                  }
                >
                  Sil
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="react-empty">
          <strong>{books.length ? 'Arama sonucu bulunamadı' : 'Henüz kitap eklenmedi'}</strong>
          <span>
            {books.length
              ? 'Farklı bir başlık veya yazar deneyin.'
              : 'İlk kitabını ekleyerek koleksiyonunu oluşturmaya başla.'}
          </span>
        </div>
      )}
      {books.length > 0 && (
        <section className="recommendation-strip">
          <div className="section-heading">
            <div>
              <p className="eyebrow">KEŞİF</p>
              <h3>Sonraki okumaların</h3>
            </div>
            <span>Okuma listendeki kitaplar</span>
          </div>
          <div className="recommendation-list">
            {books
              .filter((book) => book.status !== 'read' && book.status !== 'reading')
              .slice(0, 3)
              .map((book) => (
                <button type="button" key={book.id} onClick={() => onSelect(book)}>
                  <strong>{book.title}</strong>
                  <span>{book.author || 'Yazar bilinmiyor'}</span>
                </button>
              ))}
          </div>
        </section>
      )}
    </section>
  );
}

function AddPage({ onSave, userId, onNotice }) {
  const [form, setForm] = useState({
    title: '',
    author: '',
    isbn: '',
    status: 'unread',
    progress: 0,
    rating: 0,
    shelf: 'owned',
    tags: '',
    review: '',
    notes: '',
  });
  const [lookingUp, setLookingUp] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [quickQueue, setQuickQueue] = useState([]);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const queueRef = useRef([]);
  const lastScanRef = useRef('');
  const lookup = async () => {
    if (!form.isbn.trim()) return;
    setLookingUp(true);
    try {
      const book = await lookupIsbn(form.isbn);
      setForm((current) => ({ ...current, ...book }));
    } catch (error) {
      alert(error.message);
    } finally {
      setLookingUp(false);
    }
  };
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };
  const startCamera = async (isQuick = quickMode) => {
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      onNotice?.(
        'Bu tarayıcıda kamera barkod taraması desteklenmiyor. ISBN alanına yazabilirsiniz.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      });
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8'] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const isbn = codes.find((code) => /^97[89]\d{10}$/.test(code.rawValue || ''))?.rawValue;
          if (isbn && isbn !== lastScanRef.current) {
            lastScanRef.current = isbn;
            if (isQuick) {
              if (!queueRef.current.includes(isbn)) {
                queueRef.current = [...queueRef.current, isbn];
                setQuickQueue(queueRef.current);
                onNotice?.(`${isbn} kuyruğa eklendi. Sıradaki kitabı gösterin.`);
              }
              window.setTimeout(() => {
                lastScanRef.current = '';
              }, 1200);
              requestAnimationFrame(scan);
              return;
            }
            stopCamera();
            setForm((current) => ({ ...current, isbn }));
            const book = await lookupIsbn(isbn);
            setForm((current) => ({ ...current, ...book }));
            return;
          }
        } catch {
          /* A frame may be unavailable while the camera starts. */
        }
        requestAnimationFrame(scan);
      };
      requestAnimationFrame(scan);
    } catch (error) {
      onNotice?.(`Kamera açılamadı: ${error.message}`);
    }
  };
  const toggleQuickMode = () => {
    if (quickMode) {
      stopCamera();
      setQuickMode(false);
      return;
    }
    queueRef.current = [];
    setQuickQueue([]);
    setQuickMode(true);
    startCamera(true);
  };
  const removeQueued = (isbn) => {
    queueRef.current = queueRef.current.filter((item) => item !== isbn);
    setQuickQueue(queueRef.current);
  };
  const fillFromQueue = async (isbn) => {
    setForm((current) => ({ ...current, isbn }));
    try {
      const book = await lookupIsbn(isbn);
      setForm((current) => ({ ...current, ...book }));
      removeQueued(isbn);
    } catch (error) {
      onNotice?.(error.message);
    }
  };
  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  const submit = (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: form.title.trim(),
      author: form.author.trim(),
      isbn: form.isbn.trim(),
      status: form.status,
      read: form.status === 'read',
      progress: form.status === 'read' ? 100 : Number(form.progress) || 0,
      rating: Number(form.rating) || 0,
      shelf: form.shelf,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      review: form.review.trim(),
      notes: form.notes.trim(),
      share: form.share,
      caption: form.caption || '',
      metadata: {},
      createdAt: Date.now(),
    });
  };
  return (
    <section className="react-page narrow-page">
      <p className="eyebrow">YENİ KAYIT</p>
      <h2>Kitap ekle</h2>
      <form className="react-form" onSubmit={submit}>
        <label>
          Başlık
          <input
            required
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </label>
        <label>
          Yazar
          <input
            value={form.author}
            onChange={(event) => setForm({ ...form, author: event.target.value })}
          />
        </label>
        <label>
          ISBN
          <div className="inline-field">
            <input
              inputMode="numeric"
              value={form.isbn}
              onChange={(event) => setForm({ ...form, isbn: event.target.value })}
            />
            <button
              type="button"
              className="secondary-action"
              onClick={lookup}
              disabled={lookingUp}
            >
              {lookingUp ? 'Aranıyor...' : 'Bilgileri bul'}
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={cameraOpen ? stopCamera : startCamera}
            >
              {cameraOpen ? 'Kamerayı kapat' : 'Barkod tara'}
            </button>
          </div>
        </label>
        <div className="quick-scan-controls">
          <button type="button" className="secondary-action" onClick={toggleQuickMode}>
            {quickMode ? 'Hızlı taramayı bitir' : 'Hızlı çoklu tarama'}
          </button>
          {quickQueue.length > 0 && <span>{quickQueue.length} ISBN bekliyor</span>}
        </div>
        {quickQueue.length > 0 && (
          <div className="quick-queue" aria-label="Bekleyen ISBN kodları">
            {quickQueue.map((isbn) => (
              <button
                type="button"
                key={isbn}
                onClick={() => fillFromQueue(isbn)}
                title="ISBN bilgisini forma getir"
              >
                {isbn}
              </button>
            ))}
          </div>
        )}
        {cameraOpen && (
          <div className="scanner-preview">
            <video ref={videoRef} muted playsInline aria-label="Barkod kamera görüntüsü" />
            <p>Kamerayı barkoda doğrultun.</p>
          </div>
        )}
        <label>
          Okuma durumu
          <select
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value })}
          >
            <option value="unread">Okunacak</option>
            <option value="reading">Okunuyor</option>
            <option value="read">Okundu</option>
          </select>
        </label>
        <label>
          İlerleme (%)
          <input
            type="number"
            min="0"
            max="100"
            value={form.progress}
            onChange={(event) => setForm({ ...form, progress: event.target.value })}
          />
        </label>
        <label>
          Puan (0-5)
          <input
            type="number"
            min="0"
            max="5"
            value={form.rating}
            onChange={(event) => setForm({ ...form, rating: event.target.value })}
          />
        </label>
        <label>
          Raf
          <select
            value={form.shelf}
            onChange={(event) => setForm({ ...form, shelf: event.target.value })}
          >
            <option value="owned">Sahip olduklarım</option>
            <option value="wishlist">Okuma listem</option>
            <option value="favorites">Favorilerim</option>
          </select>
        </label>
        <label>
          Etiketler
          <input
            value={form.tags}
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
            placeholder="kurgu, klasik"
          />
        </label>
        <label>
          Yorum
          <textarea
            value={form.review}
            onChange={(event) => setForm({ ...form, review: event.target.value })}
          />
        </label>
        <label>
          Notlar
          <textarea
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </label>
        {userId && (
          <label className="share-option">
            <input
              type="checkbox"
              checked={form.share || false}
              onChange={(event) => setForm({ ...form, share: event.target.checked })}
            />{' '}
            Akışta paylaş
          </label>
        )}
        {form.share && (
          <label>
            Paylaşım notu
            <textarea
              value={form.caption || ''}
              onChange={(event) => setForm({ ...form, caption: event.target.value })}
              maxLength="500"
            />
          </label>
        )}
        <button type="submit">Kitabı kaydet</button>
      </form>
    </section>
  );
}

function StatsPage({ books }) {
  const read = books.filter((book) => book.read || book.status === 'read').length;
  const reading = books.filter((book) => book.status === 'reading').length;
  const [plan, setPlan] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('book_library_reading_plan') || '{}');
    } catch {
      return {};
    }
  });
  const pagesLeft = Math.max(0, Number(plan.totalPages || 0) - Number(plan.pagesRead || 0));
  const daysLeft = plan.targetDate
    ? Math.max(1, Math.ceil((new Date(plan.targetDate) - new Date()) / 86400000))
    : 0;
  const savePlan = (event) => {
    event.preventDefault();
    localStorage.setItem('book_library_reading_plan', JSON.stringify(plan));
  };
  const exportData = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      books,
      profile: JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'),
      quotes: JSON.parse(localStorage.getItem(QUOTES_KEY) || '[]'),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `kitap-kutuphanem-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const importData = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!Array.isArray(payload.books)) throw new Error('Geçersiz yedek dosyası.');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.books));
        if (payload.profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(payload.profile));
        if (payload.quotes) localStorage.setItem(QUOTES_KEY, JSON.stringify(payload.quotes));
        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    };
    reader.readAsText(file);
  };
  const restoreBackup = () => {
    try {
      const history = JSON.parse(localStorage.getItem('book_library_backup_history') || '[]');
      if (history[0]?.books && window.confirm('Son yedek geri yüklensin mi?')) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history[0].books));
        window.location.reload();
      }
    } catch {
      alert('Yedek okunamadı.');
    }
  };
  return (
    <section className="react-page">
      <p className="eyebrow">GENEL BAKIŞ</p>
      <h2>İstatistikler</h2>
      <div className="react-stat-grid">
        <div>
          <strong>{books.length}</strong>
          <span>Toplam kitap</span>
        </div>
        <div>
          <strong>{read}</strong>
          <span>Okundu</span>
        </div>
        <div>
          <strong>{reading}</strong>
          <span>Okunuyor</span>
        </div>
        <div>
          <strong>
            {books.length
              ? Math.round(
                  books.reduce((sum, book) => sum + (Number(book.progress) || 0), 0) / books.length,
                )
              : 0}
            %
          </strong>
          <span>Ortalama ilerleme</span>
        </div>
      </div>
      <div className="backup-actions">
        <button type="button" onClick={exportData}>
          JSON dışa aktar
        </button>
        <label className="file-button">
          JSON içe aktar
          <input type="file" accept="application/json" onChange={importData} />
        </label>
        <button type="button" className="secondary-action" onClick={restoreBackup}>
          Son yedeği geri yükle
        </button>
      </div>
      <div className="planner-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OKUMA PLANI</p>
            <h3>Hedefini takip et</h3>
          </div>
          <span>
            {daysLeft && pagesLeft
              ? `${Math.ceil(pagesLeft / daysLeft)} sayfa / gün`
              : 'Henüz plan yok'}
          </span>
        </div>
        <form className="planner-form" onSubmit={savePlan}>
          <label>
            Toplam sayfa
            <input
              type="number"
              min="1"
              value={plan.totalPages || ''}
              onChange={(e) => setPlan({ ...plan, totalPages: e.target.value })}
            />
          </label>
          <label>
            Okunan sayfa
            <input
              type="number"
              min="0"
              value={plan.pagesRead || ''}
              onChange={(e) => setPlan({ ...plan, pagesRead: e.target.value })}
            />
          </label>
          <label>
            Hedef tarih
            <input
              type="date"
              value={plan.targetDate || ''}
              onChange={(e) => setPlan({ ...plan, targetDate: e.target.value })}
            />
          </label>
          <button type="submit">Planı kaydet</button>
        </form>
      </div>
    </section>
  );
}

function QuotesPage() {
  const [quotes, setQuotes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(QUOTES_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [text, setText] = useState('');
  const addQuote = (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    const next = [{ id: Date.now(), text: text.trim() }, ...quotes];
    localStorage.setItem(QUOTES_KEY, JSON.stringify(next));
    setQuotes(next);
    setText('');
  };
  return (
    <section className="react-page">
      <p className="eyebrow">NOTLAR</p>
      <h2>Alıntılarım</h2>
      <form className="react-form" onSubmit={addQuote}>
        <label>
          Yeni alıntı
          <textarea value={text} onChange={(event) => setText(event.target.value)} required />
        </label>
        <button type="submit">Alıntıyı kaydet</button>
      </form>
      <div className="react-quote-list">
        {quotes.length ? (
          quotes.map((quote) => <blockquote key={quote.id}>{quote.text}</blockquote>)
        ) : (
          <div className="react-empty">
            <span>Henüz alıntı eklenmedi.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ProfilePage({ profile: initialProfile, userId, onSaved, onNotice }) {
  const [profile, setProfile] = useState(() => {
    try {
      return initialProfile && Object.keys(initialProfile).length
        ? initialProfile
        : JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const save = async (event) => {
    event.preventDefault();
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    try {
      const saved = await saveProfile(userId, profile);
      setProfile(saved);
      onSaved?.(saved);
      onNotice?.('Profil kaydedildi.');
    } catch (error) {
      onNotice?.(error.message);
    }
  };
  return (
    <section className="react-page narrow-page">
      <p className="eyebrow">KİŞİSEL ALAN</p>
      <h2>Profilim</h2>
      <form className="react-form" onSubmit={save}>
        <label>
          Görünen ad
          <input
            value={profile.displayName || profile.display_name || ''}
            onChange={(event) => setProfile({ ...profile, displayName: event.target.value })}
          />
        </label>
        <label>
          Kullanıcı adı
          <input
            value={profile.username || ''}
            onChange={(event) => setProfile({ ...profile, username: event.target.value })}
          />
        </label>
        <label>
          Biyografi
          <textarea
            value={profile.bio || ''}
            onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
          />
        </label>
        <label>
          Konum
          <input
            value={profile.location || ''}
            onChange={(event) => setProfile({ ...profile, location: event.target.value })}
          />
        </label>
        <label>
          Web sitesi
          <input
            type="url"
            value={profile.website || ''}
            onChange={(event) => setProfile({ ...profile, website: event.target.value })}
          />
        </label>
        <label>
          Avatar URL
          <input
            type="url"
            value={profile.avatar_url || profile.avatarUrl || ''}
            onChange={(event) => setProfile({ ...profile, avatar_url: event.target.value })}
          />
        </label>
        <label>
          Kapak URL
          <input
            type="url"
            value={profile.cover_url || profile.coverUrl || ''}
            onChange={(event) => setProfile({ ...profile, cover_url: event.target.value })}
          />
        </label>
        <button type="submit">Profili kaydet</button>
      </form>
    </section>
  );
}

function FeedPage({ userId, onNotice }) {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    loadFeed(userId)
      .then(setPosts)
      .catch((error) => onNotice(error.message));
  }, [userId, onNotice]);
  useEffect(() => {
    const handleRealtime = () =>
      loadFeed(userId)
        .then(setPosts)
        .catch((error) => onNotice(error.message));
    window.addEventListener('react-library:realtime', handleRealtime);
    return () => window.removeEventListener('react-library:realtime', handleRealtime);
  }, [userId, onNotice]);
  const refresh = () =>
    loadFeed(userId)
      .then(setPosts)
      .catch((error) => onNotice(error.message));
  const like = async (post) => {
    try {
      await toggleLike(
        userId,
        post.id,
        post.likes?.some((item) => item.user_id === userId),
      );
      refresh();
    } catch (error) {
      onNotice(error.message);
    }
  };
  const comment = async (event, postId) => {
    event.preventDefault();
    const input = event.currentTarget.elements.comment;
    try {
      await addComment(userId, postId, input.value);
      input.value = '';
      refresh();
    } catch (error) {
      onNotice(error.message);
    }
  };
  return (
    <section className="react-page">
      <div className="react-page-heading">
        <div>
          <p className="eyebrow">ARKADAŞLARININ OKUMA DÜNYASI</p>
          <h2>Akış</h2>
        </div>
        <button
          type="button"
          onClick={() =>
            loadFeed(userId)
              .then(setPosts)
              .catch((error) => onNotice(error.message))
          }
        >
          Yenile
        </button>
      </div>
      {posts.length ? (
        <div className="feed-list">
          {posts.map((post) => (
            <article className="feed-card" key={post.id}>
              <div className="feed-card-head">
                <strong>
                  {post.profile?.display_name || post.profile?.username || 'Bir kullanıcı'} ·{' '}
                  {post.title}
                </strong>
                <span>{post.author || 'Yazar bilinmiyor'}</span>
              </div>
              {post.cover_url && (
                <img src={post.cover_url} alt={`${post.title} kapak`} loading="lazy" />
              )}
              {post.caption && <p>{post.caption}</p>}
              <small>
                {post.status === 'read'
                  ? 'Okundu'
                  : post.status === 'reading'
                    ? 'Okunuyor'
                    : 'Okunacak'}
              </small>
              <div className="feed-actions">
                <button type="button" onClick={() => like(post)}>
                  {post.likes?.some((item) => item.user_id === userId) ? 'Beğenildi' : 'Beğen'} (
                  {post.likes?.length || 0})
                </button>
                <span>{post.comments?.length || 0} yorum</span>
              </div>
              <div className="feed-comments">
                {(post.comments || []).map((item) => (
                  <p key={item.id}>{item.body}</p>
                ))}
              </div>
              <form className="inline-field" onSubmit={(event) => comment(event, post.id)}>
                <input name="comment" placeholder="Yorum yaz" maxLength="500" required />
                <button type="submit">Gönder</button>
              </form>
            </article>
          ))}
        </div>
      ) : (
        <div className="react-empty">Henüz arkadaş akışı bulunmuyor.</div>
      )}
    </section>
  );
}

function FriendsPage({ userId, onNotice }) {
  const [data, setData] = useState({ friends: [], incoming: [] });
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const refresh = useCallback(
    () =>
      loadFriends(userId)
        .then(setData)
        .catch((error) => onNotice(error.message)),
    [userId, onNotice],
  );
  useEffect(refresh, [userId]);
  const find = async (event) => {
    event.preventDefault();
    try {
      setResults(await searchProfiles(userId, query));
    } catch (error) {
      onNotice(error.message);
    }
  };
  const add = async (username) => {
    try {
      await sendFriendRequest(userId, username);
      onNotice('Arkadaşlık isteği gönderildi.');
      setResults([]);
    } catch (error) {
      onNotice(error.message);
    }
  };
  const respond = async (id, status) => {
    try {
      await respondFriendRequest(userId, id, status);
      refresh();
    } catch (error) {
      onNotice(error.message);
    }
  };
  const openProfile = async (friendId) => {
    try {
      setSelected(await loadFriendProfile(userId, friendId));
    } catch (error) {
      onNotice(error.message);
    }
  };
  if (selected)
    return (
      <section className="react-page">
        <button type="button" className="secondary-action" onClick={() => setSelected(null)}>
          Arkadaşlara dön
        </button>
        <div className="friend-profile">
          <p className="eyebrow">ARKADAŞ PROFİLİ</p>
          <h2>{selected.profile.display_name || selected.profile.username}</h2>
          <p>@{selected.profile.username}</p>
          {selected.profile.bio && <p>{selected.profile.bio}</p>}
          <h3>Kütüphane · {selected.books.length} kitap</h3>
          <div className="book-grid">
            {selected.books.map((book) => (
              <article className="book-tile" key={book.id}>
                <strong>{book.title}</strong>
                <span>{book.author || 'Yazar bilinmiyor'}</span>
                <small>
                  {book.status === 'read'
                    ? 'Okundu'
                    : book.status === 'reading'
                      ? 'Okunuyor'
                      : 'Okunacak'}
                </small>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  return (
    <section className="react-page">
      <div className="react-page-heading">
        <div>
          <p className="eyebrow">SOSYAL KÜTÜPHANE</p>
          <h2>Arkadaşlar</h2>
        </div>
        <button type="button" onClick={refresh}>
          Yenile
        </button>
      </div>
      <form className="inline-field friend-search" onSubmit={find}>
        <input
          placeholder="Kullanıcı adı veya görünen ad"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          minLength="2"
        />
        <button type="submit">Ara</button>
      </form>
      {results.map((person) => (
        <div className="friend-row" key={person.user_id}>
          <span>
            <strong>{person.display_name || person.username}</strong>
            <small>@{person.username}</small>
          </span>
          <button type="button" onClick={() => add(person.username)}>
            Ekle
          </button>
        </div>
      ))}
      {data.incoming.length > 0 && (
        <>
          <h3>Bekleyen istekler</h3>
          {data.incoming.map((item) => (
            <div className="friend-row" key={item.id}>
              <span>
                <strong>{item.profile.display_name || item.profile.username}</strong>
                <small>@{item.profile.username}</small>
              </span>
              <span className="row-actions">
                <button type="button" onClick={() => respond(item.id, 'accepted')}>
                  Kabul et
                </button>
                <button
                  type="button"
                  className="danger-action"
                  onClick={() => respond(item.id, 'declined')}
                >
                  Reddet
                </button>
              </span>
            </div>
          ))}
        </>
      )}
      {data.friends.length > 0 && (
        <>
          <h3>Arkadaş listesi</h3>
          {data.friends.map((item) => (
            <div className="friend-row" key={item.id}>
              <span>
                <strong>{item.profile.display_name || item.profile.username}</strong>
                <small>@{item.profile.username}</small>
              </span>
              <button type="button" onClick={() => openProfile(item.profile.user_id)}>
                Profili gör
              </button>
            </div>
          ))}
        </>
      )}
      {!data.friends.length && !data.incoming.length && !results.length && (
        <div className="react-empty">Henüz arkadaş eklenmedi.</div>
      )}
    </section>
  );
}

function InfoPage({ title, text }) {
  return (
    <section className="react-page">
      <p className="eyebrow">REACT GEÇİŞİ</p>
      <h2>{title}</h2>
      <p className="migration-copy">{text}</p>
    </section>
  );
}

function NotificationCenter({ notifications }) {
  return (
    <aside className="notification-center" aria-label="Bildirimler">
      <div className="section-heading">
        <h2>Bildirimler</h2>
        <span>{notifications.length} kayıt</span>
      </div>
      {notifications.length ? (
        notifications.map((item) => (
          <article className={`notification-row${item.read ? '' : ' unread'}`} key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </article>
        ))
      ) : (
        <p className="react-empty">Yeni bildirim yok.</p>
      )}
    </aside>
  );
}

function BookDetail({ book, onClose, onUpdate }) {
  const [editing, setEditing] = useState(Boolean(book.editing));
  const [form, setForm] = useState({
    title: book.title || '',
    author: book.author || '',
    isbn: book.isbn || '',
    progress: book.progress || 0,
  });
  const update = (event) => {
    event.preventDefault();
    onUpdate({ ...book, ...form, progress: Number(form.progress) || 0, editing: undefined });
  };
  return (
    <div className="react-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="react-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Kitap ayrıntısı"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Kapat">
          ×
        </button>
        {editing ? (
          <form className="react-form" onSubmit={update}>
            <label>
              Başlık
              <input
                required
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </label>
            <label>
              Yazar
              <input
                value={form.author}
                onChange={(event) => setForm({ ...form, author: event.target.value })}
              />
            </label>
            <label>
              ISBN
              <input
                value={form.isbn}
                onChange={(event) => setForm({ ...form, isbn: event.target.value })}
              />
            </label>
            <label>
              İlerleme
              <input
                type="number"
                min="0"
                max="100"
                value={form.progress}
                onChange={(event) => setForm({ ...form, progress: event.target.value })}
              />
            </label>
            <button type="submit">Değişiklikleri kaydet</button>
            <button type="button" className="secondary-action" onClick={() => setEditing(false)}>
              Vazgeç
            </button>
          </form>
        ) : (
          <>
            {coverFor(book) && (
              <img className="detail-cover" src={coverFor(book)} alt={`${book.title} kapak`} />
            )}
            <p className="eyebrow">KİTAP AYRINTISI</p>
            <h2>{book.title}</h2>
            <p className="detail-author">{book.author || 'Yazar bilinmiyor'}</p>
            {(book.tags?.length || book.review || book.notes) && (
              <div className="detail-notes">
                {book.tags?.length > 0 && (
                  <p>
                    <strong>Etiketler:</strong> {book.tags.join(', ')}
                  </p>
                )}
                {book.review && (
                  <p>
                    <strong>Yorum:</strong> {book.review}
                  </p>
                )}
                {book.notes && (
                  <p>
                    <strong>Not:</strong> {book.notes}
                  </p>
                )}
              </div>
            )}
            {book.metadata?.description && (
              <p className="detail-description">{book.metadata.description}</p>
            )}
            {book.metadata?.pageCount && (
              <p className="detail-meta">{book.metadata.pageCount} sayfa</p>
            )}
            {Array.isArray(book.metadata?.readingHistory) &&
              book.metadata.readingHistory.length > 0 && (
                <div className="detail-history">
                  <strong>Son okuma hareketleri</strong>
                  {book.metadata.readingHistory.slice(0, 5).map((entry, index) => (
                    <span key={`${entry.at}-${index}`}>
                      {new Date(entry.at).toLocaleDateString('tr-TR')} · %{entry.progress} ·{' '}
                      {entry.status === 'read'
                        ? 'Okundu'
                        : entry.status === 'reading'
                          ? 'Okunuyor'
                          : 'Okunacak'}
                    </span>
                  ))}
                </div>
              )}
            <dl>
              <dt>Durum</dt>
              <dd>
                {book.status === 'read' || book.read
                  ? 'Okundu'
                  : book.status === 'reading'
                    ? 'Okunuyor'
                    : 'Okunacak'}
              </dd>
              {book.isbn && (
                <>
                  <dt>ISBN</dt>
                  <dd>{book.isbn}</dd>
                </>
              )}
              {book.progress !== undefined && (
                <>
                  <dt>İlerleme</dt>
                  <dd>{book.progress}%</dd>
                </>
              )}
              {book.year && (
                <>
                  <dt>Yıl</dt>
                  <dd>{book.year}</dd>
                </>
              )}
              {book.rating > 0 && (
                <>
                  <dt>Puan</dt>
                  <dd>
                    {'★'.repeat(book.rating)}
                    {'☆'.repeat(5 - book.rating)}
                  </dd>
                </>
              )}
              {book.shelf && (
                <>
                  <dt>Raf</dt>
                  <dd>{book.shelf}</dd>
                </>
              )}
            </dl>
            <button type="button" onClick={() => setEditing(true)}>
              Düzenle
            </button>
          </>
        )}
      </section>
    </div>
  );
}

export default App;
