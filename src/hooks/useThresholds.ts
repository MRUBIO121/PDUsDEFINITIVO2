import { useState, useEffect } from 'react';
import { ThresholdData } from '../types';

interface UseThresholdsReturn {
  thresholds: ThresholdData[];
  rackSpecificThresholds: ThresholdData[];
  globalThresholds: ThresholdData[];
  loading: boolean;
  error: string | null;
  refreshThresholds: () => void;
}

interface UseThresholdsOptions {
  rackId?: string;
}

export function useThresholds(options: UseThresholdsOptions = {}): UseThresholdsReturn {
  const { rackId } = options;
  const [thresholds, setThresholds] = useState<ThresholdData[]>([]);
  const [rackSpecificThresholds, setRackSpecificThresholds] = useState<ThresholdData[]>([]);
  const [globalThresholds, setGlobalThresholds] = useState<ThresholdData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThresholds = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (rackId) {
        // Fetch rack-specific thresholds
        const response = await fetch(`/api/racks/${rackId}/thresholds`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || 'Failed to fetch rack-specific thresholds');
        }
        
        setRackSpecificThresholds(data.data.rackSpecific || []);
        setGlobalThresholds(data.data.global || []);
        
        // Create merged thresholds with rack-specific overrides taking precedence
        const mergedThresholds = [...data.data.global];
        data.data.rackSpecific.forEach((rackThreshold: ThresholdData) => {
          const index = mergedThresholds.findIndex(t => t.key === rackThreshold.key);
          if (index >= 0) {
            mergedThresholds[index] = rackThreshold;
          } else {
            mergedThresholds.push(rackThreshold);
          }
        });
        
        setThresholds(mergedThresholds);
      } else {
        // Fetch global thresholds only
        const response = await fetch('/api/thresholds');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || 'Failed to fetch thresholds');
        }
        
        setThresholds(data.data || []);
        setGlobalThresholds(data.data || []);
        setRackSpecificThresholds([]);
      }
    } catch (err) {
      console.error(`Error fetching thresholds${rackId ? ` for rack ${rackId}` : ''}:`, err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, [rackId]);

  return {
    thresholds,
    rackSpecificThresholds,
    globalThresholds,
    loading,
    error,
    refreshThresholds: fetchThresholds,
  };
}