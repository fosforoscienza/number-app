const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI environment variable is not set.');
  process.exit(1);
}

// --- Schemas ---

const numberSchema = new mongoose.Schema({
  value: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

const submittedIpSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true }
});

const settingsSchema = new mongoose.Schema({
  _id: { type: String },
  resetToken: { type: String, required: true }
});

const NumberEntry = mongoose.model('NumberEntry', numberSchema);
const SubmittedIp = mongoose.model('SubmittedIp', submittedIpSchema);
const Settings = mongoose.model('Settings', settingsSchema);

// --- Helpers ---

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress;
}

async function getResetToken() {
  const settings = await Settings.findById('main');
  return settings ? settings.resetToken : '0';
}

async function ensureSettings() {
  const exists = await Settings.findById('main');
  if (!exists) {
    await Settings.create({ _id: 'main', resetToken: Date.now().toString() });
  }
}

// --- Middleware ---

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ---

// GET /api/data — lista numeri, media, resetToken
app.get('/api/data', async (req, res) => {
  try {
    const entries = await NumberEntry.find().sort({ createdAt: 1 });
    const values = entries.map(e => e.value);
    const count = values.length;
    const average = count > 0
      ? values.reduce((sum, n) => sum + n, 0) / count
      : null;
    const resetToken = await getResetToken();
    res.json({
      entries: entries.map((e, i) => ({ id: i + 1, value: e.value })),
      average,
      count,
      resetToken
    });
  } catch (err) {
    res.status(500).json({ error: 'Errore database' });
  }
});

// POST /api/submit — invia un numero (un solo invio per IP)
app.post('/api/submit', async (req, res) => {
  const { number } = req.body;
  const parsed = parseFloat(number);
  if (number === undefined || number === null || number === '' || isNaN(parsed)) {
    return res.status(400).json({ error: 'Numero non valido' });
  }

  const ip = getClientIp(req);

  try {
    const alreadySubmitted = await SubmittedIp.findOne({ ip });
    if (alreadySubmitted) {
      return res.status(403).json({ error: 'Hai già inviato un numero', alreadySubmitted: true });
    }

    await NumberEntry.create({ value: parsed });
    await SubmittedIp.create({ ip });

    const count = await NumberEntry.countDocuments();
    res.json({ ok: true, count });
  } catch (err) {
    res.status(500).json({ error: 'Errore database' });
  }
});

// DELETE /api/reset — svuota tutto e genera nuovo resetToken
app.delete('/api/reset', async (req, res) => {
  try {
    await NumberEntry.deleteMany({});
    await SubmittedIp.deleteMany({});
    const newToken = Date.now().toString();
    await Settings.findByIdAndUpdate('main', { resetToken: newToken }, { upsert: true });
    res.json({ ok: true, resetToken: newToken });
  } catch (err) {
    res.status(500).json({ error: 'Errore database' });
  }
});

// --- Start ---

mongoose.connect(MONGODB_URI)
  .then(async () => {
    await ensureSettings();
    console.log('MongoDB connesso');
    app.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Errore connessione MongoDB:', err.message);
    process.exit(1);
  });
