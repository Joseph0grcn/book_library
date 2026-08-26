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
  return {
    statusCode: 403,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      error: 'Bu uç nokta güvenlik nedeniyle kapatılmıştır. Lütfen verilerinize erişmek için Supabase oturumu açın.'
    })
  };
};

