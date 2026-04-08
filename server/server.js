// ╔══════════════════════════════════════════════════════╗
// ║   КОСМОНАВТИКА — Сервер v2                           ║
// ║   Только чистый JS — работает на Render бесплатно    ║
// ╚══════════════════════════════════════════════════════╝

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'players.json');

// ── Загружаем базу из файла (или создаём пустую) ─────────
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch(e) { console.log('DB read error, starting fresh'); }
  return { players: {} };
}

function saveDB(db) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db), 'utf8'); }
  catch(e) { console.error('DB write error:', e.message); }
}

let DB = loadDB();
console.log(`Loaded ${Object.keys(DB.players).length} players from DB`);

// ── Middleware ───────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// ── /ping ────────────────────────────────────────────────
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', time: Date.now(), players: Object.keys(DB.players).length });
});

// ── /save ────────────────────────────────────────────────
app.post('/save', (req, res) => {
  try {
    const { player_id, player_name, nation, resources, buildings, total_resources } = req.body;

    if (!player_id || typeof player_id !== 'string' || player_id.length > 100) {
      return res.status(400).json({ error: 'invalid player_id' });
    }
    if (total_resources > 50_000_000) {
      return res.status(400).json({ error: 'suspicious data' });
    }

    DB.players[player_id] = {
      player_id,
      player_name: String(player_name || 'Игрок').slice(0, 64),
      nation:      String(nation || 'unknown').slice(0, 8),
      resources:   resources || {},
      buildings:   Number(buildings)           || 0,
      total_resources: Number(total_resources) || 0,
      last_seen:   Date.now()
    };

    saveDB(DB);
    res.json({ ok: true });
  } catch(e) {
    console.error('/save error:', e.message);
    res.status(500).json({ error: 'server error' });
  }
});

// ── /leaderboard ─────────────────────────────────────────
app.get('/leaderboard', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const players = Object.values(DB.players)
      .sort((a, b) => b.total_resources - a.total_resources)
      .slice(0, limit)
      .map(({ player_id, player_name, nation, buildings, total_resources }) =>
        ({ player_id, player_name, nation, buildings, total_resources })
      );
    res.json({ players, total: Object.keys(DB.players).length });
  } catch(e) {
    res.status(500).json({ error: 'server error' });
  }
});

// ── /player/:id ──────────────────────────────────────────
app.get('/player/:id', (req, res) => {
  const p = DB.players[req.params.id];
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});

// ── /stats ───────────────────────────────────────────────
app.get('/stats', (req, res) => {
  const all  = Object.values(DB.players);
  const hour = Date.now() - 3_600_000;
  const nations = {};
  all.forEach(p => { nations[p.nation] = (nations[p.nation] || 0) + 1; });
  res.json({
    total_players: all.length,
    active_1h:     all.filter(p => p.last_seen > hour).length,
    by_nation:     nations
  });
});

// ── Запуск ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('🚀 Космонавтика-сервер запущен: порт ' + PORT);
});
