import React, { useState } from 'react';
import { X } from 'lucide-react';

interface RackThresholdManagerProps {
  rackId: string;
  rackName: string;
  onSaveSuccess: () => void;
  onClose: () => void;
}

const RackThresholdManager: React.FC<RackThresholdManagerProps> = ({
  rackId,
  rackName,
  onSaveSuccess,
  onClose,
}) => {
  const [warning, setWarning] = useState(80);
  const [critical, setCritical] = useState(90);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (warning >= critical) {
      setError('El umbral de advertencia debe ser menor que el crítico');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/rack-thresholds/${rackId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warning, critical }),
      });

      if (!response.ok) {
        throw new Error('Error al guardar umbrales del rack');
      }

      onSaveSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Configurar Umbrales - {rackName}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Umbral de Advertencia (%)
            </label>
            <input
              type="number"
              value={warning}
              onChange={(e) => setWarning(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              min="0"
              max="100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Umbral Crítico (%)
            </label>
            <input
              type="number"
              value={critical}
              onChange={(e) => setCritical(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              min="0"
              max="100"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="flex space-x-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RackThresholdManager;
