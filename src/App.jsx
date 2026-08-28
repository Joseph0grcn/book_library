import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'book_library_books';
const QUOTES_KEY = 'book_library_quotes';
const PROFILE_KEY = 'book_library_profile';
const navigation = [
  { id: 'feed', label: 'Akış' },
  { id: 'library', label: 'Kitaplığım' },
  { id: 'add', label: 'Kitap ekle' },
  { id: 'stats', label: 'İstatistikler' },
  { id: 'quotes', label: 'Alıntılar' },
  { id: 'profile', label: 'Profilim' },
  { id: 'friends', label: 'Arkadaşlar' },
];

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
  const [page, setPage] = useState(
    () => new URLSearchParams(window.location.search).get('view') || 'library',
  );
  const [books, setBooks] = useState(readBooks);
  const [selectedBook, setSelectedBook] = useState(null);
  useEffect(() => {
    const onPopState = () =>
      setPage(new URLSearchParams(window.location.search).get('view') || 'library');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = (nextPage) => {
    window.history.pushState({}, '', `/react.html?view=${nextPage}`);
    setPage(nextPage);
    setSelectedBook(null);
  };
  const saveBooks = (nextBooks) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextBooks));
    setBooks(nextBooks);
  };
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
        <span className="status-badge">React aktif</span>
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
        {page === 'feed' && (
          <InfoPage
            title="Akış"
            text="Arkadaşlarının kitap paylaşımları React ekranına taşınıyor."
          />
        )}
        {page === 'library' && (
          <LibraryPage books={books} onSelect={setSelectedBook} onNavigate={navigate} />
        )}
        {page === 'add' && (
          <AddPage
            onSave={(book) => {
              saveBooks([book, ...books]);
              navigate('library');
            }}
          />
        )}
        {page === 'stats' && <StatsPage books={books} />}
        {page === 'quotes' && <QuotesPage />}
        {page === 'profile' && <ProfilePage />}
        {page === 'friends' && (
          <InfoPage
            title="Arkadaşlar"
            text="Arkadaş arama ve kütüphane paylaşımı bir sonraki React geçiş adımında bağlanacak."
          />
        )}
      </main>
      {selectedBook && <BookDetail book={selectedBook} onClose={() => setSelectedBook(null)} />}
    </div>
  );
}

function LibraryPage({ books, onSelect, onNavigate }) {
  const [query, setQuery] = useState('');
  const visibleBooks = useMemo(
    () =>
      books.filter((book) =>
        `${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [books, query],
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
      {visibleBooks.length ? (
        <div className="book-grid">
          {visibleBooks.map((book) => (
            <button
              className="book-tile"
              type="button"
              key={book.id}
              onClick={() => onSelect(book)}
            >
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
    </section>
  );
}

function AddPage({ onSave }) {
  const [form, setForm] = useState({ title: '', author: '', isbn: '' });
  const submit = (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: form.title.trim(),
      author: form.author.trim(),
      isbn: form.isbn.trim(),
      status: 'unread',
      read: false,
      progress: 0,
      rating: 0,
      tags: [],
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
          <input
            inputMode="numeric"
            value={form.isbn}
            onChange={(event) => setForm({ ...form, isbn: event.target.value })}
          />
        </label>
        <button type="submit">Kitabı kaydet</button>
      </form>
    </section>
  );
}

function StatsPage({ books }) {
  const read = books.filter((book) => book.read || book.status === 'read').length;
  const reading = books.filter((book) => book.status === 'reading').length;
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

function ProfilePage() {
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const save = (event) => {
    event.preventDefault();
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  };
  return (
    <section className="react-page narrow-page">
      <p className="eyebrow">KİŞİSEL ALAN</p>
      <h2>Profilim</h2>
      <form className="react-form" onSubmit={save}>
        <label>
          Görünen ad
          <input
            value={profile.displayName || ''}
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
        <button type="submit">Profili kaydet</button>
      </form>
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

function BookDetail({ book, onClose }) {
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
        {coverFor(book) && (
          <img className="detail-cover" src={coverFor(book)} alt={`${book.title} kapak`} />
        )}
        <p className="eyebrow">KİTAP AYRINTISI</p>
        <h2>{book.title}</h2>
        <p className="detail-author">{book.author || 'Yazar bilinmiyor'}</p>
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
        </dl>
      </section>
    </div>
  );
}

export default App;
