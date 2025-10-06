import { useState, useEffect } from 'react';
import { Thresholds, defaultThresholds } from '../utils/thresholdUtils';

export function useThresholds() {
  const [thresholds, setThresholds] = useState<Thresholds>(defaultThresholds);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThresholds = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/thresholds');
      if (response.ok) {
        const data = await response.json();
        setThresholds(data.thresholds || defaultThresholds);
        setError(null);
      }
    } catch (err) {
      console.error('Error loading thresholds:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, []);

  return {
    thresholds,
    loading,
    error,
    refreshThresholds: fetchThresholds
  };
}
