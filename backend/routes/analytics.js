const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as n FROM tickets').get().n;
  const open = db.prepare("SELECT COUNT(*) as n FROM tickets WHERE status = 'open'").get().n;
  const closed = db.prepare("SELECT COUNT(*) as n FROM tickets WHERE status = 'closed'").get().n;
  const slaBreaches = db.prepare('SELECT COUNT(*) as n FROM tickets WHERE sla_breached = 1').get().n;

  const resolutionRow = db.prepare(`
    SELECT AVG(
      (strftime('%s', updated_at) - strftime('%s', created_at)) * 1000
    ) as avg_ms
    FROM tickets WHERE status = 'closed'
  `).get();

  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM tickets
    WHERE category IS NOT NULL
    GROUP BY category
  `).all();

  const byPriority = db.prepare(`
    SELECT priority, COUNT(*) as count
    FROM tickets
    WHERE priority IS NOT NULL
    GROUP BY priority
  `).all();

  // Volume over last 7 days
  const volumeByDay = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM tickets
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY day
    ORDER BY day
  `).all();

  res.json({
    total,
    open,
    closed,
    slaBreaches,
    avgResolutionMs: Math.round(resolutionRow.avg_ms || 0),
    byCategory,
    byPriority,
    volumeByDay,
  });
});

module.exports = router;
