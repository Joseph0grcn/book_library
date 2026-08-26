export function convertIsbn10To13(isbn10) {
  if (!isbn10 || isbn10.length !== 10) return null;
  const core = '978' + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return core + checkDigit;
}

export function convertIsbn13To10(isbn13) {
  if (!isbn13 || isbn13.length !== 13 || !isbn13.startsWith('978')) return null;
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(core[i]) * (10 - i);
  }
  const remainder = (11 - (sum % 11)) % 11;
  const checkDigit = remainder === 10 ? 'X' : String(remainder);
  return core + checkDigit;
}

export function getIsbnVariants(isbnInput) {
  if (!isbnInput) return new Set();
  const clean = isbnInput.replace(/[^0-9Xx]/g, '').toUpperCase();
  const variants = new Set();
  if (clean) variants.add(clean);
  if (clean.length === 10) {
    const v13 = convertIsbn10To13(clean);
    if (v13) variants.add(v13);
  } else if (clean.length === 13) {
    const v10 = convertIsbn13To10(clean);
    if (v10) variants.add(v10);
  }
  return variants;
}

export function findDuplicateBook(bookCheck, existingBooks) {
  const checkVariants = bookCheck.isbn ? getIsbnVariants(bookCheck.isbn) : new Set();
  const cleanTitle = (bookCheck.title || '').trim().toLowerCase();
  const cleanAuthor = (bookCheck.author || '').trim().toLowerCase();

  return existingBooks.find((existing) => {
    if (bookCheck.id && existing.id === bookCheck.id) return false;

    if (existing.isbn && checkVariants.size > 0) {
      const existingVariants = getIsbnVariants(existing.isbn);
      for (const variant of checkVariants) {
        if (existingVariants.has(variant)) return existing;
      }
    }

    if (cleanTitle && (existing.title || '').trim().toLowerCase() === cleanTitle) {
      if (!cleanAuthor || (existing.author || '').trim().toLowerCase() === cleanAuthor) {
        return existing;
      }
    }

    return false;
  });
}

export function normalizeIsbn(input) {
  const isbn = input.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (isbn.length === 10) {
    const valid = isbn.split('').reduce((sum, digit, index) => {
      const value = digit === 'X' ? 10 : Number(digit);
      return sum + value * (10 - index);
    }, 0) % 11 === 0;
    if (!valid) throw new Error('ISBN-10 kontrol hanesi geçersiz. Numarayı kontrol edin.');
    return isbn;
  }
  if (isbn.length === 13 && /^97[89]\d{10}$/.test(isbn)) {
    const sum = isbn.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    if (sum % 10 !== 0) throw new Error('ISBN-13 kontrol hanesi geçersiz. Numarayı kontrol edin.');
    return isbn;
  }
  throw new Error('ISBN 10 veya 13 haneli olmalıdır. Numarayı kontrol edin.');
}

export async function fetchGoogleBooksMetadata(isbn) {
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

export async function fetchOpenLibraryMetadata(isbn) {
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

export async function fetchBookMetadata(isbnInput) {
  const cleaned = isbnInput.trim();
  if (!cleaned) throw new Error('ISBN veya barkod girin.');

  const isbn = normalizeIsbn(cleaned);

  const googleBook = await fetchGoogleBooksMetadata(isbn).catch(() => null);
  if (googleBook) return googleBook;

  const openLibraryBook = await fetchOpenLibraryMetadata(isbn).catch(() => null);
  if (!openLibraryBook) throw new Error('Bu ISBN için kitap bilgisi bulunamadı.');

  return openLibraryBook;
}
