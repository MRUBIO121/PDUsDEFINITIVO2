export interface RackData {
  id: string;
  rackId?: string;
  name: string;
  country?: string;
  site: string;
  phase: string;
  dc: string;
  chain?: string;
  node?: string;
  serial?: string;
  current: number;
  temperature: number;
  status: 'normal' | 'warning' | 'critical';
  lastUpdated: string;
  // Sensor data from sensors endpoint - optional fields
  sensorTemperature?: number;
  sensorHumidity?: number;
  // Alert reasons
  reasons?: string[];
}

export interface ThresholdData {
  key: string;
  value: number;
  unit?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}