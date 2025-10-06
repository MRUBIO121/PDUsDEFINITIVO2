import React from 'react';
import { Home, Layers, ChevronUp, ChevronDown } from 'lucide-react';
import DcGroup from './DcGroup';
import { RackData } from '../types';

interface SiteGroupProps {
  site: string;
  dcGroups: { [dc: string]: RackData[][] };
  originalRackGroups: RackData[][];
  activeView: 'principal' | 'alertas' | 'mantenimiento';
  country: string;
  isExpanded: boolean;
  onToggleExpand: (site: string) => void;
  expandedDcIds: Set<string>;
  toggleDcExpansion: (dc: string) => void;
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
  maintenanceRacks: Set<string>;
}

export default function SiteGroup({ 
  site, 
  dcGroups, 
  originalRackGroups,
  activeView,
  country,
  isExpanded,
  onToggleExpand,
  expandedDcIds,
  toggleDcExpansion,
  getThresholdValue, 
  getMetricStatusColor, 
  getAmperageStatusColor,
  activeStatusFilter,
  onStatusFilterChange,
  onConfigureThresholds,
  onSendRackToMaintenance,
  onSendChainToMaintenance,
  maintenanceRacks
}: SiteGroupProps) {

  // Calculate total racks for this site from original data (unfiltered)
  const totalRacksForSite = (originalRackGroups || []).filter(rackGroup => {
    const firstRack = rackGroup[0];
    return (firstRack.country || 'N/A') === country && 
           (firstRack.site || 'N/A') === site;
  }).length;

  // Calculate total DCs for this site from original data (unfiltered)
  const totalDcsForSite = new Set(
    (originalRackGroups || [])
      .filter(rackGroup => {
        const firstRack = rackGroup[0];
        return (firstRack.country || 'N/A') === country && 
               (firstRack.site || 'N/A') === site;
      })
      .map(rackGroup => rackGroup[0].dc || 'N/A')
  ).size;

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
    <div className="bg-white rounded-lg shadow space-y-6 mb-6">
      {/* Site Header */}
      <div>
        <div className="flex items-center justify-between cursor-pointer p-6" onClick={() => onToggleExpand(site)}>
          <div className="flex items-center">
            <div className="bg-blue-600 rounded-full mr-4 p-2">
              <Home className="text-white h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center mb-1">
                <span className="font-semibold text-blue-600 uppercase tracking-wider text-xs">
                  SITIO
                </span>
              </div>
              <h1 className="font-bold text-gray-900 text-2xl">
                {site === 'N/A' ? 'Sin Sitio Definido' : `Sitio: ${site}`}
              </h1>
              <p className="text-gray-600 mt-1 flex items-center text-sm">
                <Layers className="mr-1 h-4 w-4" />
                {totalRacksForSite} racks • {totalDcsForSite} DC{totalDcsForSite !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          
          {/* Site Status Summary */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              {['critical', 'warning', 'normal', 'maintenance'].map(status => {
                let count = 0;

                if (status === 'maintenance') {
                  // Count maintenance racks (only show in main view)
                  if (activeView === 'alertas') return null;
                  count = Object.values(dcGroups).flat()
                    .filter(rackGroup => {
                      const rackId = rackGroup[0]?.rackId || rackGroup[0]?.id;
                      return maintenanceRacks.has(rackId);
                    }).length;
                } else {
                  // Count other statuses, excluding maintenance racks
                  count = Object.values(dcGroups).flat()
                    .filter(rackGroup => {
                      const rackId = rackGroup[0]?.rackId || rackGroup[0]?.id;
                      // Don't count if rack is in maintenance
                      if (maintenanceRacks.has(rackId)) return false;
                      return rackGroup.some(rack => rack.status === status);
                    }).length;
                }

                if (count === 0 || (activeView === 'alertas' && status === 'normal')) return null;

                // All status counts are now clickable buttons
                const isActive = activeStatusFilter === status;

                // Define colors based on status
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
                    className={`flex items-center space-x-1 rounded-full border px-3 py-1 transition-all duration-200 hover:shadow-md ${
                      isActive
                        ? `${bgActiveClass} ${borderActiveClass} shadow-md`
                        : 'bg-white hover:bg-gray-50'
                    }`}
                    title={`Filtrar por ${getStatusText(status).toLowerCase()}`}
                  >
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(status)} ${
                      status === 'critical' || status === 'warning' ? 'animate-pulse' : ''
                    }`}></div>
                    <span className={`font-medium text-xs ${
                      isActive ? textActiveClass : 'text-gray-700'
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
            
            {/* Toggle Button */}
            <div
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title={isExpanded ? "Minimizar Sitio" : "Expandir Sitio"}
            >
              {isExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* DC Groups within this Site */}
      {isExpanded && (
        <div className="space-y-4 px-3 pb-6">
          {Object.entries(dcGroups).map(([dc, logicalRackGroups]) => (
            <DcGroup
              key={dc}
              dc={dc}
              rackGroups={logicalRackGroups}
              originalRackGroups={originalRackGroups}
              activeView={activeView}
              country={country}
              site={site}
              isExpanded={expandedDcIds.has(dc)}
              onToggleExpand={toggleDcExpansion}
              getThresholdValue={getThresholdValue}
              getMetricStatusColor={getMetricStatusColor}
              getAmperageStatusColor={getAmperageStatusColor}
              activeStatusFilter={activeStatusFilter}
              onStatusFilterChange={onStatusFilterChange}
              onConfigureThresholds={onConfigureThresholds}
              onSendRackToMaintenance={onSendRackToMaintenance}
              onSendChainToMaintenance={onSendChainToMaintenance}
              maintenanceRacks={maintenanceRacks}
            />
          ))}
        </div>
      )}
    </div>
  );
}