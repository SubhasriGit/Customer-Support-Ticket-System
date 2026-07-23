import React, { useState } from 'react';

export default function TicketForm({ onCreated }) {
  const [form, setForm] = useState({ title: '', description: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onCreated(form);
      setForm({ title: '', description: '', email: '' });
    } catch {
      setError('Failed to submit ticket. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form data-testid="ticket-form" onSubmit={handleSubmit} style={styles.form}>
      <h2 style={styles.heading}>Submit a Support Ticket</h2>
      {error && <p style={styles.error}>{error}</p>}
      <input
        data-testid="ticket-title"
        style={styles.input}
        placeholder="Title"
        value={form.title}
        onChange={e => setForm({ ...form, title: e.target.value })}
        required
      />
      <input
        data-testid="ticket-email"
        style={styles.input}
        type="email"
        placeholder="Your email"
        value={form.email}
        onChange={e => setForm({ ...form, email: e.target.value })}
        required
      />
      <textarea
        data-testid="ticket-description"
        style={{ ...styles.input, height: 100, resize: 'vertical' }}
        placeholder="Describe your issue..."
        value={form.description}
        onChange={e => setForm({ ...form, description: e.target.value })}
        required
      />
      <button data-testid="ticket-submit" style={styles.button} type="submit" disabled={loading}>
        {loading ? 'Submitting...' : 'Submit Ticket'}
      </button>
    </form>
  );
}

const styles = {
  form: { background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.1)', marginBottom: 24 },
  heading: { marginBottom: 16, fontSize: 18 },
  input: { display: 'block', width: '100%', padding: '10px 12px', marginBottom: 12, border: '1px solid #ddd', borderRadius: 6, fontSize: 14 },
  button: { background: '#2563eb', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  error: { color: '#dc2626', marginBottom: 12, fontSize: 13 },
};
