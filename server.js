const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory state (unica fonte di verità) ──────────────────────────────────
// Node.js è single-thread: le operazioni sincrone sull'oggetto state
// non hanno race condition, anche con 300 richieste concorrenti.

let state = {
  numbers: [],
  submittedIps: new Set(),
  resetToken: Date.now().toString()
};

// ─── Persistenza su file (backup asincrono, non bloccante) ───────────────────

let saveTimer = null;

function scheduleSave() {
  // Raggruppa scritture ravvicinate in un'unica operazione (debounce 200ms)
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const payload = {
      numbers: state.numbers,
      submittedIps: [...state.submittedIps],
      resetToken: state.resetToken
    };
    fs.writeFile(DATA_FILE, JSON.stringify(payload), err => {
      if (err) console.error('[save] Errore scrittura file:', err.message);
    });
  }, 200);
}

function loadFromFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    state.numbers = Array.isArray(raw.numbers) ? raw.numbers : [];
    state.submittedIps = new Set(Array.isArray(raw.submittedIps) ? raw.submittedIps : []);
    state.resetToken = raw.resetToken || Date.now().toString();
    console.log(`[boot] Caricati ${state.numbers.length} numeri da file`);
  } catch (err) {
    console.error('[boot] Impossibile leggere data.json, parto da zero:', err.message);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress;
}

// ─── API ─────────────────────────────────────────────────────────────────────

// GET /api/data
app.get('/api/data', (req, res) => {
  const count = state.numbers.length;
  const average = count > 0
    ? state.numbers.reduce((sum, n) => sum + n, 0) / count
    : null;
  res.json({
    entries: state.numbers.map((value, i) => ({ id: i + 1, value })),
    average,
    count,
    resetToken: state.resetToken
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

  if (state.submittedIps.has(ip)) {
    return res.status(403).json({ error: 'Hai già inviato un numero', alreadySubmitted: true });
  }

  // Aggiorna stato in memoria (atomico nel single-thread di Node.js)
  state.numbers.push(parsed);
  state.submittedIps.add(ip);

  // Salva su file in modo asincrono senza bloccare la risposta
  scheduleSave();

  res.json({ ok: true, count: state.numbers.length, resetToken: state.resetToken });
});

// DELETE /api/reset
app.delete('/api/reset', (req, res) => {
  state.numbers = [];
  state.submittedIps = new Set();
  state.resetToken = Date.now().toString();
  scheduleSave();
  res.json({ ok: true, resetToken: state.resetToken });
});

// ─── Avvio ───────────────────────────────────────────────────────────────────

loadFromFile();
app.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`));
