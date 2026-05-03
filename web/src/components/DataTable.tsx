import { useEffect, useState, useCallback } from 'react';

interface DataTableProps {
  endpoint: string;
  keyLabel: string;
  valueLabel: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  commitMessage: string;
}

export function DataTable({ endpoint, keyLabel, valueLabel, keyPlaceholder, valuePlaceholder }: DataTableProps) {
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
      setSuccess('Saved. The bot will pick up changes within 2 minutes.');
      await load();
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

  const handleUpdate = (oldKey: string, newVal: string) => {
    const updated = { ...data, [oldKey]: newVal };
    setData(updated);
    save(updated);
  };

  const filtered = Object.entries(data).filter(([k, v]) => {
    const q = search.toLowerCase();
    return k.toLowerCase().includes(q) || v.toLowerCase().includes(q);
  });

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.4 }}>Loading...</div>;
  }

  return (
    <div>
      {error && <div style={errorStyle}>{error}</div>}
      {success && <div style={successStyle}>{success}</div>}

      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>{keyLabel}</th>
              <th style={thStyle}>{valueLabel}</th>
              <th style={{ ...thStyle, width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
              <tr key={key} style={trStyle}>
                <td style={tdStyle}>{key}</td>
                <td style={tdStyle}>
                  <EditableCell
                    value={value}
                    onSave={(v) => handleUpdate(key, v)}
                    disabled={saving}
                  />
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <button
                    onClick={() => handleDelete(key)}
                    disabled={saving}
                    style={deleteBtnStyle}
                    title="Delete"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{keyLabel}</label>
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={keyPlaceholder}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{valueLabel}</label>
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={valuePlaceholder}
            style={inputStyle}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={saving || !newKey.trim() || !newValue.trim()}
          style={addBtnStyle}
        >
          {saving ? '...' : 'Add'}
        </button>
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.8rem', opacity: 0.35 }}>
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
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onSave(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (draft !== value) onSave(draft);
            setEditing(false);
          }
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        disabled={disabled}
        autoFocus
        style={{ ...inputStyle, padding: '0.3rem 0.5rem', fontSize: '0.9rem', width: '100%' }}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      style={{ cursor: 'pointer', borderBottom: '1px dashed rgba(255,255,255,0.2)' }}
      title="Click to edit"
    >
      {value}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: "'Source Serif 4', Georgia, serif",
  fontSize: '0.95rem',
  padding: '0.6rem 0.8rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 3,
  color: '#f5f0e8',
  outline: 'none',
  width: '100%',
};

const labelStyle: React.CSSProperties = {
  fontFamily: "'Oswald', sans-serif",
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  color: 'rgba(245,240,232,0.4)',
  display: 'block',
  marginBottom: '0.3rem',
};

const tableWrapStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  overflow: 'hidden',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9rem',
};

const thStyle: React.CSSProperties = {
  fontFamily: "'Oswald', sans-serif",
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  color: '#c8a94e',
  textAlign: 'left',
  padding: '0.75rem 1rem',
  background: 'rgba(255,255,255,0.03)',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  fontWeight: 600,
};

const trStyle: React.CSSProperties = {
  borderBottom: '1px solid rgba(255,255,255,0.04)',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 1rem',
};

const deleteBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(196,48,43,0.6)',
  fontSize: '1.3rem',
  cursor: 'pointer',
  lineHeight: 1,
  padding: '0.2rem 0.5rem',
  borderRadius: 3,
  transition: 'color 0.15s',
};

const addBtnStyle: React.CSSProperties = {
  fontFamily: "'Oswald', sans-serif",
  fontSize: '0.85rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 600,
  padding: '0.6rem 1.5rem',
  background: '#c8a94e',
  color: '#1a1410',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const errorStyle: React.CSSProperties = {
  background: 'rgba(196,48,43,0.15)',
  border: '1px solid rgba(196,48,43,0.3)',
  borderRadius: 4,
  padding: '0.75rem 1rem',
  marginBottom: '1rem',
  color: '#e05550',
  fontSize: '0.9rem',
};

const successStyle: React.CSSProperties = {
  background: 'rgba(45,90,39,0.15)',
  border: '1px solid rgba(45,90,39,0.3)',
  borderRadius: 4,
  padding: '0.75rem 1rem',
  marginBottom: '1rem',
  color: '#5cb85c',
  fontSize: '0.9rem',
};
