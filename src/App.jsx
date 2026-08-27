import { useMemo, useState } from 'react';

const navigation = [
  { id: 'feed', label: 'Akış' },
  { id: 'library', label: 'Kitaplığım' },
  { id: 'add', label: 'Kitap ekle' },
  { id: 'stats', label: 'İstatistikler' },
  { id: 'profile', label: 'Profilim' }
];

function readBooks() {
  try {
    const stored = localStorage.getItem('book_library_books');
    const books = stored ? JSON.parse(stored) : [];
    return Array.isArray(books) ? books : [];
  } catch {
    return [];
  }
}

function App() {
  const [page, setPage] = useState('library');
  const books = useMemo(readBooks, []);
  const readCount = books.filter((book) => book.read || book.status === 'read').length;
  const readingCount = books.filter((book) => book.status === 'reading').length;

  return (
    <div className="react-shell">
      <header className="react-header">
        <div>
          <p className="eyebrow">REACT GEÇİŞİ · ÖNİZLEME</p>
          <h1>Kitap Kütüphanem</h1>
          <p className="intro">Yeni arayüz, mevcut verilerinle birlikte çalışıyor.</p>
        </div>
        <span className="status-badge">React altyapısı hazır</span>
      </header>

      <nav className="react-nav" aria-label="React önizleme gezinme">
        {navigation.map((item) => (
          <button className={page === item.id ? 'active' : ''} key={item.id} type="button" onClick={() => setPage(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      <main>
        <section className="react-hero">
          <div>
            <p className="eyebrow">{navigation.find((item) => item.id === page)?.label}</p>
            <h2>{page === 'library' ? 'Koleksiyonuna tek bakışta hakim ol.' : 'Bu bölüm React bileşenine dönüşmeye hazır.'}</h2>
            <p>Bu ilk adım, mevcut uygulamayı bozmadan bileşen tabanlı yapıya geçiş için oluşturuldu.</p>
          </div>
          <div className="react-stats" aria-label="Kitap özeti">
            <div><strong>{books.length}</strong><span>toplam kitap</span></div>
            <div><strong>{readCount}</strong><span>okundu</span></div>
            <div><strong>{readingCount}</strong><span>okunuyor</span></div>
          </div>
        </section>

        {page === 'library' ? (
          <section className="book-preview-section">
            <div className="section-heading"><h2>Mevcut kitapların</h2><span>{books.length} kayıt</span></div>
            {books.length ? (
              <div className="book-grid">
                {books.slice(0, 12).map((book) => <article className="book-tile" key={book.id}><strong>{book.title || 'Başlıksız'}</strong><span>{book.author || 'Yazar bilinmiyor'}</span></article>)}
              </div>
            ) : <p className="empty-state">Henüz yerel kitap kaydı bulunmuyor.</p>}
          </section>
        ) : (
          <section className="migration-note"><strong>{navigation.find((item) => item.id === page)?.label} bileşeni</strong><p>Sonraki adımda bu ekran, mevcut vanilla işlevleri korunarak React bileşenlerine taşınacak.</p></section>
        )}
      </main>
    </div>
  );
}

export default App;
