import { useState, useEffect } from 'react';
import { Wrench, Calendar, User, MapPin, Server, AlertCircle } from 'lucide-react';

interface MaintenanceRack {
  id: string;
  rack_id: string;
  chain: string;
  pdu_id: string;
  name: string;
  country: string;
  site: string;
  dc: string;
  phase: string;
  node: string;
  serial: string;
  reason: string;
  started_at: string;
  started_by: string;
  created_at: string;
}

interface GroupedByChainDc {
  [key: string]: MaintenanceRack[];
}

export default function MaintenancePage() {
  const [maintenanceRacks, setMaintenanceRacks] = useState<MaintenanceRack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMaintenanceRacks = async () => {
    try {
      setLoading(true);
      setError(null);

      const timestamp = new Date().getTime();
      const response = await fetch(`/api/maintenance?t=${timestamp}`, {
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
        throw new Error(data.message || 'Failed to fetch maintenance racks');
      }

      setMaintenanceRacks(data.data || []);
    } catch (err) {
      console.error('Error fetching maintenance racks:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaintenanceRacks();

    const interval = setInterval(fetchMaintenanceRacks, 60000);
    return () => clearInterval(interval);
  }, []);

  const [removingChainDc, setRemovingChainDc] = useState<string | null>(null);

  const handleRemoveChainDc = async (chain: string, dc: string) => {
    if (!confirm(`¿Seguro que quieres sacar la chain "${chain}" del DC "${dc}" de mantenimiento?`)) {
      return;
    }

    try {
      const key = `${chain}_${dc}`;
      setRemovingChainDc(key);

      const response = await fetch(`/api/maintenance/chain/${encodeURIComponent(chain)}/${encodeURIComponent(dc)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to remove chain from maintenance');
      }

      await fetchMaintenanceRacks();
    } catch (err) {
      console.error('Error removing chain from maintenance:', err);
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRemovingChainDc(null);
    }
  };

  const groupedByChainDc: GroupedByChainDc = maintenanceRacks.reduce((acc, rack) => {
    const chain = rack.chain || 'Sin Chain';
    const dc = rack.dc || 'Sin DC';
    const key = `${chain}_${dc}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(rack);
    return acc;
  }, {} as GroupedByChainDc);

  const chainDcKeys = Object.keys(groupedByChainDc).sort();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-900">Error al cargar datos</h3>
                <p className="text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Wrench className="w-8 h-8 text-amber-600" />
            <h1 className="text-3xl font-bold text-slate-900">Modo Mantenimiento</h1>
          </div>
          <p className="text-slate-600">
            Equipos actualmente en mantenimiento (no generan alertas)
          </p>
        </div>

        {maintenanceRacks.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
            <Wrench className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              No hay equipos en mantenimiento
            </h3>
            <p className="text-slate-500">
              Todos los equipos están activos y generando alertas normalmente
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {chainDcKeys.map(key => {
              const racks = groupedByChainDc[key];
              const firstRack = racks[0];
              const chain = firstRack.chain || 'Sin Chain';
              const dc = firstRack.dc || 'Sin DC';

              return (
                <div
                  key={key}
                  className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"
                >
                  <div className="bg-gradient-to-r from-amber-50 to-amber-100 border-b border-amber-200 p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <Server className="w-6 h-6 text-amber-700" />
                          <h2 className="text-2xl font-bold text-amber-900">
                            Chain: {chain}
                          </h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div className="flex items-center gap-2 text-slate-700">
                            <MapPin className="w-4 h-4 text-amber-600" />
                            <span className="font-medium">País:</span>
                            <span>{firstRack.country || 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-700">
                            <MapPin className="w-4 h-4 text-amber-600" />
                            <span className="font-medium">Sitio:</span>
                            <span>{firstRack.site || 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-700">
                            <Server className="w-4 h-4 text-amber-600" />
                            <span className="font-medium">DC:</span>
                            <span>{dc}</span>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Calendar className="w-4 h-4" />
                            <span className="font-medium">Inicio:</span>
                            <span>{new Date(firstRack.started_at).toLocaleString('es-ES')}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            <User className="w-4 h-4" />
                            <span className="font-medium">Por:</span>
                            <span>{firstRack.started_by}</span>
                          </div>
                        </div>

                        {firstRack.reason && (
                          <div className="mt-3 text-sm text-slate-700">
                            <span className="font-medium">Razón:</span> {firstRack.reason}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleRemoveChainDc(chain, dc)}
                        disabled={removingChainDc === key}
                        className="ml-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {removingChainDc === key ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                            Procesando...
                          </>
                        ) : (
                          <>
                            <Wrench className="w-4 h-4" />
                            Finalizar Mantenimiento
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    <h3 className="font-semibold text-slate-900 mb-4">
                      Equipos en esta chain ({racks.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {racks.map(rack => (
                        <div
                          key={rack.id}
                          className="border border-slate-200 rounded-lg p-4 bg-slate-50"
                        >
                          <div className="font-medium text-slate-900 mb-2">
                            {rack.name || rack.rack_id}
                          </div>
                          <div className="space-y-1 text-sm text-slate-600">
                            <div>
                              <span className="font-medium">Rack ID:</span> {rack.rack_id}
                            </div>
                            {rack.pdu_id && (
                              <div>
                                <span className="font-medium">PDU ID:</span> {rack.pdu_id}
                              </div>
                            )}
                            {rack.phase && (
                              <div>
                                <span className="font-medium">Fase:</span> {rack.phase}
                              </div>
                            )}
                            {rack.node && (
                              <div>
                                <span className="font-medium">Node:</span> {rack.node}
                              </div>
                            )}
                            {rack.serial && (
                              <div>
                                <span className="font-medium">Serial:</span> {rack.serial}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
