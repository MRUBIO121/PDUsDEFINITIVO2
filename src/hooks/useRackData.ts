import { useState, useEffect } from 'react';
import { RackData } from '../types';
import { groupRacksByCountry, filterRacks } from '../utils/dataProcessing';

interface UseRackDataOptions {
  forceShowAllRacks?: boolean;
  showZeroAmperageAlerts?: boolean;
}

interface UseRackDataReturn {
  racks: RackData[];
  groupedRacks: { [country: string]: { [site: string]: { [dc: string]: RackData[][] } } };
  originalRackGroups: RackData[][];
  maintenanceRacks: Set<string>;
  loading: boolean;
  error: string | null;
  expandedCountryIds: Set<string>;
  expandedSiteIds: Set<string>;
  expandedDcIds: Set<string>;
  activeStatusFilter: 'all' | 'critical' | 'warning';
  activeCountryFilter: string;
  activeSiteFilter: string;
  activeDcFilter: string;
  availableCountries: string[];
  availableSites: string[];
  availableDcs: string[];
  activeMetricFilter: string;
  showZeroAmperageAlerts: boolean;
  toggleCountryExpansion: (country: string) => void;
  toggleSiteExpansion: (site: string) => void;
  toggleDcExpansion: (dc: string) => void;
  setActiveStatusFilter: (filter: 'all' | 'critical' | 'warning') => void;
  setActiveCountryFilter: (country: string) => void;
  setActiveSiteFilter: (site: string) => void;
  setActiveDcFilter: (dc: string) => void;
  setActiveMetricFilter: (metric: string) => void;
  setShowZeroAmperageAlerts: (show: boolean) => void;
  refreshData: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchField: string;
  setSearchField: (field: string) => void;
}

