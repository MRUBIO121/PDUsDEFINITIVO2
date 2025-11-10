import { RackData } from '../types';

/**
 * Groups racks by country, site, DC, and logical rack ID
 */
export function groupRacksByCountry(racks: RackData[]): { [country: string]: { [site: string]: { [dc: string]: RackData[][] } } } {
  const countryGroups: { [country: string]: { [site: string]: { [dc: string]: RackData[][] } } } = {};
  
  // First, group all racks by country
  const racksByCountry: { [country: string]: RackData[] } = {};
  racks.forEach(rack => {
    const country = rack.country || 'N/A';
    if (!racksByCountry[country]) {
      racksByCountry[country] = [];
    }
    racksByCountry[country].push(rack);
  });
  
  // Then, for each country, group all its racks by site
  Object.entries(racksByCountry).forEach(([country, countryRacks]) => {
    if (!countryGroups[country]) {
      countryGroups[country] = {};
    }
    
    const siteGroups = groupRacksBySite(countryRacks);
    Object.entries(siteGroups).forEach(([site, dcGroups]) => {
      if (!countryGroups[country][site]) {
        countryGroups[country][site] = {};
      }
      
      Object.entries(dcGroups).forEach(([dc, logicalRackGroups]) => {
        if (!countryGroups[country][site][dc]) {
          countryGroups[country][site][dc] = [];
        }
        
        // Add all logical rack groups from this site/dc to the country structure
        countryGroups[country][site][dc] = logicalRackGroups;
      });
    });
  });
  
  return countryGroups;
}

/**
 * Groups racks by site, DC, and logical rack ID
 */
export function groupRacksBySite(racks: RackData[]): { [site: string]: { [dc: string]: RackData[][] } } {
  const siteGroups: { [site: string]: { [dc: string]: RackData[][] } } = {};
  
  // First, group all racks by site
  const racksBySite: { [site: string]: RackData[] } = {};
  racks.forEach(rack => {
    const site = rack.site || 'N/A';
    if (!racksBySite[site]) {
      racksBySite[site] = [];
    }
    racksBySite[site].push(rack);
  });
  
  // Then, for each site, group all its racks by DC
  Object.entries(racksBySite).forEach(([site, siteRacks]) => {
    if (!siteGroups[site]) {
      siteGroups[site] = {};
    }
    
    const dcGroups = groupRacksByDc(siteRacks);
    Object.entries(dcGroups).forEach(([dc, logicalRackGroups]) => {
      if (!siteGroups[site][dc]) {
        siteGroups[site][dc] = [];
      }
      
      // Add all logical rack groups from this DC to the site structure
      siteGroups[site][dc] = logicalRackGroups;
    });
  });
  
  return siteGroups;
}

/**
 * Groups racks by DC and rack ID
 */
