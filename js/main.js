import { supabaseClient, activeUser, setActiveUser, getUserStorageKey } from './core/config.js';
import { showToast } from './ui/toast.js';
import { fetchBookMetadata, findDuplicateBook } from './features/isbn.js';
import { addQuote, renderQuotes } from './features/quotes.js';
import { loadBooks, saveBooks, createBook, fetchAllBooksFromServer, syncBooksToServer, flushPendingSync, setupRealtimeSubscription } from './core/storage.js';
import { initTheme, setupStarRating, getStarRatingValue, render, showBookDetail, hideBookDetail, openCoverModal, closeCoverModal, closeEditModal, saveEditedBook } from './ui/ui.js';

let appInitialized = false;
let deferredInstallPrompt = null;

function setupPwaUi() {
  const installButton = document.getElementById('pwa-install');
  const connectionStatus = document.getElementById('connection-status');
  
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installButton) installButton.classList.remove('hidden');
  });

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installButton.classList.add('hidden');
    });
  }

  const updateConnectionStatus = () => {
    if (connectionStatus) {
      connectionStatus.textContent = navigator.onLine ? 'Çevrimiçi' : 'Çevrimdışı';
      connectionStatus.classList.toggle('offline', !navigator.onLine);
    }
  };

  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('online', async () => {
    try {
      await flushPendingSync();
      render();
      showToast('Bağlantı sağlandı. Veriler eşitlendi.', 'success');
    } catch (error) {
      showToast('Bağlantı sağlandı ancak bekleyen veriler eşitlenemedi.', 'error');
    }
  });
  window.addEventListener('offline', updateConnectionStatus);
  updateConnectionStatus();
}

function showLookupError(isbn, message) {
  const modal = document.getElementById('lookup-error-modal');
  document.getElementById('lookup-error-message').textContent = message || 'Kitap bilgisi alınamadı.';
  document.getElementById('lookup-error-isbn').textContent = isbn || 'Okunamadı';
  modal.classList.remove('hidden');
}

