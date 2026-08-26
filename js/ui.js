import { THEME_KEY, ANNUAL_GOAL_KEY } from './config.js';
import { loadBooks, saveBooks, syncBooksToServer, createBook, normalizeBook } from './storage.js';
import { findDuplicateBook } from './isbn.js';
import { showToast } from './toast.js';
import { renderBadges } from './badges.js';
import { renderQuotes } from './quotes.js';

export function getShelfLabel(shelfKey) {
  const map = {
    owned: 'Sahip olduklarım',
    wishlist: 'Okuma listem',
    favorites: 'Favorilerim',
    reread: 'Tekrar okunacaklar'
  };
  return map[shelfKey] || shelfKey || 'Sahip olduklarım';
}

// ----------------------------------------------------
// 1. THEME SWITCHER LOGIC
// ----------------------------------------------------
export function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);

  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }
}

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.textContent = theme === 'dark' ? '☀️ Aydınlık Mod' : '🌙 Koyu Mod';
  }
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
}

// ----------------------------------------------------
// 2. INTERACTIVE STAR RATING WIDGET
// ----------------------------------------------------
export function setupStarRating(containerId, initialRating = 0, onChangeCallback) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  container.className = 'star-rating-widget';
  container.dataset.rating = String(initialRating);

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.className = `star-icon ${i <= initialRating ? 'filled' : ''}`;
    star.textContent = '★';
    star.dataset.value = String(i);
    star.tabIndex = 0;
    star.setAttribute('role', 'button');
    star.setAttribute('aria-label', `${i} Yıldız`);

    star.addEventListener('mouseenter', () => highlightStars(container, i));
    star.addEventListener('mouseleave', () => resetStars(container));
    star.addEventListener('click', () => {
      container.dataset.rating = String(i);
      resetStars(container);
      if (typeof onChangeCallback === 'function') onChangeCallback(i);
    });

    container.appendChild(star);
  }
}

function highlightStars(container, count) {
  const stars = container.querySelectorAll('.star-icon');
  stars.forEach((star, index) => {
    star.classList.toggle('active', index < count);
  });
}

function resetStars(container) {
  const current = Number(container.dataset.rating) || 0;
  const stars = container.querySelectorAll('.star-icon');
  stars.forEach((star, index) => {
    star.classList.remove('active');
    star.classList.toggle('filled', index < current);
  });
}

export function getStarRatingValue(containerId) {
  const container = document.getElementById(containerId);
  return container ? (Number(container.dataset.rating) || 0) : 0;
}

