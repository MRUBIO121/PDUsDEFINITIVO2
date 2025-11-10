import { useState, useEffect } from 'react';
import { RackData } from '../types';
import { groupRacksByCountry, filterRacks } from '../utils/dataProcessing';

interface UseRackDataOptions {
  forceShowAllRacks?: boolean;
}

interface UseRackDataReturn {
  racks: RackData[];
  groupedRacks: { [country: string]: { [site: string]: { [dc: string]: { [gateway: string]: RackData[][] } } } };
  originalRackGroups: RackData[][];
  maintenanceRacks: Set<string>;
  loading: boolean;
  error: string | null;
  expandedCountryIds: Set<string>;
  expandedSiteIds: Set<string>;
  expandedDcIds: Set<string>;
  expandedGatewayIds: Set<string>;
  activeStatusFilter: 'all' | 'critical' | 'warning' | 'normal' | 'maintenance';
  activeCountryFilter: string;
  activeSiteFilter: string;
  activeDcFilter: string;
  availableCountries: string[];
  availableSites: string[];
  availableDcs: string[];
  activeMetricFilter: string;
  toggleCountryExpansion: (country: string) => void;
  toggleSiteExpansion: (site: string) => void;
  toggleDcExpansion: (dc: string) => void;
  toggleGatewayExpansion: (gateway: string) => void;
  setActiveStatusFilter: (filter: 'all' | 'critical' | 'warning' | 'normal' | 'maintenance') => void;
  setActiveCountryFilter: (country: string) => void;
  setActiveSiteFilter: (site: string) => void;
  setActiveDcFilter: (dc: string) => void;
  setActiveMetricFilter: (metric: string) => void;
  refreshData: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchField: string;
  setSearchField: (field: string) => void;
}

export function useRackData(options: UseRackDataOptions = {}): UseRackDataReturn {
  const { forceShowAllRacks = false } = options;
  
  const [racks, setRacks] = useState<RackData[]>([]);
  const [originalRackGroups, setOriginalRackGroups] = useState<RackData[][]>([]);
  const [maintenanceRacks, setMaintenanceRacks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCountryIds, setExpandedCountryIds] = useState<Set<string>>(new Set());
  const [expandedSiteIds, setExpandedSiteIds] = useState<Set<string>>(new Set());
  const [expandedDcIds, setExpandedDcIds] = useState<Set<string>>(new Set());
  const [expandedGatewayIds, setExpandedGatewayIds] = useState<Set<string>>(new Set());
  const [activeStatusFilter, setActiveStatusFilter] = useState<'all' | 'critical' | 'warning' | 'normal' | 'maintenance'>('all');
  const [activeCountryFilter, setActiveCountryFilter] = useState<string>('all');
  const [activeSiteFilter, setActiveSiteFilter] = useState<string>('all');
  const [activeDcFilter, setActiveDcFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchField, setSearchField] = useState<string>('all');
  const [activeMetricFilter, setActiveMetricFilter] = useState<string>('all');

  const fetchRacks = async () => {
    try {
      setLoading(true);
      setError(null);

      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/racks/energy?t=${timestamp}`, {
        cache: 'no-store',
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      // If unauthorized, silently fail (user not logged in yet)
      if (response.status === 401) {
        setLoading(false);
        return;
      }

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
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      // If unauthorized, silently fail (user not logged in yet)
      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        console.error('Failed to fetch maintenance racks');
        return;
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        const maintenanceSet = new Set<string>();

        data.data.forEach((entry: any) => {
          if (Array.isArray(entry.racks)) {
            entry.racks.forEach((rack: any) => {
              if (rack.rack_id) {
                const rackIdStr = String(rack.rack_id).trim();
                if (rackIdStr) {
                  maintenanceSet.add(rackIdStr);
                }
              }
            });
          }
        });

        setMaintenanceRacks(maintenanceSet);
      }
    } catch (err) {
      console.error('Error fetching maintenance racks:', err);
    }
  };

  const fetchAllData = async () => {
    // Fetch both racks and maintenance data in parallel, but wait for both to complete
    await Promise.all([
      fetchRacks(),
      fetchMaintenanceRacks()
    ]);
  };

  useEffect(() => {
    // Small delay to ensure component is fully mounted and authenticated
    const initTimer = setTimeout(() => {
      fetchAllData();
    }, 100);

    return () => {
      clearTimeout(initTimer);
    };
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

  const toggleGatewayExpansion = (gateway: string) => {
    setExpandedGatewayIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(gateway)) {
        newSet.delete(gateway);
      } else {
        newSet.add(gateway);
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
    maintenanceRacks
  );
  const groupedRacks = Array.isArray(filteredRacks) ? groupRacksByCountry(filteredRacks) : {};

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
    expandedGatewayIds,
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
    toggleGatewayExpansion,
    setActiveStatusFilter: handleStatusFilterChange,
    setActiveCountryFilter: handleCountryFilterChange,
    setActiveSiteFilter: handleSiteFilterChange,
    setActiveDcFilter: handleDcFilterChange,
    activeMetricFilter,
    setActiveMetricFilter,
    searchQuery,
    setSearchQuery,
    searchField,
    setSearchField,
    refreshData: fetchAllData,
  };
}