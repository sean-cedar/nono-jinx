import { useState } from 'react';
import { DataTable } from './DataTable';

type Tab = 'handles' | 'hashtags';

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('handles');

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.reload();
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <TabButton active={tab === 'handles'} onClick={() => setTab('handles')}>
            Player Handles
          </TabButton>
          <TabButton active={tab === 'hashtags'} onClick={() => setTab('hashtags')}>
            Team Hashtags
          </TabButton>
        </div>
        <button onClick={handleLogout} style={logoutStyle}>
          Log Out
        </button>
      </div>

      {tab === 'handles' && (
        <DataTable
          endpoint="/api/handles"
          keyLabel="Player Name"
          valueLabel="X Handle"
          keyPlaceholder="e.g. Gerrit Cole"
          valuePlaceholder="e.g. GerritCole45"
          commitMessage="Update player X handles"
        />
      )}
      {tab === 'hashtags' && (
        <DataTable
          endpoint="/api/hashtags"
          keyLabel="Team Name"
          valueLabel="Hashtag"
          keyPlaceholder="e.g. New York Yankees"
          valuePlaceholder="e.g. #RepBX"
          commitMessage="Update team hashtags"
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'Oswald', sans-serif",
        fontSize: '0.85rem',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.12em',
        fontWeight: 600,
        padding: '0.6rem 1.2rem',
        border: '1px solid',
        borderColor: active ? '#c8a94e' : 'rgba(255,255,255,0.12)',
        borderRadius: 3,
        background: active ? 'rgba(200,169,78,0.12)' : 'transparent',
        color: active ? '#c8a94e' : 'rgba(245,240,232,0.5)',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

const logoutStyle: React.CSSProperties = {
  fontFamily: "'Oswald', sans-serif",
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  padding: '0.5rem 1rem',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 3,
  color: 'rgba(245,240,232,0.4)',
  cursor: 'pointer',
};
