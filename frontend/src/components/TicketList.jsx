import React from 'react';

export default function TicketList({ tickets, onStatusToggle }) {
  if (!tickets.length) return <p style={styles.empty}>No tickets yet.</p>;

  return (
    <div data-testid="ticket-list">
      {tickets.map(ticket => (
        <div key={ticket.id} data-testid={`ticket-${ticket.id}`} style={styles.card}>
          <div style={styles.header}>
            <span data-testid={`ticket-title-${ticket.id}`} style={styles.title}>{ticket.title}</span>
            <span
              data-testid={`ticket-status-${ticket.id}`}
              style={{ ...styles.badge, background: ticket.status === 'open' ? '#dcfce7' : '#f1f5f9', color: ticket.status === 'open' ? '#16a34a' : '#64748b' }}
            >
              {ticket.status}
            </span>
          </div>
          <p style={styles.email}>{ticket.email}</p>
          <p style={styles.description}>{ticket.description}</p>
          <div style={styles.footer}>
            <span style={styles.date}>{new Date(ticket.created_at).toLocaleString()}</span>
            <button
              data-testid={`toggle-status-${ticket.id}`}
              style={styles.toggle}
              onClick={() => onStatusToggle(ticket.id, ticket.status === 'open' ? 'closed' : 'open')}
            >
              {ticket.status === 'open' ? 'Close' : 'Reopen'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const styles = {
  card: { background: '#fff', padding: 16, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontWeight: 600, fontSize: 15 },
  badge: { fontSize: 12, padding: '2px 8px', borderRadius: 12, fontWeight: 500 },
  email: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  description: { fontSize: 14, color: '#475569', marginBottom: 12 },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 12, color: '#94a3b8' },
  toggle: { background: 'transparent', border: '1px solid #e2e8f0', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  empty: { textAlign: 'center', color: '#94a3b8', padding: 40 },
};