export function useRackData(options: UseRackDataOptions = {}): UseRackDataReturn {
  const { forceShowAllRacks = false, showZeroAmperageAlerts: initialShowZeroAmperageAlerts = true } = options;
  
  const [racks, setRacks] = useState<RackData[]>([]);
  const [originalRackGroups, setOriginalRackGroups] = useState<RackData[][]>([]);
  const [maintenanceRacks, setMaintenanceRacks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCountryIds, setExpandedCountryIds] = useState<Set<string>>(new Set());
  const [expandedSiteIds, setExpandedSiteIds] = useState<Set<string>>(new Set());
  const [expandedDcIds, setExpandedDcIds] = useState<Set<string>>(new Set());
  const [activeStatusFilter, setActiveStatusFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [activeCountryFilter, setActiveCountryFilter] = useState<string>('all');
  const [activeSiteFilter, setActiveSiteFilter] = useState<string>('all');
  const [activeDcFilter, setActiveDcFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchField, setSearchField] = useState<string>('all');
  const [activeMetricFilter, setActiveMetricFilter] = useState<string>('all');
  const [showZeroAmperageAlerts, setShowZeroAmperageAlerts] = useState<boolean>(initialShowZeroAmperageAlerts);

  const fetchRacks = async () => {
    try {
      setLoading(true);
      setError(null);

      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/racks/energy?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch rack data');
      }
      
      // Store original rack groups as they come from the API
      const rackGroups = Array.isArray(data.data) ? data.data : [];
      setOriginalRackGroups(rackGroups);
      
      // Transform the nested array structure into a flat array
      const flatRacks: RackData[] = [];
      if (Array.isArray(rackGroups)) {
        rackGroups.forEach((rackGroup: RackData[]) => {
          if (Array.isArray(rackGroup)) {
            flatRacks.push(...rackGroup);
          }
        });
      }
      
      // Set all racks to show "España" as country
      flatRacks.forEach(rack => {
        rack.country = 'España';
      });
      
      // Normalize site names - unify Cantabria sites
      flatRacks.forEach(rack => {
        if (rack.site && rack.site.toLowerCase().includes('cantabria')) {
          rack.site = 'Cantabria';
        }
      });
      
      setRacks(flatRacks);
      
      // 🔍 DEBUG: Log data received from backend
      console.log('🔍 DEBUG - flatRacks received from backend:', flatRacks.length, 'total racks');
      const alertingRacks = flatRacks.filter(rack => rack.status !== 'normal');
      console.log('🔍 DEBUG - Racks with alerts:', alertingRacks.length);
      if (alertingRacks.length > 0) {
        console.log('🔍 DEBUG - First few alerting racks:', alertingRacks.slice(0, 5).map(rack => ({
          id: rack.id,
          logicalRackId: rack.logicalRackId,
          name: rack.name,
          status: rack.status,
          reasons: rack.reasons,
          temperature: rack.temperature,
          sensorTemperature: rack.sensorTemperature,
          current: rack.current
        })));
      }
    } catch (err) {
      console.error('Error fetching racks:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchMaintenanceRacks = async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/maintenance?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch maintenance racks');
        return;
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        const maintenanceSet = new Set<string>();
        data.data.forEach((rack: any) => {
          if (rack.rack_id) {
            maintenanceSet.add(rack.rack_id);
          }
          // Also add pdu_id if different from rack_id
          if (rack.pdu_id && rack.pdu_id !== rack.rack_id) {
            maintenanceSet.add(rack.pdu_id);
          }
        });
        console.log('🔍 Maintenance racks loaded:', Array.from(maintenanceSet));
        setMaintenanceRacks(maintenanceSet);
      }
    } catch (err) {
      console.error('Error fetching maintenance racks:', err);
    }
  };

  useEffect(() => {
    fetchRacks();
    fetchMaintenanceRacks();

    // Set up polling every 30 seconds
    const interval = setInterval(() => {
      fetchRacks();
      fetchMaintenanceRacks();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleCountryExpansion = (country: string) => {
    setExpandedCountryIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(country)) {
        newSet.delete(country);
      } else {
        newSet.add(country);
      }
      return newSet;
    });
  };

  const toggleSiteExpansion = (site: string) => {
    setExpandedSiteIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(site)) {
        newSet.delete(site);
      } else {
        newSet.add(site);
      }
      return newSet;
    });
  };

  const toggleDcExpansion = (dc: string) => {
    setExpandedDcIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dc)) {
        newSet.delete(dc);
      } else {
        newSet.add(dc);
      }
      return newSet;
    });
  };

  const handleStatusFilterChange = (filter: 'all' | 'critical' | 'warning') => {
    if (activeStatusFilter === filter) {
      setActiveStatusFilter('all'); // Toggle off if already active
    } else {
      setActiveStatusFilter(filter);
    }
  };

  const handleCountryFilterChange = (country: string) => {
    setActiveCountryFilter(country);
    // Reset lower-level filters when country changes
    setActiveSiteFilter('all');
    setActiveDcFilter('all');
  };

  const handleSiteFilterChange = (site: string) => {
    setActiveSiteFilter(site);
    // Reset DC filter when site changes
    setActiveDcFilter('all');
  };

  const handleDcFilterChange = (dc: string) => {
    setActiveDcFilter(dc);
  };

  // Derive available filter options dynamically
  const availableCountries = Array.from(new Set(racks.map(rack => rack.country || 'N/A'))).sort();
  
  const availableSites = Array.from(new Set(
    racks
      .filter(rack => activeCountryFilter === 'all' || rack.country === activeCountryFilter)
      .map(rack => rack.site || 'N/A')
  )).sort();
  
  const availableDcs = Array.from(new Set(
    racks
      .filter(rack => 
        (activeCountryFilter === 'all' || rack.country === activeCountryFilter) &&
        (activeSiteFilter === 'all' || rack.site === activeSiteFilter)
      )
      .map(rack => rack.dc || 'N/A')
  )).sort();

  // Filter and group the racks
  const filteredRacks = filterRacks(
    racks, 
    activeStatusFilter, 
    activeCountryFilter, 
    activeSiteFilter, 
    activeDcFilter,
    searchQuery,
    searchField,
    activeMetricFilter,
    forceShowAllRacks,
    showZeroAmperageAlerts
  );
  const groupedRacks = groupRacksByCountry(filteredRacks);

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
    availableCountries,
    availableSites,
    availableDcs,
    toggleCountryExpansion,
    toggleSiteExpansion,
    toggleDcExpansion,
    setActiveStatusFilter: handleStatusFilterChange,
    setActiveCountryFilter: handleCountryFilterChange,
    setActiveSiteFilter: handleSiteFilterChange,
    setActiveDcFilter: handleDcFilterChange,
    activeMetricFilter,
    setActiveMetricFilter,
    searchQuery,
    showZeroAmperageAlerts,
    setShowZeroAmperageAlerts,
    setSearchQuery,
    searchField,
    setSearchField,
    refreshData: () => {
      fetchRacks();
      fetchMaintenanceRacks();
    },
  };
}