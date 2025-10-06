import { useState, useEffect } from 'react';

export interface PDU {
  id: string;
  rackId: string;
  site: string;
  dc: string;
  chain: string;
  country: string;
  amperage: number;
  maxAmperage: number;
  power: number;
  maxPower: number;
  lastUpdate?: string;
}

interface UseRackDataProps {
  forceShowAllRacks?: boolean;
}

export function useRackData({ forceShowAllRacks = false }: UseRackDataProps = {}) {
  const [racks, setRacks] = useState<PDU[]>([]);
  const [originalRackGroups, setOriginalRackGroups] = useState<PDU[][]>([]);
  const [maintenanceRacks, setMaintenanceRacks] = useState<Set<string>>(new Set());
  const [groupedRacks, setGroupedRacks] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedCountryIds, setExpandedCountryIds] = useState<Set<string>>(new Set());
  const [expandedSiteIds, setExpandedSiteIds] = useState<Set<string>>(new Set());
  const [expandedDcIds, setExpandedDcIds] = useState<Set<string>>(new Set());

  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('all');
  const [activeCountryFilter, setActiveCountryFilter] = useState<string>('all');
  const [activeSiteFilter, setActiveSiteFilter] = useState<string>('all');
  const [activeDcFilter, setActiveDcFilter] = useState<string>('all');
  const [activeMetricFilter, setActiveMetricFilter] = useState<string>('all');
  const [showZeroAmperageAlerts, setShowZeroAmperageAlerts] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState('all');

  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [availableSites, setAvailableSites] = useState<string[]>([]);
  const [availableDcs, setAvailableDcs] = useState<string[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [powerResponse, maintenanceResponse] = await Promise.all([
        fetch('/api/power-data'),
        fetch('/api/maintenance')
      ]);

      if (!powerResponse.ok) {
        throw new Error(`HTTP ${powerResponse.status}`);
      }

      const powerData = await powerResponse.json();
      const rackGroupsData = powerData.rackGroups || [];

      setOriginalRackGroups(rackGroupsData);

      const flatRacks: PDU[] = [];
      rackGroupsData.forEach((group: PDU[]) => {
        flatRacks.push(...group);
      });
      setRacks(flatRacks);

      if (maintenanceResponse.ok) {
        const maintenanceData = await maintenanceResponse.json();
        const maintenanceSet = new Set<string>();
        (maintenanceData.entries || []).forEach((entry: any) => {
          maintenanceSet.add(entry.rackId);
        });
        setMaintenanceRacks(maintenanceSet);
      }

      const grouped: any = {};
      rackGroupsData.forEach((group: PDU[]) => {
        if (group.length === 0) return;

        const firstPdu = group[0];
        const country = firstPdu.country || 'Unknown';
        const site = firstPdu.site || 'Unknown';
        const dc = firstPdu.dc || 'Unknown';
        const chain = firstPdu.chain || 'Unknown';

        if (!grouped[country]) grouped[country] = {};
        if (!grouped[country][site]) grouped[country][site] = {};
        if (!grouped[country][site][dc]) grouped[country][site][dc] = {};
        if (!grouped[country][site][dc][chain]) grouped[country][site][dc][chain] = [];

        grouped[country][site][dc][chain].push(group);
      });

      setGroupedRacks(grouped);

      const countries = new Set<string>();
      const sites = new Set<string>();
      const dcs = new Set<string>();

      flatRacks.forEach(pdu => {
        if (pdu.country) countries.add(pdu.country);
        if (pdu.site) sites.add(pdu.site);
        if (pdu.dc) dcs.add(pdu.dc);
      });

      setAvailableCountries(Array.from(countries).sort());
      setAvailableSites(Array.from(sites).sort());
      setAvailableDcs(Array.from(dcs).sort());

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setGroupedRacks({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [forceShowAllRacks]);

  const toggleCountryExpansion = (countryId: string) => {
    setExpandedCountryIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(countryId)) {
        newSet.delete(countryId);
      } else {
        newSet.add(countryId);
      }
      return newSet;
    });
  };

  const toggleSiteExpansion = (siteId: string) => {
    setExpandedSiteIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(siteId)) {
        newSet.delete(siteId);
      } else {
        newSet.add(siteId);
      }
      return newSet;
    });
  };

  const toggleDcExpansion = (dcId: string) => {
    setExpandedDcIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dcId)) {
        newSet.delete(dcId);
      } else {
        newSet.add(dcId);
      }
      return newSet;
    });
  };

  return {
    racks,
    originalRackGroups,
    maintenanceRacks,
    groupedRacks,
    loading,
    error,
    expandedCountryIds,
    expandedSiteIds,
    expandedDcIds,
    activeStatusFilter,
    activeCountryFilter,
    activeSiteFilter,
    activeDcFilter,
    showZeroAmperageAlerts,
    setShowZeroAmperageAlerts,
    availableCountries,
    availableSites,
    availableDcs,
    toggleCountryExpansion,
    toggleSiteExpansion,
    toggleDcExpansion,
    setActiveStatusFilter,
    setActiveCountryFilter,
    setActiveSiteFilter,
    setActiveDcFilter,
    activeMetricFilter,
    setActiveMetricFilter,
    searchQuery,
    setSearchQuery,
    searchField,
    setSearchField,
    refreshData: fetchData
  };
}
