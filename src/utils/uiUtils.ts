import { RackData, ThresholdData } from '../types';
import { getThresholdValue } from './thresholdUtils';

/**
 * Determines the status color for a metric based on thresholds
 */
export function getMetricStatusColor(
  value: number,
  criticalLow: number,
  criticalHigh: number,
  warningLow: number,
  warningHigh: number
): string {
  const belowCritLow = criticalLow === 0 ? value <= criticalLow : value < criticalLow;
  const belowWarnLow = warningLow === 0 ? value <= warningLow : value < warningLow;
  if (belowCritLow || value > criticalHigh) {
    return 'text-red-600';
  }
  if (belowWarnLow || value > warningHigh) {
    return 'text-yellow-600';
  }
  return 'text-green-600';
}

/**
 * Determines the amperage status color for a rack based on its phase and thresholds
 */
export function getAmperageStatusColor(rack: RackData, thresholds: ThresholdData[]): string {
  const current = parseFloat(String(rack.current)) || 0;
  const phase = rack.phase || 'single_phase';
  
  // Determine phase type for threshold selection
  const normalizedPhase = phase.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const isSinglePhase = normalizedPhase === 'single_phase' || normalizedPhase === 'single' || normalizedPhase === '1_phase';
  const is3Phase = normalizedPhase === '3_phase' || normalizedPhase === '3phase' || normalizedPhase === 'three_phase' || normalizedPhase === 'trifasico';
  
  let criticalLow, criticalHigh, warningLow, warningHigh;
  
  if (isSinglePhase) {
    criticalLow = getThresholdValue(thresholds, 'critical_amperage_low_single_phase');
    criticalHigh = getThresholdValue(thresholds, 'critical_amperage_high_single_phase');
    warningLow = getThresholdValue(thresholds, 'warning_amperage_low_single_phase');
    warningHigh = getThresholdValue(thresholds, 'warning_amperage_high_single_phase');
  } else if (is3Phase) {
    criticalLow = getThresholdValue(thresholds, 'critical_amperage_low_3_phase');
    criticalHigh = getThresholdValue(thresholds, 'critical_amperage_high_3_phase');
    warningLow = getThresholdValue(thresholds, 'warning_amperage_low_3_phase');
    warningHigh = getThresholdValue(thresholds, 'warning_amperage_high_3_phase');
  } else {
    // Default to single phase
    criticalLow = getThresholdValue(thresholds, 'critical_amperage_low_single_phase');
    criticalHigh = getThresholdValue(thresholds, 'critical_amperage_high_single_phase');
    warningLow = getThresholdValue(thresholds, 'warning_amperage_low_single_phase');
    warningHigh = getThresholdValue(thresholds, 'warning_amperage_high_single_phase');
  }
  
  if (!criticalLow || !criticalHigh || !warningLow || !warningHigh) {
    return 'text-gray-600'; // Default if thresholds not available
  }
  
  return getMetricStatusColor(current, criticalLow, criticalHigh, warningLow, warningHigh);
}