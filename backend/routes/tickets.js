const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { triage } = require('../services/triageService');

router.get('/', (req, res) => {
  const tickets = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all();

  // Mark SLA breached in-flight (no background job needed for capstone)
  const now = new Date().toISOString();
  for (const t of tickets) {
    if (t.status === 'open' && t.sla_due_at && t.sla_due_at < now && !t.sla_breached) {
      db.prepare('UPDATE tickets SET sla_breached = 1 WHERE id = ?').run(t.id);
      t.sla_breached = 1;
    }
  }

  res.json(tickets);
});

router.get('/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

router.post('/', async (req, res) => {
  const { title, description, email } = req.body;
  if (!title || !description || !email) {
    return res.status(400).json({ error: 'title, description, and email are required' });
  }

  let category = null, priority = 'medium', sla_due_at = null;
  try {
    const result = await triage(title, description);
    category = result.category;
    priority = result.priority;
    sla_due_at = result.sla_due_at;
  } catch {
    // triage failure is non-fatal — ticket is still created
  }

  const result = db.prepare(
    'INSERT INTO tickets (title, description, email, category, priority, sla_due_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(title, description, email, category, priority, sla_due_at);

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(ticket);
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['open', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'status must be open or closed' });
  }
  const result = db.prepare(
    'UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Ticket not found' });
  res.json(db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Ticket not found' });
  res.status(204).send();
});

module.exports = router;
