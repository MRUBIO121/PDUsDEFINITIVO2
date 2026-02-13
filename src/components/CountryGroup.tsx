import React from 'react';
import { Globe, Building, ChevronUp, ChevronDown } from 'lucide-react';
import SiteGroup from './SiteGroup';
import { RackData } from '../types';

interface CountryGroupProps {
  country: string;
  siteGroups: { [site: string]: { [dc: string]: { [gwKey: string]: RackData[][] } } };
  originalRackGroups: RackData[][];
  activeView: 'principal' | 'alertas' | 'mantenimiento';
  isExpanded: boolean;
  onToggleExpand: (country: string) => void;
  expandedSiteIds: Set<string>;
  toggleSiteExpansion: (site: string) => void;
  expandedDcIds: Set<string>;
  toggleDcExpansion: (dc: string) => void;
  expandedGwIds: Set<string>;
  toggleGwExpansion: (gwKey: string) => void;
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
  expandedRackNames: Set<string>;
  onToggleRackExpansion: (rackName: string) => void;
}

export default function CountryGroup({
  country,
  siteGroups,
  originalRackGroups,
  activeView,
  isExpanded,
  onToggleExpand,
  expandedSiteIds,
  toggleSiteExpansion,
  expandedDcIds,
  toggleDcExpansion,
  expandedGwIds,
  toggleGwExpansion,
  getThresholdValue,
  getMetricStatusColor,
  getAmperageStatusColor,
  activeStatusFilter,
  onStatusFilterChange,
  onConfigureThresholds,
  onSendRackToMaintenance,
  onSendChainToMaintenance,
  maintenanceRacks,
  expandedRackNames,
  onToggleRackExpansion
}: CountryGroupProps) {

  // Calculate total racks for this country from original data (unfiltered)
  const totalRacksForCountry = (originalRackGroups || []).filter(rackGroup => {
    const firstRack = rackGroup[0];
    return (firstRack.country || 'N/A') === country;
  }).length;

  // Calculate total sites for this country from original data (unfiltered)
  const totalSitesForCountry = new Set(
    (originalRackGroups || [])
      .filter(rackGroup => {
        const firstRack = rackGroup[0];
        return (firstRack.country || 'N/A') === country;
      })
      .map(rackGroup => rackGroup[0].site || 'N/A')
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

  const getCountryFlag = (country: string): string => {
    switch (country) {
      case 'España':
        return '🇪🇸';
      default:
        return '🌍';
    }
  };

  const displayedRackGroups = React.useMemo(() => {
    const groups: RackData[][] = [];
    Object.values(siteGroups).forEach(dcMap => {
      Object.values(dcMap).forEach(gwMap => {
        Object.values(gwMap).forEach(rackGroupList => {
          groups.push(...rackGroupList);
        });
      });
    });
    return groups;
  }, [siteGroups]);

  return (
    <div className="bg-white rounded-lg shadow space-y-6 mb-6 border border-gray-200">
      {/* Country Header */}
      <div className="p-6">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => onToggleExpand(country)}>
          <div className="flex items-center">
            <div className="bg-blue-600 rounded-full mr-4 p-2">
              <Globe className="text-white h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center mb-1">
                <span className="font-semibold text-blue-600 uppercase tracking-wider text-xs">
                  PAÍS
                </span>
              </div>
              <h1 className="font-bold text-gray-900 text-2xl flex items-center">
                <span className="mr-2 text-3xl">{getCountryFlag(country)}</span>
                España
              </h1>
              <p className="text-gray-600 mt-1 flex items-center text-sm">
                <Building className="mr-1 h-4 w-4" />
                {totalRacksForCountry} racks • {Object.keys(siteGroups).length} sitio{Object.keys(siteGroups).length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          
          {/* Country Status Summary */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              {['critical', 'warning', 'normal', 'maintenance'].map(status => {
                let count = 0;

                if (status === 'maintenance') {
                  if (activeView === 'alertas') return null;
                  count = displayedRackGroups.filter(rackGroup => {
                    const rackName = String(rackGroup[0].name || '').trim();
                    const rackId = String(rackGroup[0].rackId || rackGroup[0].id || '').trim();
                    return (rackName && maintenanceRacks.has(rackName)) || (rackId && maintenanceRacks.has(rackId));
                  }).length;
                } else {
                  count = displayedRackGroups.filter(rackGroup => {
                    const rackName = String(rackGroup[0].name || '').trim();
                    const rackId = String(rackGroup[0].rackId || rackGroup[0].id || '').trim();
                    if ((rackName && maintenanceRacks.has(rackName)) || (rackId && maintenanceRacks.has(rackId))) return false;
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
              title={isExpanded ? "Minimizar País" : "Expandir País"}
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
      
      {/* Site Groups within this Country */}
      {isExpanded && (
        <div className="space-y-4 px-3 pb-6">
          {Object.entries(siteGroups).sort(([a], [b]) => a.localeCompare(b)).map(([site, dcGroups]) => (
            <SiteGroup
              key={site}
              site={site}
              dcGroups={dcGroups}
              originalRackGroups={originalRackGroups}
              activeView={activeView}
              country={country}
              isExpanded={expandedSiteIds.has(site)}
              onToggleExpand={toggleSiteExpansion}
              expandedDcIds={expandedDcIds}
              toggleDcExpansion={toggleDcExpansion}
              expandedGwIds={expandedGwIds}
              toggleGwExpansion={toggleGwExpansion}
              getThresholdValue={getThresholdValue}
              getMetricStatusColor={getMetricStatusColor}
              getAmperageStatusColor={getAmperageStatusColor}
              activeStatusFilter={activeStatusFilter}
              onStatusFilterChange={onStatusFilterChange}
              onConfigureThresholds={onConfigureThresholds}
              onSendRackToMaintenance={onSendRackToMaintenance}
              onSendChainToMaintenance={onSendChainToMaintenance}
              maintenanceRacks={maintenanceRacks}
              expandedRackNames={expandedRackNames}
              onToggleRackExpansion={onToggleRackExpansion}
            />
          ))}
        </div>
      )}
    </div>
  );
}