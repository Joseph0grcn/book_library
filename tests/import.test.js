import test from 'node:test';
import assert from 'node:assert/strict';
import { csvToBooks, parseCsv } from '../js/features/import.js';

test('parses quoted CSV values containing commas', () => {
  const rows = parseCsv(
    'title,author,notes\n"Dune, Çöl Gezegeni",Frank Herbert,"Birinci, önemli not"',
  );
  assert.equal(rows[0].title, 'Dune, Çöl Gezegeni');
  assert.equal(rows[0].notes, 'Birinci, önemli not');
});

test('maps Turkish CSV headers to book fields', () => {
  const books = csvToBooks(
    'Başlık,Yazar,ISBN,Etiketler\nDeneme,Yazar,9780306406157,"klasik, bilim"',
  );
  assert.deepEqual(books[0], {
    title: 'Deneme',
    author: 'Yazar',
    year: '',
    isbn: '9780306406157',
    tags: 'klasik, bilim',
    status: '',
    shelf: '',
    rating: '',
    review: '',
    notes: '',
  });
});
