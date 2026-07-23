import React, { useState, useEffect } from 'react';
import TicketForm from './components/TicketForm';
import TicketList from './components/TicketList';
import Dashboard from './components/Dashboard';
import { getTickets, createTicket, updateStatus } from './services/api';

export default function App() {
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('tickets');

  useEffect(() => {
    if (view === 'tickets') getTickets().then(setTickets);
  }, [view]);

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
        <h1 style={styles.title}>Customer Support</h1>
        <nav style={styles.nav}>
          <button
            data-testid="nav-tickets"
            style={{ ...styles.navBtn, ...(view === 'tickets' ? styles.navActive : {}) }}
            onClick={() => setView('tickets')}
          >
            Tickets
          </button>
          <button
            data-testid="nav-dashboard"
            style={{ ...styles.navBtn, ...(view === 'dashboard' ? styles.navActive : {}) }}
            onClick={() => setView('dashboard')}
          >
            Analytics
          </button>
        </nav>
      </header>

      <main style={styles.main}>
        {view === 'tickets' && (
          <>
            <div style={styles.filters}>
              {['all', 'open', 'closed'].map(f => (
                <button
                  key={f}
                  data-testid={`filter-${f}`}
                  style={{ ...styles.filterBtn, ...(filter === f ? styles.filterActive : {}) }}
                  onClick={() => setFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== 'all' && (
                    <span style={styles.filterCount}>
                      {tickets.filter(t => t.status === f).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <TicketForm onCreated={handleCreate} />
            <TicketList tickets={filtered} onStatusToggle={handleStatusToggle} />
          </>
        )}
        {view === 'dashboard' && <Dashboard />}
      </main>
    </div>
  );
}

const styles = {
  app: { minHeight: '100vh', background: '#f8fafc' },
  header: { background: '#1e3a5f', color: '#fff', padding: '14px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 700, margin: 0 },
  nav: { display: 'flex', gap: 4 },
  navBtn: { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '5px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13 },
  navActive: { background: '#fff', color: '#1e3a5f', fontWeight: 600 },
  main: { maxWidth: 860, margin: '24px auto', padding: '0 16px' },
  filters: { display: 'flex', gap: 8, marginBottom: 16 },
  filterBtn: { background: '#fff', border: '1px solid #e2e8f0', color: '#475569', padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 },
  filterActive: { background: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f', fontWeight: 600 },
  filterCount: { background: 'rgba(255,255,255,0.25)', borderRadius: 10, padding: '0px 6px', fontSize: 11 },
};
