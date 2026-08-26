import { QUOTES_KEY, getUserStorageKey, uid } from './config.js';
import { showToast } from './toast.js';

export function parseMarkdown(text) {
  if (!text) return '';
  let html = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Blockquotes (> text)
  html = html.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  
  // Bold (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic (*text*)
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Line breaks
  html = html.replace(/\n/g, '<br/>');

  return html;
}

export function loadQuotes() {
  try {
    const raw = localStorage.getItem(getUserStorageKey(QUOTES_KEY));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

export function saveQuotes(quotes) {
  localStorage.setItem(getUserStorageKey(QUOTES_KEY), JSON.stringify(quotes));
}

export function addQuote({ bookTitle, author, text, pageNumber }) {
  if (!text || !text.trim()) {
    showToast('Alıntı metni zorunludur.', 'error');
    return false;
  }

  const quotes = loadQuotes();
  const newQuote = {
    id: uid(),
    bookTitle: bookTitle ? bookTitle.trim() : 'Bilinmeyen Kitap',
    author: author ? author.trim() : '',
    text: text.trim(),
    pageNumber: pageNumber ? pageNumber.trim() : '',
    createdAt: Date.now()
  };

  quotes.unshift(newQuote);
  saveQuotes(quotes);
  showToast('Alıntı eklendi.', 'success');
  renderQuotes();
  return true;
}

export function deleteQuote(quoteId) {
  if (!confirm('Bu alıntıyı silmek istediğinize emin misiniz?')) return;
  const quotes = loadQuotes().filter((q) => q.id !== quoteId);
  saveQuotes(quotes);
  showToast('Alıntı silindi.', 'info');
  renderQuotes();
}

export function renderQuotes() {
  const container = document.getElementById('quotes-list');
  if (!container) return;

  const quotes = loadQuotes();
  const searchInput = document.getElementById('quote-search');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filtered = quotes.filter((q) => {
    if (!query) return true;
    const haystack = `${q.text} ${q.bookTitle} ${q.author}`.toLowerCase();
    return haystack.includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="muted">Henüz alıntı eklenmemiş.</p>';
    return;
  }

  container.innerHTML = filtered.map((quote) => `
    <div class="quote-card card-widget">
      <blockquote class="quote-text">${parseMarkdown(quote.text)}</blockquote>
      <div class="quote-meta">
        <strong class="quote-book-title">${escapeHtml(quote.bookTitle)}</strong>
        ${quote.author ? `<span class="quote-author">— ${escapeHtml(quote.author)}</span>` : ''}
        ${quote.pageNumber ? `<span class="quote-page">Sayfa ${escapeHtml(quote.pageNumber)}</span>` : ''}
      </div>
      <div class="quote-actions">
        <button type="button" class="small secondary copy-quote-btn" data-text="${escapeHtml(quote.text)} — ${escapeHtml(quote.bookTitle)}">Kopyala</button>
        <button type="button" class="small danger delete-quote-btn" data-id="${quote.id}">Sil</button>
      </div>
    </div>
  `).join('');

  // Event listeners for kopyala & sil
  container.querySelectorAll('.copy-quote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.text);
      showToast('Alıntı panoya kopyalandı.', 'success');
    });
  });

  container.querySelectorAll('.delete-quote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      deleteQuote(btn.dataset.id);
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
