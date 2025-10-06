export interface Thresholds {
  warning: number;
  critical: number;
}

export const defaultThresholds: Thresholds = {
  warning: 80,
  critical: 90
};

export function getThresholdValue(
  thresholds: Thresholds,
  type: 'warning' | 'critical'
): number {
  return thresholds[type] || defaultThresholds[type];
}

export function isAboveThreshold(
  value: number,
  threshold: number
): boolean {
  return value >= threshold;
}
