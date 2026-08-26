const STORAGE_KEY = 'book_library_books';
const DB_FILE_NAME = 'db.json';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeBook(rawBook) {
  return {
    id: rawBook.id || uid(),
    title: rawBook.title || 'Başlıksız',
    author: rawBook.author || '',
    year: rawBook.year || '',
    tags: Array.isArray(rawBook.tags) ? rawBook.tags : [],
    read: !!rawBook.read,
    isbn: rawBook.isbn || '',
    createdAt: rawBook.createdAt || Date.now()
  };
}

function loadBooks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalizeBook) : [];
  } catch (error) {
    console.error('Veri okunurken hata oluştu:', error);
    return [];
  }
}

function saveBooks(books) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function createBook({ title, author, year, tags, read, isbn }) {
  return normalizeBook({
    id: uid(),
    title: title || 'Başlıksız',
    author: author || '',
    year: year || '',
    tags: Array.isArray(tags) ? tags : [],
    read: !!read,
    isbn: isbn || '',
    createdAt: Date.now()
  });
}

function setStatus(message, isError = false) {
  const status = document.getElementById('status');
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? '#b91c1c' : '#475569';
}

async function fetchAllBooksFromServer() {
  try {
    const response = await fetch('/.netlify/functions/books');
    if (!response.ok) throw new Error('Sunucudan veri alınamadı');
    const data = await response.json();
    return Array.isArray(data) ? data.map(normalizeBook) : [];
  } catch (error) {
    return loadBooks();
  }
}

async function syncBooksToServer(books) {
  try {
    const response = await fetch('/.netlify/functions/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(books)
    });
    if (!response.ok) throw new Error('Sunucu kaydı başarısız');
    const data = await response.json();
    return data;
  } catch (error) {
    saveBooks(books);
    return { fallback: true };
  }
}

