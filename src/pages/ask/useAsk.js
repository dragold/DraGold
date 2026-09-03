import { useCallback, useRef, useState } from 'react';
import { supabase } from '../../supabase.js';

// Calls POST /api/ask. Non-streaming: the endpoint returns a structured
// { answer, meta, evidence } once the agent has finished its tool chain.
export function useAsk() {
  const [state, setState] = useState({ status: 'idle', result: null, error: null });
  const [history, setHistory] = useState([]); // [{role, content}]
  const abortRef = useRef(null);

  const ask = useCallback(async (message) => {
    const q = (message || '').trim();
    if (!q) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: 'loading', result: null, error: null });

    const headers = { 'Content-Type': 'application/json' };
    try {
      const { data } = await supabase?.auth.getSession() ?? {};
      const token = data?.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch { /* anonymous is fine */ }

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: q, history: history.slice(-6) }),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ status: 'error', result: null, error: json?.error || `Request failed (${res.status})` });
        return;
      }
      setState({ status: 'done', result: json, error: null });
      setHistory(h => [...h, { role: 'user', content: q }, { role: 'assistant', content: json.answer || '' }]);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setState({ status: 'error', result: null, error: 'Network error — please try again.' });
    }
  }, [history]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ status: 'idle', result: null, error: null });
    setHistory([]);
  }, []);

  return { ...state, ask, reset, history };
}
