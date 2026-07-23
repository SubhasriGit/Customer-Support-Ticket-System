const BASE = '/api/tickets';

export const getTickets = () => fetch(BASE).then(r => r.json());

export const createTicket = (data) =>
  fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());

export const updateStatus = (id, status) =>
  fetch(`${BASE}/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).then(r => r.json());

export const deleteTicket = (id) =>
  fetch(`${BASE}/${id}`, { method: 'DELETE' });