function render() {
  const list = document.getElementById('list');
  const books = loadBooks();
  const query = document.getElementById('search').value.trim().toLowerCase();
  const filter = document.getElementById('filter').value;

  const visible = books.filter((book) => {
    if (filter === 'read' && !book.read) return false;
    if (filter === 'unread' && book.read) return false;
    if (!query) return true;

    const haystack = `${book.title || ''} ${book.author || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  if (visible.length === 0) {
    list.innerHTML = '<p class="muted">Henüz kitap eklenmemiş.</p>';
    return;
  }

  list.innerHTML = '';

  visible.forEach((book) => {
    const card = document.createElement('div');
    card.className = 'card';

    const meta = document.createElement('div');
    meta.className = 'meta';

    const titleEl = document.createElement('div');
    titleEl.className = 'title';
    titleEl.textContent = book.title;

    const detailsEl = document.createElement('div');
    detailsEl.className = 'muted';
    const detailParts = [book.author || 'Yazar bilinmiyor', book.year || '', book.isbn ? `ISBN: ${book.isbn}` : ''];
    detailsEl.textContent = detailParts.filter(Boolean).join(' • ');

    const tagsEl = document.createElement('div');
    tagsEl.className = 'tags';
    tagsEl.textContent = (book.tags || []).join(', ') || 'Etiket yok';

    meta.appendChild(titleEl);
    meta.appendChild(detailsEl);
    meta.appendChild(tagsEl);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'small';
    toggleBtn.textContent = book.read ? 'Okundu' : 'Okunmadı';
    toggleBtn.addEventListener('click', async () => {
      const updatedBooks = loadBooks().map((item) => item.id === book.id ? { ...item, read: !item.read } : item);
      saveBooks(updatedBooks);
      await syncBooksToServer(updatedBooks);
      render();
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'small secondary';
    editBtn.textContent = 'Düzenle';
    editBtn.addEventListener('click', async () => {
      const nextTitle = prompt('Başlık', book.title);
      if (nextTitle === null) return;

      const nextAuthor = prompt('Yazar', book.author);
      if (nextAuthor === null) return;

      const nextYear = prompt('Yıl', book.year);
      if (nextYear === null) return;

      const nextTags = prompt('Etiketler (virgülle ayrılmış)', (book.tags || []).join(', '));
      if (nextTags === null) return;

      const updatedBooks = loadBooks().map((item) => {
        if (item.id !== book.id) return item;
        return {
          ...item,
          title: nextTitle.trim() || 'Başlıksız',
          author: nextAuthor.trim(),
          year: nextYear.trim(),
          tags: nextTags.split(',').map((part) => part.trim()).filter(Boolean)
        };
      });

      saveBooks(updatedBooks);
      await syncBooksToServer(updatedBooks);
      render();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'small danger';
    deleteBtn.textContent = 'Sil';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Bu kitabı silmek istediğinize emin misiniz?')) return;
      const updatedBooks = loadBooks().filter((item) => item.id !== book.id);
      saveBooks(updatedBooks);
      await syncBooksToServer(updatedBooks);
      render();
    });

    actions.appendChild(toggleBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(meta);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

async function fetchBookMetadata(isbnInput) {
  const cleaned = isbnInput.trim();
  if (!cleaned) {
    throw new Error('ISBN veya barkod girin.');
  }

  const isbn = cleaned.replace(/[^0-9Xx]/g, '');
  if (!isbn) {
    throw new Error('Geçerli bir ISBN / barkod bulunamadı.');
  }

  const url = `https://openlibrary.org/isbn/${isbn}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Bu ISBN için kitap bilgisi bulunamadı.');
  }

  const data = await response.json();
  const title = data.title || 'Başlıksız';
  const authors = Array.isArray(data.authors) ? data.authors.map((a) => a.name || '').filter(Boolean).join(', ') : '';
  const publishDate = data.publish_date || '';
  const year = publishDate ? publishDate.split(' ')[0] || '' : '';

  return {
    title,
    author: authors,
    year,
    isbn,
    tags: ['isbn', 'otomatik']
  };
}

function saveDbFile() {
  const books = loadBooks();
  const blob = new Blob([JSON.stringify(books, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = DB_FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
  setStatus(`db.json hazır. Toplam ${books.length} kitap kaydedildi.`);
}

function setup() {
  const form = document.getElementById('book-form');
  const manualFields = document.getElementById('manual-fields');
  const isbnFields = document.getElementById('isbn-fields');
  const modeManual = document.getElementById('mode-manual');
  const modeIsbn = document.getElementById('mode-isbn');
  const isbnInput = document.getElementById('isbn-input');
  const scannerModal = document.getElementById('scanner-modal');
  const closeScanner = document.getElementById('close-scanner');
  const scannerVideo = document.getElementById('scanner-video');
  let scannerLoopToken = 0;

  function setMode(mode) {
    const isManual = mode === 'manual';
    modeManual.classList.toggle('active', isManual);
    modeManual.classList.toggle('secondary', !isManual);
    modeIsbn.classList.toggle('active', !isManual);
    modeIsbn.classList.toggle('secondary', isManual);
    manualFields.classList.toggle('hidden', !isManual);
    isbnFields.classList.toggle('hidden', isManual);
  }

  function stopScanner() {
    scannerLoopToken += 1;
    if (window.Quagga) {
      try { window.Quagga.stop(); } catch (error) {}
    }
    if (scannerVideo.srcObject) {
      scannerVideo.srcObject.getTracks().forEach((track) => track.stop());
      scannerVideo.srcObject = null;
    }
    scannerModal.classList.add('hidden');
  }

  scannerModal.classList.add('hidden');
  setMode('manual');

  modeManual.addEventListener('click', () => setMode('manual'));
  modeIsbn.addEventListener('click', () => setMode('isbn'));

  document.getElementById('lookup-book').addEventListener('click', async () => {
    try {
      setStatus('ISBN bilgisi alınıyor...');
      const result = await fetchBookMetadata(isbnInput.value);
      document.getElementById('title').value = result.title;
      document.getElementById('author').value = result.author;
      document.getElementById('year').value = result.year;
      document.getElementById('tags').value = result.tags.join(', ');
      setStatus('Kitap bilgisi hazır. Kaydet butonuna basabilirsiniz.');
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  async function openScanner() {
    setMode('isbn');
    scannerModal.classList.remove('hidden');
    setStatus('Kamera açılıyor...');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Bu tarayıcı kamera erişimini desteklemiyor.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      scannerVideo.srcObject = stream;
      await scannerVideo.play();
      setStatus('Kamera açıldı. Barkodu tarayın.');

      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']
        });

        const token = ++scannerLoopToken;
        const scanFrame = async () => {
          if (token !== scannerLoopToken || scannerModal.classList.contains('hidden')) {
            return;
          }

          try {
            const barcodes = await detector.detect(scannerVideo);
            for (const barcode of barcodes) {
              const code = barcode.rawValue;
              if (!code) continue;
              const cleaned = String(code).replace(/[^0-9Xx]/g, '');
              if (!cleaned) continue;
              isbnInput.value = cleaned;
              setStatus('Barkod algılandı. Bilgi getiriliyor...');
              stopScanner();
              fetchBookMetadata(cleaned)
                .then((book) => {
                  document.getElementById('title').value = book.title;
                  document.getElementById('author').value = book.author;
                  document.getElementById('year').value = book.year;
                  document.getElementById('tags').value = book.tags.join(', ');
                  setStatus('Barkod bilgisi hazır. Kaydet butonuna basabilirsiniz.');
                })
                .catch((error) => {
                  setStatus(error.message, true);
                });
              return;
            }
          } catch (error) {
            // Kamera görünümünü kapatmadan bir sonraki kareye devam et.
          }

          requestAnimationFrame(scanFrame);
        };

        scanFrame();
        return;
      }

      if (!window.Quagga) {
        setStatus('Barkod tarayıcı yüklenmedi. ISBN alanını manuel yazabilirsiniz.', true);
        return;
      }

      window.Quagga.init({
        inputStream: {
          name: 'Live',
          type: 'LiveStream',
          target: scannerVideo,
          constraints: { facingMode: 'environment' }
        },
        decoder: {
          readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'code_128_reader']
        },
        locate: true
      }, function (err) {
        if (err) {
          setStatus('Barkod tarayıcısı başlatılamadı.', true);
          stopScanner();
          return;
        }

        window.Quagga.onDetected((result) => {
          const code = result.codeResult && result.codeResult.code;
          if (!code) return;

          const cleaned = String(code).replace(/[^0-9Xx]/g, '');
          if (!cleaned) return;

          isbnInput.value = cleaned;
          setStatus('Barkod algılandı. Bilgi getiriliyor...');
          stopScanner();

          fetchBookMetadata(cleaned)
            .then((book) => {
              document.getElementById('title').value = book.title;
              document.getElementById('author').value = book.author;
              document.getElementById('year').value = book.year;
              document.getElementById('tags').value = book.tags.join(', ');
              setStatus('Barkod bilgisi hazır. Kaydet butonuna basabilirsiniz.');
            })
            .catch((error) => {
              setStatus(error.message, true);
            });
        });

        window.Quagga.start();
      });
    } catch (error) {
      setStatus('Kamera erişimi yok. ISBN manuel olarak yazabilirsiniz.', true);
      stopScanner();
    }
  }

  document.getElementById('scan-camera').addEventListener('click', openScanner);
  closeScanner.addEventListener('click', () => {
    stopScanner();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const mode = document.querySelector('.mode.active')?.id === 'mode-isbn' ? 'isbn' : 'manual';
    let title = document.getElementById('title').value.trim();
    let author = document.getElementById('author').value.trim();
    let year = document.getElementById('year').value.trim();
    let tags = document.getElementById('tags').value.split(',').map((tag) => tag.trim()).filter(Boolean);
    let isbn = '';

    if (mode === 'isbn') {
      try {
        setStatus('ISBN üzerinden bilgi alınıyor...');
        const result = await fetchBookMetadata(isbnInput.value);
        title = result.title;
        author = result.author;
        year = result.year;
        isbn = result.isbn;
        tags = result.tags;
        document.getElementById('title').value = title;
        document.getElementById('author').value = author;
        document.getElementById('year').value = year;
        document.getElementById('tags').value = tags.join(', ');
      } catch (error) {
        setStatus(error.message, true);
        return;
      }
    }

    if (!title) {
      setStatus('Başlık alanı zorunludur.', true);
      return;
    }

    const books = loadBooks();
    books.unshift(createBook({
      title,
      author,
      year,
      tags,
      read: document.getElementById('read').checked,
      isbn
    }));
    saveBooks(books);
    await syncBooksToServer(books);
    form.reset();
    setStatus('Kitap başarıyla kaydedildi.');
    render();
  });

  document.getElementById('search').addEventListener('input', render);
  document.getElementById('filter').addEventListener('change', render);

  document.getElementById('export').addEventListener('click', () => {
    const books = loadBooks();
    const blob = new Blob([JSON.stringify(books, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kitaplar-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`JSON dışa aktarıldı. ${books.length} kitap bulundu.`);
  });

  document.getElementById('save-db').addEventListener('click', saveDbFile);

  document.getElementById('import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const incoming = JSON.parse(text);
      if (!Array.isArray(incoming)) throw new Error('Geçersiz JSON formatı.');

      const existing = loadBooks();
      const existingIds = new Set(existing.map((book) => book.id));
      const newBooks = incoming
        .map((book) => normalizeBook(book))
        .filter((book) => !existingIds.has(book.id));

      const merged = [...newBooks, ...existing];
      saveBooks(merged);
      await syncBooksToServer(merged);
      render();
      setStatus(`${newBooks.length} yeni kitap içe aktarıldı.`);
    } catch (error) {
      setStatus('İçe aktarma sırasında hata oluştu: ' + error.message, true);
    } finally {
      event.target.value = '';
    }
  });

  document.getElementById('clear').addEventListener('click', () => {
    if (!confirm('Tüm kitapları silmek istediğinize emin misiniz?')) return;
    localStorage.removeItem(STORAGE_KEY);
    render();
    setStatus('Tüm kitap kayıtları silindi.');
  });

  render();
}

document.addEventListener('DOMContentLoaded', setup);
