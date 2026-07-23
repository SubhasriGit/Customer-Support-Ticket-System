import React, { useState, useEffect } from 'react';
import { getAnalytics } from '../services/api';

function KPICard({ label, value, sub, color }) {
  return (
    <div data-testid={`kpi-${label.toLowerCase().replace(/\s/g, '-')}`} style={{ ...styles.kpi, borderTop: `3px solid ${color}` }}>
      <div style={{ ...styles.kpiValue, color }}>{value}</div>
      <div style={styles.kpiLabel}>{label}</div>
      {sub && <div style={styles.kpiSub}>{sub}</div>}
    </div>
  );
}

function BarChart({ data, labelKey, valueKey, color }) {
  if (!data?.length) return <p style={styles.empty}>No data yet.</p>;
  const max = Math.max(...data.map(d => d[valueKey]));
  return (
    <div style={styles.chart}>
      {data.map((d, i) => (
        <div key={i} style={styles.bar}>
          <div style={styles.barLabel}>{d[labelKey]}</div>
          <div style={styles.barTrack}>
            <div style={{ ...styles.barFill, width: `${(d[valueKey] / max) * 100}%`, background: color }} />
          </div>
          <div style={styles.barValue}>{d[valueKey]}</div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalytics().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={styles.loading}>Loading analytics...</div>;
  if (!data) return <div style={styles.loading}>Failed to load analytics.</div>;

  const avgHours = data.avgResolutionMs ? (data.avgResolutionMs / 3600000).toFixed(1) : '—';

  return (
    <div data-testid="dashboard" style={styles.container}>
      <h2 style={styles.heading}>Analytics Dashboard</h2>

      <div style={styles.kpiRow}>
        <KPICard label="Total Tickets" value={data.total} color="#1e3a5f" />
        <KPICard label="Open" value={data.open} sub={`${data.total ? Math.round(data.open / data.total * 100) : 0}%`} color="#0284c7" />
        <KPICard label="Closed" value={data.closed} sub={`${data.total ? Math.round(data.closed / data.total * 100) : 0}%`} color="#16a34a" />
        <KPICard label="SLA Breaches" value={data.slaBreaches} color="#dc2626" />
        <KPICard label="Avg Resolution" value={`${avgHours}h`} color="#9333ea" />
      </div>

      <div style={styles.charts}>
        <div style={styles.chartBox}>
          <h3 style={styles.chartTitle}>By Category</h3>
          <BarChart data={data.byCategory} labelKey="category" valueKey="count" color="#2563eb" />
        </div>
        <div style={styles.chartBox}>
          <h3 style={styles.chartTitle}>By Priority</h3>
          <BarChart data={data.byPriority} labelKey="priority" valueKey="count" color="#dc2626" />
        </div>
        <div style={styles.chartBox}>
          <h3 style={styles.chartTitle}>Volume — Last 7 Days</h3>
          <BarChart data={data.volumeByDay} labelKey="day" valueKey="count" color="#16a34a" />
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { padding: '0 16px 32px' },
  heading: { fontSize: 18, fontWeight: 700, color: '#1e3a5f', marginBottom: 20 },
  kpiRow: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 },
  kpi: { background: '#fff', borderRadius: 8, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', minWidth: 120, flex: 1 },
  kpiValue: { fontSize: 28, fontWeight: 700, lineHeight: 1 },
  kpiLabel: { fontSize: 12, color: '#64748b', marginTop: 4 },
  kpiSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  charts: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  chartBox: { background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flex: '1 1 260px' },
  chartTitle: { fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 12 },
  chart: { display: 'flex', flexDirection: 'column', gap: 8 },
  bar: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 },
  barLabel: { width: 90, color: '#64748b', fontSize: 12, textTransform: 'capitalize' },
  barTrack: { flex: 1, height: 16, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, transition: 'width 0.3s' },
  barValue: { width: 24, textAlign: 'right', color: '#475569', fontSize: 12, fontWeight: 600 },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 20 },
  loading: { textAlign: 'center', color: '#94a3b8', padding: 40 },
};
