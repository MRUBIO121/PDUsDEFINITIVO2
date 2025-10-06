export function getMetricStatusColor(percentage: number, thresholds: { warning: number; critical: number }): string {
  if (percentage >= thresholds.critical) return 'text-red-600';
  if (percentage >= thresholds.warning) return 'text-yellow-600';
  return 'text-green-600';
}

export function getAmperageStatusColor(
  amperage: number,
  maxAmperage: number,
  thresholds: { warning: number; critical: number }
): string {
  if (maxAmperage === 0) return 'text-red-600';
  const percentage = (amperage / maxAmperage) * 100;
  return getMetricStatusColor(percentage, thresholds);
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatAmperage(value: number): string {
  return `${value.toFixed(1)}A`;
}
