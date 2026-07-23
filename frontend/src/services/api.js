const BASE = '/api/tickets';

export const getTickets = () => fetch(BASE).then(r => r.json());

export const createTicket = (data) =>
  fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());

export const updateStatus = (id, status) =>
  fetch(`${BASE}/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).then(r => r.json());

export const deleteTicket = (id) =>
  fetch(`${BASE}/${id}`, { method: 'DELETE' });

export const getSuggestedReply = (id) =>
  fetch(`${BASE}/${id}/suggest-reply`).then(r => r.json());

export const saveResponse = (id, response, accepted) =>
  fetch(`${BASE}/${id}/response`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response, accepted }) }).then(r => r.json());

export const getAnalytics = () =>
  fetch('/api/analytics').then(r => r.json());
