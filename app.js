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
  const coverId = Array.isArray(metadata.covers) ? metadata.covers[0] : '';
  const description = typeof metadata.description === 'object' ? metadata.description.value : metadata.description;
  const publisher = Array.isArray(metadata.publishers) ? metadata.publishers.join(', ') : '';
  const subjects = Array.isArray(metadata.subjects) ? metadata.subjects.join(', ') : '';

  controls.classList.add('hidden');
  list.classList.add('hidden');
  detail.classList.remove('hidden');
  content.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'book-detail-content';

  if (coverId) {
    const cover = document.createElement('img');
    cover.className = 'book-cover';
    cover.src = `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-L.jpg`;
    cover.alt = `${book.title} kapak görseli`;
    cover.loading = 'lazy';
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
  const authorEntries = Array.isArray(data.authors) ? data.authors : [];
  const authorNames = await Promise.all(authorEntries.map(async (author) => {
    if (author.name) return author.name;
    const authorKey = author.key || (author.author && author.author.key);
    if (!authorKey) return '';

    try {
      const authorResponse = await fetch(`https://openlibrary.org${authorKey}.json`);
      if (!authorResponse.ok) return '';
      const authorData = await authorResponse.json();
      return authorData.name || authorData.personal_name || '';
    } catch (error) {
      return '';
    }
  }));
  const authors = authorNames.filter(Boolean).join(', ');
  const publishDate = data.publish_date || '';
  const year = publishDate ? publishDate.split(' ')[0] || '' : '';
  const metadata = {
    ...data,
    resolved_authors: authorNames.filter(Boolean)
  };

  return {
    title,
    author: authors,
    year,
    isbn,
    tags: ['isbn', 'otomatik'],
    metadata
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
  const readPrintedIsbn = document.getElementById('read-printed-isbn');
  const scanBarcode = document.getElementById('scan-barcode');
  const scanPrintedIsbn = document.getElementById('scan-printed-isbn');
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
  setMode('isbn');

  modeManual.addEventListener('click', () => setMode('manual'));
  modeIsbn.addEventListener('click', () => setMode('isbn'));
  document.getElementById('back-to-library').addEventListener('click', hideBookDetail);

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
        setStatus('Yazılı ISBN bulunamadı. Numarayı daha yakından ve aydınlıkta gösterin.', true);
        return;
      }

      await handleScannedIsbn(isbn, 'Yazılı ISBN');
    } catch (error) {
      setStatus('Yazılı ISBN okunamadı. Numarayı elle yazabilirsiniz.', true);
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

  document.getElementById('clear').addEventListener('click', () => {
    if (!confirm('Tüm kitapları silmek istediğinize emin misiniz?')) return;
    localStorage.removeItem(STORAGE_KEY);
    render();
    setStatus('Tüm kitap kayıtları silindi.');
  });

  render();
}

document.addEventListener('DOMContentLoaded', setup);
