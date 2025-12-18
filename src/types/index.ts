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
  voltage?: number; // Voltage from totalVolts field in NENG API
  temperature: number;
  status: 'normal' | 'warning' | 'critical';
  lastUpdated: string;
  // Sensor data from sensors endpoint - optional fields
  sensorTemperature?: number;
  sensorHumidity?: number;
  // Gateway information
  gwName?: string;
  gwIp?: string;
  // Alert reasons
  reasons?: string[];
  // SONAR error (if failed to send alert)
  sonarError?: string;
  // SONAR alert sent successfully
  sonarSent?: boolean;
}

export interface ThresholdData {
  key: string;
  value: number;
  unit?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}