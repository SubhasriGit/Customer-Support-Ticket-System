const https = require('https');

const SLA_HOURS = { high: 4, medium: 8, low: 24 };

function slaDeadline(priority) {
  const hours = SLA_HOURS[priority] || 8;
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

function keywordTriage(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  let category = 'general';
  let priority = 'medium';

  if (/billing|payment|invoice|charge|refund|subscription|price/.test(text)) {
    category = 'billing';
  } else if (/error|bug|crash|broken|not working|failed|issue|problem|slow|500|cannot login|can't login/.test(text)) {
    category = 'technical';
  }

  if (/urgent|critical|cannot|blocked|outage|down|immediately|asap|emergency/.test(text)) {
    priority = 'high';
  } else if (/when possible|low priority|minor|sometime|no rush/.test(text)) {
    priority = 'low';
  }

  return { category, priority };
}

async function claudeTriage(title, description) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) return null;

  const prompt = `Categorise this support ticket and return ONLY valid JSON with keys "category" (billing|technical|general) and "priority" (high|medium|low).

Title: ${title}
Description: ${description}`;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
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
          const text = parsed.content?.[0]?.text || '';
          const match = text.match(/\{[^}]+\}/);
          if (match) resolve(JSON.parse(match[0]));
          else resolve(null);
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

async function triage(title, description) {
  const aiResult = await claudeTriage(title, description);
  const result = aiResult || keywordTriage(title, description);
  return {
    category: result.category || 'general',
    priority: result.priority || 'medium',
    sla_due_at: slaDeadline(result.priority || 'medium'),
  };
}

module.exports = { triage };
