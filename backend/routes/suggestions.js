const express = require('express');
const router = express.Router();
const db = require('../db/database');
const https = require('https');

function keywordSuggestion(ticket) {
  const category = ticket.category || 'general';
  const templates = {
    billing: `Hi ${ticket.email.split('@')[0]},\n\nThank you for reaching out about your billing enquiry. I've reviewed your account and will investigate the issue right away. You can expect a resolution within ${ticket.priority === 'high' ? '4 hours' : '8 hours'}.\n\nBest regards,\nSupport Team`,
    technical: `Hi ${ticket.email.split('@')[0]},\n\nThank you for reporting this technical issue. Our engineering team has been alerted and is looking into "${ticket.title}". We'll update you as soon as we have a fix.\n\nBest regards,\nSupport Team`,
    general: `Hi ${ticket.email.split('@')[0]},\n\nThank you for contacting us. We've received your request and a support agent will be in touch shortly. Your ticket reference is #${ticket.id}.\n\nBest regards,\nSupport Team`,
  };
  return templates[category] || templates.general;
}

async function claudeSuggestion(ticket) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) return null;

  const prompt = `You are a helpful support agent. Write a concise, professional reply to this support ticket in 3-4 sentences.

Ticket #${ticket.id}: ${ticket.title}
From: ${ticket.email}
Category: ${ticket.category || 'general'}
Priority: ${ticket.priority || 'medium'}
Description: ${ticket.description}

Reply only with the email body text, no subject line.`;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.content?.[0]?.text || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

// GET /api/tickets/:id/suggest-reply
router.get('/:id/suggest-reply', async (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const aiSuggestion = await claudeSuggestion(ticket);
  const suggestion = aiSuggestion || keywordSuggestion(ticket);

  res.json({ suggestion });
});

// PATCH /api/tickets/:id/response
router.patch('/:id/response', (req, res) => {
  const { response, accepted } = req.body;
  if (!response) return res.status(400).json({ error: 'response is required' });

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  db.prepare(
    'INSERT INTO responses (ticket_id, suggestion, accepted) VALUES (?, ?, ?)'
  ).run(ticket.id, response, accepted ? 1 : 0);

  res.json({ id: ticket.id, response, accepted: !!accepted });
});

module.exports = router;
