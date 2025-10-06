import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CountryGroupProps {
  country: string;
  siteGroups: any;
  originalRackGroups: any;
  activeView: string;
  isExpanded: boolean;
  onToggleExpand: (country: string) => void;
  expandedSiteIds: Set<string>;
  toggleSiteExpansion: (siteId: string) => void;
  expandedDcIds: Set<string>;
  toggleDcExpansion: (dcId: string) => void;
  getThresholdValue: (key: string) => number;
  getMetricStatusColor: (percentage: number, thresholds: any) => string;
  getAmperageStatusColor: (rack: any) => string;
  activeStatusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onConfigureThresholds: (rackId: string, rackName: string) => void;
  onSendRackToMaintenance: (rack: any) => void;
  onSendChainToMaintenance: (chain: string, dc: string, site: string) => void;
  maintenanceRacks: Set<string>;
}

const CountryGroup: React.FC<CountryGroupProps> = ({
  country,
  siteGroups,
  isExpanded,
  onToggleExpand,
}) => {
  return (
    <div className="bg-white rounded-lg shadow">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => onToggleExpand(country)}
      >
        <div className="flex items-center space-x-2">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-500" />
          )}
          <h2 className="text-lg font-semibold text-gray-900">{country}</h2>
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4">
          <p className="text-gray-500">Sitios cargando...</p>
        </div>
      )}
    </div>
  );
};

export default CountryGroup;
