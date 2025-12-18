import React, { useState, useRef, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Activity, AlertTriangle, Settings, BarChart3, Zap, Download, RefreshCw, Wrench, LogOut, User, ChevronDown, ChevronUp } from 'lucide-react';
import CountryGroup from './components/CountryGroup';
import ThresholdManager from './components/ThresholdManager';
import RackThresholdManager from './components/RackThresholdManager';
import MaintenancePage from './pages/MaintenancePage';
import { useRackData } from './hooks/useRackData';
import { useThresholds } from './hooks/useThresholds';
import { getThresholdValue } from './utils/thresholdUtils';
import { getMetricStatusColor, getAmperageStatusColor } from './utils/uiUtils';
import { useAuth } from './contexts/AuthContext';

function App() {
  const { user, logout } = useAuth();
  const [showThresholds, setShowThresholds] = useState(false);
  const [showRackThresholdsModal, setShowRackThresholdsModal] = useState(false);
  const [selectedRackId, setSelectedRackId] = useState<string>('');
  const [selectedRackName, setSelectedRackName] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showAllDcs, setShowAllDcs] = useState(false);
  const [showAllGateways, setShowAllGateways] = useState(false);
  const [activeView, setActiveView] = useState<'principal' | 'alertas' | 'mantenimiento'>('principal');
  const [isGeoFiltersExpanded, setIsGeoFiltersExpanded] = useState(false);
  const [hasInitializedFilters, setHasInitializedFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [expandedRackNames, setExpandedRackNames] = useState<Set<string>>(new Set());

  // Helper function to check if user has access to a site
  // Handles Cantabria Norte/Sur unification
  const userHasAccessToSite = (siteName: string): boolean => {
    // Administrators have access to all sites
    if (user?.rol === 'Administrador') {
      return true;
    }

    if (!user?.sitios_asignados || user.sitios_asignados.length === 0) {
      return true; // No restrictions
    }

    // Normalize site name for Cantabria check
    const normalizedSite = siteName.toLowerCase().includes('cantabria') ? 'Cantabria' : siteName;

    // Check if user has direct access
    if (user.sitios_asignados.includes(siteName)) {
      return true;
    }

    // Check if this is a Cantabria site and user has any Cantabria access
    if (normalizedSite === 'Cantabria') {
      return user.sitios_asignados.some(assignedSite =>
        assignedSite.toLowerCase().includes('cantabria')
      );
    }

    return false;
  };
  
  const {
    racks,
    originalRackGroups,
    maintenanceRacks,
    groupedRacks,
    loading: racksLoading,
    error: racksError,
    expandedCountryIds,
    expandedSiteIds,
    expandedDcIds,
    expandedGwIds,
    activeStatusFilter,
    activeCountryFilter,
    activeSiteFilter,
    activeDcFilter,
    activeGwFilter,
    availableCountries,
    availableSites,
    availableDcs,
    availableGateways,
    toggleCountryExpansion,
    toggleSiteExpansion,
    toggleDcExpansion,
    toggleGwExpansion,
    setActiveStatusFilter,
    setActiveCountryFilter,
    setActiveSiteFilter,
    setActiveDcFilter,
    setActiveGwFilter,
    activeMetricFilter,
    setActiveMetricFilter,
    searchQuery,
    setSearchQuery,
    searchField,
    setSearchField,
    refreshData
  } = useRackData({ forceShowAllRacks: activeView === 'principal' });

  const {
    thresholds,
    loading: thresholdsLoading,
    error: thresholdsError,
    refreshThresholds
  } = useThresholds();

  // Initialize site filter based on user's assigned sites
  React.useEffect(() => {
    if (user && !hasInitializedFilters && availableSites.length > 0) {
      if (user.sitios_asignados && user.sitios_asignados.length > 0) {
        // Check if user has any Cantabria site assigned
        const hasCantabriaNorte = user.sitios_asignados.some(site =>
          site.toLowerCase().includes('cantabria norte')
        );
        const hasCantabriaSur = user.sitios_asignados.some(site =>
          site.toLowerCase().includes('cantabria sur')
        );

        // If user has any Cantabria site, set filter to unified "Cantabria"
        if ((hasCantabriaNorte || hasCantabriaSur) && availableSites.includes('Cantabria')) {
          setActiveSiteFilter('Cantabria');
        }
        // Otherwise, if user has exactly 1 site, use that site
        else if (user.sitios_asignados.length === 1) {
          const assignedSite = user.sitios_asignados[0];
          if (availableSites.includes(assignedSite)) {
            setActiveSiteFilter(assignedSite);
          }
        }
      }
      setHasInitializedFilters(true);
    }
  }, [user, hasInitializedFilters, availableSites]);

  // Create wrapper functions for threshold-dependent utilities
  const getThresholdValueWrapper = (key: string) => getThresholdValue(thresholds, key);
  const getAmperageStatusColorWrapper = (rack: any) => getAmperageStatusColor(rack, thresholds);

  const filteredRackGroups = React.useMemo(() => {
    const rackGroups: RackData[][] = [];

    Object.values(groupedRacks).forEach(siteGroups => {
      Object.values(siteGroups).forEach(dcGroups => {
        Object.values(dcGroups).forEach(gwGroups => {
          Object.values(gwGroups).forEach(logicalGroups => {
            rackGroups.push(...logicalGroups);
          });
        });
      });
    });

    // Debug: Check which maintenance racks are not in power data
    const powerRackIds = new Set<string>();
    rackGroups.forEach(rackGroup => {
      const rackId = String(rackGroup[0].rackId || '').trim();
      if (rackId) {
        powerRackIds.add(rackId);
      }
    });

    const maintenanceNotInPower: string[] = [];
    maintenanceRacks.forEach(maintRackId => {
      if (!powerRackIds.has(maintRackId)) {
        maintenanceNotInPower.push(maintRackId);
      }
    });

    if (maintenanceNotInPower.length > 0) {
      console.warn(`⚠️ ${maintenanceNotInPower.length} racks en mantenimiento NO encontrados en datos de power:`, maintenanceNotInPower.slice(0, 10));
    }

    console.log('🔍 Rack Comparison:', {
      powerRacks: powerRackIds.size,
      maintenanceRacks: maintenanceRacks.size,
      notFoundInPower: maintenanceNotInPower.length
    });

    return rackGroups;
  }, [groupedRacks, maintenanceRacks]);

  // Calculate alert summary statistics
  const filteredAlertSummary = React.useMemo(() => {
    // Rack-level summary (racks)
    const rackSummary = {
      critical: {
        total: 0,
        amperage: 0,
        temperature: 0,
        humidity: 0,
        voltage: 0,
        power: 0
      },
      warning: {
        total: 0,
        amperage: 0,
        temperature: 0,
        humidity: 0,
        voltage: 0,
        power: 0
      }
    };

    // PDU-level summary (individual PDUs)
    const pduSummary = {
      critical: {
        total: 0,
        amperage: 0,
        temperature: 0,
        humidity: 0,
        voltage: 0,
        power: 0
      },
      warning: {
        total: 0,
        amperage: 0,
        temperature: 0,
        humidity: 0,
        voltage: 0,
        power: 0
      }
    };

    // Sets to track unique logical racks with alerts
    // Sets to track unique racks with alerts
    const criticalRacks = new Set();
    const warningRacks = new Set();
    const criticalRacksByMetric = {
      amperage: new Set(),
      temperature: new Set(),
      humidity: new Set(),
      voltage: new Set(),
      power: new Set()
    };
    const warningRacksByMetric = {
      amperage: new Set(),
      temperature: new Set(),
      humidity: new Set(),
      voltage: new Set(),
      power: new Set()
    };

    filteredRackGroups.forEach(rackGroup => {
      const rackId = String(rackGroup[0].rackId || rackGroup[0].id || '').trim();
      const isInMaintenance = rackId && maintenanceRacks.has(rackId);

      // Skip racks in maintenance - they shouldn't count in alerts
      if (isInMaintenance) {
        return;
      }

      // Determine overall status for this rack group
      const overallStatus = rackGroup.some(r => r.status === 'critical')
        ? 'critical'
        : rackGroup.some(r => r.status === 'warning')
        ? 'warning'
        : 'normal';

      // Count racks by overall status
      if (overallStatus === 'critical') {
        criticalRacks.add(rackId);
      } else if (overallStatus === 'warning') {
        warningRacks.add(rackId);
      }

      // Count individual PDUs and track racks with specific metric alerts
      rackGroup.forEach(pdu => {
        if (pdu.reasons && pdu.reasons.length > 0) {
          pdu.reasons.forEach(reason => {
            // Count PDUs with critical alerts and track racks with critical alerts by metric
            if (reason.startsWith('critical_')) {
              pduSummary.critical.total++;
              if (reason.includes('amperage')) {
                pduSummary.critical.amperage++;
                criticalRacksByMetric.amperage.add(rackId);
              }
              if (reason.includes('temperature')) {
                pduSummary.critical.temperature++;
                criticalRacksByMetric.temperature.add(rackId);
              }
              if (reason.includes('humidity')) {
                pduSummary.critical.humidity++;
                criticalRacksByMetric.humidity.add(rackId);
              }
              if (reason.includes('voltage')) {
                pduSummary.critical.voltage++;
                criticalRacksByMetric.voltage.add(rackId);
              }
              if (reason.includes('power')) {
                pduSummary.critical.power++;
                criticalRacksByMetric.power.add(rackId);
              }
            }
            // Count PDUs with warning alerts and track racks with warning alerts by metric
            else if (reason.startsWith('warning_')) {
              pduSummary.warning.total++;
              if (reason.includes('amperage')) {
                pduSummary.warning.amperage++;
                warningRacksByMetric.amperage.add(rackId);
              }
              if (reason.includes('temperature')) {
                pduSummary.warning.temperature++;
                warningRacksByMetric.temperature.add(rackId);
              }
              if (reason.includes('humidity')) {
                pduSummary.warning.humidity++;
                warningRacksByMetric.humidity.add(rackId);
              }
              if (reason.includes('voltage')) {
                pduSummary.warning.voltage++;
                warningRacksByMetric.voltage.add(rackId);
              }
              if (reason.includes('power')) {
                pduSummary.warning.power++;
                warningRacksByMetric.power.add(rackId);
              }
            }
          });
        }
      });
    });

    // Set rack summary counts from Sets
    rackSummary.critical.total = criticalRacks.size;
    rackSummary.warning.total = warningRacks.size;
    rackSummary.critical.amperage = criticalRacksByMetric.amperage.size;
    rackSummary.critical.temperature = criticalRacksByMetric.temperature.size;
    rackSummary.critical.humidity = criticalRacksByMetric.humidity.size;
    rackSummary.critical.voltage = criticalRacksByMetric.voltage.size;
    rackSummary.warning.amperage = warningRacksByMetric.amperage.size;
    rackSummary.warning.temperature = warningRacksByMetric.temperature.size;
    rackSummary.warning.humidity = warningRacksByMetric.humidity.size;
    rackSummary.warning.voltage = warningRacksByMetric.voltage.size;

    return { rackSummary, pduSummary };
  }, [filteredRackGroups, maintenanceRacks]);

  // Calculate GLOBAL alert summary statistics (for header display - always unfiltered)
  const globalAlertSummary = React.useMemo(() => {
    // PDU-level summary (individual PDUs) - NEW for header display
    const pduSummary = {
      critical: {
        total: 0,
        amperage: 0,
        temperature: 0,
        humidity: 0,
        voltage: 0,
        power: 0
      },
      warning: {
        total: 0,
        amperage: 0,
        temperature: 0,
        humidity: 0,
        voltage: 0,
        power: 0
      }
    };

    // Count individual PDUs with alerts (for header display) - EXCLUDE maintenance racks and filter by site
    racks.forEach(pdu => {
      const rackId = String(pdu.rackId || pdu.id || '').trim();
      const isInMaintenance = rackId && maintenanceRacks.has(rackId);

      // Skip PDUs that are in maintenance
      if (isInMaintenance) {
        return;
      }

      // Skip PDUs from sites the user doesn't have access to
      if (!userHasAccessToSite(pdu.site)) {
        return;
      }

      if (pdu.reasons && pdu.reasons.length > 0) {
        pdu.reasons.forEach(reason => {
          // Count PDUs with critical alerts
          if (reason.startsWith('critical_')) {
            pduSummary.critical.total++;
            if (reason.includes('amperage')) {
              pduSummary.critical.amperage++;
            }
            if (reason.includes('temperature')) {
              pduSummary.critical.temperature++;
            }
            if (reason.includes('humidity')) {
              pduSummary.critical.humidity++;
            }
            if (reason.includes('voltage')) {
              pduSummary.critical.voltage++;
            }
          }
          else if (reason.startsWith('warning_')) {
            pduSummary.warning.total++;
            if (reason.includes('amperage')) {
              pduSummary.warning.amperage++;
            }
            if (reason.includes('temperature')) {
              pduSummary.warning.temperature++;
            }
            if (reason.includes('humidity')) {
              pduSummary.warning.humidity++;
            }
            if (reason.includes('voltage')) {
              pduSummary.warning.voltage++;
            }
          }
        });
      }
    });

    // Rack-level summary (logical racks) - KEEP for group headers
    // Rack-level summary (racks) - KEEP for group headers
    const rackSummary = {
      critical: {
        total: 0,
        amperage: 0,
        temperature: 0,
        humidity: 0,
        voltage: 0
      },
      warning: {
        total: 0,
        amperage: 0,
        temperature: 0,
        humidity: 0,
        voltage: 0
      }
    };

    // Sets to track unique racks with different types of alerts
    const criticalRacks = new Set();
    const warningRacks = new Set();
    const allAlertingRacks = new Set(); // Tracks all racks with any type of alert
    const criticalRacksByMetric = {
      amperage: new Set(),
      temperature: new Set(),
      humidity: new Set(),
      voltage: new Set()
    };
    const warningRacksByMetric = {
      amperage: new Set(),
      temperature: new Set(),
      humidity: new Set(),
      voltage: new Set()
    };

    originalRackGroups.forEach(rackGroup => {
      const rackId = String(rackGroup[0].rackId || rackGroup[0].id || '').trim();
      const isInMaintenance = rackId && maintenanceRacks.has(rackId);

      // Skip racks in maintenance - they shouldn't count in alerts
      if (isInMaintenance) {
        return;
      }

      // Skip racks from sites the user doesn't have access to
      if (!userHasAccessToSite(rackGroup[0].site)) {
        return;
      }

      // Check what types of alerts this rack group has
      const hasCriticalPDU = rackGroup.some(r => r.status === 'critical');
      const hasWarningPDU = rackGroup.some(r => r.status === 'warning');

      // Count racks independently for each alert type they have
      if (hasCriticalPDU) {
        criticalRacks.add(rackId);
        allAlertingRacks.add(rackId);
      }
      if (hasWarningPDU) {
        warningRacks.add(rackId);
        allAlertingRacks.add(rackId);
      }

      // Count racks with specific metric alerts
      rackGroup.forEach(pdu => {
        if (pdu.reasons && pdu.reasons.length > 0) {
          pdu.reasons.forEach(reason => {
            // Track racks with critical alerts by metric
            if (reason.startsWith('critical_')) {
              if (reason.includes('amperage')) {
                criticalRacksByMetric.amperage.add(rackId);
              }
              if (reason.includes('temperature')) {
                warningRacksByMetric.temperature.add(rackId);
              }
              if (reason.includes('humidity')) {
                criticalRacksByMetric.humidity.add(rackId);
              }
              if (reason.includes('voltage')) {
                criticalRacksByMetric.voltage.add(rackId);
              }
            }
            // Track racks with warning alerts by metric
            else if (reason.startsWith('warning_')) {
              if (reason.includes('amperage')) {
                warningRacksByMetric.amperage.add(rackId);
              }
              if (reason.includes('temperature')) {
                warningRacksByMetric.temperature.add(rackId);
              }
              if (reason.includes('humidity')) {
                warningRacksByMetric.humidity.add(rackId);
              }
              if (reason.includes('voltage')) {
                warningRacksByMetric.voltage.add(rackId);
              }
            }
          });
        }
      });
    });

    // Set rack summary counts from Sets
    rackSummary.critical.total = criticalRacks.size;
    rackSummary.warning.total = warningRacks.size;
    rackSummary.critical.amperage = criticalRacksByMetric.amperage.size;
    rackSummary.critical.temperature = criticalRacksByMetric.temperature.size;
    rackSummary.critical.humidity = criticalRacksByMetric.humidity.size;
    rackSummary.critical.voltage = criticalRacksByMetric.voltage.size;
    rackSummary.warning.amperage = warningRacksByMetric.amperage.size;
    rackSummary.warning.temperature = warningRacksByMetric.temperature.size;
    rackSummary.warning.humidity = warningRacksByMetric.humidity.size;
    rackSummary.warning.voltage = warningRacksByMetric.voltage.size;

    // Calculate total racks accessible by user (INCLUDING maintenance for consistency with group counts)
    const totalUserRacks = originalRackGroups.filter(rackGroup => {
      return userHasAccessToSite(rackGroup[0].site);
    }).length;

    // Calculate racks in maintenance that user has access to
    const userMaintenanceRacks = originalRackGroups.filter(rackGroup => {
      const rackId = String(rackGroup[0].rackId || rackGroup[0].id || '').trim();
      const isInMaintenance = rackId && maintenanceRacks.has(rackId);
      return isInMaintenance && userHasAccessToSite(rackGroup[0].site);
    }).length;

    return {
      rackSummary,
      pduSummary,
      totalAlertingPdus: pduSummary.critical.total + pduSummary.warning.total,
      totalAlertingRacks: allAlertingRacks.size,
      totalUserRacks,
      userMaintenanceRacks
    };
  }, [originalRackGroups, racks, maintenanceRacks, user]);

  const handleThresholdSaveSuccess = () => {
    refreshThresholds();
    refreshData();
  };

  const handleConfigureThresholds = (rackId: string, rackName: string) => {
    // Check if user has permission based on assigned sites (Administrators are exempt)
    if (user?.rol !== 'Administrador' && user?.sitios_asignados && user.sitios_asignados.length > 0) {
      // Find rack data to check its site
      const rackData = racks.find(r => r.rackId === rackId);
      if (rackData && !userHasAccessToSite(rackData.site)) {
        alert(`No tienes permisos para configurar umbrales de racks fuera de tus sitios asignados (${user.sitios_asignados.join(', ')})`);
        return;
      }
    }

    setSelectedRackId(rackId);
    setSelectedRackName(rackName);
    setShowRackThresholdsModal(true);
  };

  const handleToggleRackExpansion = (rackName: string) => {
    setExpandedRackNames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rackName)) {
        newSet.delete(rackName);
      } else {
        newSet.add(rackName);
      }
      return newSet;
    });
  };

  const handleSendRackToMaintenance = async (rackId: string, chain: string, rackName: string, rackData?: any) => {
    // Check if user has permission based on assigned sites (Administrators are exempt)
    if (user?.rol !== 'Administrador' && user?.sitios_asignados && user.sitios_asignados.length > 0) {
      if (rackData && !userHasAccessToSite(rackData.site)) {
        alert(`No tienes permisos para enviar a mantenimiento racks fuera de tus sitios asignados (${user.sitios_asignados.join(', ')})`);
        return;
      }
    }

    const userReason = prompt(`¿Por qué se está enviando el rack "${rackName}" a mantenimiento?`, 'Mantenimiento programado');

    if (userReason === null) {
      return;
    }

    const reason = userReason || 'Mantenimiento programado';

    try {
      const response = await fetch('/api/maintenance/rack', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rackId,
          rackData,
          reason,
          user: user?.usuario || 'Sistema'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to send rack to maintenance');
      }

      alert(`El rack "${rackName}" ha sido enviado a mantenimiento.`);
      refreshData();
    } catch (error) {
      console.error('Error sending rack to maintenance:', error);
      alert(`Error al enviar rack a mantenimiento: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSendChainToMaintenance = async (chain: string, site: string, dc: string, rackData?: any) => {
    // Check if user has permission based on assigned sites (Administrators are exempt)
    if (user?.rol !== 'Administrador' && user?.sitios_asignados && user.sitios_asignados.length > 0) {
      if (!userHasAccessToSite(site)) {
        alert(`No tienes permisos para enviar a mantenimiento chains fuera de tus sitios asignados (${user.sitios_asignados.join(', ')})`);
        return;
      }
    }

    const userReason = prompt(`¿Por qué se está enviando el chain "${chain}" del DC "${dc}" (Site: ${site}) a mantenimiento?\n\nNOTA: Se enviarán TODOS los racks únicos con chain "${chain}" en el datacenter "${dc}" y sitio "${site}".`, 'Mantenimiento programado');

    if (userReason === null) {
      return;
    }

    const reason = userReason || 'Mantenimiento programado';

    try {
      const response = await fetch('/api/maintenance/chain', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chain,
          site,
          dc,
          rackData,
          reason,
          user: user?.usuario || 'Sistema'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to send chain to maintenance');
      }

      // Check if no racks were found
      if (data.racksAdded === 0 && !data.data) {
        alert(`⚠️ ${data.message || `No se encontraron racks para la chain "${chain}" en DC "${dc}"`}`);
        return;
      }

      const { racksAdded, racksFailed, totalRacks, totalPdusFiltered } = data.data;
      let message = `Chain "${chain}" del DC "${dc}" enviado a mantenimiento.\n\n`;
      message += `✅ ${racksAdded} racks únicos añadidos exitosamente`;
      if (racksFailed > 0) {
        message += `\n⚠️ ${racksFailed} racks ya estaban en mantenimiento (omitidos)`;
      }
      message += `\n\n📊 Total de racks únicos procesados: ${totalRacks}`;
      if (totalPdusFiltered && totalPdusFiltered !== totalRacks) {
        message += `\n📌 Nota: Se filtraron ${totalPdusFiltered} PDUs que pertenecen a estos ${totalRacks} racks físicos`;
      }

      alert(message);
      refreshData();
    } catch (error) {
      console.error('Error sending chain to maintenance:', error);
      alert(`Error al enviar chain a mantenimiento: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCloseRackThresholds = () => {
    setShowRackThresholdsModal(false);
    setSelectedRackId('');
    setSelectedRackName('');
  };

  const handleRackThresholdSaveSuccess = () => {
    refreshThresholds();
    refreshData();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleExportAlerts = async (filterBySite: boolean = false) => {
    setIsExporting(true);
    setExportMessage(null);
    setExportError(null);
    setShowExportMenu(false);

    try {
      const response = await fetch('/api/export/alerts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filterBySite }),
      });

      if (!response.ok) {
        // Try to parse JSON error message
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check if response is JSON (no alerts case) or Excel file
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        // No alerts to export case
        const result = await response.json();
        if (result.count === 0) {
          setExportMessage('No hay alertas para exportar en este momento.');
        } else {
          setExportMessage('Archivo Excel generado exitosamente.');
        }
      } else {
        // Excel file received - trigger download
        const blob = await response.blob();

        // Get filename from Content-Disposition header or use default
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'alertas.xlsx';
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        }

        // Create a temporary URL for the blob
        const url = window.URL.createObjectURL(blob);

        // Create a temporary anchor element and trigger download
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setExportMessage(`✅ Archivo descargado exitosamente: ${filename}`);
      }

      // Clear success message after 8 seconds
      setTimeout(() => setExportMessage(null), 8000);

    } catch (err) {
      console.error('Error exporting alerts:', err);
      setExportError(err instanceof Error ? err.message : 'Error al exportar las alertas');

      // Clear error message after 8 seconds
      setTimeout(() => setExportError(null), 8000);
    } finally {
      setIsExporting(false);
    }
  };

  // Helper function to render alert summary blocks
  const renderAlertSummaryBlock = (title: string, summary: any, type: 'racks' | 'pdus') => {
    const unitText = type === 'racks' ? 'racks' : 'PDUs';
    const criticalTotal = summary.critical.total;
    const warningTotal = summary.warning.total;
    
    if (criticalTotal === 0 && warningTotal === 0) {
      return null;
    }

    return (
      <div className="bg-white rounded-lg shadow-lg mb-6 p-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <AlertTriangle className="h-6 w-6 mr-2 text-red-600" />
            {title}
          </h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Critical Alerts */}
          {criticalTotal > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-red-800 flex items-center">
                  <div className="w-3 h-3 bg-red-600 rounded-full mr-2 animate-pulse"></div>
                  Alertas Críticas
                </h3>
                <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                  {criticalTotal}
                </span>
              </div>
              <div className="space-y-2">
                {summary.critical.amperage > 0 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveStatusFilter('critical');
                        setActiveMetricFilter('amperage');
                      }}
                      className="text-red-700 text-sm hover:text-red-900 hover:bg-red-100 px-2 py-1 rounded transition-colors cursor-pointer flex items-center"
                      title="Filtrar por alertas críticas de amperaje"
                    >
                      ⚡ Amperaje
                    </button>
                    <span className="bg-red-200 text-red-800 px-2 py-1 rounded text-xs font-medium">
                      {summary.critical.amperage} {unitText}
                    </span>
                  </div>
                )}
                {summary.critical.temperature > 0 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveStatusFilter('critical');
                        setActiveMetricFilter('temperature');
                      }}
                      className="text-red-700 text-sm hover:text-red-900 hover:bg-red-100 px-2 py-1 rounded transition-colors cursor-pointer flex items-center"
                      title="Filtrar por alertas críticas de temperatura"
                    >
                      🌡️ Temperatura
                    </button>
                    <span className="bg-red-200 text-red-800 px-2 py-1 rounded text-xs font-medium">
                      {summary.critical.temperature} {unitText}
                    </span>
                  </div>
                )}
                {summary.critical.humidity > 0 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveStatusFilter('critical');
                        setActiveMetricFilter('humidity');
                      }}
                      className="text-red-700 text-sm hover:text-red-900 hover:bg-red-100 px-2 py-1 rounded transition-colors cursor-pointer flex items-center"
                      title="Filtrar por alertas críticas de humedad"
                    >
                      💧 Humedad
                    </button>
                    <span className="bg-red-200 text-red-800 px-2 py-1 rounded text-xs font-medium">
                      {summary.critical.humidity} {unitText}
                    </span>
                  </div>
                )}
                {summary.critical.voltage > 0 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveStatusFilter('critical');
                        setActiveMetricFilter('voltage');
                      }}
                      className="text-red-700 text-sm hover:text-red-900 hover:bg-red-100 px-2 py-1 rounded transition-colors cursor-pointer flex items-center"
                      title="Filtrar por alertas críticas de voltaje"
                    >
                      🔌 Voltaje
                    </button>
                    <span className="bg-red-200 text-red-800 px-2 py-1 rounded text-xs font-medium">
                      {summary.critical.voltage} {unitText}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Warning Alerts */}
          {warningTotal > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-yellow-800 flex items-center">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2 animate-pulse"></div>
                  Alertas de Advertencia
                </h3>
                <span className="bg-yellow-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                  {warningTotal}
                </span>
              </div>
              <div className="space-y-2">
                {summary.warning.amperage > 0 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveStatusFilter('warning');
                        setActiveMetricFilter('amperage');
                      }}
                      className="text-yellow-700 text-sm hover:text-yellow-900 hover:bg-yellow-100 px-2 py-1 rounded transition-colors cursor-pointer flex items-center"
                      title="Filtrar por alertas de advertencia de amperaje"
                    >
                      ⚡ Amperaje
                    </button>
                    <span className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-xs font-medium">
                      {summary.warning.amperage} {unitText}
                    </span>
                  </div>
                )}
                {summary.warning.temperature > 0 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveStatusFilter('warning');
                        setActiveMetricFilter('temperature');
                      }}
                      className="text-yellow-700 text-sm hover:text-yellow-900 hover:bg-yellow-100 px-2 py-1 rounded transition-colors cursor-pointer flex items-center"
                      title="Filtrar por alertas de advertencia de temperatura"
                    >
                      🌡️ Temperatura
                    </button>
                    <span className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-xs font-medium">
                      {summary.warning.temperature} {unitText}
                    </span>
                  </div>
                )}
                {summary.warning.humidity > 0 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveStatusFilter('warning');
                        setActiveMetricFilter('humidity');
                      }}
                      className="text-yellow-700 text-sm hover:text-yellow-900 hover:bg-yellow-100 px-2 py-1 rounded transition-colors cursor-pointer flex items-center"
                      title="Filtrar por alertas de advertencia de humedad"
                    >
                      💧 Humedad
                    </button>
                    <span className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-xs font-medium">
                      {summary.warning.humidity} {unitText}
                    </span>
                  </div>
                )}
                {summary.warning.voltage > 0 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveStatusFilter('warning');
                        setActiveMetricFilter('voltage');
                      }}
                      className="text-yellow-700 text-sm hover:text-yellow-900 hover:bg-yellow-100 px-2 py-1 rounded transition-colors cursor-pointer flex items-center"
                      title="Filtrar por alertas de advertencia de voltaje"
                    >
                      🔌 Voltaje
                    </button>
                    <span className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-xs font-medium">
                      {summary.warning.voltage} {unitText}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (racksLoading && thresholdsLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando datos del sistema...</p>
        </div>
      </div>
    );
  }

  if (racksError || thresholdsError) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error al cargar datos</h2>
          <p className="text-gray-600 mb-4">
            {racksError || thresholdsError}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={
        <div className="min-h-screen bg-gray-100">
          <div className="bg-white shadow-md border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Top Row - Title and User Info */}
              <div className="flex justify-between items-center py-4 border-b border-gray-100">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Monitoreo de Racks y PDUs
                  </h1>
                  <div className="flex items-center mt-1">
                    <span className="text-sm text-gray-600">
                      {globalAlertSummary.totalAlertingRacks} Racks con alertas de {globalAlertSummary.totalUserRacks} Racks totales
                      {globalAlertSummary.totalUserRacks > 0 && (
                        <span className="ml-1 text-xs font-semibold text-blue-700">
                          ({((globalAlertSummary.totalAlertingRacks / globalAlertSummary.totalUserRacks) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </span>
                    {globalAlertSummary.totalAlertingRacks > 0 && (
                      <div className="ml-3 flex items-center space-x-3">
                        {globalAlertSummary.rackSummary.critical.total > 0 && (
                          <div className="flex items-center">
                            <div className="w-2 h-2 bg-red-600 rounded-full mr-1 animate-pulse"></div>
                            <span className="text-xs font-medium text-red-700">
                              {globalAlertSummary.rackSummary.critical.total} crítico{globalAlertSummary.rackSummary.critical.total !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        {globalAlertSummary.rackSummary.warning.total > 0 && (
                          <div className="flex items-center">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full mr-1 animate-pulse"></div>
                            <span className="text-xs font-medium text-yellow-700">
                              {globalAlertSummary.rackSummary.warning.total} advertencia{globalAlertSummary.rackSummary.warning.total !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {maintenanceRacks.size > 0 && (
                      <div className="ml-3 flex items-center">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mr-1"></div>
                        <span className="text-xs font-medium text-blue-700">
                          {maintenanceRacks.size} en mantenimiento
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* User Info */}
                <div className="flex items-center px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
                  <User className="h-5 w-5 mr-2 text-gray-600" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900">{user?.usuario}</span>
                    <span className={`text-xs font-semibold ${
                      user?.rol === 'Administrador' ? 'text-red-600' :
                      user?.rol === 'Operador' ? 'text-blue-600' :
                      user?.rol === 'Tecnico' ? 'text-green-600' :
                      'text-gray-600'
                    }`}>
                      {user?.rol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Row - Navigation and Actions */}
              <div className="flex justify-between items-center py-3">
                {/* View Toggle Buttons */}
                <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
                  <button
                    onClick={() => {
                      setActiveView('principal');
                      setActiveStatusFilter('all');
                      setActiveMetricFilter('all');
                    }}
                    className={`px-5 py-2.5 rounded-md text-sm font-medium transition-all ${
                      activeView === 'principal'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-white'
                    }`}
                  >
                    <Activity className="h-4 w-4 inline mr-2" />
                    Principal
                  </button>
                  <button
                    onClick={() => setActiveView('alertas')}
                    className={`px-5 py-2.5 rounded-md text-sm font-medium transition-all ${
                      activeView === 'alertas'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-white'
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4 inline mr-2" />
                    Alertas
                  </button>
                  <button
                    onClick={() => setActiveView('mantenimiento')}
                    className={`px-5 py-2.5 rounded-md text-sm font-medium transition-all ${
                      activeView === 'mantenimiento'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-white'
                    }`}
                  >
                    <Wrench className="h-4 w-4 inline mr-2" />
                    Mantenimiento
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  {/* Refresh Button */}
                  <button
                    onClick={() => {
                      refreshData();
                      refreshThresholds();
                    }}
                    disabled={racksLoading || thresholdsLoading}
                    className={`inline-flex items-center px-4 py-2.5 border text-sm font-medium rounded-lg transition-all ${
                      racksLoading || thresholdsLoading
                        ? 'bg-blue-100 text-blue-400 border-blue-200 cursor-not-allowed'
                        : 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm'
                    }`}
                    title="Refrescar datos"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${racksLoading || thresholdsLoading ? 'animate-spin' : ''}`} />
                    Refrescar
                  </button>

                  {/* Export Button with Dropdown - Visible to all users */}
                  <div className="relative" ref={exportMenuRef}>
                      <button
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        disabled={isExporting || racksLoading || thresholdsLoading}
                        className={`inline-flex items-center px-4 py-2.5 border text-sm font-medium rounded-lg transition-all ${
                          isExporting
                            ? 'bg-blue-100 text-blue-700 border-blue-200 cursor-not-allowed'
                            : 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm'
                        }`}
                        title={isExporting ? "Exportando alertas..." : "Exportar alertas a archivo Excel"}
                      >
                        <Download className={`h-4 w-4 mr-2 ${isExporting ? 'animate-spin' : ''}`} />
                        Exportar
                        <ChevronDown className="h-4 w-4 ml-1" />
                      </button>

                      {showExportMenu && !isExporting && (
                        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                          <div className="py-1">
                            <button
                              onClick={() => handleExportAlerts(false)}
                              className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-start"
                            >
                              <Download className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="font-medium">Exportar Todas las Alertas</div>
                                <div className="text-xs text-gray-500 mt-0.5">Exporta todas las alertas del sistema</div>
                              </div>
                            </button>
                            <div className="border-t border-gray-100"></div>
                            <button
                              onClick={() => handleExportAlerts(true)}
                              className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-start"
                            >
                              <Download className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="font-medium">Exportar Alertas del Sitio Asignado</div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {user?.sitios_asignados && user.sitios_asignados.length > 0
                                    ? `Solo alertas de: ${user.sitios_asignados.join(', ')}`
                                    : 'Exporta alertas según tus permisos'}
                                </div>
                              </div>
                            </button>
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Settings Button - Hidden for Tecnico and Observador */}
                  {(user?.rol === 'Administrador' || user?.rol === 'Operador') && (
                    <button
                      onClick={() => setShowThresholds(!showThresholds)}
                      className={`inline-flex items-center px-4 py-2.5 border text-sm font-medium rounded-lg transition-all ${
                        showThresholds
                          ? 'text-blue-700 bg-blue-100 border-blue-200 shadow-sm'
                          : 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm'
                      }`}
                      title={showThresholds ? "Cerrar Configuración" : "Abrir Configuración"}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Configuración
                    </button>
                  )}

                  {/* Logout Button */}
                  <button
                    onClick={logout}
                    className="inline-flex items-center px-4 py-2.5 border border-red-200 text-sm font-medium rounded-lg text-red-700 bg-red-50 hover:bg-red-100 hover:border-red-300 hover:shadow-sm transition-all"
                    title="Cerrar sesión"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Salir
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto py-8">
            {/* Export Status Messages */}
            {(exportMessage || exportError) && (
              <div className="mb-6">
                {exportMessage && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <Download className="h-5 w-5 text-green-400" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-green-800">Exportación Exitosa</h3>
                        <div className="mt-1 text-sm text-green-700">
                          {exportMessage}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {exportError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Error de Exportación</h3>
                        <div className="mt-1 text-sm text-red-700">
                          {exportError}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Alerts Summary Dashboard - Dual View */}
            {!showThresholds && activeView === 'alertas' && (filteredAlertSummary.rackSummary.critical.total > 0 || filteredAlertSummary.rackSummary.warning.total > 0 || filteredAlertSummary.pduSummary.critical.total > 0 || filteredAlertSummary.pduSummary.warning.total > 0) && (
              <>
                {/* Rack-level Summary */}
                {renderAlertSummaryBlock("Resumen de Alertas por Rack", filteredAlertSummary.rackSummary, 'racks')}
                
                {/* PDU-level Summary */}
                {renderAlertSummaryBlock("Resumen de Alertas por PDU", filteredAlertSummary.pduSummary, 'pdus')}
                
                {/* Active Filters Display */}
                {(activeStatusFilter !== 'all' || activeMetricFilter !== 'all') && (
                  <div className="bg-white rounded-lg shadow mb-6 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">Filtros activos:</span>
                        {activeStatusFilter !== 'all' && (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            activeStatusFilter === 'critical' 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {activeStatusFilter === 'critical' ? 'Críticas' : 'Advertencias'}
                          </span>
                        )}
                        {activeMetricFilter !== 'all' && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {activeMetricFilter === 'amperage' ? 'Amperaje' : 
                             activeMetricFilter === 'temperature' ? 'Temperatura' : 
                             activeMetricFilter === 'humidity' ? 'Humedad' :
                             activeMetricFilter === 'voltage' ? 'Voltaje' :
                             activeMetricFilter === 'power' ? 'Potencia' : activeMetricFilter}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setActiveStatusFilter('all');
                          setActiveMetricFilter('all');
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        title="Limpiar todos los filtros"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Rack Threshold Manager Modal */}
            {showRackThresholdsModal && selectedRackId && (
              <RackThresholdManager
                rackId={selectedRackId}
                rackName={selectedRackName}
                onSaveSuccess={handleRackThresholdSaveSuccess}
                onClose={handleCloseRackThresholds}
              />
            )}

            {showThresholds ? (
              <ThresholdManager
                thresholds={thresholds}
                onSaveSuccess={handleThresholdSaveSuccess}
                onClose={() => setShowThresholds(false)}
              />
            ) : (
              <>
            {/* Search Bar - Only show when threshold manager is closed and NOT in maintenance view */}
            {!showRackThresholdsModal && activeView !== 'mantenimiento' && (
              <div className="bg-white rounded-lg shadow mb-6 p-4">
                <div className="flex items-center space-x-4 flex-wrap gap-2">
                  <label htmlFor="search-input" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    Buscar:
                  </label>
                  <div className="flex items-center space-x-2 flex-1">
                    <label htmlFor="search-field-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                      Campo:
                    </label>
                    <select
                      id="search-field-select"
                      value={searchField}
                      onChange={(e) => setSearchField(e.target.value)}
                      className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    >
                      <option value="all">Todos los campos</option>
                      <option value="site">Sitio</option>
                      <option value="country">País</option>
                      <option value="dc">Sala</option>
                      <option value="name">Nombre del Rack</option>
                      <option value="node">Nodo</option>
                      <option value="chain">Cadena</option>
                      <option value="serial">N° de Serie</option>
                    </select>
                    <div className="flex-1 relative">
                      <input
                        id="search-input"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={
                          searchField === 'all' 
                            ? "Buscar por sitio, país, DC, rack, nodo, cadena, N° serie..." 
                            : searchField === 'site' 
                              ? "Buscar por sitio..."
                              : searchField === 'country'
                                ? "Buscar por país..."
                                : searchField === 'dc'
                                  ? "Buscar por sala..."
                                  : searchField === 'name'
                                    ? "Buscar por nombre del rack..."
                                    : searchField === 'node'
                                      ? "Buscar por nodo..."
                                      : searchField === 'chain'
                                        ? "Buscar por cadena..."
                                        : searchField === 'serial'
                                          ? "Buscar por N° de serie..."
                                          : "Buscar..."
                        }
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm pl-3 pr-10 py-2"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          title="Limpiar búsqueda"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Geographical Filters - Only show when threshold manager is closed and NOT in maintenance view */}
            {!showThresholds && !showRackThresholdsModal && activeView !== 'mantenimiento' && (
              <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setIsGeoFiltersExpanded(!isGeoFiltersExpanded)}
                >
                  <h3 className="text-lg font-medium text-gray-900 flex items-center">
                    Filtros Geográficos
                    {(activeCountryFilter !== 'all' || activeSiteFilter !== 'all' || activeDcFilter !== 'all' || activeGwFilter !== 'all') && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {[
                          activeCountryFilter !== 'all' && 'País',
                          activeSiteFilter !== 'all' && 'Sitio',
                          activeDcFilter !== 'all' && 'DC',
                          activeGwFilter !== 'all' && 'Gateway'
                        ].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </h3>
                  {isGeoFiltersExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  )}
                </div>

                {isGeoFiltersExpanded && (
                  <div className="border-t border-gray-200 p-4">
                    <div className="space-y-6">
                      {/* Country Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          País:
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setActiveCountryFilter('all')}
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                              activeCountryFilter === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Todos
                          </button>
                          {availableCountries.filter(country => country !== 'N/A').map((country) => (
                            <button
                              key={country}
                              onClick={() => setActiveCountryFilter(country)}
                              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                activeCountryFilter === country
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {country}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Site Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Sitio:
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setActiveSiteFilter('all')}
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                              activeSiteFilter === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Todos
                          </button>
                          {availableSites.map((site) => (
                            <button
                              key={site}
                              onClick={() => setActiveSiteFilter(site)}
                              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                activeSiteFilter === site
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {site}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Sala Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Sala:
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setActiveDcFilter('all')}
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                              activeDcFilter === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Todos
                          </button>
                          {(showAllDcs ? availableDcs : availableDcs.slice(0, 4)).map((dc) => (
                            <button
                              key={dc}
                              onClick={() => setActiveDcFilter(dc)}
                              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                activeDcFilter === dc
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {dc}
                            </button>
                          ))}
                          {availableDcs.length > 4 && (
                            <button
                              onClick={() => setShowAllDcs(!showAllDcs)}
                              className="px-3 py-2 rounded-md text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                            >
                              {showAllDcs ? 'Mostrar menos' : 'Mostrar más'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Gateway Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Gateway:
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setActiveGwFilter('all')}
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                              activeGwFilter === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Todos
                          </button>
                          {(showAllGateways ? availableGateways : availableGateways.slice(0, 4)).map((gwKey) => {
                            const [gwName, gwIp] = gwKey.split('-');
                            return (
                              <button
                                key={gwKey}
                                onClick={() => setActiveGwFilter(gwKey)}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                  activeGwFilter === gwKey
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                                title={`IP: ${gwIp}`}
                              >
                                {gwName === 'N/A' ? 'Sin Gateway' : gwName}
                              </button>
                            );
                          })}
                          {availableGateways.length > 4 && (
                            <button
                              onClick={() => setShowAllGateways(!showAllGateways)}
                              className="px-3 py-2 rounded-md text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                            >
                              {showAllGateways ? 'Mostrar menos' : 'Mostrar más'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Main Content */}
            {activeView === 'mantenimiento' ? (
              <MaintenancePage />
            ) : (
              <>
                {!showRackThresholdsModal && (
                  <div className="space-y-6">
                  {Object.entries(groupedRacks).map(([country, siteGroups]) => (
                    <CountryGroup
                      key={country}
                      country={country}
                      siteGroups={siteGroups}
                      originalRackGroups={originalRackGroups}
                      activeView={activeView}
                      isExpanded={expandedCountryIds.has(country)}
                      onToggleExpand={toggleCountryExpansion}
                      expandedSiteIds={expandedSiteIds}
                      toggleSiteExpansion={toggleSiteExpansion}
                      expandedDcIds={expandedDcIds}
                      toggleDcExpansion={toggleDcExpansion}
                      expandedGwIds={expandedGwIds}
                      toggleGwExpansion={toggleGwExpansion}
                      getThresholdValue={getThresholdValueWrapper}
                      getMetricStatusColor={getMetricStatusColor}
                      getAmperageStatusColor={getAmperageStatusColorWrapper}
                      activeStatusFilter={activeStatusFilter}
                      onStatusFilterChange={setActiveStatusFilter}
                      onConfigureThresholds={(user?.rol === 'Administrador' || user?.rol === 'Operador') ? handleConfigureThresholds : undefined}
                      onSendRackToMaintenance={(user?.rol !== 'Observador') ? handleSendRackToMaintenance : undefined}
                      onSendChainToMaintenance={(user?.rol !== 'Observador') ? handleSendChainToMaintenance : undefined}
                      maintenanceRacks={maintenanceRacks}
                      expandedRackNames={expandedRackNames}
                      onToggleRackExpansion={handleToggleRackExpansion}
                    />
                  ))}
                  </div>
                )}

                {/* No Data Message */}
                {Object.keys(groupedRacks).length === 0 && !showRackThresholdsModal && (
                  <div className="text-center py-12">
                    <Activity className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      No hay datos de racks disponibles
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Los datos se cargarán automáticamente cuando estén disponibles.
                    </p>
                  </div>
                )}
              </>
            )}
            </>
            )}
          </div>
        </div>
      } />
    </Routes>
  );
}

export default App;