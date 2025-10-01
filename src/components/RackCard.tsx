import React from 'react';
import { Server, Activity } from 'lucide-react';
import { RackData } from '../types';

interface RackCardProps {
  rack: RackData;
  getThresholdValue: (key: string) => number | undefined;
  getMetricStatusColor: (
    value: number, 
    criticalLow: number, 
    criticalHigh: number, 
    warningLow: number, 
    warningHigh: number
  ) => string;
  getAmperageStatusColor: (rack: RackData) => string;
}

export default function RackCard({ 
  rack, 
  getThresholdValue, 
  getMetricStatusColor, 
  getAmperageStatusColor
}: RackCardProps) {
  // Helper function to determine metric background color based on alerts
  const getMetricBgColor = (rack: RackData, metricType: 'amperage' | 'temperature' | 'humidity'): string => {
    // Check for critical alerts first (higher priority)
    const hasCritical = rack.reasons && rack.reasons.some(reason => 
      reason.startsWith('critical_') && reason.includes(metricType)
    );
    
    if (hasCritical) {
      return 'bg-red-50 border border-red-200'; // Critical alert
    }
    
    // Check for warning alerts
    const hasWarning = rack.reasons && rack.reasons.some(reason => 
      reason.startsWith('warning_') && reason.includes(metricType)
    );
    
    if (hasWarning) {
      return 'bg-yellow-50 border border-yellow-200'; // Warning alert
    }
    
    // If no specific metric alert but PDU has critical status, show general critical background
    if (rack.status === 'critical') {
      return 'bg-red-25 border border-red-100'; // General critical alert (lighter than specific)
    }
    
    // If no specific metric alert but PDU has warning status, show general warning background
    if (rack.status === 'warning') {
      return 'bg-yellow-25 border border-yellow-100'; // General warning alert (lighter than specific)
    }
    
    return 'bg-white'; // Default color for normal status
  };

  // Helper function to format phase text
  const formatPhaseText = (phase: string): string => {
    if (!phase || phase === 'N/A') return 'Fase no especificada';
    
    const normalizedPhase = phase.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    switch (normalizedPhase) {
      case 'single_phase':
      case 'single':
      case '1_phase':
      case 'monofasico':
        return 'Monofásico';
      case '3_phase':
      case '3phase':
      case 'three_phase':
      case 'trifasico':
        return 'Trifásico';
      default:
        return phase;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': return 'bg-red-700';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'normal': return 'Normal';
      case 'warning': return 'Advertencia';
      case 'critical': return 'Crítico';
      default: return 'Desconocido';
    }
  };

  return (
    <div className={`rounded-lg shadow hover:shadow-md transition-shadow bg-white ${
      rack.status === 'critical' ? 'border-l-4 border-red-700' : 
      rack.status === 'warning' ? 'border-l-4 border-yellow-500' : ''
    }`}>
      <div className="p-6">
        {/* Rack Status - Moved to Top */}
        <div className="flex items-center justify-end mb-3">
          <div className={`w-3 h-3 rounded-full ${getStatusColor(rack.status)} mr-2 ${
            rack.status !== 'normal' ? 'animate-pulse' : ''
          }`}></div>
          <span className="font-medium text-gray-700 text-xs">
            {getStatusText(rack.status)}
          </span>
        </div>

        {/* Rack Header */}
        <div className="flex items-center mb-4">
          <div className="flex items-center">
            <Server className="text-gray-600 mr-2 h-6 w-6" />
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">
                {rack.name} (ID PDU: {rack.id})
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {formatPhaseText(rack.phase)}
              </p>
            </div>
          </div>
        </div>

        {/* PDU Container */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          {/* PDU Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full ${getStatusColor(rack.status)} mr-1 ${
                rack.status !== 'normal' ? 'animate-pulse' : ''
              }`}></div>
              <span className="text-xs text-gray-600">
                PDU #1 (ID PDU: {rack.id})
              </span>
            </div>
          </div>
          
          {/* PDU Name/ID */}
          <div className="flex items-center mb-3">
            <span className="font-medium text-gray-700 text-sm">
              PDU #1 (ID: {rack.id})
            </span>
          </div>

          {/* PDU Chain, Node, Serial Info */}
          <div className="mb-3 space-y-1">
            {rack.chain && rack.chain !== 'N/A' && (
              <div className="text-xs text-gray-600">
                Chain {rack.chain}
              </div>
            )}
            {rack.node && rack.node !== 'N/A' && (
              <div className="text-xs text-gray-600">
                Node {rack.node}
              </div>
            )}
            {rack.serial && rack.serial !== 'N/A' && (
              <div className="text-xs text-gray-600">
                N° Serie {rack.serial}
              </div>
            )}
          </div>

          {/* PDU Metrics */}
          <div className="grid grid-cols-1 gap-3">
            {/* Current */}
            <div className={`${getMetricBgColor(rack, 'amperage')} rounded-lg p-2`}>
              <span className="font-medium text-gray-600 text-xs">
                Corriente
              </span>
              <p className="font-bold mt-1 text-sm">
                {rack.reasons && rack.reasons.includes('warning_amperage_invalid_reading') ? (
                  <span className="text-orange-600">Error de lectura</span>
                ) : (
                  <span className="text-gray-900">{rack.current}A</span>
                )}
              </p>
            </div>

            {/* Temperature */}
            <div className={`${getMetricBgColor(rack, 'temperature')} rounded-lg p-2`}>
              <span className="font-medium text-gray-600 text-xs">
                Temperatura
              </span>
              <p className="font-bold text-gray-900 mt-1 text-sm">
                {rack.sensorTemperature != null && !isNaN(rack.sensorTemperature) ? `${rack.sensorTemperature}°C` : 'N/A'}
              </p>
            </div>

            {/* Humidity */}
            <div className={`${getMetricBgColor(rack, 'humidity')} rounded-lg p-2`}>
              <span className="font-medium text-gray-600 text-xs">
                Humedad
              </span>
              <p className="font-bold text-gray-900 mt-1 text-sm">
                {rack.sensorHumidity != null && !isNaN(rack.sensorHumidity) ? `${rack.sensorHumidity}%` : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}