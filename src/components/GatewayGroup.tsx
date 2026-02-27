import React from 'react';
import { Network, ChevronUp, ChevronDown } from 'lucide-react';
import CombinedRackCard from './CombinedRackCard';
import { RackData } from '../types';

interface GatewayGroupProps {
  gwName: string;
  gwIp: string;
  rackGroups: RackData[][];
  originalRackGroups: RackData[][];
  activeView: 'principal' | 'alertas' | 'mantenimiento';
  country: string;
  site: string;
  dc: string;
  isExpanded: boolean;
  onToggleExpand: (gwKey: string) => void;
  getThresholdValue: (key: string) => number | undefined;
  getMetricStatusColor: (
    value: number,
    criticalLow: number,
    criticalHigh: number,
    warningLow: number,
    warningHigh: number
  ) => string;
  getAmperageStatusColor: (rack: RackData) => string;
  activeStatusFilter: 'all' | 'critical' | 'warning' | 'normal' | 'maintenance';
  onStatusFilterChange: (filter: 'all' | 'critical' | 'warning' | 'normal' | 'maintenance') => void;
  onConfigureThresholds?: (rackId: string, rackName: string) => void;
  onSendRackToMaintenance?: (rackId: string, chain: string, rackName: string, rackData?: any) => void;
  onSendChainToMaintenance?: (chain: string, site: string, dc: string, rackData?: any) => void;
  onSendAlertToSonar?: (rackId: string, rackName: string) => void;
  maintenanceRacks: Set<string>;
  expandedRackNames: Set<string>;
  onToggleRackExpansion: (rackName: string) => void;
}

