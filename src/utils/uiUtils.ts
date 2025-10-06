export function getMetricStatusColor(percentage: number, thresholds: { warning: number; critical: number }): string {
  if (percentage >= thresholds.critical) return 'text-red-600';
  if (percentage >= thresholds.warning) return 'text-yellow-600';
  return 'text-green-600';
}

export function getAmperageStatusColor(
  rack: any,
  thresholds: { warning: number; critical: number }
): string {
  const amperage = rack.amperage || 0;
  const maxAmperage = rack.maxAmperage || 0;

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
