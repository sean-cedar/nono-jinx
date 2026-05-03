import { useEffect, useState, useCallback } from 'react';

interface DataTableProps {
  endpoint: string;
  keyLabel: string;
  valueLabel: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  linkPrefix?: string;
}

export function DataTable({ endpoint, keyLabel, valueLabel, keyPlaceholder, valuePlaceholder, linkPrefix }: DataTableProps) {
  const [data, setData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setData(json.data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  const save = async (updated: Record<string, string>) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: updated }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Save failed');
      }
      setSuccess('Saved. Changes picked up within 2 minutes.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    if (!newKey.trim() || !newValue.trim()) return;
    const updated = { ...data, [newKey.trim()]: newValue.trim() };
    setData(updated);
    setNewKey('');
    setNewValue('');
    save(updated);
  };

  const handleDelete = (key: string) => {
    const updated = { ...data };
    delete updated[key];
    setData(updated);
    save(updated);
  };

  const handleUpdateKey = (oldKey: string, newKeyVal: string) => {
    if (newKeyVal === oldKey || !newKeyVal.trim()) return;
    const updated: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      updated[k === oldKey ? newKeyVal.trim() : k] = v;
    }
    setData(updated);
    save(updated);
  };

  const handleUpdateValue = (key: string, newVal: string) => {
    const updated = { ...data, [key]: newVal };
    setData(updated);
    save(updated);
  };

  const filtered = Object.entries(data).filter(([k, v]) => {
    const q = search.toLowerCase();
    return k.toLowerCase().includes(q) || v.toLowerCase().includes(q);
  });

  if (loading) {
    return <div style={{ padding: '3rem', opacity: 0.3, textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div>
      {error && <div style={msgStyle('#d42b2b')}>{error}</div>}
      {success && <div style={msgStyle('#2a9d2a')}>{success}</div>}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search..."
        style={{ ...inputStyle, marginBottom: '1rem' }}
      />

      <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>{keyLabel}</th>
              <th style={thStyle}>{valueLabel}</th>
              {linkPrefix && <th style={{ ...thStyle, width: 30 }}></th>}
              <th style={{ ...thStyle, width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
              <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={tdStyle}>
                  <EditableCell value={key} onSave={(v) => handleUpdateKey(key, v)} disabled={saving} />
                </td>
                <td style={tdStyle}>
                  <EditableCell value={value} onSave={(v) => handleUpdateValue(key, v)} disabled={saving} />
                </td>
                {linkPrefix && (
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <a href={`${linkPrefix}${value}`} target="_blank" rel="noopener noreferrer" style={linkStyle} title={`@${value}`}>↗</a>
                  </td>
                )}
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <button onClick={() => handleDelete(key)} disabled={saving} style={delStyle}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{keyLabel}</label>
          <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder={keyPlaceholder} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{valueLabel}</label>
          <input type="text" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={valuePlaceholder} style={inputStyle}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
        </div>
        <button onClick={handleAdd} disabled={saving || !newKey.trim() || !newValue.trim()} style={addStyle}>
          {saving ? '...' : 'Add'}
        </button>
      </div>

      <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', opacity: 0.25 }}>
        {Object.keys(data).length} entries
      </div>
    </div>
  );
}

function EditableCell({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input type="text" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onSave(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { if (draft !== value) onSave(draft); setEditing(false); }
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        disabled={disabled} autoFocus
        style={{ ...inputStyle, padding: '0.2rem 0.4rem', fontSize: '0.85rem' }} />
    );
  }

  return (
    <span onClick={() => { setDraft(value); setEditing(true); }}
      style={{ cursor: 'pointer', borderBottom: '1px dashed rgba(255,255,255,0.15)' }} title="Click to edit">
      {value}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: '0.9rem',
  padding: '0.55rem 0.7rem',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 2,
  color: '#fafafa',
  outline: 'none',
  width: '100%',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  color: 'rgba(250,250,250,0.3)',
  display: 'block',
  marginBottom: '0.25rem',
};

const thStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  color: '#d42b2b',
  textAlign: 'left',
  padding: '0.6rem 0.8rem',
  background: 'rgba(255,255,255,0.02)',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = { padding: '0.5rem 0.8rem' };

const linkStyle: React.CSSProperties = {
  color: 'rgba(250,250,250,0.35)',
  textDecoration: 'none',
  fontSize: '0.9rem',
};

const delStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(212,43,43,0.5)',
  fontSize: '1.1rem',
  cursor: 'pointer',
  padding: '0 0.3rem',
};

const addStyle: React.CSSProperties = {
  fontFamily: "'Archivo Black', Impact, sans-serif",
  fontSize: '0.75rem',
  padding: '0.55rem 1.2rem',
  background: '#d42b2b',
  color: '#fafafa',
  border: 'none',
  borderRadius: 2,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function msgStyle(color: string): React.CSSProperties {
  return {
    background: `${color}15`,
    border: `1px solid ${color}30`,
    borderRadius: 2,
    padding: '0.6rem 0.8rem',
    marginBottom: '0.75rem',
    color,
    fontSize: '0.85rem',
  };
}
