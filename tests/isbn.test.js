import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateBook, getIsbnVariants, normalizeIsbn } from '../js/features/isbn.js';
import { createBook, normalizeBook } from '../js/core/storage.js';

test('validates ISBN-10 and generates the ISBN-13 variant', () => {
  assert.equal(normalizeIsbn('0-306-40615-2'), '0306406152');
  assert.ok(getIsbnVariants('0306406152').has('9780306406157'));
});

test('rejects an invalid ISBN', () => {
  assert.throws(() => normalizeIsbn('0306406153'), /kontrol hanesi/);
});

test('finds duplicate books through ISBN variants', () => {
  const existing = [{ id: 'book-1', title: 'A', author: 'B', isbn: '9780306406157' }];
  assert.equal(
    findDuplicateBook({ title: 'Different', isbn: '0306406152' }, existing)?.id,
    'book-1',
  );
});

test('normalizes imported data without losing its identity and date', () => {
  const book = createBook({
    id: 'imported',
    title: 'Book',
    tags: 'fiction, classic',
    progress: 140,
    rating: -2,
    createdAt: '2024-01-02T00:00:00.000Z',
  });
  assert.equal(book.id, 'imported');
  assert.deepEqual(book.tags, ['fiction', 'classic']);
  assert.equal(book.progress, 100);
  assert.equal(book.rating, 0);
  assert.equal(book.createdAt, new Date('2024-01-02T00:00:00.000Z').getTime());
  assert.equal(normalizeBook({ status: 'read', progress: 20 }).progress, 100);
});
