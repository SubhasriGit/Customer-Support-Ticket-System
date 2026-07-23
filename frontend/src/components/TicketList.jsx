import React, { useState } from 'react';
import SuggestedReply from './SuggestedReply';

const PRIORITY_COLORS = {
  high:   { bg: '#fee2e2', color: '#dc2626' },
  medium: { bg: '#fef9c3', color: '#ca8a04' },
  low:    { bg: '#dcfce7', color: '#16a34a' },
};

const CATEGORY_COLORS = {
  technical: { bg: '#eff6ff', color: '#2563eb' },
  billing:   { bg: '#fdf4ff', color: '#9333ea' },
  general:   { bg: '#f8fafc', color: '#475569' },
};

function SLACountdown({ sla_due_at, sla_breached }) {
  if (!sla_due_at) return null;
  const remaining = new Date(sla_due_at) - Date.now();
  if (sla_breached || remaining <= 0) {
    return <span data-testid="sla-breached" style={styles.slaBreach}>SLA Breached</span>;
  }
  const hrs  = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const urgent = remaining < 3600000;
  return (
    <span data-testid="sla-countdown" style={{ ...styles.sla, color: urgent ? '#dc2626' : '#64748b' }}>
      SLA: {hrs}h {mins}m
    </span>
  );
}

export default function TicketList({ tickets, onStatusToggle }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!tickets.length) return <p style={styles.empty}>No tickets yet.</p>;

  return (
    <div data-testid="ticket-list">
      {tickets.map(ticket => {
        const priorityStyle = PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.medium;
        const categoryStyle = CATEGORY_COLORS[ticket.category] || CATEGORY_COLORS.general;
        const isOpen = ticket.status === 'open';

        return (
          <div key={ticket.id} data-testid={`ticket-card-${ticket.id}`} style={styles.card}>
            <div style={styles.header}>
              <span data-testid={`ticket-title-${ticket.id}`} style={styles.title}>{ticket.title}</span>
              <div style={styles.badgeRow}>
                {ticket.priority && (
                  <span data-testid={`ticket-priority-${ticket.id}`}
                    style={{ ...styles.badge, background: priorityStyle.bg, color: priorityStyle.color }}>
                    {ticket.priority}
                  </span>
                )}
                {ticket.category && (
                  <span data-testid={`ticket-category-${ticket.id}`}
                    style={{ ...styles.badge, background: categoryStyle.bg, color: categoryStyle.color }}>
                    {ticket.category}
                  </span>
                )}
                <span
                  data-testid={`ticket-status-${ticket.id}`}
                  style={{ ...styles.badge, background: isOpen ? '#dcfce7' : '#f1f5f9', color: isOpen ? '#16a34a' : '#64748b' }}
                >
                  {ticket.status}
                </span>
              </div>
            </div>

            <p style={styles.email}>{ticket.email}</p>
            <p style={styles.description}>{ticket.description}</p>

            <div style={styles.footer}>
              <div style={styles.footerLeft}>
                <span style={styles.date}>{new Date(ticket.created_at).toLocaleString()}</span>
                <SLACountdown sla_due_at={ticket.sla_due_at} sla_breached={ticket.sla_breached} />
              </div>
              <div style={styles.footerRight}>
                {isOpen && (
                  <button
                    data-testid={`suggest-reply-${ticket.id}`}
                    style={styles.suggestBtn}
                    onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
                  >
                    {expandedId === ticket.id ? 'Hide Reply' : '💡 Suggest Reply'}
                  </button>
                )}
                <button
                  data-testid={`toggle-status-${ticket.id}`}
                  style={styles.toggle}
                  onClick={() => onStatusToggle(ticket.id, isOpen ? 'closed' : 'open')}
                >
                  {isOpen ? 'Close' : 'Reopen'}
                </button>
              </div>
            </div>

            {expandedId === ticket.id && (
              <SuggestedReply ticketId={ticket.id} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  card: { background: '#fff', padding: 16, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8 },
  title: { fontWeight: 600, fontSize: 15, flex: 1 },
  badgeRow: { display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' },
  badge: { fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 500, whiteSpace: 'nowrap' },
  email: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  description: { fontSize: 14, color: '#475569', marginBottom: 12 },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  footerLeft: { display: 'flex', gap: 12, alignItems: 'center' },
  footerRight: { display: 'flex', gap: 8 },
  date: { fontSize: 12, color: '#94a3b8' },
  sla: { fontSize: 12, fontWeight: 500 },
  slaBreach: { fontSize: 12, fontWeight: 600, color: '#dc2626', background: '#fee2e2', padding: '1px 6px', borderRadius: 8 },
  toggle: { background: 'transparent', border: '1px solid #e2e8f0', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  suggestBtn: { background: '#f0f9ff', border: '1px solid #bae6fd', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#0284c7' },
  empty: { textAlign: 'center', color: '#94a3b8', padding: 40 },
};
