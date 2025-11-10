import React, { useState, useRef, useEffect } from 'react';
import { Server, Settings, Wrench, MoreVertical, Zap } from 'lucide-react';
import { RackData } from '../types';

interface CombinedRackCardProps {
  racks: RackData[];
  overallStatus: 'normal' | 'warning' | 'critical';
  getThresholdValue: (key: string) => number | undefined;
  getMetricStatusColor: (
    value: number,
    criticalLow: number,
    criticalHigh: number,
    warningLow: number,
    warningHigh: number
  ) => string;
  getAmperageStatusColor: (rack: RackData) => string;
  onConfigureThresholds?: (rackId: string, rackName: string) => void;
  onSendRackToMaintenance?: (rackId: string, chain: string, rackName: string, rackData?: any) => void;
  onSendChainToMaintenance?: (chain: string, site: string, dc: string, rackData?: any) => void;
  maintenanceRacks: Set<string>;
  isExpanded: boolean;
  onToggleExpansion: () => void;
}

export default function CombinedRackCard({
  racks,
  overallStatus,
  getThresholdValue,
  getMetricStatusColor,
  getAmperageStatusColor,
  onConfigureThresholds,
  onSendRackToMaintenance,
  onSendChainToMaintenance,
  maintenanceRacks,
  isExpanded,
  onToggleExpansion
}: CombinedRackCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  // Helper function to determine metric background color based on alerts
  const getMetricBgColor = (rack: RackData, metricType: 'amperage' | 'temperature' | 'humidity' | 'voltage'): string => {
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

  const commonInfo = racks[0];
  const rackId = String(commonInfo.rackId || '').trim();
  const isInMaintenance = rackId && maintenanceRacks.has(rackId);

  return (
    <div className={`rounded-lg shadow hover:shadow-md transition-all bg-white ${
      isInMaintenance ? 'border-l-4 border-blue-500' :
      overallStatus === 'critical' ? 'border-l-4 border-red-700' :
      overallStatus === 'warning' ? 'border-l-4 border-yellow-500' : ''
    }`}>
      <div className="p-4">
        {/* Collapsed Header - Clickable */}
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('.menu-button')) {
              onToggleExpansion();
            }
          }}
        >
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-3 h-3 rounded-full ${isInMaintenance ? 'bg-blue-500' : getStatusColor(overallStatus)} ${
              !isInMaintenance && overallStatus !== 'normal' ? 'animate-pulse' : ''
            }`}></div>
            <h3 className="font-semibold text-gray-900 text-base">
              {commonInfo.name}
            </h3>
            {isInMaintenance && (
              <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                Mantenimiento
              </span>
            )}
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {racks.length} PDU{racks.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {(onConfigureThresholds || onSendRackToMaintenance || onSendChainToMaintenance) && (
              <div className="relative menu-button" ref={menuRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(!showMenu);
                  }}
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Opciones"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {showMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    {onConfigureThresholds && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          onConfigureThresholds(commonInfo.rackId || commonInfo.id, commonInfo.name);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 hover:bg-blue-50 transition-colors first:rounded-t-lg"
                      >
                        <Settings className="h-4 w-4 text-blue-600" />
                        <span>Configurar Umbrales</span>
                      </button>
                    )}
                    {onSendRackToMaintenance && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          onSendRackToMaintenance(
                          commonInfo.rackId || commonInfo.id,
                          commonInfo.chain || 'Unknown',
                          commonInfo.name,
                          {
                            id: commonInfo.id,
                            rackId: commonInfo.rackId,
                            name: commonInfo.name,
                            country: commonInfo.country,
                            site: commonInfo.site,
                            dc: commonInfo.dc,
                            phase: commonInfo.phase,
                            chain: commonInfo.chain,
                            node: commonInfo.node,
                            serial: commonInfo.serial
                          }
                        );
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 hover:bg-amber-50 transition-colors border-t border-gray-100"
                      >
                        <Wrench className="h-4 w-4 text-amber-600" />
                        <span>Enviar Rack a Mantenimiento</span>
                      </button>
                    )}
                    {onSendChainToMaintenance && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          onSendChainToMaintenance(
                          commonInfo.chain || 'Unknown',
                          commonInfo.site || 'Unknown',
                          commonInfo.dc || 'Unknown',
                          {
                            id: commonInfo.id,
                            rackId: commonInfo.rackId,
                            name: commonInfo.name,
                            country: commonInfo.country,
                            site: commonInfo.site,
                            dc: commonInfo.dc,
                            phase: commonInfo.phase,
                            chain: commonInfo.chain,
                            node: commonInfo.node,
                            serial: commonInfo.serial
                          }
                        );
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 hover:bg-amber-50 transition-colors last:rounded-b-lg border-t border-gray-100"
                      >
                        <Wrench className="h-4 w-4 text-amber-600" />
                        <span>Enviar Chain a Mantenimiento</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
            {/* Phase Info */}
            <div className="text-sm text-gray-600">
              {formatPhaseText(commonInfo.phase)}
            </div>

            {/* PDUs Grid */}
            <div className="grid grid-cols-1 gap-4">
          {racks.map((rack, index) => (
            <div key={rack.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              {/* PDU Name/ID */}
              <div className="flex items-center mb-3">
                <span className="font-medium text-gray-700 text-sm">
                  ID {rack.id}
                </span>
              </div>

              {/* PDU Chain, Node, Serial, Gateway Info */}
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
                {rack.gwName && rack.gwName !== 'N/A' && (
                  <div className="text-xs text-gray-600">
                    Gateway: {rack.gwName}
                  </div>
                )}
                {rack.gwIp && rack.gwIp !== 'N/A' && (
                  <div className="text-xs text-gray-600">
                    IP Gateway: {rack.gwIp}
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

                {/* Voltage */}
                <div className={`${getMetricBgColor(rack, 'voltage')} rounded-lg p-2`}>
                  <span className="font-medium text-gray-600 text-xs">
                    Voltaje
                  </span>
                  <p className="font-bold text-gray-900 mt-1 text-sm">
                    {rack.voltage != null && !isNaN(rack.voltage) && rack.voltage > 0 ? `${rack.voltage}V` : 'N/A'}
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
            ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}