export function groupRacksByDc(racks: RackData[]): { [dc: string]: RackData[][] } {
  const dcGroups: { [dc: string]: RackData[][] } = {};
  
  // First, group racks by DC
  const racksByDc: { [dc: string]: RackData[] } = {};
  racks.forEach(rack => {
    const dc = rack.dc || 'N/A';
    if (!racksByDc[dc]) {
      racksByDc[dc] = [];
    }
    racksByDc[dc].push(rack);
  });
  
  // Then, for each DC, group racks by rack ID using Map for accuracy
  Object.entries(racksByDc).forEach(([dc, dcRacks]) => {
    const rackMap = new Map<string, RackData[]>();

    dcRacks.forEach(rack => {
      const rackId = rack.rackId || rack.id;

      if (!rackMap.has(rackId)) {
        rackMap.set(rackId, []);
      }

      rackMap.get(rackId)!.push(rack);
    });

    // Convert Map to array of arrays and sort alphabetically by rack name
    dcGroups[dc] = Array.from(rackMap.values()).sort((a, b) => {
      const nameA = (a[0]?.name || '').toLowerCase();
      const nameB = (b[0]?.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  });
  
  return dcGroups;
}

/**
 * Filters racks based on multiple criteria
 */
export function filterRacks(
  racks: RackData[],
  statusFilter: 'all' | 'critical' | 'warning' | 'normal' | 'maintenance',
  countryFilter: string = 'all',
  siteFilter: string = 'all',
  dcFilter: string = 'all',
  searchQuery: string = '',
  searchField: string = 'all',
  metricFilter: string = 'all',
  showAllRacks: boolean = false,
  maintenanceRacks: Set<string> = new Set()
): RackData[] {
  let filteredRacks = racks;
  
  // Filter by search query
  if (searchQuery.trim() !== '') {
    const lowercaseQuery = searchQuery.toLowerCase().trim();
    filteredRacks = filteredRacks.filter(rack => {
      // If searching all fields, use the previous behavior
      if (searchField === 'all') {
        const searchableFields = [
          rack.site,
          rack.country,
          rack.dc,
          rack.node,
          rack.chain,
          rack.name,
          rack.serial
        ];
        
        return searchableFields.some(field => 
          field && String(field).toLowerCase().includes(lowercaseQuery)
        );
      }
      
      // Search by specific field
      let fieldValue = '';
      switch (searchField) {
        case 'site':
          fieldValue = String(rack.site || '');
          break;
        case 'country':
          fieldValue = String(rack.country || '');
          break;
        case 'dc':
          fieldValue = String(rack.dc || '');
          break;
        case 'node':
          fieldValue = String(rack.node || '');
          break;
        case 'chain':
          fieldValue = String(rack.chain || '');
          break;
        case 'name':
          fieldValue = String(rack.name || '');
          break;
        case 'serial':
          fieldValue = String(rack.serial || '');
          break;
        default:
          return true;
      }
      
      return fieldValue.toLowerCase().includes(lowercaseQuery);
    });
  }
  
  // Filter by country
  if (countryFilter !== 'all') {
    filteredRacks = filteredRacks.filter(rack => rack.country === countryFilter);
  }
  
  // Filter by site
  if (siteFilter !== 'all') {
    filteredRacks = filteredRacks.filter(rack => rack.site === siteFilter);
  }
  
  // Filter by DC
  if (dcFilter !== 'all') {
    filteredRacks = filteredRacks.filter(rack => rack.dc === dcFilter);
  }
  
  // Filter by status
  if (showAllRacks) {
    // In "Principal" mode: show all racks regardless of status
    // Apply status filter only if a specific status is selected
    if (statusFilter !== 'all') {
      if (statusFilter === 'maintenance') {
        // Filter to show only racks in maintenance
        filteredRacks = filteredRacks.filter(rack => {
          const rackId = String(rack.rackId || '').trim();
          return rackId && maintenanceRacks.has(rackId);
        });
      } else {
        // Filter by normal status (exclude maintenance racks)
        filteredRacks = filteredRacks.filter(rack => {
          const rackId = String(rack.rackId || '').trim();
          const isInMaintenance = rackId && maintenanceRacks.has(rackId);
          return !isInMaintenance && rack.status === statusFilter;
        });
      }
    }
    // If statusFilter is 'all', show all racks (no status filtering)
  } else {
    // In "Alertas" mode: show ONLY PDUs with alerts, EXCLUDING maintenance
    let maintenanceExcludedCount = 0;
    let alertCount = 0;

    filteredRacks = filteredRacks.filter(rack => {
      const rackId = String(rack.rackId || '').trim();
      const isInMaintenance = rackId && maintenanceRacks.has(rackId);
      const hasAlert = rack.status === 'critical' || rack.status === 'warning';

      if (isInMaintenance) {
        maintenanceExcludedCount++;
        // NEVER show maintenance racks in alerts view
        return false;
      }

      if (hasAlert) {
        alertCount++;
      }

      // Show ONLY if has alerts and NOT in maintenance
      return hasAlert;
    });

    // Apply additional status filter if specified
    // No need to check maintenance here since they're already excluded
    if (statusFilter !== 'all') {
      filteredRacks = filteredRacks.filter(rack => {
        return rack.status === statusFilter;
      });
    }
  }
  
  // Filter by specific metric type (only in Alertas mode and when statusFilter is not 'all')
  // No need to check maintenance here since they're already excluded in Alertas mode
  if (metricFilter !== 'all' && statusFilter !== 'all' && !showAllRacks) {
    filteredRacks = filteredRacks.filter(rack => {
      if (!rack.reasons || rack.reasons.length === 0) {
        return false;
      }

      // Check if the rack has alerts for the specific metric and status combination
      const hasSpecificMetricAlert = rack.reasons.some(reason => {
        const hasStatusMatch = reason.startsWith(`${statusFilter}_`);
        const hasMetricMatch = reason.includes(metricFilter);
        return hasStatusMatch && hasMetricMatch;
      });

      return hasSpecificMetricAlert;
    });
  }
  
  return filteredRacks;
}