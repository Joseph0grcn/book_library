const HEADER_ALIASES = {
  title: ['title', 'başlık', 'baslik', 'kitap'],
  author: ['author', 'yazar'],
  year: ['year', 'yıl', 'yil'],
  isbn: ['isbn', 'isbn-10', 'isbn-13'],
  tags: ['tags', 'etiket', 'etiketler'],
  status: ['status', 'durum'],
  shelf: ['shelf', 'raf'],
  rating: ['rating', 'puan'],
  review: ['review', 'yorum'],
  notes: ['notes', 'not', 'notlar'],
};

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  if (value || row.length) {
    row.push(value.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows
    .slice(1)
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])),
    );
}

export function csvToBooks(text) {
  return parseCsv(text)
    .map((row) => ({
      title: row.title || 'Başlıksız',
      author: row.author || '',
      year: row.year || '',
      isbn: row.isbn || '',
      tags: row.tags || '',
      status: row.status || '',
      shelf: row.shelf || '',
      rating: row.rating || '',
      review: row.review || '',
      notes: row.notes || '',
    }))
    .filter((book) => (book.title && book.title !== 'Başlıksız') || book.isbn);
}

function normalizeHeader(header) {
  const value = String(header || '')
    .trim()
    .toLowerCase();
  return (
    Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(value))?.[0] || value
  );
}
