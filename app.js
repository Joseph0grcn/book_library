const STORAGE_KEY = 'book_library_books';
const DB_FILE_NAME = 'db.json';
const supabaseClient = window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !window.SUPABASE_URL.includes('YOUR_')
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;
let activeUser = null;
let appInitialized = false;
let deferredInstallPrompt = null;

function setupPwaUi() {
  const installButton = document.getElementById('pwa-install');
  const connectionStatus = document.getElementById('connection-status');
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.classList.remove('hidden');
  });
  installButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.classList.add('hidden');
  });
  const updateConnectionStatus = () => {
    connectionStatus.textContent = navigator.onLine ? 'Çevrimiçi' : 'Çevrimdışı';
    connectionStatus.classList.toggle('offline', !navigator.onLine);
  };
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  updateConnectionStatus();
}

function userStorageKey() {
  return activeUser ? `${STORAGE_KEY}_${activeUser.id}` : STORAGE_KEY;
}

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
    status: rawBook.status || (rawBook.read ? 'read' : 'unread'),
    progress: Number.isFinite(Number(rawBook.progress)) ? Number(rawBook.progress) : (rawBook.read ? 100 : 0),
    rating: Number.isFinite(Number(rawBook.rating)) ? Number(rawBook.rating) : 0,
    review: rawBook.review || '',
    notes: rawBook.notes || '',
    isbn: rawBook.isbn || '',
    metadata: rawBook.metadata && typeof rawBook.metadata === 'object' ? rawBook.metadata : {},
    createdAt: rawBook.createdAt || Date.now()
  };
}

function loadBooks() {
  try {
    const raw = localStorage.getItem(userStorageKey());
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalizeBook) : [];
  } catch (error) {
    console.error('Veri okunurken hata oluştu:', error);
    return [];
  }
}

function saveBooks(books) {
  localStorage.setItem(userStorageKey(), JSON.stringify(books));
}

function createBook({ title, author, year, tags, read, status, progress, rating, review, notes, isbn, metadata }) {
  return normalizeBook({
    id: uid(),
    title: title || 'Başlıksız',
    author: author || '',
    year: year || '',
    tags: Array.isArray(tags) ? tags : [],
    read: !!read,
    status: status || (read ? 'read' : 'unread'),
    progress: progress || 0,
    rating: rating || 0,
    review: review || '',
    notes: notes || '',
    isbn: isbn || '',
    metadata: metadata || {},
    createdAt: Date.now()
  });
}

function setStatus(message, isError = false) {
  const status = document.getElementById('status');
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? '#b91c1c' : '#475569';
}

function showLookupError(isbn, message) {
  const modal = document.getElementById('lookup-error-modal');
  document.getElementById('lookup-error-message').textContent = message || 'Kitap bilgisi alınamadı.';
  document.getElementById('lookup-error-isbn').textContent = isbn || 'Okunamadı';
  modal.classList.remove('hidden');
}

