// ╔══════════════════════════════════════════════════════╗
// ║   КОСМОНАВТИКА — Сервер                              ║
// ║   Node.js + Express + SQLite                         ║
// ║   Бесплатный хостинг: Render.com                     ║
// ╚══════════════════════════════════════════════════════╝

const express = require('express');
const cors    = require('cors');
const Database= require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Разрешаем запросы со всех сайтов (CORS) ──────────────
app.use(cors());
app.use(express.json());

// ── База данных (SQLite — файл на диске) ─────────────────
const db = new Database('kosmonavtika.db');

// Создаём таблицу при первом запуске
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    player_id      TEXT PRIMARY KEY,
    player_name    TEXT NOT NULL,
    nation         TEXT,
    resources      TEXT DEFAULT '{}',
    buildings      INTEGER DEFAULT 0,
    total_resources INTEGER DEFAULT 0,
    last_seen      INTEGER DEFAULT 0
  );
`);

// ── /ping — проверка что сервер живой ────────────────────
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

// ── /save — игра сохраняет прогресс каждые 30 секунд ────
// Тело запроса: { player_id, player_name, nation, resources, buildings, total_resources }
app.post('/save', (req, res) => {
  try {
    const { player_id, player_name, nation, resources, buildings, total_resources } = req.body;

    // Валидация — защита от читеров
    if (!player_id || typeof player_id !== 'string' || player_id.length > 50) {
      return res.status(400).json({ error: 'invalid player_id' });
    }
    if (total_resources > 10_000_000) {
      return res.status(400).json({ error: 'suspicious data' });
    }

    // Сохраняем или обновляем запись
    const stmt = db.prepare(`
      INSERT INTO players (player_id, player_name, nation, resources, buildings, total_resources, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        player_name     = excluded.player_name,
        nation          = excluded.nation,
        resources       = excluded.resources,
        buildings       = excluded.buildings,
        total_resources = excluded.total_resources,
        last_seen       = excluded.last_seen
    `);
    stmt.run(
      player_id,
      player_name || 'Игрок',
      nation || 'unknown',
      JSON.stringify(resources || {}),
      buildings || 0,
      total_resources || 0,
      Date.now()
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('/save error:', e.message);
    res.status(500).json({ error: 'server error' });
  }
});

// ── /leaderboard — топ игроков по ресурсам ───────────────
// Query: ?limit=20
app.get('/leaderboard', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const rows = db.prepare(`
      SELECT player_id, player_name, nation, buildings, total_resources
      FROM players
      ORDER BY total_resources DESC
      LIMIT ?
    `).all(limit);
    res.json({ players: rows, total: db.prepare('SELECT COUNT(*) as c FROM players').get().c });
  } catch (e) {
    console.error('/leaderboard error:', e.message);
    res.status(500).json({ error: 'server error' });
  }
});

// ── /player/:id — данные одного игрока ───────────────────
app.get('/player/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM players WHERE player_id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json({ ...row, resources: JSON.parse(row.resources || '{}') });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

// ── Статистика ────────────────────────────────────────────
app.get('/stats', (req, res) => {
  try {
    const total   = db.prepare('SELECT COUNT(*) as c FROM players').get().c;
    const online  = db.prepare('SELECT COUNT(*) as c FROM players WHERE last_seen > ?').get(Date.now() - 3600000).c;
    const nations = db.prepare('SELECT nation, COUNT(*) as cnt FROM players GROUP BY nation').all();
    res.json({ total_players: total, active_1h: online, by_nation: nations });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

// ── Запуск ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Сервер Космонавтика запущен на порту ${PORT}`);
  console.log(`   Ping: http://localhost:${PORT}/ping`);
  console.log(`   Лидеры: http://localhost:${PORT}/leaderboard`);
});