export default function GatewayGroup({
  gwName,
  gwIp,
  rackGroups,
  originalRackGroups,
  activeView,
  country,
  site,
  dc,
  isExpanded,
  onToggleExpand,
  getThresholdValue,
  getMetricStatusColor,
  getAmperageStatusColor,
  activeStatusFilter,
  onStatusFilterChange,
  onConfigureThresholds,
  onSendRackToMaintenance,
  onSendChainToMaintenance,
  onSendAlertToSonar,
  maintenanceRacks,
  expandedRackNames,
  onToggleRackExpansion
}: GatewayGroupProps) {

  const gwKey = `${gwName}-${gwIp}`;

  const totalRacksForGateway = rackGroups.length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      case 'maintenance': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'normal': return 'Normal';
      case 'warning': return 'Advertencia';
      case 'critical': return 'Crítico';
      case 'maintenance': return 'Mantenimiento';
      default: return 'Desconocido';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow space-y-4 border-2 border-purple-600 mb-4">
      <div className="flex items-center justify-between cursor-pointer p-6" onClick={() => onToggleExpand(gwKey)}>
        <div className="flex items-center">
          <div className="bg-purple-600 rounded-full mr-3 p-2">
            <Network className="text-white h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center mb-1">
              <span className="font-semibold text-purple-600 uppercase tracking-wider text-xs">
                GATEWAY
              </span>
            </div>
            <h2 className="font-bold text-gray-900 text-lg">
              {gwName === 'N/A' ? 'Sin Gateway Definido' : gwName}
            </h2>
            <div className="flex items-center mt-1">
              <span className="text-gray-600 mr-2 text-sm">
                IP: {gwIp === 'N/A' ? 'No disponible' : gwIp}
              </span>
              <span className="text-gray-400 mx-2">•</span>
              <span className="text-gray-600 text-sm">
                {totalRacksForGateway} rack{totalRacksForGateway !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
          {['critical', 'warning', 'normal', 'maintenance'].map(status => {
            let count = 0;

            if (status === 'maintenance') {
              if (activeView === 'alertas') return null;
              count = rackGroups.filter(rackGroup => {
                const rackName = String(rackGroup[0].name || '').trim();
                const rackId = String(rackGroup[0].rackId || rackGroup[0].id || '').trim();
                return (rackName && maintenanceRacks.has(rackName)) || (rackId && maintenanceRacks.has(rackId));
              }).length;
            } else {
              count = rackGroups.filter(rackGroup => {
                const rackName = String(rackGroup[0].name || '').trim();
                const rackId = String(rackGroup[0].rackId || rackGroup[0].id || '').trim();
                if ((rackName && maintenanceRacks.has(rackName)) || (rackId && maintenanceRacks.has(rackId))) return false;
                return rackGroup.some(rack => rack.status === status);
              }).length;
            }

            if (count === 0 || (activeView === 'alertas' && status === 'normal')) return null;

            const isActive = activeStatusFilter === status;

            let bgActiveClass = 'bg-gray-100';
            let borderActiveClass = 'border-gray-500';
            let textActiveClass = 'text-gray-800';
            let textSecondaryActiveClass = 'text-gray-600';

            if (status === 'critical') {
              bgActiveClass = 'bg-red-100';
              borderActiveClass = 'border-red-500';
              textActiveClass = 'text-red-800';
              textSecondaryActiveClass = 'text-red-600';
            } else if (status === 'warning') {
              bgActiveClass = 'bg-yellow-100';
              borderActiveClass = 'border-yellow-500';
              textActiveClass = 'text-yellow-800';
              textSecondaryActiveClass = 'text-yellow-600';
            } else if (status === 'normal') {
              bgActiveClass = 'bg-green-100';
              borderActiveClass = 'border-green-500';
              textActiveClass = 'text-green-800';
              textSecondaryActiveClass = 'text-green-600';
            } else if (status === 'maintenance') {
              bgActiveClass = 'bg-blue-100';
              borderActiveClass = 'border-blue-500';
              textActiveClass = 'text-blue-800';
              textSecondaryActiveClass = 'text-blue-600';
            }

            return (
              <button
                key={status}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusFilterChange(status as 'critical' | 'warning' | 'normal' | 'maintenance');
                }}
                className={`flex items-center space-x-1 rounded-full border px-2 py-1 transition-all duration-200 hover:shadow-md ${
                  isActive
                    ? `${bgActiveClass} ${borderActiveClass} shadow-md`
                    : 'bg-gray-50 hover:bg-white'
                }`}
                title={`Filtrar por ${getStatusText(status).toLowerCase()}`}
              >
                <div className={`w-2 h-2 rounded-full ${getStatusColor(status)} ${
                  status === 'critical' || status === 'warning' ? 'animate-pulse' : ''
                }`}></div>
                <span className={`font-medium text-xs ${
                  isActive ? textActiveClass : 'text-gray-600'
                }`}>
                  {count}
                </span>
                <span className={`text-xs ${
                  isActive ? textSecondaryActiveClass : 'text-gray-500'
                }`}>
                  {getStatusText(status).toLowerCase()}
                </span>
              </button>
            );
          })}
          </div>

          <div className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            {isExpanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 px-3 pb-6">
          {rackGroups.map((rackGroup, index) => {
            const overallStatus = rackGroup.some(r => r.status === 'critical')
              ? 'critical'
              : rackGroup.some(r => r.status === 'warning')
              ? 'warning'
              : 'normal';

            const handleToggleRow = () => {
              const rowIndex = Math.floor(index / 4);
              const startIndex = rowIndex * 4;
              const endIndex = Math.min(startIndex + 4, rackGroups.length);

              const racksInRow = rackGroups.slice(startIndex, endIndex);
              const allExpanded = racksInRow.every(rg => expandedRackNames.has(rg[0].name));

              racksInRow.forEach(rg => {
                if (allExpanded) {
                  onToggleRackExpansion(rg[0].name);
                } else {
                  if (!expandedRackNames.has(rg[0].name)) {
                    onToggleRackExpansion(rg[0].name);
                  }
                }
              });
            };

            return (
              <CombinedRackCard
                key={`combined-${rackGroup[0].rackId || rackGroup[0].id}-${index}`}
                racks={rackGroup}
                overallStatus={overallStatus}
                getThresholdValue={getThresholdValue}
                getMetricStatusColor={getMetricStatusColor}
                getAmperageStatusColor={getAmperageStatusColor}
                onConfigureThresholds={onConfigureThresholds}
                onSendRackToMaintenance={onSendRackToMaintenance}
                onSendChainToMaintenance={onSendChainToMaintenance}
                onSendAlertToSonar={onSendAlertToSonar}
                maintenanceRacks={maintenanceRacks}
                isExpanded={expandedRackNames.has(rackGroup[0].name)}
                onToggleExpansion={handleToggleRow}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