async function fetchAllBooksFromServer() {
  if (supabaseClient && activeUser) {
    const { data, error } = await supabaseClient.from('books').select('*').eq('user_id', activeUser.id).order('created_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      return data.map((book) => normalizeBook({ ...book, createdAt: book.created_at }));
    }
  }
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
      isbn: book.isbn,
      metadata: book.metadata,
      created_at: new Date(book.createdAt).toISOString()
    }));
    const { data, error } = await supabaseClient.from('books').upsert(rows).select();
    if (!error) {
      const ids = books.map((book) => book.id);
      if (ids.length) {
        await supabaseClient.from('books').delete().eq('user_id', activeUser.id).not('id', 'in', `(${ids.join(',')})`);
      } else {
        await supabaseClient.from('books').delete().eq('user_id', activeUser.id);
      }
      return data;
    }
    saveBooks(books);
    return { fallback: true };
  }
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
  const bookCount = document.getElementById('book-count');
  if (bookCount) bookCount.textContent = books.length;
  const statReading = document.getElementById('stat-reading');
  const statRead = document.getElementById('stat-read');
  const statProgress = document.getElementById('stat-progress');
  if (statReading) statReading.textContent = books.filter((book) => book.status === 'reading').length;
  if (statRead) statRead.textContent = books.filter((book) => book.status === 'read').length;
  if (statProgress) statProgress.textContent = books.length ? `${Math.round(books.reduce((sum, book) => sum + book.progress, 0) / books.length)}%` : '0%';
  const query = document.getElementById('search').value.trim().toLowerCase();
  const filter = document.getElementById('filter').value;
  const statusFilter = document.getElementById('status-filter').value;
  const ratingFilter = document.getElementById('rating-filter').value;

  const visible = books.filter((book) => {
    if (filter === 'read' && !book.read) return false;
    if (filter === 'unread' && book.read) return false;
    if (statusFilter !== 'all' && book.status !== statusFilter) return false;
    if (ratingFilter !== 'all' && book.rating < Number(ratingFilter)) return false;
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
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => showBookDetail(book));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showBookDetail(book);
      }
    });

    const meta = document.createElement('div');
    meta.className = 'meta';

    const titleEl = document.createElement('div');
    titleEl.className = 'title';
    titleEl.textContent = book.title;

    const detailsEl = document.createElement('div');
    detailsEl.className = 'muted';
    const metadata = book.metadata || {};
    const publisher = Array.isArray(metadata.publishers) ? metadata.publishers.join(', ') : '';
    const pageCount = metadata.number_of_pages || '';
    const detailParts = [
      book.author || 'Yazar bilinmiyor',
      book.year || '',
      publisher,
      pageCount ? `${pageCount} sayfa` : '',
      book.isbn ? `ISBN: ${book.isbn}` : ''
    ];
    detailsEl.textContent = detailParts.filter(Boolean).join(' • ');

    const tagsEl = document.createElement('div');
    tagsEl.className = 'tags';
    tagsEl.textContent = (book.tags || []).join(', ') || 'Etiket yok';

    meta.appendChild(titleEl);
    meta.appendChild(detailsEl);
    meta.appendChild(tagsEl);

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.addEventListener('click', (event) => event.stopPropagation());

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'small';
    toggleBtn.textContent = book.read ? 'Okundu' : 'Okunmadı';
    toggleBtn.addEventListener('click', async () => {
      const nextRead = !book.read;
      const updatedBooks = loadBooks().map((item) => item.id === book.id ? { ...item, read: nextRead, status: nextRead ? 'read' : 'unread', progress: nextRead ? 100 : item.progress } : item);
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

function showBookDetail(book) {
  const controls = document.querySelector('.controls');
  const list = document.getElementById('list');
  const detail = document.getElementById('book-detail');
  const content = document.getElementById('book-detail-content');
  const metadata = book.metadata || {};
  const coverUrl = getBookCoverUrl(book);
  const description = typeof metadata.description === 'object' ? metadata.description.value : metadata.description;
  const publisher = Array.isArray(metadata.publishers) ? metadata.publishers.join(', ') : '';
  const subjects = Array.isArray(metadata.subjects) ? metadata.subjects.join(', ') : '';

  controls.classList.add('hidden');
  list.classList.add('hidden');
  detail.classList.remove('hidden');
  content.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'book-detail-content';

  if (coverUrl) {
    const cover = document.createElement('img');
    cover.className = 'book-cover';
    cover.src = coverUrl;
    cover.alt = `${book.title} kapak görseli`;
    cover.loading = 'lazy';
    cover.referrerPolicy = 'no-referrer';
    cover.title = 'Büyütmek için tıklayın';
    cover.addEventListener('click', () => openCoverModal(coverUrl, book.title));
    cover.addEventListener('error', () => {
      cover.remove();
    }, { once: true });
    layout.appendChild(cover);
  }

  const summary = document.createElement('div');
  const heading = document.createElement('h2');
  heading.textContent = book.title;
  summary.appendChild(heading);

  const fields = [
    ['Yazar', book.author || 'Yazar bilinmiyor'],
    ['ISBN', book.isbn],
    ['Okuma durumu', book.status === 'reading' ? 'Okunuyor' : book.status === 'read' ? 'Okundu' : 'Okunacak'],
    ['İlerleme', `${book.progress}%`],
    ['Puan', book.rating ? `${book.rating} / 5` : 'Puan verilmedi'],
    ['Yayın tarihi', metadata.publish_date],
    ['Yayınevi', publisher],
    ['Sayfa sayısı', metadata.number_of_pages],
    ['Format', metadata.physical_format],
    ['Konular', subjects]
  ].filter((field) => field[1]);
  const details = document.createElement('dl');
  fields.forEach(([label, value]) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const descriptionEl = document.createElement('dd');
    descriptionEl.textContent = value;
    details.append(term, descriptionEl);
  });
  summary.appendChild(details);

  if (description) {
    const descriptionHeading = document.createElement('h3');
    descriptionHeading.textContent = 'Açıklama';
    const descriptionEl = document.createElement('p');
    descriptionEl.className = 'book-description';
    descriptionEl.textContent = description;
    summary.append(descriptionHeading, descriptionEl);
  }
  if (book.review || book.notes) {
    const personalHeading = document.createElement('h3');
    personalHeading.textContent = 'Kişisel notlar';
    const personal = document.createElement('p');
    personal.className = 'book-description';
    personal.textContent = [book.review ? `Yorum: ${book.review}` : '', book.notes ? `Notlar: ${book.notes}` : ''].filter(Boolean).join('\n\n');
    summary.append(personalHeading, personal);
  }
  layout.appendChild(summary);
  content.appendChild(layout);

  const metadataHeading = document.createElement('h3');
  metadataHeading.textContent = 'Kitap bilgileri';
  content.appendChild(metadataHeading);

  const metadataGrid = document.createElement('div');
  metadataGrid.className = 'metadata-grid';
  Object.entries(metadata).forEach(([key, value]) => {
    if (key === 'description' || value === null || value === undefined || value === '') return;
    const field = document.createElement('div');
    field.className = 'metadata-field';
    const label = document.createElement('strong');
    label.textContent = metadataLabel(key);
    const valueEl = document.createElement('span');
    valueEl.textContent = formatMetadataValue(value);
    field.append(label, valueEl);
    metadataGrid.appendChild(field);
  });
  content.appendChild(metadataGrid);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openCoverModal(coverUrl, title) {
  const modal = document.getElementById('cover-modal');
  const image = document.getElementById('large-cover');
  document.getElementById('cover-modal-title').textContent = title;
  image.src = coverUrl;
  image.alt = `${title} büyük kapak görseli`;
  modal.classList.remove('hidden');
}

function closeCoverModal() {
  const modal = document.getElementById('cover-modal');
  document.getElementById('large-cover').removeAttribute('src');
  modal.classList.add('hidden');
}

function getBookCoverUrl(book) {
  const metadata = book.metadata || {};
  const googleCoverUrls = metadata.imageLinks && [
    metadata.imageLinks.extraLarge,
    metadata.imageLinks.large,
    metadata.imageLinks.medium,
    metadata.imageLinks.thumbnail,
    metadata.imageLinks.smallThumbnail
  ].filter(Boolean).map((url) => url.replace(/^http:/, 'https:'));

  if (metadata.source_api === 'Google Books' && googleCoverUrls.length) {
    return googleCoverUrls[0];
  }

  const coverId = Array.isArray(metadata.covers) ? metadata.covers[0] : '';
  if (coverId) return `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-L.jpg`;
  if (googleCoverUrls && googleCoverUrls.length) return googleCoverUrls[0];
  return '';
}

function metadataLabel(key) {
  const labels = {
    title: 'Başlık',
    subtitle: 'Alt başlık',
    authors: 'Yazar kayıtları',
    resolved_authors: 'Yazarlar',
    publish_date: 'Yayın tarihi',
    publishers: 'Yayınevleri',
    number_of_pages: 'Sayfa sayısı',
    physical_format: 'Fiziksel format',
    physical_dimensions: 'Fiziksel boyutlar',
    weight: 'Ağırlık',
    languages: 'Diller',
    subjects: 'Konular',
    covers: 'Kapak kimlikleri',
    works: 'Eser kayıtları',
    identifiers: 'Diğer kimlikler',
    classifications: 'Sınıflandırmalar',
    first_sentence: 'İlk cümle',
    notes: 'Notlar',
    links: 'Bağlantılar',
    ebooks: 'E-kitap bilgileri'
  };
  return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMetadataValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => formatMetadataValue(item)).filter(Boolean).join(', ');
  }
  if (value && typeof value === 'object') {
    if (value.value) return formatMetadataValue(value.value);
    if (value.name) return formatMetadataValue(value.name);
    if (value.title) return formatMetadataValue(value.title);
    if (value.key) return formatMetadataValue(value.key);
    return Object.entries(value)
      .map(([key, item]) => `${metadataLabel(key)}: ${formatMetadataValue(item)}`)
      .filter(Boolean)
      .join(' • ');
  }
  return String(value);
}

