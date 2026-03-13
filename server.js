const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Stato in memoria ────────────────────────────────────────────────────────
// Node.js è single-thread: nessuna race condition sulle operazioni sincrone.
// submittedTokens = Set di token univoci per browser (UUID generato dal client).

let state = {
  numbers: [],
  submittedTokens: new Set(),
  resetToken: Date.now().toString()
};

// ─── Persistenza su file (backup asincrono, debounced) ───────────────────────

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const payload = {
      numbers: state.numbers,
      submittedTokens: [...state.submittedTokens],
      resetToken: state.resetToken
    };
    fs.writeFile(DATA_FILE, JSON.stringify(payload), err => {
      if (err) console.error('[save] Errore scrittura file:', err.message);
    });
  }, 300);
}

function loadFromFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    state.numbers        = Array.isArray(raw.numbers) ? raw.numbers : [];
    state.submittedTokens = new Set(Array.isArray(raw.submittedTokens) ? raw.submittedTokens : []);
    state.resetToken     = raw.resetToken || Date.now().toString();
    console.log(`[boot] Caricati ${state.numbers.length} numeri dal file`);
  } catch (err) {
    console.error('[boot] data.json non leggibile, parto da zero:', err.message);
  }
}

// ─── API ─────────────────────────────────────────────────────────────────────

// GET /api/data  — dati per admin
app.get('/api/data', (req, res) => {
  const count   = state.numbers.length;
  const average = count > 0
    ? state.numbers.reduce((sum, n) => sum + n, 0) / count
    : null;
  res.json({
    entries:    state.numbers.map((value, i) => ({ id: i + 1, value })),
    average,
    count,
    resetToken: state.resetToken
  });
});

// POST /api/submit  — invio numero con token browser univoco
app.post('/api/submit', (req, res) => {
  const { number, browserToken } = req.body;

  // Valida il numero
  const parsed = parseFloat(number);
  if (number === undefined || number === null || number === '' || isNaN(parsed)) {
    return res.status(400).json({ error: 'Numero non valido' });
  }

  // Valida il token
  if (!browserToken || typeof browserToken !== 'string' || browserToken.length < 8) {
    return res.status(400).json({ error: 'Token mancante' });
  }

  // Controlla se questo browser ha già inviato (in questo ciclo)
  if (state.submittedTokens.has(browserToken)) {
    return res.status(403).json({ error: 'Hai già inviato un numero', alreadySubmitted: true });
  }

  // Salva
  state.numbers.push(parsed);
  state.submittedTokens.add(browserToken);
  scheduleSave();

  res.json({ ok: true, count: state.numbers.length, resetToken: state.resetToken });
});

// DELETE /api/reset  — svuota tutto
app.delete('/api/reset', (req, res) => {
  state.numbers         = [];
  state.submittedTokens = new Set();
  state.resetToken      = Date.now().toString();
  scheduleSave();
  res.json({ ok: true, resetToken: state.resetToken });
});

// ─── Avvio ───────────────────────────────────────────────────────────────────

loadFromFile();
app.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`));
