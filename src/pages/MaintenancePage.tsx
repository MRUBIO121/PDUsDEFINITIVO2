import React, { useState, useEffect } from 'react';
import { Wrench, RefreshCw, X } from 'lucide-react';

interface MaintenanceEntry {
  id: string;
  rackId: string;
  chain: string;
  dc: string;
  site: string;
  reason: string;
  startedBy: string;
  startTime: string;
}

const MaintenancePage: React.FC = () => {
  const [entries, setEntries] = useState<MaintenanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMaintenanceData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/maintenance');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setEntries(data.entries || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaintenanceData();
    const interval = setInterval(fetchMaintenanceData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleEndMaintenance = async (entryId: string) => {
    try {
      const response = await fetch(`/api/maintenance/${entryId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Error al finalizar mantenimiento');
      }

      await fetchMaintenanceData();
    } catch (err) {
      console.error('Error:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Wrench className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Racks en Mantenimiento</h2>
          </div>
          <button
            onClick={fetchMaintenanceData}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <Wrench className="h-12 w-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">No hay racks en mantenimiento</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{entry.rackId}</h3>
                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                    <p><span className="font-medium">Chain:</span> {entry.chain}</p>
                    <p><span className="font-medium">DC:</span> {entry.dc}</p>
                    <p><span className="font-medium">Site:</span> {entry.site}</p>
                    <p><span className="font-medium">Razón:</span> {entry.reason}</p>
                    <p><span className="font-medium">Iniciado por:</span> {entry.startedBy}</p>
                    <p><span className="font-medium">Inicio:</span> {new Date(entry.startTime).toLocaleString()}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleEndMaintenance(entry.id)}
                  className="flex items-center space-x-1 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  <X className="h-4 w-4" />
                  <span>Finalizar</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MaintenancePage;
