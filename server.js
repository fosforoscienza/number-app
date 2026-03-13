const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- File storage helpers ---

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { numbers: [], submittedIps: [], resetToken: Date.now().toString() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress;
}

// --- API ---

// GET /api/data
app.get('/api/data', (req, res) => {
  const data = readData();
  const count = data.numbers.length;
  const average = count > 0
    ? data.numbers.reduce((sum, n) => sum + n, 0) / count
    : null;
  res.json({
    entries: data.numbers.map((value, i) => ({ id: i + 1, value })),
    average,
    count,
    resetToken: data.resetToken
  });
});

// POST /api/submit
app.post('/api/submit', (req, res) => {
  const { number } = req.body;
  const parsed = parseFloat(number);
  if (number === undefined || number === null || number === '' || isNaN(parsed)) {
    return res.status(400).json({ error: 'Numero non valido' });
  }

  const ip = getClientIp(req);
  const data = readData();

  if (data.submittedIps.includes(ip)) {
    return res.status(403).json({ error: 'Hai già inviato un numero', alreadySubmitted: true });
  }

  data.numbers.push(parsed);
  data.submittedIps.push(ip);
  writeData(data);

  res.json({ ok: true, count: data.numbers.length });
});

// DELETE /api/reset
app.delete('/api/reset', (req, res) => {
  writeData({ numbers: [], submittedIps: [], resetToken: Date.now().toString() });
  res.json({ ok: true });
});

// --- Start ---

app.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`));