export function showAuthErrorModal(errorMessage) {
  const modal = document.getElementById('auth-error-modal');
  const messageEl = document.getElementById('auth-error-message');
  const suggestionEl = document.getElementById('auth-error-suggestion');
  if (!modal || !messageEl || !suggestionEl) return;

  const msg = String(errorMessage || 'Bilinmeyen bir oturum hatası oluştu.');
  messageEl.textContent = msg;

  let suggestion = '💡 <strong>Çözüm Önerisi:</strong><br/>';

  const lowerMsg = msg.toLowerCase();
  if (lowerMsg.includes('invalid login credentials')) {
    suggestion += 'Girdiğiniz e-posta veya şifre eşleşmiyor.<br/>• Henüz bu e-posta adresiyle kayıt olmadıysanız <strong>"Hesap oluştur"</strong> butonuna basabilirsiniz.<br/>• Şifrenizi doğru girdiğinizden emin olun.';
  } else if (lowerMsg.includes('email not confirmed')) {
    suggestion += 'E-posta adresiniz henüz doğrulanmamış.<br/>• Gelen kutunuzdaki onay bağlantısına tıklayın.<br/>• Veya Supabase panelinde (Auth ➔ Email) <strong>Confirm Email</strong> seçeneğini kapatın.';
  } else if (lowerMsg.includes('api key') || lowerMsg.includes('jwt') || lowerMsg.includes('secret api key')) {
    suggestion += 'Supabase API Anahtarı geçersiz.<br/>• <strong>supabase-config.js</strong> dosyasındaki <code>window.SUPABASE_ANON_KEY</code> değerini kontrol edin.';
  } else {
    suggestion += 'İnternet bağlantınızı ve giriş bilgilerinizi kontrol edip tekrar deneyiniz.';
  }

  suggestionEl.innerHTML = suggestion;
  modal.classList.remove('hidden');
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
  const shelf = document.getElementById('shelf');
  let scannerLoopToken = 0;

  // Star Rating for Main Book Form
  setupStarRating('form-rating-widget', 0);

  function setScannerVisible(isVisible) {
    scannerModal.classList.toggle('hidden', !isVisible);
    scannerModal.style.display = isVisible ? 'flex' : 'none';
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
    if (scannerVideo && scannerVideo.srcObject) {
      scannerVideo.srcObject.getTracks().forEach((track) => track.stop());
      scannerVideo.srcObject = null;
    }
    setScannerVisible(false);
  }

  setScannerVisible(false);
  setMode(new URLSearchParams(window.location.search).get('mode') === 'manual' ? 'manual' : 'isbn');

  modeManual.addEventListener('click', () => setMode('manual'));
  modeIsbn.addEventListener('click', () => setMode('isbn'));
  document.getElementById('back-to-library').addEventListener('click', hideBookDetail);
  document.getElementById('close-edit-modal').addEventListener('click', closeEditModal);
  document.getElementById('edit-form').addEventListener('submit', saveEditedBook);
  document.getElementById('edit-progress').addEventListener('input', (event) => {
    document.getElementById('edit-progress-value').value = `${event.target.value}%`;
  });

  const coverModal = document.getElementById('cover-modal');
  document.getElementById('close-cover-modal').addEventListener('click', closeCoverModal);
  coverModal.addEventListener('click', (event) => {
    if (event.target === coverModal) closeCoverModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeCoverModal();
      closeEditModal();
      const quoteModal = document.getElementById('quote-modal');
      if (quoteModal) quoteModal.classList.add('hidden');
    }
  });

  document.getElementById('close-lookup-error').addEventListener('click', () => lookupErrorModal.classList.add('hidden'));
  lookupErrorModal.addEventListener('click', (event) => {
    if (event.target === lookupErrorModal) lookupErrorModal.classList.add('hidden');
  });

  async function saveFetchedBook(book) {
    const books = loadBooks();
    const duplicate = findDuplicateBook(book, books);
    if (duplicate) {
      showToast(`Bu kitap zaten kütüphanede kayıtlı ("${duplicate.title}").`, 'error');
      return false;
    }

    const ratingVal = getStarRatingValue('form-rating-widget');

    books.unshift(createBook({
      ...book,
      read: readingStatus.value === 'read',
      status: readingStatus.value,
      progress: Number(progress.value),
      rating: ratingVal,
      review: document.getElementById('review').value.trim(),
      notes: document.getElementById('notes').value.trim(),
      shelf: shelf.value,
      startDate: document.getElementById('start-date').value,
      finishDate: document.getElementById('finish-date').value
    }));
    saveBooks(books);
    await syncBooksToServer(books);
    render();
    showToast('Kitap ISBN ile kütüphaneye eklendi.', 'success');
    return true;
  }

  document.getElementById('lookup-book').addEventListener('click', async () => {
    try {
      showToast('ISBN bilgisi alınıyor...', 'info');
      const result = await fetchBookMetadata(isbnInput.value);
      applyBookToForm(result);
      await saveFetchedBook(result);
    } catch (error) {
      showToast(error.message, 'error');
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
    showToast(`${source} algılandı. Bilgi getiriliyor...`, 'info');
    stopScanner();
    const book = await fetchBookMetadata(cleaned);
    await saveFetchedBook(book);
  }

  async function openScanner() {
    setMode('isbn');
    setScannerVisible(true);
    showToast('Kamera açılıyor...', 'info');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Bu tarayıcı kamera erişimini desteklemiyor.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      scannerVideo.srcObject = stream;
      await scannerVideo.play();

      if (!scanPrintedIsbn.checked && 'BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
        const token = ++scannerLoopToken;
        const scanFrame = async () => {
          if (token !== scannerLoopToken || scannerModal.classList.contains('hidden')) return;
          try {
            const barcodes = await detector.detect(scannerVideo);
            for (const barcode of barcodes) {
              const code = barcode.rawValue;
              if (!code) continue;
              const cleaned = String(code).replace(/[^0-9Xx]/g, '');
              if (!cleaned) continue;
              handleScannedIsbn(cleaned, 'Barkod').catch((error) => {
                showToast(error.message, 'error');
                showLookupError(cleaned, error.message);
              });
              return;
            }
          } catch (error) {}
          requestAnimationFrame(scanFrame);
        };
        scanFrame();
        return;
      }

      if (scanPrintedIsbn.checked) return;

      if (!window.Quagga) {
        showToast('Barkod tarayıcı yüklenmedi. ISBN alanını yazabilirsiniz.', 'error');
        setScannerVisible(false);
        return;
      }

      window.Quagga.init({
        inputStream: { name: 'Live', type: 'LiveStream', target: scannerVideo, constraints: { facingMode: 'environment' } },
        decoder: { readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'code_128_reader'] },
        locate: true
      }, function (err) {
        if (err) {
          showToast('Barkod tarayıcısı başlatılamadı.', 'error');
          stopScanner();
          return;
        }
        window.Quagga.onDetected((result) => {
          const code = result.codeResult && result.codeResult.code;
          if (!code) return;
          const cleaned = String(code).replace(/[^0-9Xx]/g, '');
          if (!cleaned) return;
          handleScannedIsbn(cleaned, 'Barkod').catch((error) => {
            showToast(error.message, 'error');
            showLookupError(cleaned, error.message);
          });
        });
        window.Quagga.start();
      });
    } catch (error) {
      showToast('Kamera erişimi yok.', 'error');
      stopScanner();
    }
  }

  readPrintedIsbn.addEventListener('click', async () => {
    if (!scannerVideo.videoWidth || !scannerVideo.videoHeight) {
      showToast('Kamera görüntüsü hazır değil. Birkaç saniye bekleyin.', 'error');
      return;
    }

    if (!window.Tesseract) {
      showToast('Yazı okuma kütüphanesi yüklenemedi.', 'error');
      return;
    }

    readPrintedIsbn.disabled = true;
    showToast('Yazılı ISBN okunuyor...', 'info');

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
        showToast('Yazılı ISBN bulunamadı. Numarayı daha yakından gösterin.', 'error');
        return;
      }

      await handleScannedIsbn(isbn, 'Yazılı ISBN');
    } catch (error) {
      showToast('Yazılı ISBN okunamadı.', 'error');
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
    if (!scanBarcode.checked && !scanPrintedIsbn.checked) scanBarcode.checked = true;
  });

  document.getElementById('scan-camera').addEventListener('click', openScanner);
  closeScanner.addEventListener('click', stopScanner);
  scannerModal.addEventListener('click', (event) => {
    if (event.target === scannerModal) stopScanner();
  });

  // Main Book Form Submit
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
        showToast('ISBN üzerinden bilgi alınıyor...', 'info');
        const result = await fetchBookMetadata(isbnInput.value);
        title = result.title;
        author = result.author;
        year = result.year;
        isbn = result.isbn;
        tags = result.tags;
        metadata = result.metadata;
      } catch (error) {
        showToast(error.message, 'error');
        return;
      }
    }

    if (!title) {
      showToast('Başlık alanı zorunludur.', 'error');
      return;
    }

    const books = loadBooks();
    const duplicate = findDuplicateBook({ title, author, isbn }, books);
    if (duplicate) {
      showToast(`Bu kitap zaten kütüphanede kayıtlı ("${duplicate.title}").`, 'error');
      return;
    }

    const ratingVal = getStarRatingValue('form-rating-widget');

    books.unshift(createBook({
      title,
      author,
      year,
      tags,
      read: readingStatus.value === 'read',
      status: readingStatus.value,
      progress: Number(progress.value),
      rating: ratingVal,
      review: document.getElementById('review').value.trim(),
      notes: document.getElementById('notes').value.trim(),
      shelf: shelf.value,
      startDate: document.getElementById('start-date').value,
      finishDate: document.getElementById('finish-date').value,
      isbn,
      metadata
    }));

    saveBooks(books);
    await syncBooksToServer(books);
    form.reset();
    setupStarRating('form-rating-widget', 0);
    showToast('Kitap başarıyla kaydedildi.', 'success');
    render();
  });

  // Filters & Search event listeners
  document.getElementById('search').addEventListener('input', render);
  document.getElementById('filter').addEventListener('change', render);
  document.getElementById('status-filter').addEventListener('change', render);
  document.getElementById('rating-filter').addEventListener('change', render);
  document.getElementById('shelf-filter').addEventListener('change', render);
  progress.addEventListener('input', () => { progressValue.value = `${progress.value}%`; });
  readingStatus.addEventListener('change', () => {
    if (readingStatus.value === 'read') progress.value = 100;
    progressValue.value = `${progress.value}%`;
  });

  // Quote Form & Modal logic
  const openQuoteModalBtn = document.getElementById('open-quote-modal');
  const quoteModal = document.getElementById('quote-modal');
  const closeQuoteModalBtn = document.getElementById('close-quote-modal');
  const quoteForm = document.getElementById('quote-form');

  if (openQuoteModalBtn && quoteModal) {
    openQuoteModalBtn.addEventListener('click', () => {
      // Populate book titles in select dropdown
      const bookSelect = document.getElementById('quote-book-select');
      if (bookSelect) {
        const books = loadBooks();
        bookSelect.innerHTML = '<option value="">Kitap seçin (veya elle yazın)</option>' +
          books.map((b) => `<option value="${escapeHtml(b.title)}">${escapeHtml(b.title)} (${escapeHtml(b.author)})</option>`).join('');
      }
      quoteModal.classList.remove('hidden');
    });
  }

  if (closeQuoteModalBtn && quoteModal) {
    closeQuoteModalBtn.addEventListener('click', () => quoteModal.classList.add('hidden'));
  }

  if (quoteForm) {
    quoteForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const selectVal = document.getElementById('quote-book-select').value;
      const customVal = document.getElementById('quote-book-title').value.trim();
      const bookTitle = customVal || selectVal;
      const author = document.getElementById('quote-author').value.trim();
      const text = document.getElementById('quote-text').value.trim();
      const pageNumber = document.getElementById('quote-page').value.trim();

      const added = addQuote({ bookTitle, author, text, pageNumber });
      if (added) {
        quoteForm.reset();
        if (quoteModal) quoteModal.classList.add('hidden');
      }
    });
  }

  document.getElementById('quote-search')?.addEventListener('input', renderQuotes);

  // Backup & Import
  document.getElementById('export').addEventListener('click', () => {
    const books = loadBooks();
    const blob = new Blob([JSON.stringify(books, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kitaplar-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`JSON dışa aktarıldı. ${books.length} kitap bulundu.`, 'success');
  });

  document.getElementById('backup').addEventListener('click', () => {
    const books = loadBooks();
    const blob = new Blob([JSON.stringify({ version: 1, createdAt: new Date().toISOString(), books }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kitap-kutuphanesi-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Yedek alındı. ${books.length} kitap kaydedildi.`, 'success');
  });

  document.getElementById('save-db').addEventListener('click', () => {
    const books = loadBooks();
    const blob = new Blob([JSON.stringify(books, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'db.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast(`db.json indirildi. ${books.length} kitap kaydedildi.`, 'success');
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
      const newBooks = incoming.map(createBook).filter((book) => !existingIds.has(book.id));
      const merged = [...newBooks, ...existing];
      saveBooks(merged);
      await syncBooksToServer(merged);
      render();
      showToast(`${newBooks.length} yeni kitap içe aktarıldı.`, 'success');
    } catch (error) {
      showToast('İçe aktarma sırasında hata oluştu: ' + error.message, 'error');
    } finally {
      event.target.value = '';
    }
  });

  document.getElementById('clear').addEventListener('click', async () => {
    if (!confirm('Tüm kitapları silmek istediğinize emin misiniz?')) return;
    localStorage.removeItem(getUserStorageKey());
    await syncBooksToServer([], { allowDelete: true });
    render();
    showToast('Tüm kitap kayıtları silindi.', 'info');
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
  const quotesSection = document.getElementById('quotes-section');
  const list = document.getElementById('list');
  const detail = document.getElementById('book-detail');

  const setPage = (page) => {
    controls.classList.toggle('page-hidden', page === 'stats' || page === 'quotes');
    modeSwitch.classList.toggle('page-hidden', page !== 'add');
    bookForm.classList.toggle('page-hidden', page !== 'add');
    filters.classList.toggle('page-hidden', page !== 'library');
    stats.classList.toggle('page-hidden', page !== 'stats');
    if (quotesSection) quotesSection.classList.toggle('page-hidden', page !== 'quotes');
    list.classList.toggle('page-hidden', page !== 'library');
    detail.classList.add('page-hidden');

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
  setPage(['add', 'stats', 'quotes'].includes(initialPage) ? initialPage : 'library');

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

  const guestBtn = document.getElementById('auth-guest');

  const showApp = async (session = null) => {
    setActiveUser(session ? session.user : null);
    authGate.style.display = 'none';
    app.style.display = 'block';

    // 1. Initialize DOM events & render local cache instantly (0ms lag)
    if (!appInitialized) {
      setup();
      appInitialized = true;
    } else {
      render();
    }

    // 2. Perform server sync & setup Realtime in background
    if (session && supabaseClient) {
      try {
        await flushPendingSync();
        const books = await fetchAllBooksFromServer();
        saveBooks(books);
        render();
        setupRealtimeSubscription(() => {
          render();
        });
      } catch (err) {
        console.warn('Background sync error:', err);
      }
    }
  };


  // 1. Attach Form Event Listeners IMMEDIATELY so clicks are never blocked
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabaseClient) {
      showToast('Supabase ayarları tanımlanmamış. Yerel modda girebilirsiniz.', 'error');
      return;
    }
    authStatus.textContent = 'Giriş yapılıyor...';
    authStatus.style.color = 'var(--muted)';
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: document.getElementById('auth-email').value.trim(),
        password: document.getElementById('auth-password').value
      });
      if (error) {
        authStatus.textContent = 'Giriş Hatası: ' + error.message;
        authStatus.style.color = 'var(--danger)';
        showToast('Giriş Yapılamadı: ' + error.message, 'error');
        showAuthErrorModal(error.message);
      } else {
        authStatus.textContent = '';
        showToast('Başarıyla giriş yapıldı.', 'success');
        if (data && data.session) {
          await showApp(data.session);
        }
      }
    } catch (err) {
      authStatus.textContent = 'Giriş Hatası: ' + err.message;
      authStatus.style.color = 'var(--danger)';
      showToast('Giriş Yapılamadı: ' + err.message, 'error');
      showAuthErrorModal(err.message);
    }
  });

  registerButton.addEventListener('click', async () => {
    if (!supabaseClient) {
      showToast('Supabase ayarları tanımlanmamış.', 'error');
      return;
    }
    authStatus.textContent = 'Hesap oluşturuluyor...';
    authStatus.style.color = 'var(--muted)';
    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email: document.getElementById('auth-email').value.trim(),
        password: document.getElementById('auth-password').value
      });
      if (error) {
        authStatus.textContent = 'Kayıt Hatası: ' + error.message;
        authStatus.style.color = 'var(--danger)';
        showToast('Kayıt Başarısız: ' + error.message, 'error');
        showAuthErrorModal(error.message);
      } else {
        const msg = data.session ? 'Hesabınız oluşturuldu ve giriş yapıldı.' : 'Hesabınız oluşturuldu. Lütfen e-postanızı doğrulayın, ardından giriş yapın.';
        authStatus.textContent = msg;
        authStatus.style.color = 'var(--primary)';
        showToast(msg, 'info');
        if (data.session) {
          await showApp(data.session);
        }
      }
    } catch (err) {
      authStatus.textContent = 'Kayıt Hatası: ' + err.message;
      authStatus.style.color = 'var(--danger)';
      showToast('Kayıt Başarısız: ' + err.message, 'error');
      showAuthErrorModal(err.message);
    }
  });

  const authErrorModal = document.getElementById('auth-error-modal');
  document.getElementById('close-auth-error')?.addEventListener('click', () => {
    authErrorModal?.classList.add('hidden');
  });
  authErrorModal?.addEventListener('click', (event) => {
    if (event.target === authErrorModal) authErrorModal.classList.add('hidden');
  });

  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      showToast('Yerel (çevrimdışı) modda giriş yapıldı.', 'info');
      showApp(null);
    });
  }

  document.getElementById('auth-logout')?.addEventListener('click', () => {
    supabaseClient?.auth.signOut();
    setActiveUser(null);
    app.style.display = 'none';
    authGate.style.display = 'flex';
    showToast('Çıkış yapıldı.', 'info');
  });


  // 2. Check Existing Supabase Session Safely
  if (supabaseClient) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) await showApp(session);

      supabaseClient.auth.onAuthStateChange(async (_event, nextSession) => {
        if (nextSession) {
          await showApp(nextSession);
        } else {
          setActiveUser(null);
          app.style.display = 'none';
          authGate.style.display = 'flex';
        }
      });
    } catch (sessionErr) {
      console.warn('Supabase session check error:', sessionErr);
    }
  } else {
    authStatus.textContent = 'Supabase istemcisi bağlanamadı. Dilerseniz Yerel Modda kullanabilirsiniz.';
  }
}


function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ES6 modules are automatically deferred, so the DOM is already ready
// when this code executes. No need for DOMContentLoaded which may have
// already fired, causing a silent failure where no listeners attach.
initTheme();
setupPwaUi();
initializeApp();

