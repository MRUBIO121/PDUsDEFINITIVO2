import { useState, useEffect } from 'react';
import { Thresholds, defaultThresholds } from '../utils/thresholdUtils';

export function useThresholds() {
  const [thresholds, setThresholds] = useState<Thresholds>(defaultThresholds);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        const response = await fetch('/api/thresholds');
        if (response.ok) {
          const data = await response.json();
          setThresholds(data.thresholds || defaultThresholds);
        }
      } catch (err) {
        console.error('Error loading thresholds:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchThresholds();
  }, []);

  return { thresholds, setThresholds, loading };
}
