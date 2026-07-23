import React, { useState, useEffect } from 'react';
import TicketForm from './components/TicketForm';
import TicketList from './components/TicketList';
import { getTickets, createTicket, updateStatus } from './services/api';

export default function App() {
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => { getTickets().then(setTickets); }, []);

  const handleCreate = async (data) => {
    const ticket = await createTicket(data);
    setTickets(prev => [ticket, ...prev]);
  };

  const handleStatusToggle = async (id, status) => {
    const updated = await updateStatus(id, status);
    setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  const filtered = tickets.filter(t => filter === 'all' || t.status === filter);

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>Support Tickets</h1>
        <div style={styles.filters}>
          {['all', 'open', 'closed'].map(f => (
            <button
              key={f}
              data-testid={`filter-${f}`}
              style={{ ...styles.filterBtn, ...(filter === f ? styles.filterActive : {}) }}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </header>
      <main style={styles.main}>
        <TicketForm onCreated={handleCreate} />
        <TicketList tickets={filtered} onStatusToggle={handleStatusToggle} />
      </main>
    </div>
  );
}

const styles = {
  app: { minHeight: '100vh' },
  header: { background: '#1e3a5f', color: '#fff', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 600 },
  filters: { display: 'flex', gap: 8 },
  filterBtn: { background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13 },
  filterActive: { background: '#fff', color: '#1e3a5f', fontWeight: 600 },
  main: { maxWidth: 800, margin: '32px auto', padding: '0 16px' },
};
