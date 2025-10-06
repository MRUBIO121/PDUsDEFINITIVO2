import { ThresholdData } from '../types';

/**
 * Retrieves a threshold value by key
 */
export function getThresholdValue(thresholds: ThresholdData[], key: string): number | undefined {
  const threshold = thresholds.find(t => t.key === key);
  return threshold?.value;
}