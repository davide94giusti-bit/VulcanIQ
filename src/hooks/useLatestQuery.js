import { useEffect, useRef, useState } from 'react';

export default function useLatestQuery(load, filters) {
  const generation = useRef(0);
  const loader = useRef(load);
  loader.current = load;
  const [state, setState] = useState({ data: [], loading: true, error: '' });
  const key = JSON.stringify(filters);
  async function refresh() {
    const request = ++generation.current;
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const data = await loader.current();
      if (request === generation.current) setState({ data: data || [], loading: false, error: '' });
    } catch {
      if (request === generation.current) setState((current) => ({ ...current, loading: false, error: 'Data unavailable. Retry / Dati non disponibili. Riprova.' }));
    }
  }
  useEffect(() => {
    generation.current += 1;
    setState((current) => ({ ...current, loading: true, error: '' }));
    const timer = setTimeout(refresh, filters.search ? 250 : 0);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [key]);
  return { ...state, refresh };
}
