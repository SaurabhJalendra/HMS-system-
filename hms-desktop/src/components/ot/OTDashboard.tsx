import React, { useState, useEffect } from 'react';
import otService from '../../lib/api/services/otService';
import LoadingSpinner from '../common/LoadingSpinner';

const OTDashboard = ({ user, onBack }) => {
  const [stats, setStats] = useState({ roomStats: null, surgeryStats: null });
  const [surgeriesToday, setSurgeriesToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [roomRes, surgeryRes, listRes] = await Promise.allSettled([
          otService.getOTRoomStats(),
          otService.getSurgeryStats(),
          otService.getSurgeries({
            from: new Date().toISOString().slice(0, 10),
            to: new Date().toISOString().slice(0, 10),
            limit: 20,
          }),
        ]);
        setStats({
          roomStats: roomRes.status === 'fulfilled' ? roomRes.value?.data : null,
          surgeryStats: surgeryRes.status === 'fulfilled' ? surgeryRes.value?.data : null,
        });
        setSurgeriesToday(listRes.status === 'fulfilled' ? listRes.value?.data?.surgeries || [] : []);
        const failed = [roomRes, surgeryRes, listRes].find((result) => result.status === 'rejected');
        if (failed && failed.status === 'rejected') {
          setError(failed.reason?.response?.data?.message || failed.reason?.message || 'Some OT dashboard data failed to load');
        }
      } catch (e) {
        setError(e?.response?.data?.message || 'Failed to load OT dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ padding: 16, backgroundColor: '#F0F0F0' }}>
      <h2 style={{ marginBottom: 16 }}>OT Dashboard</h2>
      {error && <p style={{ color: '#B91C1C', marginBottom: 12 }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#FFF', padding: 16, borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>OT Rooms</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{stats.roomStats?.totalRooms ?? '-'}</div>
        </div>
        <div style={{ background: '#FFF', padding: 16, borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Available</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#059669' }}>{stats.roomStats?.available ?? '-'}</div>
        </div>
        <div style={{ background: '#FFF', padding: 16, borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Surgeries Today</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{stats.surgeryStats?.scheduledToday ?? '-'}</div>
        </div>
        <div style={{ background: '#FFF', padding: 16, borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>In Progress</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#D97706' }}>{stats.surgeryStats?.inProgress ?? '-'}</div>
        </div>
      </div>
      <div style={{ background: '#FFF', padding: 16, borderRadius: 8, border: '1px solid #E5E7EB' }}>
        <h3 style={{ marginBottom: 12 }}>Today&apos;s Surgeries</h3>
        {surgeriesToday.length === 0 ? (
          <p style={{ color: '#6B7280' }}>No surgeries scheduled for today.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {surgeriesToday.map((s) => (
              <li key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid #E5E7EB' }}>
                <strong>{s.procedureName}</strong> — {s.patient?.name} — {new Date(s.scheduledAt).toLocaleTimeString()} — {s.status}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default OTDashboard;
