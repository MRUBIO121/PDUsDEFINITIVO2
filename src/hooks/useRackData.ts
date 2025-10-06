import { useState, useEffect } from 'react';

export interface PDU {
  id: string;
  rackId: string;
  site: string;
  dc: string;
  chain: string;
  country: string;
  amperage: number;
  maxAmperage: number;
  power: number;
  maxPower: number;
  lastUpdate?: string;
}

export function useRackData() {
  const [rackGroups, setRackGroups] = useState<PDU[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/power-data');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        setRackGroups(data.rackGroups || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);

    return () => clearInterval(interval);
  }, []);

  return { rackGroups, loading, error };
}
