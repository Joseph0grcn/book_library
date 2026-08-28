import { supabaseClient, activeUser, setActiveUser, getUserStorageKey } from './core/config.js';
import { showToast } from './ui/toast.js';
import { fetchBookMetadata, findDuplicateBook, normalizeIsbn, getIsbnVariants } from './features/isbn.js';
import { addQuote, renderQuotes } from './features/quotes.js';
import { loadBooks, saveBooks, createBook, fetchAllBooksFromServer, syncBooksToServer, flushPendingSync, setupRealtimeSubscription, getSyncState, loadProfile, saveProfile, fetchProfileFromServer, syncProfileToServer, searchProfiles, fetchFriendships, fetchFriendProfile, sendFriendRequest, updateFriendship, removeFriendship, createFeedPost, fetchFeedPosts, toggleFeedLike, addFeedComment } from './core/storage.js';
import { initTheme, setupStarRating, getStarRatingValue, render, hideBookDetail, getBookCoverUrl, openCoverModal, closeCoverModal, closeEditModal, saveEditedBook } from './ui/ui.js';

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
      const syncState = getSyncState();
      const syncLabel = { syncing: 'Senkronize ediliyor', pending: 'Bekleyen senkron', error: 'Senkronizasyon hatası', local: 'Yerel mod', synced: 'Senkronize' }[syncState.status];
      connectionStatus.textContent = navigator.onLine ? (syncLabel || 'Çevrimiçi') : 'Çevrimdışı';
      connectionStatus.classList.toggle('offline', !navigator.onLine);
      connectionStatus.classList.toggle('sync-error', syncState.status === 'error');
    }
  };

  window.addEventListener('book-library:sync-status', updateConnectionStatus);
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('online', async () => {
    try {
      await flushPendingSync();
      render();
      showToast('Bağlantı sağlandı. Veriler eşitlendi.', 'success');
    } catch {
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

function getAuthRedirectUrl() {
  const configuredUrl = String(window.APP_URL || '').trim().replace(/\/+$/, '');
  return configuredUrl || window.location.origin;
}


function setup() {
  const form = document.getElementById('book-form');
  const manualFields = document.getElementById('manual-fields');
  const isbnFields = document.getElementById('isbn-fields');
  const modeManual = document.getElementById('mode-manual');
  const modeIsbn = document.getElementById('mode-isbn');
  const isbnInput = document.getElementById('isbn-input');
  const scannerModal = document.getElementById('scanner-modal');
  const scannerTitle = document.getElementById('scanner-title');
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
  const profileForm = document.getElementById('profile-form');
  const profileNameInput = document.getElementById('profile-name-input');
  const profileUsernameInput = document.getElementById('profile-username-input');
  const profileBioInput = document.getElementById('profile-bio-input');
  const profileLocationInput = document.getElementById('profile-location-input');
  const profileWebsiteInput = document.getElementById('profile-website-input');
  const profileAvatarInput = document.getElementById('profile-avatar-input');
  const profileCoverInput = document.getElementById('profile-cover-input');
  const profileAvatarImage = document.getElementById('profile-avatar-image');
  const profileAvatarFallback = document.getElementById('profile-avatar-fallback');
  const profileCoverImage = document.getElementById('profile-cover-image');
  const profileDisplayName = document.getElementById('profile-display-name');
  const profileUsername = document.getElementById('profile-username');
  const profileBio = document.getElementById('profile-bio');
  const profileLocation = document.getElementById('profile-location');
  const profileWebsite = document.getElementById('profile-website');
  const friendSearchForm = document.getElementById('friend-search-form');
  const friendSearchInput = document.getElementById('friend-search-input');
  const friendSearchResults = document.getElementById('friend-search-results');
  const incomingFriends = document.getElementById('incoming-friends');
  const friendsList = document.getElementById('friends-list');
  const friendsCount = document.getElementById('friends-count');
  const friendProfileSection = document.getElementById('friend-profile-section');
  const friendProfileBooksList = document.getElementById('friend-profile-books-list');
  const friendProfileBooksCount = document.getElementById('friend-profile-books-count');
  const friendProfileBooksTitle = document.getElementById('friend-profile-books-title');
  const incomingCount = document.getElementById('incoming-count');
  const outgoingCount = document.getElementById('outgoing-count');
  const shareInFeed = document.getElementById('share-in-feed');
  const shareCaption = document.getElementById('share-caption');
  const feedList = document.getElementById('feed-list');
  const refreshFeedButton = document.getElementById('refresh-feed');
  const quickAddBooks = document.getElementById('quick-add-books');
  const quickScanQueueEl = document.getElementById('quick-scan-queue');
  const quickScanCount = document.getElementById('quick-scan-count');
  const quickScanList = document.getElementById('quick-scan-list');
  const completeQuickScan = document.getElementById('complete-quick-scan');
  let scannerLoopToken = 0;
  let pendingFetchedBook = null;
  let quickScanMode = false;
  let quickScanQueue = [];
  let pendingQuickIsbns = [];
  let friendshipData = { friends: [], incoming: [], outgoing: [] };
  let feedPosts = [];
  let scannerBusy = false;

  // Star Rating for Main Book Form
  setupStarRating('form-rating-widget', 0);

  function setScannerVisible(isVisible) {
    scannerModal.classList.toggle('hidden', !isVisible);
    scannerModal.style.display = isVisible ? 'flex' : 'none';
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function renderProfile(profile = loadProfile()) {
    const displayName = profile.displayName || 'Profilim';
    profileNameInput.value = profile.displayName;
    profileUsernameInput.value = profile.username;
    profileBioInput.value = profile.bio;
    profileLocationInput.value = profile.location;
    profileWebsiteInput.value = profile.website;
    profileAvatarInput.value = profile.avatarUrl;
    profileCoverInput.value = profile.coverUrl;
    profileDisplayName.textContent = displayName;
    profileUsername.textContent = profile.username ? `@${profile.username}` : 'Profil bilgilerinizi düzenleyin';
    profileBio.textContent = profile.bio || 'Kendiniz hakkında birkaç satır ekleyin.';
    profileLocation.textContent = profile.location ? `⌖ ${profile.location}` : '';
    profileWebsite.textContent = profile.website ? `↗ ${profile.website.replace(/^https?:\/\//, '')}` : '';
    profileWebsite.title = profile.website || '';
    profileAvatarFallback.textContent = displayName.slice(0, 1).toUpperCase();
    const avatarUrl = safeUrl(profile.avatarUrl);
    profileAvatarImage.classList.toggle('hidden', !avatarUrl);
    profileAvatarFallback.classList.toggle('hidden', !!avatarUrl);
    if (avatarUrl) profileAvatarImage.src = avatarUrl;
    const coverUrl = safeUrl(profile.coverUrl);
    profileCoverImage.classList.toggle('hidden', !coverUrl);
    if (coverUrl) profileCoverImage.src = coverUrl;
  }

  function profileLabel(profile) {
    return profile.displayName || (profile.username ? `@${profile.username}` : 'Adsız kullanıcı');
  }

  function renderFriendItems(container, items, actionMarkup, emptyText) {
    if (!items.length) {
      container.innerHTML = `<p class="muted friend-empty">${emptyText}</p>`;
      return;
    }
    container.innerHTML = items.map((item) => {
      const profile = item.profile;
      const label = profileLabel(profile);
      const avatar = safeUrl(profile.avatarUrl);
      return `<div class="friend-item">
        <button type="button" class="friend-profile-link" data-friend-profile="${escapeHtml(profile.userId)}" aria-label="${escapeHtml(label)} profilini görüntüle"><span class="friend-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="" />` : escapeHtml(label.slice(0, 1).toUpperCase())}</span>
        <span class="friend-item-info"><strong>${escapeHtml(label)}</strong><span>${profile.username ? `@${escapeHtml(profile.username)}` : 'Profil bilgisi yok'}</span></span></button>
        <div class="friend-item-actions">${actionMarkup(item)}</div>
      </div>`;
    }).join('');
  }

  function renderFriendProfile(data) {
    const profile = data.profile;
    const label = profileLabel(profile);
    const avatarImage = document.getElementById('friend-profile-avatar-image');
    const avatarFallback = document.getElementById('friend-profile-avatar-fallback');
    const avatarUrl = safeUrl(profile.avatarUrl);
    avatarImage.classList.toggle('hidden', !avatarUrl);
    avatarFallback.classList.toggle('hidden', !!avatarUrl);
    avatarFallback.textContent = label.slice(0, 1).toUpperCase();
    if (avatarUrl) avatarImage.src = avatarUrl;
    const coverImage = document.getElementById('friend-profile-cover-image');
    const coverUrl = safeUrl(profile.coverUrl);
    coverImage.classList.toggle('hidden', !coverUrl);
    if (coverUrl) coverImage.src = coverUrl;
    document.getElementById('friend-profile-display-name').textContent = label;
    document.getElementById('friend-profile-username').textContent = profile.username ? `@${profile.username}` : '';
    document.getElementById('friend-profile-bio').textContent = profile.bio || 'Bu kullanıcı henüz hakkında bilgi eklememiş.';
    document.getElementById('friend-profile-location').textContent = profile.location ? `⌖ ${profile.location}` : '';
    document.getElementById('friend-profile-website').textContent = profile.website ? `↗ ${profile.website.replace(/^https?:\/\//, '')}` : '';
    friendProfileBooksCount.textContent = `${data.books.length} kitap`;
    friendProfileBooksTitle.textContent = `${label} adlı kişinin kütüphanesi`;
    friendProfileBooksList.innerHTML = data.books.length ? data.books.map((book) => {
      const cover = safeUrl(getBookCoverUrl(book));
      const status = book.status === 'read' ? 'Okundu' : book.status === 'reading' ? 'Okunuyor' : 'Okunacak';
      return `<article class="friend-book-item">${cover ? `<button type="button" class="friend-book-cover" data-friend-book-cover="${escapeHtml(cover)}" data-friend-book-title="${escapeHtml(book.title)}"><img src="${escapeHtml(cover)}" alt="${escapeHtml(book.title)} kapak görseli" loading="lazy" /></button>` : '<div class="friend-book-cover friend-book-cover-empty">Kitap</div>'}<div><h3>${escapeHtml(book.title)}</h3><p>${escapeHtml(book.author || 'Yazar bilinmiyor')}</p><span class="shelf-badge">${status}</span></div></article>`;
    }).join('') : '<p class="muted friend-empty">Bu kütüphanede henüz kitap yok.</p>';
  }

  async function openFriendProfile(userId) {
    friendProfileBooksList.innerHTML = '<p class="muted friend-empty">Profil ve kitaplık yükleniyor...</p>';
    window.dispatchEvent(new CustomEvent('book-library:navigate', { detail: { page: 'friend-profile' } }));
    try {
      renderFriendProfile(await fetchFriendProfile(userId));
    } catch (error) {
      friendProfileBooksList.innerHTML = `<p class="muted friend-empty">Profil yüklenemedi: ${escapeHtml(error.message)}</p>`;
      showToast('Arkadaş profili yüklenemedi: ' + error.message, 'error');
    }
  }

  function renderFriendships() {
    friendsCount.textContent = String(friendshipData.friends.length);
    incomingCount.textContent = String(friendshipData.incoming.length);
    outgoingCount.textContent = `${friendshipData.outgoing.length} bekliyor`;
    renderFriendItems(friendsList, friendshipData.friends, (item) => `<button type="button" class="small danger" data-friend-action="remove" data-friend-id="${escapeHtml(item.id)}">Çıkar</button>`, 'Henüz arkadaş eklemediniz.');
    renderFriendItems(incomingFriends, friendshipData.incoming, (item) => `<button type="button" class="small" data-friend-action="accept" data-friend-id="${escapeHtml(item.id)}">Kabul et</button><button type="button" class="small secondary" data-friend-action="decline" data-friend-id="${escapeHtml(item.id)}">Reddet</button>`, 'Bekleyen arkadaşlık isteği yok.');
  }

  async function refreshFriendships() {
    if (!supabaseClient || !activeUser) {
      friendshipData = { friends: [], incoming: [], outgoing: [] };
      renderFriendships();
      return;
    }
    try {
      friendshipData = await fetchFriendships();
      renderFriendships();
    } catch (error) {
      showToast('Arkadaş listesi yüklenemedi: ' + error.message, 'error');
    }
  }

  function renderFeed() {
    if (!feedPosts.length) {
      feedList.innerHTML = '<div class="feed-empty card-widget"><strong>Akış henüz boş</strong><span>Arkadaş ekleyip kitaplarını akışta paylaşmalarını bekleyin.</span></div>';
      return;
    }
    feedList.innerHTML = feedPosts.map((post) => {
      const profile = post.profile || {};
      const name = profileLabel(profile);
      const avatar = safeUrl(profile.avatarUrl);
      const cover = safeUrl(post.cover_url);
      const largeCover = safeUrl(post.cover_large_url || post.cover_url);
      const status = post.status === 'read' ? 'Okundu' : post.status === 'reading' ? 'Okunuyor' : 'Okunacak';
      const date = post.created_at ? new Date(post.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      const comments = (post.comments || []).map((comment) => `<li><strong>${escapeHtml(String(comment.user_id || '').slice(0, 8))}</strong><span>${escapeHtml(comment.body)}</span></li>`).join('');
      return `<article class="feed-post card-widget">
        <div class="feed-post-author"><div class="friend-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="" />` : escapeHtml(name.slice(0, 1).toUpperCase())}</div><div><strong>${escapeHtml(name)}</strong><span>${profile.username ? `@${escapeHtml(profile.username)} · ` : ''}${escapeHtml(date)}</span></div></div>
        <div class="feed-book">${cover ? `<button type="button" class="feed-book-cover feed-cover-button" data-feed-cover="${escapeHtml(largeCover)}" data-feed-title="${escapeHtml(post.title)}" title="Kapağı büyüt"><img src="${escapeHtml(cover)}" alt="${escapeHtml(post.title)} kapak görseli" loading="lazy" /></button>` : '<div class="feed-book-cover"><span>Kitap</span></div>'}<div class="feed-book-info"><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.author || 'Yazar bilinmiyor')}${post.year ? ` · ${escapeHtml(post.year)}` : ''}</p><span class="shelf-badge">${status}</span>${post.rating ? `<span class="feed-rating">★ ${post.rating}/5</span>` : ''}</div></div>
        ${post.caption ? `<p class="feed-caption">${escapeHtml(post.caption)}</p>` : ''}
        <div class="feed-actions"><button type="button" class="feed-like-button${post.likedByMe ? ' is-liked' : ''}" data-feed-like="${escapeHtml(post.id)}" data-liked="${post.likedByMe}">${post.likedByMe ? 'Beğenildi' : 'Beğen'} · ${post.likeCount || 0}</button><span>${post.comments?.length || 0} yorum</span></div>
        ${comments ? `<ul class="feed-comments">${comments}</ul>` : ''}
        <form class="feed-comment-form" data-feed-comment-form="${escapeHtml(post.id)}"><input name="comment" type="text" maxlength="500" placeholder="Yorum yaz..." aria-label="Yorum yaz" required /><button type="submit">Gönder</button></form>
      </article>`;
    }).join('');
    feedList.querySelectorAll('.feed-post-author').forEach((author, index) => {
      const post = feedPosts[index];
      author.dataset.feedProfile = post?.profile?.userId || post?.user_id || '';
      author.setAttribute('role', 'button');
      author.tabIndex = 0;
    });
  }

  async function refreshFeed() {
    if (!supabaseClient || !activeUser) {
      feedPosts = [];
      renderFeed();
      return;
    }
    refreshFeedButton.disabled = true;
    try {
      feedPosts = await fetchFeedPosts();
      renderFeed();
    } catch (error) {
      showToast('Akış yüklenemedi: ' + error.message, 'error');
    } finally {
      refreshFeedButton.disabled = false;
    }
  }

  function renderQuickScanQueue() {
    quickScanCount.textContent = String(quickScanQueue.length);
    quickScanList.innerHTML = quickScanQueue.length
      ? quickScanQueue.map((isbn) => `<button type="button" class="quick-scan-item" data-quick-isbn="${escapeHtml(isbn)}" title="ISBN'i listeden çıkar">${escapeHtml(isbn)}</button>`).join('')
      : '<span class="muted">Henüz ISBN okutulmadı.</span>';
  }

  function addQuickScannedIsbn(cleaned) {
    let isbn;
    try {
      isbn = normalizeIsbn(cleaned);
    } catch {
      return;
    }

    const isbnVariants = getIsbnVariants(isbn);
    const isDuplicate = quickScanQueue.some((queued) => {
      return [...getIsbnVariants(queued)].some((variant) => isbnVariants.has(variant));
    });
    if (isDuplicate) {
      return;
    }

    quickScanQueue.push(isbn);
    renderQuickScanQueue();
  }

  async function processNextQuickBook() {
    const isbn = pendingQuickIsbns.shift();
    if (!isbn) {
      setMode('isbn');
      showToast('Hızlı kitap ekleme tamamlandı.', 'success');
      return;
    }

    try {
      showToast(`Sıradaki kitap getiriliyor... (${pendingQuickIsbns.length + 1} kaldı)`, 'info');
      const book = await fetchBookMetadata(isbn);
      if (!prepareFetchedBook(book, 'Hızlı tarama')) await processNextQuickBook();
    } catch {
      showToast(`${isbn} için kitap bilgisi alınamadı. Sıradaki kitaba geçiliyor.`, 'error');
      await processNextQuickBook();
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
      try { window.Quagga.stop(); } catch {}
    }
    if (scannerVideo && scannerVideo.srcObject) {
      scannerVideo.srcObject.getTracks().forEach((track) => track.stop());
      scannerVideo.srcObject = null;
    }
    setScannerVisible(false);
  }

  setScannerVisible(false);
  renderProfile();
  renderFriendships();
  renderFeed();
  window.addEventListener('book-library:profile-updated', (event) => renderProfile(event.detail));
  window.addEventListener('book-library:friendships-refresh', refreshFriendships);
  window.addEventListener('book-library:feed-refresh', refreshFeed);
  setMode(new URLSearchParams(window.location.search).get('mode') === 'manual' ? 'manual' : 'isbn');

  modeManual.addEventListener('click', () => {
    pendingFetchedBook = null;
    setMode('manual');
  });
  modeIsbn.addEventListener('click', () => {
    pendingFetchedBook = null;
    setMode('isbn');
  });
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

  function prepareFetchedBook(book, source = 'ISBN') {
    const books = loadBooks();
    const duplicate = findDuplicateBook(book, books);
    if (duplicate) {
      showToast(`Bu kitap zaten kütüphanede kayıtlı ("${duplicate.title}").`, 'error');
      return false;
    }

    pendingFetchedBook = book;
    applyBookToForm(book);
    setMode('manual');
    showToast(`${source} bilgileri getirildi. Kontrol edip kaydedin.`, 'success');
    document.getElementById('title').focus();
    return true;
  }

  document.getElementById('lookup-book').addEventListener('click', async () => {
    try {
      showToast('ISBN bilgisi alınıyor...', 'info');
      const result = await fetchBookMetadata(isbnInput.value);
      prepareFetchedBook(result);
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
    if (quickScanMode) {
      addQuickScannedIsbn(cleaned);
      return;
    }
    if (scannerBusy) return;
    scannerBusy = true;
    showToast(`${source} algılandı. Bilgi getiriliyor...`, 'info');
    stopScanner();
    try {
      const book = await fetchBookMetadata(cleaned);
      prepareFetchedBook(book, source);
    } finally {
      scannerBusy = false;
    }
  }

  async function openScanner() {
    setMode('isbn');
    scannerTitle.textContent = quickScanMode ? 'Hızlı kitap ekleme' : 'Barkod / ISBN tara';
    quickScanQueueEl.classList.toggle('hidden', !quickScanMode);
    if (quickScanMode) renderQuickScanQueue();
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
              if (quickScanMode) {
                requestAnimationFrame(scanFrame);
              }
              return;
            }
          } catch {}
          requestAnimationFrame(scanFrame);
        };
        scanFrame();
        return;
      }

      if (scanPrintedIsbn.checked) return;

      if (!window.Quagga && window.loadLibraryScript) {
        await window.loadLibraryScript('https://cdn.jsdelivr.net/npm/@ericblade/quagga2/dist/quagga.min.js');
      }

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
    } catch {
      showToast('Kamera erişimi yok.', 'error');
      stopScanner();
    }
  }

  readPrintedIsbn.addEventListener('click', async () => {
    if (!scannerVideo.videoWidth || !scannerVideo.videoHeight) {
      showToast('Kamera görüntüsü hazır değil. Birkaç saniye bekleyin.', 'error');
      return;
    }

    if (!window.Tesseract && window.loadLibraryScript) {
      try {
        await window.loadLibraryScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      } catch {}
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
    } catch {
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

  quickScanList.addEventListener('click', (event) => {
    const item = event.target.closest('.quick-scan-item');
    if (!item) return;
    quickScanQueue = quickScanQueue.filter((isbn) => isbn !== item.dataset.quickIsbn);
    renderQuickScanQueue();
  });

  document.getElementById('scan-camera').addEventListener('click', () => {
    quickScanMode = false;
    quickScanQueue = [];
    openScanner();
  });
  quickAddBooks.addEventListener('click', () => {
    quickScanMode = true;
    quickScanQueue = [];
    pendingQuickIsbns = [];
    openScanner();
  });
  completeQuickScan.addEventListener('click', () => {
    if (!quickScanQueue.length) {
      showToast('Önce en az bir geçerli ISBN okutun.', 'error');
      return;
    }
    pendingQuickIsbns = [...quickScanQueue];
    quickScanMode = false;
    quickScanQueue = [];
    stopScanner();
    processNextQuickBook();
  });
  closeScanner.addEventListener('click', () => {
    quickScanMode = false;
    quickScanQueue = [];
    pendingQuickIsbns = [];
    stopScanner();
  });
  scannerModal.addEventListener('click', (event) => {
    if (event.target === scannerModal) {
      quickScanMode = false;
      quickScanQueue = [];
      pendingQuickIsbns = [];
      stopScanner();
    }
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
        prepareFetchedBook(result);
        return;
      } catch (error) {
        showToast(error.message, 'error');
        return;
      }
    }

    if (pendingFetchedBook) {
      isbn = pendingFetchedBook.isbn;
      metadata = pendingFetchedBook.metadata;
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
    const shouldShareInFeed = shareInFeed.checked;
    const feedCaption = shareCaption.value.trim();
    const newBook = createBook({
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
      metadata: {
        ...metadata,
        loanedTo: document.getElementById('loaned-to').value.trim(),
        loanDueDate: document.getElementById('loan-due-date').value
      }
    });

    books.unshift(newBook);

    saveBooks(books);
    await syncBooksToServer(books);
    if (shouldShareInFeed) {
      if (supabaseClient && activeUser) {
        try {
          await createFeedPost(newBook, feedCaption);
          window.dispatchEvent(new CustomEvent('book-library:feed-refresh'));
        } catch (error) {
          showToast('Kitap kaydedildi ancak akışta paylaşılamadı: ' + error.message, 'error');
        }
      } else {
        showToast('Kitap kaydedildi. Akış paylaşımı için çevrimiçi hesapla giriş yapın.', 'info');
      }
    }
    form.reset();
    pendingFetchedBook = null;
    setupStarRating('form-rating-widget', 0);
    progressValue.value = '0%';
    shareCaption.classList.add('hidden');
    setMode('isbn');
    if (pendingQuickIsbns.length) {
      showToast('Kitap kaydedildi. Sıradaki kitap hazırlanıyor.', 'success');
      setTimeout(() => processNextQuickBook(), 0);
    } else {
      showToast('Kitap başarıyla kaydedildi.', 'success');
    }
    render();
  });

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const profile = saveProfile({
      ...loadProfile(),
      displayName: profileNameInput.value,
      username: profileUsernameInput.value,
      bio: profileBioInput.value,
      location: profileLocationInput.value,
      website: profileWebsiteInput.value,
      avatarUrl: profileAvatarInput.value,
      coverUrl: profileCoverInput.value,
      updatedAt: Date.now()
    });
    renderProfile(profile);
    try {
      await syncProfileToServer(profile);
      showToast('Profiliniz kaydedildi.', 'success');
    } catch (error) {
      showToast(`Profil yerel olarak kaydedildi. Sunucuya aktarılamadı: ${error.message}`, 'error');
    }
  });

  friendSearchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabaseClient || !activeUser) {
      showToast('Arkadaş eklemek için çevrimiçi hesapla giriş yapmalısınız.', 'error');
      return;
    }
    friendSearchResults.innerHTML = '<p class="muted friend-empty">Aranıyor...</p>';
    try {
      const profiles = await searchProfiles(friendSearchInput.value);
      friendSearchResults.innerHTML = profiles.length ? profiles.map((profile) => {
        const label = profileLabel(profile);
        return `<div class="friend-search-result"><div><strong>${escapeHtml(label)}</strong><span>${profile.username ? `@${escapeHtml(profile.username)}` : ''}</span></div><button type="button" class="small" data-add-username="${escapeHtml(profile.username)}">İstek gönder</button></div>`;
      }).join('') : '<p class="muted friend-empty">Eşleşen profil bulunamadı.</p>';
    } catch (error) {
      friendSearchResults.innerHTML = '<p class="muted friend-empty">Profil araması kullanılamıyor.</p>';
      showToast('Profil araması başarısız: ' + error.message, 'error');
    }
  });

  friendSearchResults.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-add-username]');
    if (!button) return;
    button.disabled = true;
    try {
      await sendFriendRequest(button.dataset.addUsername);
      showToast('Arkadaşlık isteği gönderildi.', 'success');
      button.textContent = 'Gönderildi';
    } catch (error) {
      showToast(error.message, 'error');
      button.disabled = false;
    }
  });

  const handleFriendAction = async (event) => {
    const profileLink = event.target.closest('[data-friend-profile]');
    if (profileLink) {
      openFriendProfile(profileLink.dataset.friendProfile);
      return;
    }
    const button = event.target.closest('[data-friend-action]');
    if (!button) return;
    button.disabled = true;
    try {
      if (button.dataset.friendAction === 'remove') await removeFriendship(button.dataset.friendId);
      else await updateFriendship(button.dataset.friendId, button.dataset.friendAction === 'accept' ? 'accepted' : 'declined');
      await refreshFriendships();
      showToast(button.dataset.friendAction === 'remove' ? 'Arkadaş çıkarıldı.' : 'Arkadaşlık isteği güncellendi.', 'success');
    } catch (error) {
      button.disabled = false;
      showToast('İşlem başarısız: ' + error.message, 'error');
    }
  };
  friendsList.addEventListener('click', handleFriendAction);
  friendProfileSection.addEventListener('click', (event) => {
    const cover = event.target.closest('[data-friend-book-cover]');
    if (cover) openCoverModal(cover.dataset.friendBookCover, cover.dataset.friendBookTitle || 'Kitap kapağı');
  });
  document.getElementById('back-to-friends').addEventListener('click', () => window.dispatchEvent(new CustomEvent('book-library:navigate', { detail: { page: 'friends' } })));
  incomingFriends.addEventListener('click', handleFriendAction);
  refreshFeedButton.addEventListener('click', refreshFeed);
  feedList.addEventListener('click', (event) => {
    const profileLink = event.target.closest('[data-feed-profile]');
    if (profileLink) {
      openFriendProfile(profileLink.dataset.feedProfile);
      return;
    }
    const coverButton = event.target.closest('[data-feed-cover]');
    if (!coverButton) return;
    openCoverModal(coverButton.dataset.feedCover, coverButton.dataset.feedTitle || 'Kitap kapağı');
  });
  feedList.addEventListener('click', (event) => {
    const likeButton = event.target.closest('[data-feed-like]');
    if (!likeButton) return;
    likeButton.disabled = true;
    toggleFeedLike(likeButton.dataset.feedLike, likeButton.dataset.liked === 'true')
      .then(refreshFeed)
      .catch((error) => showToast('Beğeni kaydedilemedi: ' + error.message, 'error'))
      .finally(() => { likeButton.disabled = false; });
  });
  feedList.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-feed-comment-form]');
    if (!form) return;
    event.preventDefault();
    const input = form.elements.comment;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    addFeedComment(form.dataset.feedCommentForm, input.value)
      .then(() => { input.value = ''; return refreshFeed(); })
      .catch((error) => showToast('Yorum kaydedilemedi: ' + error.message, 'error'))
      .finally(() => { submitButton.disabled = false; });
  });

  shareInFeed.addEventListener('change', () => {
    shareCaption.classList.toggle('hidden', !shareInFeed.checked);
  });
  shareCaption.classList.add('hidden');

  // Filters & Search event listeners
  document.getElementById('search').addEventListener('input', render);
  document.getElementById('filter').addEventListener('change', render);
  document.getElementById('status-filter').addEventListener('change', render);
  document.getElementById('rating-filter').addEventListener('change', render);
  document.getElementById('shelf-filter').addEventListener('change', render);
  document.getElementById('smart-filter').addEventListener('change', render);
  document.getElementById('format-filter').addEventListener('change', render);
  document.getElementById('tag-filter').addEventListener('input', render);
  document.getElementById('year-from-filter').addEventListener('input', render);
  document.getElementById('year-to-filter').addEventListener('input', render);
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (event.key === '/' && !isTyping) {
      event.preventDefault();
      document.getElementById('search')?.focus();
    }
    if (event.key === 'Escape') {
      document.getElementById('filter-menu')?.classList.remove('is-open');
      document.getElementById('actions-menu')?.classList.remove('is-open');
      document.getElementById('filter-menu-toggle')?.setAttribute('aria-expanded', 'false');
      document.getElementById('actions-menu-toggle')?.setAttribute('aria-expanded', 'false');
    }
  });
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
  const profileSection = document.getElementById('profile-section');
  const friendsSection = document.getElementById('friends-section');
  const feedSection = document.getElementById('feed-section');
  const friendProfileSection = document.getElementById('friend-profile-section');
  const mobileMockAd = document.getElementById('mobile-mock-ad');
  const list = document.getElementById('list');
  const detail = document.getElementById('book-detail');

  const finishBoot = () => {
    document.body.classList.remove('app-booting');
    document.getElementById('legacy-runtime-root')?.classList.remove('app-booting');
  };

  const setPage = (page) => {
    // Detail view temporarily adds `hidden`; clear that transient state whenever a tab changes.
    controls.classList.remove('hidden');
    list.classList.remove('hidden');
    detail.classList.add('hidden', 'page-hidden');
    controls.classList.toggle('page-hidden', ['stats', 'quotes', 'profile', 'friends', 'feed', 'friend-profile'].includes(page));
    modeSwitch.classList.toggle('page-hidden', page !== 'add');
    bookForm.classList.toggle('page-hidden', page !== 'add');
    filters.classList.toggle('page-hidden', page !== 'library');
    stats.classList.toggle('page-hidden', page !== 'stats');
    if (quotesSection) quotesSection.classList.toggle('page-hidden', page !== 'quotes');
    if (profileSection) profileSection.classList.toggle('page-hidden', page !== 'profile');
    if (friendsSection) friendsSection.classList.toggle('page-hidden', page !== 'friends');
    if (feedSection) feedSection.classList.toggle('page-hidden', page !== 'feed');
    if (friendProfileSection) friendProfileSection.classList.toggle('page-hidden', page !== 'friend-profile');
    if (mobileMockAd) mobileMockAd.classList.toggle('hidden', page !== 'feed');
    list.classList.toggle('page-hidden', page !== 'library');
    document.querySelectorAll('[data-page]').forEach((item) => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    if (page === 'add') document.getElementById('mode-isbn')?.click();
    if (page === 'friends') window.dispatchEvent(new CustomEvent('book-library:friendships-refresh'));
    if (page === 'feed') window.dispatchEvent(new CustomEvent('book-library:feed-refresh'));
    const pagePath = page === 'library' ? '/library' : `/${page}`;
    if (window.location.pathname !== pagePath) window.history.replaceState(null, '', pagePath);
  };

  window.addEventListener('book-library:navigate', (event) => setPage(event.detail?.page || 'library'));

  document.querySelectorAll('[data-page]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetPage = tab.dataset.page;
      if (targetPage === 'logout') {
        supabaseClient?.auth.signOut();
        return;
      }
      const route = targetPage === 'library' ? '/library' : `/${targetPage}`;
      window.history.pushState(null, '', route);
      setPage(targetPage);
    });
  });

  const validPages = ['feed', 'library', 'add', 'stats', 'quotes', 'profile', 'friends'];
  const pageFromLocation = () => {
    const pathPage = window.location.pathname.replace(/^\/+/, '').split('/')[0];
    return pathPage || window.location.hash.slice(1) || 'feed';
  };

  window.addEventListener('popstate', () => {
    const page = pageFromLocation();
    setPage(validPages.includes(page) ? page : 'feed');
  });

  const initialPage = pageFromLocation();
  setPage(validPages.includes(initialPage) ? initialPage : 'feed');

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
  const googleLoginButton = document.getElementById('auth-google');

  const showApp = async (session = null) => {
    setActiveUser(session ? session.user : null);
    finishBoot();
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
        try {
          const profile = await fetchProfileFromServer();
          saveProfile(profile);
          window.dispatchEvent(new CustomEvent('book-library:profile-updated', { detail: profile }));
        } catch (profileError) {
          console.warn('Profile sync unavailable:', profileError);
        }
        const books = await fetchAllBooksFromServer();
        saveBooks(books);
        render();
        setupRealtimeSubscription(() => {
          render();
        });
        window.dispatchEvent(new CustomEvent('book-library:friendships-refresh'));
        window.dispatchEvent(new CustomEvent('book-library:feed-refresh'));
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
        password: document.getElementById('auth-password').value,
        options: { emailRedirectTo: getAuthRedirectUrl() }
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

  document.querySelectorAll('.mock-ad-close').forEach((button) => {
    button.addEventListener('click', () => button.closest('.mock-ad')?.remove());
  });

  const mockAdLinks = [
    { name: 'Dream Layers', handle: '@dreamlayerstr', url: 'https://www.shopier.com/dreamlayerstr', image: 'https://cdn.shopier.app/pictures_large/dreamlayerstr_1ab277ea81cd7b768a65ec58d9c5fddd.png', label: 'DREAM LAYERS', art: 'DL', detail: 'SEÇKİ', copy: 'Dream Layers ürünlerini Shopier mağazasında keşfet.' },
    { name: 'Dream Layers', handle: '@dreamlayerstr', url: 'https://www.shopier.com/dreamlayerstr', image: 'https://cdn.shopier.app/pictures_large/dreamlayerstr_f9c1289a9a9cb4e7f15cca8b59ed77a1.png', label: 'DREAM LAYERS', art: 'DL', detail: 'YENİ', copy: 'Yeni Dream Layers seçkisini Shopier mağazasında incele.' }
  ];
  document.querySelectorAll('.mock-ad-rail').forEach((ad, index) => {
    const content = mockAdLinks[index];
    if (!content) return;
    ad.querySelector('.mock-ad-label').textContent = `SPONSORLU · ${content.label}`;
    ad.querySelector('.mock-ad-art span').textContent = content.label.split(' ')[0];
    ad.querySelector('.mock-ad-art strong').textContent = content.art;
    ad.querySelector('.mock-ad-art small').textContent = content.detail;
    ad.querySelector('.mock-ad-art').style.backgroundImage = `url("${content.image}")`;
    ad.querySelector('.mock-ad-art').classList.add('has-image');
    ad.querySelector('.mock-ad-art + strong').textContent = content.name;
    ad.querySelector('.mock-ad-art + strong + span').textContent = content.copy;
    ad.querySelector('.mock-ad-meta span:first-child').textContent = 'Instagram';
    ad.querySelector('.mock-ad-meta span:last-child').textContent = content.handle;
    const action = ad.querySelector('.mock-ad-action');
    action.textContent = 'Mağazayı ziyaret et';
    action.addEventListener('click', () => window.open(content.url, '_blank', 'noopener,noreferrer'));
  });
  if (mobileMockAd) {
    const mobileContent = mobileMockAd.querySelector('div');
    mobileContent.style.backgroundImage = `url("${mockAdLinks[0].image}")`;
    mobileContent.classList.add('mock-ad-mobile-content');
  }

  googleLoginButton?.addEventListener('click', async () => {
    if (!supabaseClient) {
      showToast('Supabase ayarları tanımlanmamış.', 'error');
      return;
    }

    authStatus.textContent = 'Google giriş sayfası açılıyor...';
    authStatus.style.color = 'var(--muted)';
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getAuthRedirectUrl() }
      });
      if (error) throw error;
    } catch (error) {
      authStatus.textContent = 'Google giriş hatası: ' + error.message;
      authStatus.style.color = 'var(--danger)';
      showToast('Google ile giriş yapılamadı: ' + error.message, 'error');
      showAuthErrorModal(error.message);
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
      else finishBoot();

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
    finishBoot();
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

