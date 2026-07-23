import React, { useState, useEffect } from 'react';
import { getSuggestedReply, saveResponse } from '../services/api';

export default function SuggestedReply({ ticketId }) {
  const [suggestion, setSuggestion] = useState('');
  const [edited, setEdited] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    setLoading(true);
    getSuggestedReply(ticketId)
      .then(data => { setSuggestion(data.suggestion); setEdited(data.suggestion); })
      .finally(() => setLoading(false));
  }, [ticketId]);

  const handle = async (accepted) => {
    await saveResponse(ticketId, edited, accepted);
    setSaved(accepted ? 'accepted' : 'discarded');
  };

  if (loading) return <div data-testid="suggest-loading" style={styles.box}>Loading suggestion...</div>;
  if (saved) return (
    <div data-testid="suggest-saved" style={{ ...styles.box, background: saved === 'accepted' ? '#f0fdf4' : '#f8fafc', color: '#64748b', fontSize: 13 }}>
      {saved === 'accepted' ? '✅ Response saved.' : '✗ Discarded.'}
    </div>
  );

  return (
    <div data-testid="suggested-reply" style={styles.box}>
      <p style={styles.label}>💡 AI Suggested Reply</p>
      <textarea
        data-testid="suggest-textarea"
        style={styles.textarea}
        value={edited}
        onChange={e => setEdited(e.target.value)}
        rows={5}
      />
      <div style={styles.actions}>
        <button data-testid="suggest-accept" style={styles.accept} onClick={() => handle(true)}>✅ Accept &amp; Save</button>
        <button data-testid="suggest-discard" style={styles.discard} onClick={() => handle(false)}>✗ Discard</button>
      </div>
    </div>
  );
}

const styles = {
  box: { marginTop: 12, padding: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8 },
  label: { fontSize: 13, fontWeight: 600, color: '#0284c7', marginBottom: 8 },
  textarea: { width: '100%', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  actions: { display: 'flex', gap: 8, marginTop: 8 },
  accept: { background: '#dcfce7', border: '1px solid #86efac', padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#16a34a', fontWeight: 500 },
  discard: { background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#64748b' },
};
