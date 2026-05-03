import { useEffect, useState } from 'react';

interface HistoryEntry {
  timestamp: string;
  eventType: string;
  pitcherName: string;
  pitchingTeam: string;
  battingTeam: string;
  inning: string;
  tweetText: string;
}

export function PostHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/history?limit=30')
      .then(r => r.json())
      .then(json => setEntries(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ opacity: 0.3, padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (entries.length === 0) return <div style={{ opacity: 0.3, padding: '2rem', textAlign: 'center' }}>No posts yet. The agent will log posts here when it jinxes a no-hitter.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {entries.map((e, i) => (
        <div key={i} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={eventStyle}>{e.eventType.replace(/_/g, ' ')}</span>
            <span style={timeStyle}>{new Date(e.timestamp).toLocaleString()}</span>
          </div>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '0.4rem' }}>{e.tweetText}</p>
          <span style={gameStyle}>{e.pitcherName} · {e.pitchingTeam} vs {e.battingTeam} · {e.inning}</span>
        </div>
      ))}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 4,
  background: 'rgba(255,255,255,0.02)',
};

const eventStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: '#d42b2b',
};

const timeStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: 'rgba(250,250,250,0.3)',
};

const gameStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'rgba(250,250,250,0.35)',
};
