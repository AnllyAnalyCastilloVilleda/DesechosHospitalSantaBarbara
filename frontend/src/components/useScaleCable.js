import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import api from '../config/api'; // tu axios instancia

export default function useScaleCable() {
  const [connected, setConnected] = useState(false);
  const [weightLb, setWeightLb] = useState(0);
  const [raw, setRaw] = useState('');
  const sockRef = useRef(null);

  // inicia socket
  useEffect(() => {
    const s = io('/', { withCredentials: true }); // mismo origin del backend (ya lo tienes así)
    sockRef.current = s;

    s.on('connect', () => {});
    s.on('scale:status', (st) => setConnected(!!st?.connected));
    s.on('scale:weight', ({ value, raw }) => {
      if (typeof value === 'number') setWeightLb(value);
      if (raw != null) setRaw(raw);
    });
    s.on('scale:raw', ({ raw }) => setRaw(raw));
    s.on('scale:error', (e) => console.warn('Scale error:', e));

    return () => { try { s.disconnect(); } catch(_) {} };
  }, []);

  const listPorts = useCallback(async () => {
    const r = await api.get('/scale/ports');
    return r.data?.ports || [];
  }, []);

  const connect = useCallback(async (path, cfg = {}) => {
    await api.post('/scale/connect', { path, ...cfg });
    const st = await api.get('/scale/status');
    setConnected(!!st.data?.connected);
  }, []);

  const disconnect = useCallback(async () => {
    await api.post('/scale/disconnect');
    setConnected(false);
  }, []);

  return { connected, weightLb, raw, listPorts, connect, disconnect };
}
