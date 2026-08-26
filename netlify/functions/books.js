const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../db.json');

function readDb() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

exports.handler = async function(event, context) {
  const method = event.httpMethod || 'GET';

  if (method === 'GET') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(readDb())
    };
  }

  if (method === 'POST') {
    try {
      const payload = JSON.parse(event.body || '[]');
      const books = Array.isArray(payload) ? payload : [];
      writeDb(books);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, count: books.length })
      };
    } catch (error) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Geçersiz JSON' })
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};
