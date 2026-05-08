import { useState } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';

export function AdhocPost() {
  const [instruction, setInstruction] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [postedText, setPostedText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    const trimmed = instruction.trim();
    if (!trimmed) return;

    setStatus('loading');
    setPostedText('');
    setErrorMsg('');

    try {
      const res = await fetch('/api/adhoc-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: trimmed }),
      });

      const data = await res.json();

      if (data.success) {
        setStatus('success');
        setPostedText(data.text);
        setInstruction('');
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Failed to post');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(String(err));
    }
  };

  return (
    <div style={containerStyle}>
      <h2 style={headingStyle}>Ad-Hoc Post</h2>
      <p style={descStyle}>
        Give the jinx an instruction and it'll craft a post in character and send it to X immediately.
      </p>

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={'e.g. "Post something funny about the rain delay" or "Hype up tonight\'s slate of games"'}
        rows={3}
        style={textareaStyle}
        disabled={status === 'loading'}
      />

      <button
        onClick={handleSubmit}
        disabled={status === 'loading' || !instruction.trim()}
        style={{
          ...buttonStyle,
          opacity: status === 'loading' || !instruction.trim() ? 0.5 : 1,
          cursor: status === 'loading' || !instruction.trim() ? 'not-allowed' : 'pointer',
        }}
      >
        {status === 'loading' ? 'Generating & Posting...' : 'Send Post'}
      </button>

      {status === 'success' && (
        <div style={successStyle}>
          <span style={successLabel}>Posted to X</span>
          <p style={postedTextStyle}>{postedText}</p>
        </div>
      )}

      {status === 'error' && (
        <div style={errorStyle}>
          <span style={errorLabel}>Error</span>
          <p style={errorTextStyle}>{errorMsg}</p>
        </div>
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  marginBottom: '2.5rem',
  padding: '1.5rem',
  border: '1px solid rgba(212, 43, 43, 0.25)',
  borderRadius: 4,
  background: 'rgba(212, 43, 43, 0.04)',
};

const headingStyle: React.CSSProperties = {
  fontFamily: "'Archivo Black', Impact, sans-serif",
  fontSize: '1rem',
  letterSpacing: '0.05em',
  color: '#d42b2b',
  margin: '0 0 0.5rem',
};

const descStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'rgba(250, 250, 250, 0.5)',
  margin: '0 0 1rem',
  lineHeight: 1.5,
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: '0.9rem',
  padding: '0.7rem 0.8rem',
  background: 'rgba(255, 255, 255, 0.06)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: 2,
  color: '#fafafa',
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  marginTop: '0.75rem',
  fontFamily: "'Archivo Black', Impact, sans-serif",
  fontSize: '0.8rem',
  letterSpacing: '0.05em',
  padding: '0.6rem 1.5rem',
  background: '#d42b2b',
  color: '#fafafa',
  border: 'none',
  borderRadius: 2,
};

const successStyle: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem',
  background: 'rgba(34, 197, 94, 0.08)',
  border: '1px solid rgba(34, 197, 94, 0.3)',
  borderRadius: 4,
};

const successLabel: React.CSSProperties = {
  fontFamily: "'Archivo Black', Impact, sans-serif",
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'rgb(34, 197, 94)',
};

const postedTextStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  fontSize: '0.85rem',
  color: '#fafafa',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
};

const errorStyle: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem',
  background: 'rgba(239, 68, 68, 0.08)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  borderRadius: 4,
};

const errorLabel: React.CSSProperties = {
  fontFamily: "'Archivo Black', Impact, sans-serif",
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'rgb(239, 68, 68)',
};

const errorTextStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  fontSize: '0.85rem',
  color: 'rgba(250, 250, 250, 0.7)',
  lineHeight: 1.5,
  wordBreak: 'break-word',
};
