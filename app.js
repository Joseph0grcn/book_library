const STORAGE_KEY = 'book_library_books';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadBooks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Veri okunurken hata oluştu:', error);
    return [];
  }
}

function saveBooks(books) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function createBook({ title, author, year, tags, read }) {
  return {
    id: uid(),
    title: title || 'Başlıksız',
    author: author || '',
    year: year || '',
    tags: Array.isArray(tags) ? tags : [],
    read: !!read,
    createdAt: Date.now()
  };
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
    detailsEl.textContent = [book.author || 'Yazar bilinmiyor', book.year || ''].filter(Boolean).join(' • ');

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
    toggleBtn.addEventListener('click', () => {
      const updatedBooks = loadBooks().map((item) => item.id === book.id ? { ...item, read: !item.read } : item);
      saveBooks(updatedBooks);
      render();
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'small secondary';
    editBtn.textContent = 'Düzenle';
    editBtn.addEventListener('click', () => {
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
      render();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'small danger';
    deleteBtn.textContent = 'Sil';
    deleteBtn.addEventListener('click', () => {
      if (!confirm('Bu kitabı silmek istediğinize emin misiniz?')) return;
      const updatedBooks = loadBooks().filter((item) => item.id !== book.id);
      saveBooks(updatedBooks);
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

function setup() {
  const form = document.getElementById('book-form');

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const title = document.getElementById('title').value.trim();
    const author = document.getElementById('author').value.trim();
    const year = document.getElementById('year').value.trim();
    const tags = document.getElementById('tags').value.split(',').map((tag) => tag.trim()).filter(Boolean);
    const read = document.getElementById('read').checked;

    if (!title) return;

    const books = loadBooks();
    books.unshift(createBook({ title, author, year, tags, read }));
    saveBooks(books);
    form.reset();
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
  });

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
      const newBooks = incoming.filter((book) => !existingIds.has(book.id || ''));
      const merged = [...newBooks.map((book) => ({ ...book, id: book.id || uid(), tags: book.tags || [], read: !!book.read })), ...existing];
      saveBooks(merged);
      render();
      alert(`${newBooks.length} yeni kitap eklendi.`);
    } catch (error) {
      alert('İçe aktarma sırasında hata oluştu: ' + error.message);
    } finally {
      event.target.value = '';
    }
  });

  document.getElementById('clear').addEventListener('click', () => {
    if (!confirm('Tüm kitapları silmek istediğinize emin misiniz?')) return;
    localStorage.removeItem(STORAGE_KEY);
    render();
  });

  render();
}

document.addEventListener('DOMContentLoaded', setup);