function hideBookDetail() {
  document.querySelector('.controls').classList.remove('hidden');
  document.getElementById('list').classList.remove('hidden');
  document.getElementById('book-detail').classList.add('hidden');
}

async function fetchGoogleBooksMetadata(isbn) {
  const apiKey = window.GOOGLE_BOOKS_API_KEY && !window.GOOGLE_BOOKS_API_KEY.includes('YOUR_')
    ? `&key=${encodeURIComponent(window.GOOGLE_BOOKS_API_KEY)}`
    : '';
  const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=10${apiKey}`);
  if (!response.ok) return null;
  const result = await response.json();
  const item = Array.isArray(result.items) ? result.items[0] : null;
  if (!item) return null;

  const data = item.volumeInfo || {};
  const identifiers = Array.isArray(data.industryIdentifiers) ? data.industryIdentifiers : [];
  const matchedIsbn = identifiers.find((identifier) => identifier.identifier.replace(/[^0-9Xx]/g, '') === isbn);
  return {
    title: data.title || 'Başlıksız',
    author: Array.isArray(data.authors) ? data.authors.join(', ') : '',
    year: data.publishedDate ? data.publishedDate.slice(0, 4) : '',
    isbn: matchedIsbn ? matchedIsbn.identifier : isbn,
    tags: ['isbn', 'google-books', ...(Array.isArray(data.categories) ? data.categories : [])],
    metadata: { ...data, google_volume_id: item.id, source_api: 'Google Books', lookup_isbn: isbn, lookup_at: new Date().toISOString() }
  };
}

async function fetchOpenLibraryMetadata(isbn) {
  const response = await fetch(`https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&fields=*&limit=1`);
  if (!response.ok) return null;
  const result = await response.json();
  const data = Array.isArray(result.docs) ? result.docs[0] : null;
  if (!data) return null;

  const authors = Array.isArray(data.author_name) ? data.author_name.join(', ') : '';
  return {
    title: data.title || 'Başlıksız',
    author: authors,
    year: data.first_publish_year ? String(data.first_publish_year) : '',
    isbn,
    tags: ['isbn', 'open-library', ...(Array.isArray(data.subject) ? data.subject.slice(0, 8) : [])],
    metadata: { ...data, source_api: 'Open Library Search', lookup_isbn: isbn, lookup_at: new Date().toISOString() }
  };
}

async function fetchBookMetadata(isbnInput) {
  const cleaned = isbnInput.trim();
  if (!cleaned) throw new Error('ISBN veya barkod girin.');

  const isbn = cleaned.replace(/[^0-9Xx]/g, '');
  if (!isbn) throw new Error('Geçerli bir ISBN / barkod bulunamadı.');

  const googleBook = await fetchGoogleBooksMetadata(isbn);
  if (googleBook) return googleBook;

  const openLibraryBook = await fetchOpenLibraryMetadata(isbn);
  if (!openLibraryBook) throw new Error('Bu ISBN için kitap bilgisi bulunamadı.');

  return openLibraryBook;
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
  const readPrintedIsbn = document.getElementById('read-printed-isbn');
  const scanBarcode = document.getElementById('scan-barcode');
  const scanPrintedIsbn = document.getElementById('scan-printed-isbn');
  const lookupErrorModal = document.getElementById('lookup-error-modal');
  const readingStatus = document.getElementById('reading-status');
  const progress = document.getElementById('progress');
  const progressValue = document.getElementById('progress-value');
  let scannerLoopToken = 0;

  function setScannerVisible(isVisible) {
    scannerModal.classList.toggle('hidden', !isVisible);
    scannerModal.setAttribute('aria-hidden', String(!isVisible));
    scannerModal.hidden = !isVisible;
    if (isVisible) {
      scannerModal.style.display = 'flex';
    } else {
      scannerModal.style.display = 'none';
    }
  }

  function setMode(mode) {
    const isManual = mode === 'manual';
    modeManual.classList.toggle('active', isManual);
    modeManual.classList.toggle('secondary', !isManual);
    modeIsbn.classList.toggle('active', !isManual);
    modeIsbn.classList.toggle('secondary', isManual);
    manualFields.classList.toggle('hidden', !isManual);
    isbnFields.classList.toggle('hidden', isManual);
    document.getElementById('save-book').classList.toggle('hidden', !isManual);
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
    setScannerVisible(false);
    setStatus('');
  }

  setScannerVisible(false);
  setMode(new URLSearchParams(window.location.search).get('mode') === 'manual' ? 'manual' : 'isbn');

  modeManual.addEventListener('click', () => setMode('manual'));
  modeIsbn.addEventListener('click', () => setMode('isbn'));
  document.getElementById('back-to-library').addEventListener('click', hideBookDetail);
  const coverModal = document.getElementById('cover-modal');
  document.getElementById('close-cover-modal').addEventListener('click', closeCoverModal);
  coverModal.addEventListener('click', (event) => {
    if (event.target === coverModal) closeCoverModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCoverModal();
  });
  document.getElementById('close-lookup-error').addEventListener('click', () => lookupErrorModal.classList.add('hidden'));
  lookupErrorModal.addEventListener('click', (event) => {
    if (event.target === lookupErrorModal) lookupErrorModal.classList.add('hidden');
  });

  async function saveFetchedBook(book) {
    const books = loadBooks();
    if (books.some((item) => item.isbn === book.isbn)) {
      setStatus('Bu ISBN zaten kütüphanede kayıtlı.');
      return false;
    }
    books.unshift(createBook({
      ...book,
      read: readingStatus.value === 'read',
      status: readingStatus.value,
      progress: Number(progress.value),
      rating: Number(document.getElementById('rating').value),
      review: document.getElementById('review').value.trim(),
      notes: document.getElementById('notes').value.trim()
    }));
    saveBooks(books);
    await syncBooksToServer(books);
    render();
    return true;
  }

  document.getElementById('lookup-book').addEventListener('click', async () => {
    try {
      setStatus('ISBN bilgisi alınıyor...');
      const result = await fetchBookMetadata(isbnInput.value);
      applyBookToForm(result);
      const saved = await saveFetchedBook(result);
      setStatus(saved ? 'Kitap ISBN ile kütüphaneye eklendi.' : 'Bu ISBN zaten kütüphanede kayıtlı.');
    } catch (error) {
      setStatus(error.message, true);
      showLookupError(isbnInput.value.replace(/[^0-9Xx]/g, ''), error.message);
    }
  });

  function applyBookToForm(book) {
    isbnInput.value = book.isbn;
    document.getElementById('title').value = book.title;
    document.getElementById('author').value = book.author;
    document.getElementById('year').value = book.year;
    document.getElementById('tags').value = book.tags.join(', ');
  }

  async function handleScannedIsbn(cleaned, source) {
    isbnInput.value = cleaned;
    setStatus(`${source} algılandı. Bilgi getiriliyor...`);
    stopScanner();
    const book = await fetchBookMetadata(cleaned);
    const saved = await saveFetchedBook(book);
    setStatus(saved ? `${source} ile kitap kütüphaneye eklendi.` : 'Bu ISBN zaten kütüphanede kayıtlı.');
  }

  async function openScanner() {
    setMode('isbn');
    setScannerVisible(true);
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
      setStatus(scanPrintedIsbn.checked ? 'Kamera açıldı. Yazılı ISBN için düğmeye basın.' : 'Kamera açıldı. Barkodu tarayın.');

      if (!scanPrintedIsbn.checked && 'BarcodeDetector' in window) {
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
              handleScannedIsbn(cleaned, 'Barkod')
                .catch((error) => {
                  setStatus(error.message, true);
                  showLookupError(cleaned, error.message);
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

      if (scanPrintedIsbn.checked) return;

      if (!window.Quagga) {
        setStatus('Barkod tarayıcı yüklenmedi. ISBN alanını manuel yazabilirsiniz.', true);
        setScannerVisible(false);
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

          handleScannedIsbn(cleaned, 'Barkod')
            .catch((error) => {
              setStatus(error.message, true);
              showLookupError(cleaned, error.message);
            });
        });

        window.Quagga.start();
      });
    } catch (error) {
      setStatus('Kamera erişimi yok. ISBN manuel olarak yazabilirsiniz.', true);
      stopScanner();
    }
  }

  readPrintedIsbn.addEventListener('click', async () => {
    if (!scannerVideo.videoWidth || !scannerVideo.videoHeight) {
      setStatus('Kamera görüntüsü hazır değil. Birkaç saniye bekleyin.', true);
      return;
    }

    if (!window.Tesseract) {
      setStatus('Yazı okuma kütüphanesi yüklenemedi. ISBN numarasını elle yazabilirsiniz.', true);
      return;
    }

    readPrintedIsbn.disabled = true;
    setStatus('Yazılı ISBN okunuyor...');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = scannerVideo.videoWidth;
      canvas.height = scannerVideo.videoHeight;
      canvas.getContext('2d').drawImage(scannerVideo, 0, 0, canvas.width, canvas.height);

      const result = await window.Tesseract.recognize(canvas, 'eng');
      const text = result.data.text.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
      const candidates = text.match(/(?:97[89][\s-]?)?[0-9Xx](?:[\s-]?[0-9Xx]){8,16}/g) || [];
      const isbn = candidates
        .map((candidate) => candidate.replace(/[^0-9Xx]/g, ''))
        .find((candidate) => candidate.length === 10 || candidate.length === 13);

      if (!isbn) {
        const recognizedText = text.trim().replace(/\s+/g, ' ').slice(0, 80);
        const message = 'Yazılı ISBN bulunamadı. Numarayı daha yakından ve aydınlıkta gösterin.';
        setStatus(message, true);
        showLookupError(recognizedText, message);
        return;
      }

      await handleScannedIsbn(isbn, 'Yazılı ISBN');
    } catch (error) {
      const message = 'Yazılı ISBN okunamadı. Numarayı elle yazabilirsiniz.';
      setStatus(message, true);
      showLookupError(isbnInput.value, message);
    } finally {
      readPrintedIsbn.disabled = false;
    }
  });

  scanBarcode.addEventListener('change', () => {
    if (scanBarcode.checked) scanPrintedIsbn.checked = false;
    if (!scanBarcode.checked && !scanPrintedIsbn.checked) scanBarcode.checked = true;
  });
  scanPrintedIsbn.addEventListener('change', () => {
    if (scanPrintedIsbn.checked) scanBarcode.checked = false;
    if (!scanBarcode.checked && !scanPrintedIsbn.checked) scanPrintedIsbn.checked = true;
  });

  document.getElementById('scan-camera').addEventListener('click', openScanner);
  closeScanner.addEventListener('click', () => {
    stopScanner();
  });
  scannerModal.addEventListener('click', (event) => {
    if (event.target === scannerModal) {
      stopScanner();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const mode = document.querySelector('.mode.active')?.id === 'mode-isbn' ? 'isbn' : 'manual';
    let title = document.getElementById('title').value.trim();
    let author = document.getElementById('author').value.trim();
    let year = document.getElementById('year').value.trim();
    let tags = document.getElementById('tags').value.split(',').map((tag) => tag.trim()).filter(Boolean);
    let isbn = '';
    let metadata = {};

    if (mode === 'isbn') {
      try {
        setStatus('ISBN üzerinden bilgi alınıyor...');
        const result = await fetchBookMetadata(isbnInput.value);
        title = result.title;
        author = result.author;
        year = result.year;
        isbn = result.isbn;
        tags = result.tags;
        metadata = result.metadata;
        document.getElementById('title').value = title;
        document.getElementById('author').value = author;
        document.getElementById('year').value = year;
        document.getElementById('tags').value = tags.join(', ');
      } catch (error) {
        setStatus(error.message, true);
        showLookupError(isbnInput.value.replace(/[^0-9Xx]/g, ''), error.message);
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
      read: readingStatus.value === 'read',
      status: readingStatus.value,
      progress: Number(progress.value),
      rating: Number(document.getElementById('rating').value),
      review: document.getElementById('review').value.trim(),
      notes: document.getElementById('notes').value.trim(),
      isbn,
      metadata
    }));
    saveBooks(books);
    await syncBooksToServer(books);
    form.reset();
    setStatus('Kitap başarıyla kaydedildi.');
    render();
  });

  document.getElementById('search').addEventListener('input', render);
  document.getElementById('filter').addEventListener('change', render);
  document.getElementById('status-filter').addEventListener('change', render);
  document.getElementById('rating-filter').addEventListener('change', render);
  progress.addEventListener('input', () => { progressValue.value = `${progress.value}%`; });
  readingStatus.addEventListener('change', () => {
    if (readingStatus.value === 'read') progress.value = 100;
    progressValue.value = `${progress.value}%`;
  });

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
  document.getElementById('backup').addEventListener('click', () => {
    const books = loadBooks();
    const blob = new Blob([JSON.stringify({ version: 1, createdAt: new Date().toISOString(), books }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kitap-kutuphanesi-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`Yedek alındı. ${books.length} kitap kaydedildi.`);
  });

  document.getElementById('import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incoming = Array.isArray(parsed) ? parsed : parsed.books;
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

  document.getElementById('clear').addEventListener('click', async () => {
    if (!confirm('Tüm kitapları silmek istediğinize emin misiniz?')) return;
    localStorage.removeItem(userStorageKey());
    await syncBooksToServer([]);
    render();
    setStatus('Tüm kitap kayıtları silindi.');
  });

  render();
}

async function initializeApp() {
  const authGate = document.getElementById('auth-gate');
  const app = document.getElementById('app');
  const authStatus = document.getElementById('auth-status');
  const authForm = document.getElementById('auth-form');
  const registerButton = document.getElementById('auth-register');
  const controls = document.getElementById('library-controls');
  const bookForm = document.getElementById('book-form');
  const modeSwitch = document.querySelector('.mode-switch');
  const filters = document.querySelector('.filters');
  const filterMenu = document.getElementById('filter-menu');
  const filterMenuToggle = document.getElementById('filter-menu-toggle');
  const actionsMenu = document.getElementById('actions-menu');
  const actionsMenuToggle = document.getElementById('actions-menu-toggle');
  const stats = document.getElementById('dashboard-stats');
  const list = document.getElementById('list');

  const setPage = (page) => {
    controls.classList.toggle('page-hidden', page === 'stats');
    modeSwitch.classList.toggle('page-hidden', page !== 'add');
    bookForm.classList.toggle('page-hidden', page !== 'add');
    filters.classList.toggle('page-hidden', page !== 'library');
    stats.classList.toggle('page-hidden', page !== 'stats');
    list.classList.toggle('page-hidden', page !== 'library');
    document.querySelectorAll('[data-page]').forEach((item) => {
      item.classList.toggle('active', item.dataset.page === page);
    });
    if (page === 'add') document.getElementById('mode-isbn')?.click();
    window.history.replaceState(null, '', page === 'library' ? window.location.pathname : `#${page}`);
  };

  document.querySelectorAll('[data-page]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetPage = tab.dataset.page;
      if (targetPage === 'logout') {
        supabaseClient?.auth.signOut();
        return;
      }
      setPage(targetPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  const initialPage = window.location.hash.slice(1);
  setPage(['add', 'stats'].includes(initialPage) ? initialPage : 'library');

  const toggleMenu = (menu, toggle, event) => {
    event.stopPropagation();
    const otherMenu = menu === filterMenu ? actionsMenu : filterMenu;
    const otherToggle = toggle === filterMenuToggle ? actionsMenuToggle : filterMenuToggle;
    otherMenu.classList.remove('is-open');
    otherToggle.setAttribute('aria-expanded', 'false');
    const isOpen = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  };
  filterMenuToggle.addEventListener('click', (event) => toggleMenu(filterMenu, filterMenuToggle, event));
  actionsMenuToggle.addEventListener('click', (event) => toggleMenu(actionsMenu, actionsMenuToggle, event));
  filterMenu.addEventListener('click', (event) => event.stopPropagation());
  actionsMenu.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => {
    filterMenu.classList.remove('is-open');
    filterMenuToggle.setAttribute('aria-expanded', 'false');
    actionsMenu.classList.remove('is-open');
    actionsMenuToggle.setAttribute('aria-expanded', 'false');
  });

  if (!supabaseClient) {
    authStatus.textContent = 'Supabase ayarları yapılmamış. supabase-config.js dosyasını doldurun.';
    return;
  }

  const showApp = async (session) => {
    activeUser = session.user;
    authGate.style.display = 'none';
    app.style.display = 'block';
    const books = await fetchAllBooksFromServer();
    saveBooks(books);
    if (!appInitialized) {
      setup();
      appInitialized = true;
    } else {
      render();
    }
  };

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) await showApp(session);

  supabaseClient.auth.onAuthStateChange(async (_event, nextSession) => {
    if (nextSession) {
      await showApp(nextSession);
    } else {
      activeUser = null;
      app.style.display = 'none';
      authGate.style.display = 'flex';
    }
  });

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    authStatus.textContent = 'Giriş yapılıyor...';
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: document.getElementById('auth-email').value.trim(),
      password: document.getElementById('auth-password').value
    });
    authStatus.textContent = error ? error.message : '';
  });

  registerButton.addEventListener('click', async () => {
    authStatus.textContent = 'Hesap oluşturuluyor...';
    const { data, error } = await supabaseClient.auth.signUp({
      email: document.getElementById('auth-email').value.trim(),
      password: document.getElementById('auth-password').value
    });
    authStatus.textContent = error ? error.message : (data.session ? 'Hesabınız oluşturuldu.' : 'E-postanızı doğrulayın, ardından giriş yapın.');
  });

  document.getElementById('auth-logout').addEventListener('click', () => supabaseClient.auth.signOut());
}

document.addEventListener('DOMContentLoaded', () => {
  setupPwaUi();
  initializeApp();
});
