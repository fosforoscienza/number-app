const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ numbers: [] }));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// POST /api/submit — aggiunge un numero
app.post('/api/submit', (req, res) => {
  const { number } = req.body;
  const parsed = parseFloat(number);
  if (number === undefined || number === null || number === '' || isNaN(parsed)) {
    return res.status(400).json({ error: 'Numero non valido' });
  }
  const data = readData();
  data.numbers.push(parsed);
  writeData(data);
  res.json({ ok: true, count: data.numbers.length });
});

// GET /api/data — restituisce lista e media
app.get('/api/data', (req, res) => {
  const data = readData();
  const numbers = data.numbers;
  const count = numbers.length;
  const average = count > 0
    ? numbers.reduce((sum, n) => sum + n, 0) / count
    : null;
  const entries = numbers.map((value, i) => ({ id: i + 1, value }));
  res.json({ entries, average, count });
});

// DELETE /api/reset — svuota i dati
app.delete('/api/reset', (req, res) => {
  writeData({ numbers: [] });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