// ----------------------------------------------------
// 3. MAIN RENDER FUNCTION
// ----------------------------------------------------
export function render() {
  const list = document.getElementById('list');
  const books = loadBooks();

  const bookCount = document.getElementById('book-count');
  if (bookCount) bookCount.textContent = books.length;

  const statReading = document.getElementById('stat-reading');
  const statRead = document.getElementById('stat-read');
  const statTotal = document.getElementById('stat-total');
  const statProgress = document.getElementById('stat-progress');
  const statRated = document.getElementById('stat-rated');
  const statPages = document.getElementById('stat-pages');

  if (statTotal) statTotal.textContent = books.length;
  if (statReading) statReading.textContent = books.filter((book) => book.status === 'reading').length;
  if (statRead) statRead.textContent = books.filter((book) => book.status === 'read' || book.read).length;
  if (statProgress) statProgress.textContent = books.length ? `${Math.round(books.reduce((sum, book) => sum + book.progress, 0) / books.length)}%` : '0%';
  if (statRated) statRated.textContent = books.filter((book) => book.rating > 0).length;
  if (statPages) statPages.textContent = books.reduce((sum, book) => sum + (Number(book.metadata?.pageCount || book.metadata?.number_of_pages || 0) || 0), 0);

  // Annual Goal calculation
  const annualGoalInput = document.getElementById('annual-goal-input');
  const savedGoal = Number(localStorage.getItem(ANNUAL_GOAL_KEY)) || 12;
  if (annualGoalInput && !annualGoalInput.dataset.initialized) {
    annualGoalInput.value = savedGoal;
    annualGoalInput.dataset.initialized = 'true';
    annualGoalInput.addEventListener('change', (e) => {
      const val = Math.max(1, Number(e.target.value) || 12);
      localStorage.setItem(ANNUAL_GOAL_KEY, String(val));
      render();
    });
  }

  const currentGoal = Number(annualGoalInput ? annualGoalInput.value : savedGoal) || 12;
  const currentYear = new Date().getFullYear();
  const readThisYear = books.filter((b) => {
    if (b.status !== 'read' && !b.read) return false;
    if (b.finishDate) return new Date(b.finishDate).getFullYear() === currentYear;
    return new Date(b.createdAt).getFullYear() === currentYear;
  }).length;

  const goalPercent = Math.min(100, Math.round((readThisYear / currentGoal) * 100));
  const goalFill = document.getElementById('goal-progress-fill');
  if (goalFill) goalFill.style.width = `${goalPercent}%`;
  const goalText = document.getElementById('goal-status-text');
  if (goalText) goalText.textContent = `Bu yıl ${readThisYear} / ${currentGoal} kitap okundu (%${goalPercent})`;

  // Top Author & Top Genre calculation
  const authorCounts = {};
  const genreCounts = {};
  books.forEach((b) => {
    if (b.author && b.author.trim()) {
      const a = b.author.trim();
      authorCounts[a] = (authorCounts[a] || 0) + 1;
    }
    (b.tags || []).forEach((t) => {
      const cleanTag = t.trim().toLowerCase();
      if (cleanTag && !['isbn', 'google-books', 'open-library'].includes(cleanTag)) {
        genreCounts[cleanTag] = (genreCounts[cleanTag] || 0) + 1;
      }
    });
  });

  let topAuthor = '-';
  let maxAuthorCount = 0;
  Object.entries(authorCounts).forEach(([auth, count]) => {
    if (count > maxAuthorCount) {
      maxAuthorCount = count;
      topAuthor = auth;
    }
  });

  let topGenre = '-';
  let maxGenreCount = 0;
  Object.entries(genreCounts).forEach(([g, count]) => {
    if (count > maxGenreCount) {
      maxGenreCount = count;
      topGenre = g.charAt(0).toUpperCase() + g.slice(1);
    }
  });

  const topAuthorEl = document.getElementById('top-author-name');
  const topAuthorCountEl = document.getElementById('top-author-count');
  if (topAuthorEl) topAuthorEl.textContent = topAuthor;
  if (topAuthorCountEl) topAuthorCountEl.textContent = `${maxAuthorCount} kitap`;

  const topGenreEl = document.getElementById('top-genre-name');
  const topGenreCountEl = document.getElementById('top-genre-count');
  if (topGenreEl) topGenreEl.textContent = topGenre;
  if (topGenreCountEl) topGenreCountEl.textContent = `${maxGenreCount} kitap`;

  // Render Badges & Quotes
  renderBadges(books);
  renderQuotes();

  // Filters & Search
  const query = (document.getElementById('search')?.value || '').trim().toLowerCase();
  const filter = document.getElementById('filter')?.value || 'all';
  const statusFilter = document.getElementById('status-filter')?.value || 'all';
  const ratingFilter = document.getElementById('rating-filter')?.value || 'all';
  const shelfFilter = document.getElementById('shelf-filter')?.value || 'all';

  const visible = books.filter((book) => {
    if (filter === 'read' && !book.read) return false;
    if (filter === 'unread' && book.read) return false;
    if (statusFilter !== 'all' && book.status !== statusFilter) return false;
    if (ratingFilter !== 'all' && book.rating < Number(ratingFilter)) return false;
    if (shelfFilter !== 'all' && book.shelf !== shelfFilter) return false;
    if (!query) return true;

    const haystack = `${book.title || ''} ${book.author || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!list) return;

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
    const publisher = Array.isArray(metadata.publishers) ? metadata.publishers.join(', ') : (metadata.publisher || '');
    const pageCount = metadata.number_of_pages || metadata.pageCount || '';
    const detailParts = [
      book.author || 'Yazar bilinmiyor',
      book.year || '',
      publisher,
      pageCount ? `${pageCount} sayfa` : '',
      book.isbn ? `ISBN: ${book.isbn}` : '',
      book.startDate ? `Başlama: ${book.startDate}` : '',
      book.finishDate ? `Bitiş: ${book.finishDate}` : ''
    ];
    detailsEl.textContent = detailParts.filter(Boolean).join('\n');

    const tagsEl = document.createElement('div');
    tagsEl.className = 'tags';
    
    const shelfBadge = document.createElement('span');
    shelfBadge.className = 'shelf-badge';
    shelfBadge.textContent = getShelfLabel(book.shelf);
    
    const starsSpan = document.createElement('span');
    starsSpan.className = 'card-stars';
    starsSpan.textContent = book.rating > 0 ? ` ★ ${book.rating}/5` : '';

    const tagsText = document.createTextNode(` ${(book.tags || []).join(', ') || 'Etiket yok'}`);
    tagsEl.appendChild(shelfBadge);
    if (book.rating > 0) tagsEl.appendChild(starsSpan);
    tagsEl.appendChild(tagsText);

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
    editBtn.addEventListener('click', () => openEditModal(book));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'small danger';
    deleteBtn.textContent = 'Sil';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Bu kitabı silmek istediğinize emin misiniz?')) return;
      const updatedBooks = loadBooks().filter((item) => item.id !== book.id);
      saveBooks(updatedBooks);
      await syncBooksToServer(updatedBooks, { allowDelete: true });
      render();
      showToast('Kitap silindi.', 'info');
    });

    actions.appendChild(toggleBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(meta);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

// ----------------------------------------------------
// 4. BOOK DETAIL VIEW
// ----------------------------------------------------
export function showBookDetail(book) {
  const controls = document.querySelector('.controls');
  const list = document.getElementById('list');
  const detail = document.getElementById('book-detail');
  const content = document.getElementById('book-detail-content');
  const metadata = book.metadata || {};
  const coverUrl = getBookCoverUrl(book);
  const description = typeof metadata.description === 'object' ? metadata.description.value : metadata.description;
  const publisher = Array.isArray(metadata.publishers) ? metadata.publishers.join(', ') : (metadata.publisher || '');
  const pageCount = metadata.number_of_pages || metadata.pageCount || '';
  const subjects = Array.isArray(metadata.subjects) ? metadata.subjects.join(', ') : '';

  controls.classList.add('hidden');
  list.classList.add('hidden');
  detail.classList.remove('hidden', 'page-hidden');
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
    ['Puan', book.rating ? `${book.rating} / 5 ★` : 'Puan verilmedi'],
    ['Raf', getShelfLabel(book.shelf)],
    ['Başlama Tarihi', book.startDate],
    ['Bitirme Tarihi', book.finishDate],
    ['Yayın tarihi', metadata.publish_date],
    ['Yayınevi', publisher],
    ['Sayfa sayısı', pageCount],
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

  const metadataEntries = Object.entries(metadata).filter(([key, value]) => {
    return key !== 'description' && value !== null && value !== undefined && value !== '';
  });

  if (metadataEntries.length) {
    const metadataHeading = document.createElement('h3');
    metadataHeading.textContent = 'Kitap bilgileri';
    content.appendChild(metadataHeading);

    const metadataGrid = document.createElement('div');
    metadataGrid.className = 'metadata-grid';
    metadataEntries.forEach(([key, value]) => {
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
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function hideBookDetail() {
  document.querySelector('.controls').classList.remove('hidden');
  document.getElementById('list').classList.remove('hidden');
  document.getElementById('book-detail').classList.add('hidden', 'page-hidden');
}

export function getBookCoverUrl(book) {
  const metadata = book.metadata || {};
  const googleCoverUrls = metadata.imageLinks && [
    metadata.imageLinks.extraLarge,
    metadata.imageLinks.large,
    metadata.imageLinks.medium,
    metadata.imageLinks.thumbnail,
    metadata.imageLinks.smallThumbnail
  ].filter(Boolean).map((url) => url.replace(/^http:/, 'https:'));

  if (metadata.source_api === 'Google Books' && googleCoverUrls && googleCoverUrls.length) {
    return googleCoverUrls[0];
  }

  const coverId = Array.isArray(metadata.covers) ? metadata.covers[0] : '';
  if (coverId) return `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-L.jpg`;
  if (metadata.cover_i) return `https://covers.openlibrary.org/b/id/${encodeURIComponent(metadata.cover_i)}-L.jpg`;
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
    publishedDate: 'Yayın tarihi',
    first_publish_year: 'İlk yayın yılı',
    publishers: 'Yayınevleri',
    publisher: 'Yayınevi',
    number_of_pages: 'Sayfa sayısı',
    pageCount: 'Sayfa sayısı',
    physical_format: 'Fiziksel format',
    physical_dimensions: 'Fiziksel boyutlar',
    weight: 'Ağırlık',
    languages: 'Diller',
    subjects: 'Konular',
    subject: 'Konular',
    categories: 'Kategoriler',
    covers: 'Kapak kimlikleri',
    cover_i: 'Kapak kimliği',
    imageLinks: 'Kapak bağlantıları',
    works: 'Eser kayıtları',
    identifiers: 'Diğer kimlikler',
    industryIdentifiers: 'ISBN kayıtları',
    classifications: 'Sınıflandırmalar',
    first_sentence: 'İlk cümle',
    notes: 'Notlar',
    links: 'Bağlantılar',
    ebooks: 'E-kitap bilgileri',
    source_api: 'Kaynak',
    lookup_isbn: 'Aranan ISBN',
    lookup_at: 'Sorgu zamanı',
    google_volume_id: 'Google Books kaydı'
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
    if (value.identifier) return formatMetadataValue(value.identifier);
    if (value.key) return formatMetadataValue(value.key);
    return Object.entries(value)
      .map(([key, item]) => `${metadataLabel(key)}: ${formatMetadataValue(item)}`)
      .filter(Boolean)
      .join(' • ');
  }
  return String(value);
}

export function openCoverModal(coverUrl, title) {
  const modal = document.getElementById('cover-modal');
  const image = document.getElementById('large-cover');
  document.getElementById('cover-modal-title').textContent = title;
  image.src = coverUrl;
  image.alt = `${title} büyük kapak görseli`;
  modal.classList.remove('hidden');
}

export function closeCoverModal() {
  const modal = document.getElementById('cover-modal');
  document.getElementById('large-cover').removeAttribute('src');
  modal.classList.add('hidden');
}

// ----------------------------------------------------
// 5. EDIT MODAL LOGIC
// ----------------------------------------------------
let editingBookId = null;

export function openEditModal(book) {
  editingBookId = book.id;
  document.getElementById('edit-title').value = book.title;
  document.getElementById('edit-author').value = book.author;
  document.getElementById('edit-year').value = book.year;
  document.getElementById('edit-tags').value = (book.tags || []).join(', ');
  document.getElementById('edit-status').value = book.status;
  document.getElementById('edit-shelf').value = book.shelf || 'owned';
  document.getElementById('edit-start-date').value = book.startDate || '';
  document.getElementById('edit-finish-date').value = book.finishDate || '';
  document.getElementById('edit-progress').value = book.progress;
  document.getElementById('edit-progress-value').value = `${book.progress}%`;
  document.getElementById('edit-review').value = book.review;
  document.getElementById('edit-notes').value = book.notes;

  setupStarRating('edit-rating-widget', book.rating, (ratingVal) => {
    document.getElementById('edit-rating-widget').dataset.rating = String(ratingVal);
  });

  document.getElementById('edit-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('edit-title')?.focus(), 50);
}

export function closeEditModal() {
  editingBookId = null;
  document.getElementById('edit-modal').classList.add('hidden');
}

export async function saveEditedBook(event) {
  event.preventDefault();
  const updatedBooks = loadBooks().map((book) => {
    if (book.id !== editingBookId) return book;
    const status = document.getElementById('edit-status').value;
    const ratingVal = getStarRatingValue('edit-rating-widget');

    return normalizeBook({
      ...book,
      title: document.getElementById('edit-title').value.trim() || 'Başlıksız',
      author: document.getElementById('edit-author').value.trim(),
      year: document.getElementById('edit-year').value.trim(),
      tags: document.getElementById('edit-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean),
      status,
      read: status === 'read',
      progress: Number(document.getElementById('edit-progress').value),
      rating: ratingVal,
      review: document.getElementById('edit-review').value.trim(),
      notes: document.getElementById('edit-notes').value.trim(),
      shelf: document.getElementById('edit-shelf').value || 'owned',
      startDate: document.getElementById('edit-start-date').value,
      finishDate: document.getElementById('edit-finish-date').value
    });
  });

  saveBooks(updatedBooks);
  const result = await syncBooksToServer(updatedBooks);
  closeEditModal();
  render();
  showToast(result && result.fallback ? 'Kitap yerel olarak güncellendi.' : 'Kitap başarıyla güncellendi.', 'success');
}
