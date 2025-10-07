require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const winston = require('winston');
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

// Environment variables loaded from .env file

const app = express();
const port = process.env.PORT || 3001;

// Winston Logger Configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'energy-monitoring-api' },
  transports: [
    new winston.transports.File({ filename: './logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: './logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// SQL Server Configuration
const sqlConfig = {
  server: process.env.SQL_SERVER_HOST || 'localhost',
  database: process.env.SQL_SERVER_DATABASE || 'energy_monitor_db',
  user: process.env.SQL_SERVER_USER || 'sa',
  password: process.env.SQL_SERVER_PASSWORD,
  port: parseInt(process.env.SQL_SERVER_PORT) || 1433,
  options: {
    encrypt: process.env.SQL_SERVER_ENCRYPT === 'true',
    trustServerCertificate: true,
    enableArithAbort: true
  },
  connectionTimeout: 60000,
  requestTimeout: 60000,
  pool: {
    max: 20,
    min: 2,
    idleTimeoutMillis: 60000,
    acquireTimeoutMillis: 30000
  }
};

// Global connection pool instance
let globalPool = null;
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * Get or create the global database connection pool
 * Implements connection pooling with automatic reconnection
 */
async function getPool() {
  // If pool exists and is connected, return it
  if (globalPool && globalPool.connected) {
    return globalPool;
  }

  // If already connecting, wait for connection to complete
  if (isConnecting) {
    let attempts = 0;
    while (isConnecting && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (globalPool && globalPool.connected) {
      return globalPool;
    }
  }

  // Create new connection
  isConnecting = true;
  try {
    console.log('🔄 Establishing database connection...');
    globalPool = await sql.connect(sqlConfig);

    // Set up connection event handlers
    globalPool.on('error', (err) => {
      console.error('❌ Database pool error:', err.message);
      logger.error('Database pool error', { error: err.message });
      globalPool = null;
    });

    console.log('✅ Database connection established');
    reconnectAttempts = 0;
    isConnecting = false;
    return globalPool;
  } catch (error) {
    isConnecting = false;
    reconnectAttempts++;
    console.error(`❌ Failed to connect to database (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}):`, error.message);
    logger.error('Database connection failed', { error: error.message, attempt: reconnectAttempts });

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      console.log(`⏳ Retrying in ${reconnectAttempts * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, reconnectAttempts * 2000));
      return getPool();
    }

    throw error;
  }
}

/**
 * Execute a database query with automatic retry on connection failure
 */
async function executeQuery(queryFn, retries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const pool = await getPool();

      // Verify connection is still valid
      if (!pool || !pool.connected) {
        throw new Error('Database connection is not available');
      }

      return await queryFn(pool);
    } catch (error) {
      lastError = error;

      // Check if error is connection-related
      if (error.code === 'ECONNCLOSED' || error.code === 'ENOTOPEN' || error.message.includes('Connection is closed')) {
        console.error(`⚠️ Connection error on attempt ${attempt + 1}/${retries + 1}:`, error.message);

        // Reset global pool to force reconnection
        globalPool = null;

        if (attempt < retries) {
          console.log(`🔄 Retrying query after connection reset...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
      }

      // For non-connection errors or final retry, throw immediately
      throw error;
    }
  }

  throw lastError;
}

// Initialize connection pool on startup
async function initializeDatabaseConnection() {
  try {
    await getPool();
    console.log('✅ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    logger.error('Database initialization failed', { error: error.message });
  }
}

initializeDatabaseConnection();

// Middleware Configuration
app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Morgan logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Cache configuration
let racksCache = {
  data: null,
  timestamp: null,
  ttl: 30000 // 30 segundos
};

let thresholdsCache = {
  data: null,
  timestamp: null,
  ttl: 300000 // 5 minutos
};

// Helper function to check if cache is valid
function isCacheValid(cache) {
  return cache.data && cache.timestamp && (Date.now() - cache.timestamp) < cache.ttl;
}

// Real NENG API fetch function
async function fetchFromNengApi(url, options = {}) {
  const apiTimeout = parseInt(process.env.API_TIMEOUT) || 10000;
  
  // Making API call to NENG
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), apiTimeout);
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${process.env.NENG_API_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // API call successful
    
    return {
      success: true,
      data: data,
      count: Array.isArray(data) ? data.length : 1,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`❌ NENG API timeout after ${apiTimeout}ms`);
      throw new Error(`API request timeout after ${apiTimeout}ms`);
    }
    
    console.error('❌ NENG API error:', error);
    throw error;
  }
}

// Function to fetch thresholds from SQL Server
async function fetchThresholdsFromDatabase() {
  try {
    if (isCacheValid(thresholdsCache)) {
      return thresholdsCache.data;
    }

    const result = await executeQuery(async (pool) => {
      return await pool.request().query(`
        SELECT threshold_key as [key], value, unit, description, created_at as createdAt, updated_at as updatedAt
        FROM dbo.threshold_configs
        ORDER BY threshold_key
      `);
    });

    const thresholds = result.recordset || [];

    // Update cache
    thresholdsCache.data = thresholds;
    thresholdsCache.timestamp = Date.now();

    return thresholds;

  } catch (error) {
    console.error('❌ Error fetching thresholds from database:', error);
    logger.error('Database threshold fetch failed', { error: error.message });
    return [];
  }
}

// Function to save thresholds to SQL Server
async function saveThresholdsToDatabase(thresholds) {
  try {
    const updatedCount = await executeQuery(async (pool) => {
      let count = 0;

      for (const [key, value] of Object.entries(thresholds)) {
        const result = await pool.request()
          .input('key', sql.NVarChar, key)
          .input('value', sql.Decimal(18, 4), value)
          .query(`
            UPDATE dbo.threshold_configs
            SET value = @value, updated_at = GETDATE()
            WHERE threshold_key = @key
          `);

        if (result.rowsAffected[0] > 0) {
          count++;
        }
      }

      return count;
    });

    // Clear cache to force reload
    thresholdsCache.data = null;
    thresholdsCache.timestamp = null;

    return updatedCount;

  } catch (error) {
    console.error('❌ Error saving thresholds to database:', error);
    logger.error('Database threshold save failed', { error: error.message });
    throw error;
  }
}

// Load all rack-specific thresholds from database in one query
async function loadAllRackSpecificThresholds(rackIds) {
  try {
    if (rackIds.length === 0) return new Map();

    const result = await executeQuery(async (pool) => {
      // Create a table-valued parameter or use IN clause
      const rackIdsList = rackIds.map(id => `'${id.replace("'", "''")}'`).join(',');

      return await pool.request().query(`
        SELECT rack_id, threshold_key, value, unit
        FROM dbo.rack_threshold_overrides
        WHERE rack_id IN (${rackIdsList})
      `);
    });

    // Organize by rack_id
    const rackThresholdsMap = new Map();
    result.recordset.forEach(row => {
      if (!rackThresholdsMap.has(row.rack_id)) {
        rackThresholdsMap.set(row.rack_id, {});
      }
      const overrides = rackThresholdsMap.get(row.rack_id);
      overrides[row.threshold_key] = row.value;
      if (row.unit) {
        overrides[`${row.threshold_key}_unit`] = row.unit;
      }
    });

    // Loaded rack-specific thresholds
    return rackThresholdsMap;
  } catch (error) {
    console.error('Error loading rack-specific thresholds:', error.message);
    return new Map();
  }
}

// Process rack data with threshold evaluation
async function processRackData(racks, thresholds) {

  // Load all rack-specific thresholds in one query
  const uniqueRackIds = [...new Set(racks.map(r => r.rackId || r.id))];
  const rackThresholdsMap = await loadAllRackSpecificThresholds(uniqueRackIds);

  const processedRacks = racks.map(rack => {
    // Merge global thresholds with rack-specific overrides
    const rackId = rack.rackId || rack.id;
    const rackOverrides = rackThresholdsMap.get(rackId) || {};

    // Create effective thresholds by merging global with rack-specific
    const effectiveThresholds = thresholds.map(t => {
      if (rackOverrides[t.key] !== undefined) {
        return { ...t, value: rackOverrides[t.key] };
      }
      return t;
    });

    const reasons = [];
    let status = 'normal';
    
    // Current/Amperage evaluation
    const current = parseFloat(rack.current) || 0;
    const phase = rack.phase || 'single_phase';
    
    // Determine phase type for threshold selection
    const normalizedPhase = phase.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const isSinglePhase = normalizedPhase === 'single_phase' || normalizedPhase === 'single' || normalizedPhase === '1_phase' || normalizedPhase === 'monofasico';
    const is3Phase = normalizedPhase === '3_phase' || normalizedPhase === '3phase' || normalizedPhase === 'three_phase' || normalizedPhase === 'trifasico';
    
    let criticalLow, criticalHigh, warningLow, warningHigh;
    
    if (isSinglePhase) {
      criticalLow = getThresholdValue(effectiveThresholds, 'critical_amperage_low_single_phase');
      criticalHigh = getThresholdValue(effectiveThresholds, 'critical_amperage_high_single_phase');
      warningLow = getThresholdValue(effectiveThresholds, 'warning_amperage_low_single_phase');
      warningHigh = getThresholdValue(effectiveThresholds, 'warning_amperage_high_single_phase');
    } else if (is3Phase) {
      criticalLow = getThresholdValue(effectiveThresholds, 'critical_amperage_low_3_phase');
      criticalHigh = getThresholdValue(effectiveThresholds, 'critical_amperage_high_3_phase');
      warningLow = getThresholdValue(effectiveThresholds, 'warning_amperage_low_3_phase');
      warningHigh = getThresholdValue(effectiveThresholds, 'warning_amperage_high_3_phase');
    } else {
      // Default to single phase
      criticalLow = getThresholdValue(effectiveThresholds, 'critical_amperage_low_single_phase');
      criticalHigh = getThresholdValue(effectiveThresholds, 'critical_amperage_high_single_phase');
      warningLow = getThresholdValue(effectiveThresholds, 'warning_amperage_low_single_phase');
      warningHigh = getThresholdValue(effectiveThresholds, 'warning_amperage_high_single_phase');
    }
    
    // Amperage evaluation - CRITICAL: Including 0A evaluation
    // Only evaluate if all thresholds are defined
    if (criticalLow !== undefined && criticalHigh !== undefined && warningLow !== undefined && warningHigh !== undefined) {
      if (current === 0) {
        reasons.push('critical_amperage_zero_reading');
        status = 'critical';
      } else if (current <= criticalLow || current >= criticalHigh) {
        if (current <= criticalLow) {
          reasons.push(`critical_amperage_low_${isSinglePhase ? 'single_phase' : '3_phase'}`);
        } else {
          reasons.push(`critical_amperage_high_${isSinglePhase ? 'single_phase' : '3_phase'}`);
        }
        status = 'critical';
      } else if (current <= warningLow || current >= warningHigh) {
        if (current <= warningLow) {
          reasons.push(`warning_amperage_low_${isSinglePhase ? 'single_phase' : '3_phase'}`);
        } else {
          reasons.push(`warning_amperage_high_${isSinglePhase ? 'single_phase' : '3_phase'}`);
        }
        if (status !== 'critical') status = 'warning';
      }
    }
    
    // Temperature evaluation (using sensorTemperature primarily)
    // Skip evaluation if temperature is N/A or missing
    if (rack.sensorTemperature !== 'N/A' && rack.temperature !== 'N/A' &&
        rack.sensorTemperature !== null && rack.temperature !== null &&
        rack.sensorTemperature !== undefined && rack.temperature !== undefined) {
      const temperature = parseFloat(rack.sensorTemperature) || parseFloat(rack.temperature) || null;

      if (temperature !== null && !isNaN(temperature)) {
      const tempCriticalLow = getThresholdValue(effectiveThresholds, 'critical_temperature_low');
      const tempCriticalHigh = getThresholdValue(effectiveThresholds, 'critical_temperature_high');
      const tempWarningLow = getThresholdValue(effectiveThresholds, 'warning_temperature_low');
      const tempWarningHigh = getThresholdValue(effectiveThresholds, 'warning_temperature_high');

      // Only evaluate if all thresholds are defined
      if (tempCriticalLow !== undefined && tempCriticalHigh !== undefined && tempWarningLow !== undefined && tempWarningHigh !== undefined) {
        if (temperature <= tempCriticalLow || temperature >= tempCriticalHigh) {
          if (temperature <= tempCriticalLow) {
            reasons.push('critical_temperature_low');
          } else {
            reasons.push('critical_temperature_high');
          }
          status = 'critical';
        } else if (temperature <= tempWarningLow || temperature >= tempWarningHigh) {
          if (temperature <= tempWarningLow) {
            reasons.push('warning_temperature_low');
          } else {
            reasons.push('warning_temperature_high');
          }
          if (status !== 'critical') status = 'warning';
        }
      }
      }
    }

    // Humidity evaluation
    // Skip evaluation if humidity is N/A or missing
    if (rack.sensorHumidity !== 'N/A' && rack.sensorHumidity !== null && rack.sensorHumidity !== undefined) {
      const humidity = parseFloat(rack.sensorHumidity) || null;

      if (humidity !== null && !isNaN(humidity)) {
      const humidCriticalLow = getThresholdValue(effectiveThresholds, 'critical_humidity_low');
      const humidCriticalHigh = getThresholdValue(effectiveThresholds, 'critical_humidity_high');
      const humidWarningLow = getThresholdValue(effectiveThresholds, 'warning_humidity_low');
      const humidWarningHigh = getThresholdValue(effectiveThresholds, 'warning_humidity_high');

      // Only evaluate if all thresholds are defined
      if (humidCriticalLow !== undefined && humidCriticalHigh !== undefined && humidWarningLow !== undefined && humidWarningHigh !== undefined) {
        if (humidity <= humidCriticalLow || humidity >= humidCriticalHigh) {
          if (humidity <= humidCriticalLow) {
            reasons.push('critical_humidity_low');
          } else {
            reasons.push('critical_humidity_high');
          }
          status = 'critical';
        } else if (humidity <= humidWarningLow || humidity >= humidWarningHigh) {
          if (humidity <= humidWarningLow) {
            reasons.push('warning_humidity_low');
          } else {
            reasons.push('warning_humidity_high');
          }
          if (status !== 'critical') status = 'warning';
        }
      }
      }
    }

    return {
      ...rack,
      status,
      reasons
    };
  });
  
  // Log evaluation summary
  const criticalCount = processedRacks.filter(r => r.status === 'critical').length;
  const warningCount = processedRacks.filter(r => r.status === 'warning').length;
  const normalCount = processedRacks.filter(r => r.status === 'normal').length;
  
  // Evaluation complete
  
  return processedRacks;
}

// Helper function to get threshold value
function getThresholdValue(thresholds, key) {
  const threshold = thresholds.find(t => t.key === key);
  return threshold ? threshold.value : undefined;
}

/**
 * Get list of rack IDs currently in maintenance mode
 * Works with new maintenance_rack_details table
 */
async function getMaintenanceRackIds() {
  try {
    const result = await executeQuery(async (pool) => {
      return await pool.request().query(`
        SELECT DISTINCT rack_id FROM maintenance_rack_details
      `);
    });
    return new Set(result.recordset.map(r => r.rack_id));
  } catch (error) {
    console.error('⚠️ Error fetching maintenance racks:', error.message);
    return new Set();
  }
}

/**
 * Helper function to ensure database connection is active
 * Now uses the global pool management
 */
async function ensureConnection() {
  return await getPool();
}

/**
 * Manages active critical alerts in the database
 * Inserts new critical alerts and removes resolved ones
 * Excludes racks that are in maintenance mode
 */
async function manageActiveCriticalAlerts(allPdus, thresholds) {
  try {
    // Get racks currently in maintenance
    const maintenanceRackIds = await getMaintenanceRackIds();

    // Get current critical PDUs with their reasons, excluding maintenance racks
    const currentCriticalPdus = allPdus.filter(pdu => {
      // Check if this PDU's rack is in maintenance using rackId
      const isInMaintenance = maintenanceRackIds.has(pdu.rackId);
      return pdu.status === 'critical' && pdu.reasons && pdu.reasons.length > 0 && !isInMaintenance;
    });

    // Process PDUs in batches to avoid connection timeout issues
    const BATCH_SIZE = 10;
    let processedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < currentCriticalPdus.length; i += BATCH_SIZE) {
      const batch = currentCriticalPdus.slice(i, i + BATCH_SIZE);

      for (const pdu of batch) {
        // Process each alert reason for this PDU
        for (const reason of pdu.reasons) {
          if (reason.startsWith('critical_')) {
            try {
              await processCriticalAlert(pdu, reason, thresholds);
              processedCount++;
            } catch (alertError) {
              errorCount++;
              console.error(`❌ Error processing critical alert for PDU ${pdu.id}:`, alertError.message);
            }
          }
        }
      }

      // Small delay between batches to avoid overwhelming the database
      if (i + BATCH_SIZE < currentCriticalPdus.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Processed ${processedCount} alerts (${errorCount} errors)`);

    // Clean up resolved alerts
    try {
      await cleanupResolvedAlerts(currentCriticalPdus);
    } catch (cleanupError) {
      console.error('❌ Error during cleanup:', cleanupError.message);
    }

  } catch (error) {
    console.error('❌ Error managing active critical alerts:', error);
  }
}

/**
 * Processes a single critical alert for a PDU
 */
async function processCriticalAlert(pdu, reason, thresholds) {
  try {
    // Extract metric type and field from reason
    const metricInfo = extractMetricInfo(reason, pdu);

    if (!metricInfo) {
      console.log(`⚠️ Could not extract metric info from reason: ${reason}`);
      return;
    }

    const { metricType, alertField, alertValue, thresholdExceeded } = metricInfo;

    await executeQuery(async (pool) => {
      // Check if this alert already exists
      const existingAlert = await pool.request()
        .input('pdu_id', sql.NVarChar, pdu.id)
        .input('metric_type', sql.NVarChar, metricType)
        .input('alert_reason', sql.NVarChar, reason)
        .query(`
          SELECT id FROM active_critical_alerts
          WHERE pdu_id = @pdu_id AND metric_type = @metric_type AND alert_reason = @alert_reason
        `);

      if (existingAlert.recordset.length > 0) {
        // Update existing alert
        await pool.request()
          .input('pdu_id', sql.NVarChar, pdu.id)
          .input('metric_type', sql.NVarChar, metricType)
          .input('alert_reason', sql.NVarChar, reason)
          .input('alert_value', sql.Decimal(18, 4), alertValue)
          .input('threshold_exceeded', sql.Decimal(18, 4), thresholdExceeded)
          .query(`
            UPDATE active_critical_alerts
            SET alert_value = @alert_value,
                threshold_exceeded = @threshold_exceeded,
                last_updated_at = GETDATE()
            WHERE pdu_id = @pdu_id AND metric_type = @metric_type AND alert_reason = @alert_reason
          `);
      } else {
        // Insert new alert
        await pool.request()
          .input('pdu_id', sql.NVarChar, pdu.id)
          .input('rack_id', sql.NVarChar, pdu.rackId || pdu.id)
          .input('name', sql.NVarChar, pdu.name)
          .input('country', sql.NVarChar, pdu.country)
          .input('site', sql.NVarChar, pdu.site)
          .input('dc', sql.NVarChar, pdu.dc)
          .input('phase', sql.NVarChar, pdu.phase)
          .input('chain', sql.NVarChar, pdu.chain)
          .input('node', sql.NVarChar, pdu.node)
          .input('serial', sql.NVarChar, pdu.serial)
          .input('metric_type', sql.NVarChar, metricType)
          .input('alert_reason', sql.NVarChar, reason)
          .input('alert_value', sql.Decimal(18, 4), alertValue)
          .input('alert_field', sql.NVarChar, alertField)
          .input('threshold_exceeded', sql.Decimal(18, 4), thresholdExceeded)
          .query(`
            INSERT INTO active_critical_alerts
            (pdu_id, rack_id, name, country, site, dc, phase, chain, node, serial,
             metric_type, alert_reason, alert_value, alert_field, threshold_exceeded)
            VALUES
            (@pdu_id, @rack_id, @name, @country, @site, @dc, @phase, @chain, @node, @serial,
             @metric_type, @alert_reason, @alert_value, @alert_field, @threshold_exceeded)
          `);
      }

      return true;
    });

  } catch (error) {
    throw new Error(`Failed to process critical alert for PDU ${pdu.id}: ${error.message}`);
  }
}

/**
 * Extracts metric information from alert reason and PDU data
 */
function extractMetricInfo(reason, pdu) {
  let metricType, alertField, alertValue;
  
  if (reason.includes('amperage') || reason.includes('current')) {
    metricType = 'amperage';
    alertField = 'current';
    alertValue = parseFloat(pdu.current) || 0;
  } else if (reason.includes('temperature')) {
    metricType = 'temperature';
    // Determine which temperature field based on the PDU data
    if (pdu.sensorTemperature != null && !isNaN(pdu.sensorTemperature)) {
      alertField = 'sensorTemperature';
      alertValue = parseFloat(pdu.sensorTemperature);
    } else if (pdu.temperature != null && !isNaN(pdu.temperature)) {
      alertField = 'temperature';
      alertValue = parseFloat(pdu.temperature);
    } else {
      return null;
    }
  } else if (reason.includes('humidity')) {
    metricType = 'humidity';
    alertField = 'sensorHumidity';
    alertValue = parseFloat(pdu.sensorHumidity) || null;
  } else {
    return null;
  }
  
  // Extract threshold exceeded (this would need to be calculated based on thresholds)
  const thresholdExceeded = getThresholdFromReason(reason);
  
  return {
    metricType,
    alertField,
    alertValue,
    thresholdExceeded
  };
}

/**
 * Gets the threshold value that was exceeded based on the reason
 * This is a simplified version - you might want to enhance this with actual threshold lookup
 */
function getThresholdFromReason(reason) {
  // This is a placeholder - ideally you'd look up the actual threshold from your thresholds data
  if (reason.includes('critical_amperage_high')) return 25.0;
  if (reason.includes('critical_amperage_low')) return 1.0;
  if (reason.includes('critical_temperature_high')) return 40.0;
  if (reason.includes('critical_temperature_low')) return 5.0;
  if (reason.includes('critical_humidity_high')) return 80.0;
  if (reason.includes('critical_humidity_low')) return 20.0;
  return null;
}

/**
 * Removes alerts from database for PDUs that are no longer critical
 */
async function cleanupResolvedAlerts(currentCriticalPdus) {
  try {
    await executeQuery(async (pool) => {
      const currentCriticalPduIds = currentCriticalPdus.map(pdu => pdu.id);

      if (currentCriticalPduIds.length === 0) {
        // If no critical PDUs, delete all alerts
        const deleteResult = await pool.request().query(`
          DELETE FROM active_critical_alerts
        `);
        return deleteResult;
      }

      // Create a string of PDU IDs for the NOT IN clause
      const pduIdsList = currentCriticalPduIds.map(id => `'${id.replace("'", "''")}'`).join(',');

      // Delete alerts for PDUs that are no longer critical
      const deleteResult = await pool.request().query(`
        DELETE FROM active_critical_alerts
        WHERE pdu_id NOT IN (${pduIdsList})
      `);

      // Also clean up alerts for PDUs that are still critical but no longer have the specific reason
      for (const criticalPdu of currentCriticalPdus) {
        const currentReasons = criticalPdu.reasons.filter(r => r.startsWith('critical_'));

        if (currentReasons.length > 0) {
          const reasonsList = currentReasons.map(reason => `'${reason.replace("'", "''")}'`).join(',');

          await pool.request()
            .input('pdu_id', sql.NVarChar, criticalPdu.id)
            .query(`
              DELETE FROM active_critical_alerts
              WHERE pdu_id = @pdu_id AND alert_reason NOT IN (${reasonsList})
            `);
        }
      }

      return deleteResult;
    });

  } catch (error) {
    console.error('❌ Error cleaning up resolved alerts:', error);
  }
}

// Endpoint para obtener datos de racks de energía
app.get('/api/racks/energy', async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);

  try {
    // Check if client wants to bypass cache (from refresh button)
    const bypassCache = req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';

    // Check cache first (unless explicitly bypassed)
    if (!bypassCache && isCacheValid(racksCache)) {
      return res.json({
        success: true,
        data: racksCache.data,
        message: 'Rack data retrieved successfully (cached)',
        count: racksCache.data ? racksCache.data.flat().length : 0,
        timestamp: new Date().toISOString()
      });
    }

    // Get thresholds first
    const thresholds = await fetchThresholdsFromDatabase();
    
    // Validate NENG API configuration
    if (!process.env.NENG_API_URL || !process.env.NENG_API_KEY) {
      throw new Error('NENG API configuration missing. Please check NENG_API_URL and NENG_API_KEY environment variables.');
    }

    // Fetch ALL power data with pagination (skip by 100)
    let allPowerData = [];
    let powerSkip = 0;
    const pageSize = 100;
    let hasMorePowerData = true;

    while (hasMorePowerData) {

      const powerResponse = await fetchFromNengApi(
        `${process.env.NENG_API_URL}?skip=${powerSkip}&limit=${pageSize}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.NENG_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!powerResponse.success || !powerResponse.data) {
        throw new Error('Invalid response from NENG Power API');
      }

      const pageData = Array.isArray(powerResponse.data) ? powerResponse.data : [];

      if (pageData.length === 0) {
        hasMorePowerData = false;
      } else {
        allPowerData = allPowerData.concat(pageData);
        powerSkip += pageSize;

        // Stop if we got less than pageSize (last page)
        if (pageData.length < pageSize) {
          hasMorePowerData = false;
        }
      }
    }

    // Power data collected

    // Fetch ALL sensor data if sensors URL is configured
    let allSensorsData = [];
    if (process.env.NENG_SENSORS_API_URL) {
      let sensorSkip = 0;
      let hasMoreSensorData = true;

      try {
        while (hasMoreSensorData) {

          const sensorsResponse = await fetchFromNengApi(
            `${process.env.NENG_SENSORS_API_URL}?skip=${sensorSkip}&limit=${pageSize}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${process.env.NENG_API_KEY}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!sensorsResponse.success || !sensorsResponse.data) {
            console.warn(`[${requestId}] ⚠️ Sensor page failed, stopping pagination`);
            hasMoreSensorData = false;
            break;
          }

          const pageData = Array.isArray(sensorsResponse.data) ? sensorsResponse.data : [];

          if (pageData.length === 0) {
            hasMoreSensorData = false;
          } else {
            allSensorsData = allSensorsData.concat(pageData);
            sensorSkip += pageSize;

            // Stop if we got less than pageSize (last page)
            if (pageData.length < pageSize) {
              hasMoreSensorData = false;
            }
          }
        }

        // Sensors data collected
      } catch (sensorError) {
        console.warn(`[${requestId}] ⚠️ Sensors API failed (continuing without sensor data):`, sensorError.message);
      }
    } else {
      console.log(`[${requestId}] ⚠️ NENG_SENSORS_API_URL not configured, skipping sensor data`);
    }

    // Map and combine power and sensor data, filtering out items without valid rackName
    const itemsWithoutRackName = [];

    const combinedData = allPowerData
      .filter(powerItem => {
        // Filter out PDUs/Racks without valid rackName
        const hasValidRackName = powerItem.rackName &&
                                  String(powerItem.rackName).trim() !== '' &&
                                  String(powerItem.rackName).trim() !== 'null' &&
                                  String(powerItem.rackName).trim() !== 'undefined';

        if (!hasValidRackName) {
          itemsWithoutRackName.push(powerItem);
        }

        return hasValidRackName;
      })
      .map(powerItem => {
        // Map power fields to expected format
        const mapped = {
          id: String(powerItem.id),
          rackId: String(powerItem.rackId),
          name: powerItem.rackName || powerItem.name,
          country: 'España',
          site: powerItem.site,
          dc: powerItem.dc,
          phase: powerItem.phase,
          chain: String(powerItem.chain || ''),
          node: String(powerItem.node || ''),
          serial: powerItem.serial,
          current: parseFloat(powerItem.totalAmps) || 0,
          temperature: parseFloat(powerItem.avgVolts) || 0,
          lastUpdated: powerItem.lastUpdate || new Date().toISOString()
        };

        // Find matching sensor data by rackId
        const matchingSensor = allSensorsData.find(sensor =>
          String(sensor.rackId) === String(powerItem.rackId)
        );

        if (matchingSensor) {
          // Check for N/A before parsing temperature
          mapped.sensorTemperature = (matchingSensor.temperature === 'N/A' || matchingSensor.temperature === null || matchingSensor.temperature === undefined)
            ? 'N/A'
            : (parseFloat(matchingSensor.temperature) || null);

          // Check for N/A before parsing humidity
          mapped.sensorHumidity = (matchingSensor.humidity === 'N/A' || matchingSensor.humidity === null || matchingSensor.humidity === undefined)
            ? 'N/A'
            : (parseFloat(matchingSensor.humidity) || null);
        }

        return mapped;
      });

    // Log detailed statistics about filtered items
    if (itemsWithoutRackName.length > 0) {
      const uniqueRacksFiltered = new Set(itemsWithoutRackName.map(item => String(item.rackId))).size;
      console.log(`\n⚠️ ============ OMITIDOS POR FALTA DE RACKNAME ============`);
      console.log(`❌ PDUs omitidos: ${itemsWithoutRackName.length}`);
      console.log(`❌ Racks únicos omitidos: ${uniqueRacksFiltered}`);
      console.log(`📋 Primeros 5 PDUs omitidos: ${itemsWithoutRackName.slice(0, 5).map(item => `${item.id} (rack: ${item.rackId})`).join(', ')}`);
      console.log(`==========================================================\n`);
    }

    console.log(`📊 Power data filtered: ${allPowerData.length} PDUs → ${combinedData.length} PDUs con rackName válido`);
    
    if (combinedData.length === 0) {
      console.log(`[${requestId}] ⚠️ No data received from NENG API`);
      return res.json({
        success: true,
        data: [],
        message: 'No rack data available from NENG API',
        count: 0,
        timestamp: new Date().toISOString()
      });
    }
    
    // Data collected and combined
    
    // Process data with thresholds evaluation
    const processedData = await processRackData(combinedData, thresholds);

    // Get maintenance rack IDs to filter them out
    const maintenanceRackIds = await getMaintenanceRackIds();

    console.log(`🔧 Maintenance rack IDs count: ${maintenanceRackIds.size}`);
    if (maintenanceRackIds.size > 0) {
      console.log(`🔧 Sample maintenance racks: ${Array.from(maintenanceRackIds).slice(0, 3).join(', ')}${maintenanceRackIds.size > 3 ? '...' : ''}`);
    }

    // Filter out PDUs whose rack is in maintenance mode
    const filteredData = processedData.filter(pdu => {
      // Check if this PDU's rack is in maintenance using rackId
      const isInMaintenance = maintenanceRackIds.has(pdu.rackId);
      return !isInMaintenance;
    });

    const pdusFilteredOut = processedData.length - filteredData.length;
    console.log(`📊 Maintenance filter: ${processedData.length} PDUs → ${filteredData.length} PDUs (${pdusFilteredOut} filtered out)`);

    // Count unique racks after filtering
    const uniqueRacksAfterFilter = new Set(filteredData.map(pdu => pdu.rackId)).size;
    console.log(`📊 Unique racks after maintenance filter: ${uniqueRacksAfterFilter}`);

    // Manage active critical alerts in database (only for non-maintenance racks)
    await manageActiveCriticalAlerts(filteredData, thresholds);

    // Agrupar por rackId para formar grupos
    const rackGroups = [];
    const rackMap = new Map();

    // Track PDUs to detect duplicates
    const pduTracker = new Map(); // pdu.id -> { rackId, dc, site, chain }

    filteredData.forEach(pdu => {
      const rackId = pdu.rackId || pdu.id;
      const pduId = pdu.id;

      // Check for duplicate PDU IDs across different racks or datacenters
      if (pduTracker.has(pduId)) {
        const existing = pduTracker.get(pduId);
        console.warn(`⚠️ DUPLICATE PDU DETECTED: PDU ${pduId} appears in multiple locations:`);
        console.warn(`   Existing: rack=${existing.rackId}, dc=${existing.dc}, site=${existing.site}, chain=${existing.chain}`);
        console.warn(`   Current:  rack=${rackId}, dc=${pdu.dc}, site=${pdu.site}, chain=${pdu.chain}`);
      } else {
        pduTracker.set(pduId, {
          rackId: rackId,
          dc: pdu.dc,
          site: pdu.site,
          chain: pdu.chain
        });
      }

      if (!rackMap.has(rackId)) {
        rackMap.set(rackId, []);
      }

      rackMap.get(rackId).push(pdu);
    });

    // Check for racks appearing in multiple datacenters
    const rackDcTracker = new Map(); // rackId -> Set of DCs
    Array.from(rackMap.values()).forEach(rackGroup => {
      const rackId = rackGroup[0].rackId || rackGroup[0].id;
      const dcs = new Set(rackGroup.map(pdu => pdu.dc));

      if (dcs.size > 1) {
        console.warn(`⚠️ RACK IN MULTIPLE DCS: Rack ${rackId} appears in multiple datacenters: ${Array.from(dcs).join(', ')}`);
      }

      rackDcTracker.set(rackId, dcs);
    });

    // Convertir el Map en arrays
    Array.from(rackMap.values()).forEach(rackGroup => {
      rackGroups.push(rackGroup);
    });

    // Grouped into rack groups
    
    // Update cache
    racksCache.data = rackGroups;
    racksCache.timestamp = Date.now();
    
    const response = {
      success: true,
      data: rackGroups,
      message: 'Rack data retrieved successfully',
      count: processedData.length,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    console.error(`[${requestId}] ❌ REQUEST FAILED:`, error);
    logger.error('Energy racks fetch failed', { 
      error: error.message, 
      stack: error.stack,
      requestId 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch energy racks data',
      error: error.message,
      requestId,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para obtener umbrales globales
app.get('/api/thresholds', async (req, res) => {
  try {
    const thresholds = await fetchThresholdsFromDatabase();
    
    res.json({
      success: true,
      data: thresholds,
      message: 'Thresholds retrieved successfully',
      count: thresholds.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching thresholds:', error);
    logger.error('Thresholds fetch failed', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch thresholds',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para actualizar umbrales globales
app.put('/api/thresholds', async (req, res) => {
  try {
    
    const { thresholds } = req.body;
    
    if (!thresholds || typeof thresholds !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid thresholds data',
        timestamp: new Date().toISOString()
      });
    }
    
    // Define valid threshold keys
    const validKeys = [
      'critical_temperature_low', 'critical_temperature_high', 
      'warning_temperature_low', 'warning_temperature_high',
      'critical_humidity_low', 'critical_humidity_high',
      'warning_humidity_low', 'warning_humidity_high',
      'critical_amperage_low_single_phase', 'critical_amperage_high_single_phase',
      'warning_amperage_low_single_phase', 'warning_amperage_high_single_phase',
      'critical_amperage_low_3_phase', 'critical_amperage_high_3_phase',
      'warning_amperage_low_3_phase', 'warning_amperage_high_3_phase',
      'critical_voltage_low', 'critical_voltage_high',
      'warning_voltage_low', 'warning_voltage_high',
      'critical_power_high', 'warning_power_high'
    ];
    
    // Filter out invalid keys
    const filteredThresholds = {};
    Object.entries(thresholds).forEach(([key, value]) => {
      if (validKeys.includes(key)) {
        filteredThresholds[key] = value;
      } else {
        console.log(`⚠️ Ignoring invalid threshold key: ${key}`);
      }
    });
    
    if (Object.keys(filteredThresholds).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid threshold keys provided',
        timestamp: new Date().toISOString()
      });
    }
    
    const updatedCount = await saveThresholdsToDatabase(filteredThresholds);
    
    res.json({
      success: true,
      message: 'Thresholds updated successfully',
      count: updatedCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error updating thresholds:', error);
    logger.error('Thresholds update failed', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'Failed to update thresholds',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para obtener umbrales específicos de un rack
app.get('/api/racks/:rackId/thresholds', async (req, res) => {
  try {
    const { rackId } = req.params;

    const results = await executeQuery(async (pool) => {
      // Get global thresholds
      const globalResult = await pool.request().query(`
        SELECT threshold_key as [key], value, unit, description, created_at as createdAt, updated_at as updatedAt
        FROM dbo.threshold_configs
        ORDER BY threshold_key
      `);

      // Get rack-specific thresholds
      const rackResult = await pool.request()
        .input('rackId', sql.NVarChar, rackId)
        .query(`
          SELECT threshold_key as [key], value, unit, description, created_at as createdAt, updated_at as updatedAt
          FROM dbo.rack_threshold_overrides
          WHERE rack_id = @rackId
          ORDER BY threshold_key
        `);

      return {
        global: globalResult.recordset || [],
        rackSpecific: rackResult.recordset || []
      };
    });

    res.json({
      success: true,
      data: results,
      message: `Thresholds retrieved successfully for rack ${rackId}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Error fetching thresholds for rack ${req.params.rackId}:`, error);
    logger.error('Rack thresholds fetch failed', { error: error.message, rackId: req.params.rackId });
    
    res.status(500).json({
      success: false,
      message: `Failed to fetch thresholds for rack ${req.params.rackId}`,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para actualizar umbrales específicos de un rack
app.put('/api/racks/:rackId/thresholds', async (req, res) => {
  try {
    const { rackId } = req.params;
    const { thresholds } = req.body;

    if (!thresholds || typeof thresholds !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid thresholds data',
        timestamp: new Date().toISOString()
      });
    }

    // Define valid threshold keys
    const validKeys = [
      'critical_temperature_low', 'critical_temperature_high',
      'warning_temperature_low', 'warning_temperature_high',
      'critical_humidity_low', 'critical_humidity_high',
      'warning_humidity_low', 'warning_humidity_high',
      'critical_amperage_low_single_phase', 'critical_amperage_high_single_phase',
      'warning_amperage_low_single_phase', 'warning_amperage_high_single_phase',
      'critical_amperage_low_3_phase', 'critical_amperage_high_3_phase',
      'warning_amperage_low_3_phase', 'warning_amperage_high_3_phase'
    ];

    // Filter out invalid keys
    const filteredThresholds = {};
    Object.entries(thresholds).forEach(([key, value]) => {
      if (validKeys.includes(key)) {
        filteredThresholds[key] = value;
      } else {
        console.log(`⚠️ Ignoring invalid threshold key: ${key}`);
      }
    });

    if (Object.keys(filteredThresholds).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid threshold keys provided',
        timestamp: new Date().toISOString()
      });
    }

    const updatedCount = await executeQuery(async (pool) => {
      let count = 0;

      for (const [key, value] of Object.entries(filteredThresholds)) {
        // Get the unit from global threshold_configs
        const unitResult = await pool.request()
          .input('key', sql.NVarChar, key)
          .query(`SELECT unit FROM dbo.threshold_configs WHERE threshold_key = @key`);

        const unit = unitResult.recordset.length > 0 ? unitResult.recordset[0].unit : null;

        await pool.request()
          .input('rackId', sql.NVarChar, rackId)
          .input('key', sql.NVarChar, key)
          .input('value', sql.Decimal(18, 4), value)
          .input('unit', sql.NVarChar, unit)
          .query(`
            MERGE dbo.rack_threshold_overrides AS target
            USING (SELECT @rackId as rack_id, @key as threshold_key, @value as value, @unit as unit) AS source
            ON target.rack_id = source.rack_id AND target.threshold_key = source.threshold_key
            WHEN MATCHED THEN
              UPDATE SET value = source.value, unit = source.unit, updated_at = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (rack_id, threshold_key, value, unit) VALUES (source.rack_id, source.threshold_key, source.value, source.unit);
          `);

        count++;
      }

      return count;
    });
    
    res.json({
      success: true,
      message: `Rack-specific thresholds updated successfully for ${rackId}`,
      count: updatedCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Error updating rack thresholds for ${req.params.rackId}:`, error);
    logger.error('Rack thresholds update failed', { error: error.message, rackId: req.params.rackId });
    
    res.status(500).json({
      success: false,
      message: `Failed to update thresholds for rack ${req.params.rackId}`,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para resetear umbrales específicos de un rack (usar valores globales)
app.delete('/api/racks/:rackId/thresholds', async (req, res) => {
  try {
    const { rackId } = req.params;

    const result = await executeQuery(async (pool) => {
      return await pool.request()
        .input('rackId', sql.NVarChar, rackId)
        .query(`
          DELETE FROM dbo.rack_threshold_overrides WHERE rack_id = @rackId
        `);
    });

    const deletedCount = result.rowsAffected[0];
    
    res.json({
      success: true,
      message: `Rack-specific thresholds reset to global values for ${rackId}`,
      count: deletedCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Error resetting rack thresholds for ${req.params.rackId}:`, error);
    logger.error('Rack thresholds reset failed', { error: error.message, rackId: req.params.rackId });
    
    res.status(500).json({
      success: false,
      message: `Failed to reset thresholds for rack ${req.params.rackId}`,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================
// MAINTENANCE MODE ENDPOINTS
// ============================================

// Get all maintenance entries with their racks
app.get('/api/maintenance', async (req, res) => {
  try {
    const results = await executeQuery(async (pool) => {
      // Get all maintenance entries
      const entriesResult = await pool.request().query(`
        SELECT
          id,
          entry_type,
          rack_id,
          chain,
          site,
          dc,
          reason,
          started_at,
          started_by,
          created_at
        FROM maintenance_entries
        ORDER BY started_at DESC
      `);

      // Get all rack details
      const detailsResult = await pool.request().query(`
        SELECT
          maintenance_entry_id,
          rack_id,
          pdu_id,
          name,
          country,
          site,
          dc,
          phase,
          chain,
          node,
          serial
        FROM maintenance_rack_details
      `);

      return {
        entries: entriesResult.recordset || [],
        details: detailsResult.recordset || []
      };
    });

    const { entries, details } = results;

    // Map details to their entries
    const maintenanceData = entries.map(entry => ({
      ...entry,
      racks: details.filter(d => d.maintenance_entry_id === entry.id)
    }));

    res.json({
      success: true,
      data: maintenanceData,
      message: 'Maintenance entries retrieved successfully',
      count: entries.length,
      totalRacks: details.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching maintenance entries:', error);
    logger.error('Maintenance entries fetch failed', { error: error.message });

    res.status(500).json({
      success: false,
      message: 'Failed to fetch maintenance entries',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add single rack to maintenance
app.post('/api/maintenance/rack', async (req, res) => {
  try {
    const {
      rackId,
      rackData,
      reason = 'Mantenimiento programado',
      startedBy = 'Sistema'
    } = req.body;

    if (!rackId) {
      return res.status(400).json({
        success: false,
        message: 'rackId is required',
        timestamp: new Date().toISOString()
      });
    }

    // Validate rackId is a non-empty string
    const sanitizedRackId = String(rackId || '').trim();
    if (!sanitizedRackId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rackId: must be a non-empty string',
        timestamp: new Date().toISOString()
      });
    }

    const result = await executeQuery(async (pool) => {
      // Check if rack is already in maintenance
      const existingCheck = await pool.request()
        .input('rack_id', sql.NVarChar, sanitizedRackId)
        .query(`
          SELECT COUNT(*) as count
          FROM maintenance_rack_details
          WHERE rack_id = @rack_id
        `);

      if (existingCheck.recordset[0].count > 0) {
        return { error: 'already_exists' };
      }

      // Use rack data from request body if provided, otherwise try to find it
      let rack = rackData;
      let chain = rackData?.chain;

      // If rack data not provided, try to find it in alerts table
      if (!rack) {
        const rackDbData = await pool.request()
          .input('rack_id', sql.NVarChar, sanitizedRackId)
          .query(`
            SELECT TOP 1
              pdu_id,
              rack_id,
              name,
              country,
              site,
              dc,
              phase,
              chain,
              node,
              serial
            FROM active_critical_alerts
            WHERE rack_id = @rack_id OR pdu_id = @rack_id
          `);

        if (rackDbData.recordset.length === 0) {
          return { error: 'not_found' };
        }

        rack = rackDbData.recordset[0];
        chain = rack.chain;
      }

      const dc = rack.dc || 'Unknown';
      const site = rack.site || 'Unknown';

      // Create maintenance entry
      const entryId = require('crypto').randomUUID();

      await pool.request()
        .input('entry_id', sql.UniqueIdentifier, entryId)
        .input('entry_type', sql.NVarChar, 'individual_rack')
        .input('rack_id', sql.NVarChar, sanitizedRackId)
        .input('chain', sql.NVarChar, String(chain || 'Unknown'))
        .input('site', sql.NVarChar, site)
        .input('dc', sql.NVarChar, dc)
        .input('reason', sql.NVarChar, reason)
        .input('started_by', sql.NVarChar, startedBy)
        .query(`
          INSERT INTO maintenance_entries
          (id, entry_type, rack_id, chain, site, dc, reason, started_by)
          VALUES
          (@entry_id, @entry_type, @rack_id, @chain, @site, @dc, @reason, @started_by)
        `);

      // Insert rack details
      await pool.request()
        .input('entry_id', sql.UniqueIdentifier, entryId)
        .input('rack_id', sql.NVarChar, sanitizedRackId)
        .input('pdu_id', sql.NVarChar, String(rack.pdu_id || rack.id || sanitizedRackId))
        .input('name', sql.NVarChar, String(rack.name || sanitizedRackId))
        .input('country', sql.NVarChar, String(rack.country || 'Unknown'))
        .input('site', sql.NVarChar, site)
        .input('dc', sql.NVarChar, dc)
        .input('phase', sql.NVarChar, String(rack.phase || 'Unknown'))
        .input('chain', sql.NVarChar, String(chain || 'Unknown'))
        .input('node', sql.NVarChar, String(rack.node || 'Unknown'))
        .input('serial', sql.NVarChar, String(rack.serial || 'Unknown'))
        .query(`
          INSERT INTO maintenance_rack_details
          (maintenance_entry_id, rack_id, pdu_id, name, country, site, dc, phase, chain, node, serial)
          VALUES
          (@entry_id, @rack_id, @pdu_id, @name, @country, @site, @dc, @phase, @chain, @node, @serial)
        `);

      return { success: true, entryId, chain, dc };
    });

    if (result.error === 'already_exists') {
      return res.status(409).json({
        success: false,
        message: `Rack ${sanitizedRackId} is already in maintenance`,
        timestamp: new Date().toISOString()
      });
    }

    if (result.error === 'not_found') {
      return res.status(404).json({
        success: false,
        message: 'Rack not found. Please provide rack data in request body.',
        timestamp: new Date().toISOString()
      });
    }

    logger.info(`Rack ${sanitizedRackId} added to maintenance individually`);

    res.json({
      success: true,
      message: `Rack ${sanitizedRackId} added to maintenance`,
      data: { rackId: sanitizedRackId, chain: result.chain, dc: result.dc, entryId: result.entryId },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error adding rack to maintenance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add rack to maintenance',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add all racks from a chain to maintenance
app.post('/api/maintenance/chain', async (req, res) => {
  try {
    const {
      chain,
      site,
      dc,
      reason = 'Mantenimiento programado de chain',
      startedBy = 'Sistema'
    } = req.body;

    if (!chain || !dc) {
      return res.status(400).json({
        success: false,
        message: 'chain and dc are required',
        timestamp: new Date().toISOString()
      });
    }

    // Validate and sanitize inputs
    const sanitizedChain = String(chain || '').trim();
    const sanitizedDc = String(dc || '').trim();

    if (!sanitizedChain || !sanitizedDc) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chain or dc values',
        timestamp: new Date().toISOString()
      });
    }

    // Fetch ALL power data from NENG API to get all racks in this chain and dc
    let allPowerData = [];
    let powerSkip = 0;
    const pageSize = 100;
    let hasMorePowerData = true;

    while (hasMorePowerData) {
      const powerResponse = await fetchFromNengApi(
        `${process.env.NENG_API_URL}?skip=${powerSkip}&limit=${pageSize}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.NENG_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!powerResponse.success || !powerResponse.data) {
        throw new Error('Invalid response from NENG Power API');
      }

      const pageData = Array.isArray(powerResponse.data) ? powerResponse.data : [];

      if (pageData.length === 0) {
        hasMorePowerData = false;
      } else {
        allPowerData = allPowerData.concat(pageData);
        powerSkip += pageSize;

        if (pageData.length < pageSize) {
          hasMorePowerData = false;
        }
      }
    }

    // Filter racks that belong to this chain in the specified datacenter and site
    console.log(`\n========== ENVIANDO CHAIN A MANTENIMIENTO ==========`);
    console.log(`📋 Chain: "${sanitizedChain}" | DC: "${sanitizedDc}" | Site: "${site || 'Any'}"`);

    // First, filter by chain, dc, and site
    let chainRacks = allPowerData.filter(rack => {
      const rackChain = String(rack.chain).trim();
      const rackDc = String(rack.dc).trim();
      const rackSite = String(rack.site || '').trim();

      const chainMatch = rackChain === sanitizedChain;
      const dcMatch = rackDc === sanitizedDc;

      // If site is specified, match it; otherwise match any site
      const siteMatch = !site || site === 'Unknown' || rackSite === site;

      const matches = chainMatch && dcMatch && siteMatch;

      return matches;
    });

    console.log(`📊 PDUs filtrados por chain/dc/site: ${chainRacks.length}`);

    // Then, filter out items without valid rackName
    const beforeRackNameFilter = chainRacks.length;
    const maintenanceItemsWithoutRackName = [];

    chainRacks = chainRacks.filter(rack => {
      const hasValidRackName = rack.rackName &&
                                String(rack.rackName).trim() !== '' &&
                                String(rack.rackName).trim() !== 'null' &&
                                String(rack.rackName).trim() !== 'undefined';

      if (!hasValidRackName) {
        maintenanceItemsWithoutRackName.push(rack);
      }

      return hasValidRackName;
    });

    // Log detailed statistics about filtered items in maintenance
    if (maintenanceItemsWithoutRackName.length > 0) {
      const uniqueRacksFiltered = new Set(maintenanceItemsWithoutRackName.map(item => String(item.rackId))).size;
      console.log(`\n⚠️ ============ OMITIDOS DE MANTENIMIENTO POR FALTA DE RACKNAME ============`);
      console.log(`❌ PDUs omitidos: ${maintenanceItemsWithoutRackName.length}`);
      console.log(`❌ Racks únicos omitidos: ${uniqueRacksFiltered}`);
      console.log(`📋 Primeros 5 PDUs omitidos: ${maintenanceItemsWithoutRackName.slice(0, 5).map(item => `${item.id} (rack: ${item.rackId})`).join(', ')}`);
      console.log(`=============================================================================\n`);
    }

    console.log(`📊 PDUs después de filtrar rackName: ${chainRacks.length} (${beforeRackNameFilter - chainRacks.length} PDUs omitidos)`);

    // Show sample of what was found
    if (chainRacks.length > 0) {
      console.log(`📝 Ejemplo del primer PDU:`);
      console.log(`   - id: ${chainRacks[0].id}`);
      console.log(`   - rackId: ${chainRacks[0].rackId}`);
      console.log(`   - chain: ${chainRacks[0].chain}`);
      console.log(`   - dc: ${chainRacks[0].dc}`);
      console.log(`   - site: ${chainRacks[0].site}`);
    }

    if (chainRacks.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No racks found for chain ${sanitizedChain} in DC ${sanitizedDc}`,
        timestamp: new Date().toISOString()
      });
    }

    // Group by rackId to avoid inserting multiple records for the same physical rack
    const rackMap = new Map();
    console.log(`\n🔄 Agrupando PDUs por rackId físico...`);

    // Track PDU count per rack for debugging
    const pduCountPerRack = new Map();

    chainRacks.forEach((rack, index) => {
      // Sanitize and validate rack ID
      let rackId = null;

      if (rack.rackId && String(rack.rackId).trim()) {
        rackId = String(rack.rackId).trim();
      } else if (rack.id && String(rack.id).trim()) {
        rackId = String(rack.id).trim();
      }

      // Debug first few entries
      if (index < 5) {
        console.log(`   PDU #${index + 1}: id="${rack.id}" | rackId="${rackId}" | chain="${rack.chain}" | dc="${rack.dc}" | site="${rack.site}"`);
      }

      // Track PDU count per rack
      if (rackId) {
        pduCountPerRack.set(rackId, (pduCountPerRack.get(rackId) || 0) + 1);
      }

      // Only add racks with valid IDs (first occurrence wins)
      if (rackId && !rackMap.has(rackId)) {
        rackMap.set(rackId, { ...rack, sanitizedRackId: rackId });
      }
    });

    const uniqueRacks = Array.from(rackMap.values());

    console.log(`\n✅ Resultado del agrupamiento:`);
    console.log(`   ${chainRacks.length} PDUs → ${uniqueRacks.length} racks físicos únicos`);
    console.log(`   Racks únicos: [${Array.from(rackMap.keys()).slice(0, 5).join(', ')}${rackMap.size > 5 ? '...' : ''}]`);

    // Show racks with multiple PDUs
    const racksWithMultiplePDUs = Array.from(pduCountPerRack.entries()).filter(([rackId, count]) => count > 1);
    if (racksWithMultiplePDUs.length > 0) {
      console.log(`\n📊 Racks con múltiples PDUs (primeros 5):`);
      racksWithMultiplePDUs.slice(0, 5).forEach(([rackId, count]) => {
        console.log(`   - Rack ${rackId}: ${count} PDUs`);
      });
    }

    if (uniqueRacks.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No valid racks found for chain ${sanitizedChain} in DC ${sanitizedDc}`,
        timestamp: new Date().toISOString()
      });
    }

    const result = await executeQuery(async (pool) => {
      // Create a single maintenance entry for the entire chain
      const entryId = require('crypto').randomUUID();

      await pool.request()
        .input('entry_id', sql.UniqueIdentifier, entryId)
        .input('entry_type', sql.NVarChar, 'chain')
        .input('chain', sql.NVarChar, sanitizedChain)
        .input('site', sql.NVarChar, site || 'Unknown')
        .input('dc', sql.NVarChar, sanitizedDc)
        .input('reason', sql.NVarChar, reason)
        .input('started_by', sql.NVarChar, startedBy)
        .query(`
          INSERT INTO maintenance_entries
          (id, entry_type, rack_id, chain, site, dc, reason, started_by)
          VALUES
          (@entry_id, @entry_type, NULL, @chain, @site, @dc, @reason, @started_by)
        `);

      // Insert all racks as details of this maintenance entry
      let insertedCount = 0;
      let failedCount = 0;

      console.log(`\n💾 Insertando racks en la base de datos...`);

      for (const rack of uniqueRacks) {
        try {
          const rackId = rack.sanitizedRackId;
          const pduId = String(rack.id || rackId);

          // Check if this rack is already in maintenance
          const existingCheck = await pool.request()
            .input('rack_id', sql.NVarChar, rackId)
            .query(`
              SELECT COUNT(*) as count
              FROM maintenance_rack_details
              WHERE rack_id = @rack_id
            `);

          if (existingCheck.recordset[0].count > 0) {
            failedCount++;
            continue;
          }

          await pool.request()
            .input('entry_id', sql.UniqueIdentifier, entryId)
            .input('rack_id', sql.NVarChar, rackId)
            .input('pdu_id', sql.NVarChar, pduId)
            .input('name', sql.NVarChar, String(rack.rackName || rack.name || 'Unknown'))
            .input('country', sql.NVarChar, 'España')
            .input('site', sql.NVarChar, site || String(rack.site || 'Unknown'))
            .input('dc', sql.NVarChar, sanitizedDc)
            .input('phase', sql.NVarChar, String(rack.phase || 'Unknown'))
            .input('chain', sql.NVarChar, sanitizedChain)
            .input('node', sql.NVarChar, String(rack.node || 'Unknown'))
            .input('serial', sql.NVarChar, String(rack.serial || 'Unknown'))
            .query(`
              INSERT INTO maintenance_rack_details
              (maintenance_entry_id, rack_id, pdu_id, name, country, site, dc, phase, chain, node, serial)
              VALUES
              (@entry_id, @rack_id, @pdu_id, @name, @country, @site, @dc, @phase, @chain, @node, @serial)
            `);

          insertedCount++;
        } catch (insertError) {
          failedCount++;
          logger.error(`Failed to insert rack ${rack.sanitizedRackId} to maintenance:`, insertError);
        }
      }

      return { entryId, insertedCount, failedCount };
    });

    console.log(`\n✅ RESULTADO FINAL:`);
    console.log(`   Insertados: ${result.insertedCount}`);
    console.log(`   Ya en mantenimiento (omitidos): ${result.failedCount}`);
    console.log(`   Total procesados: ${uniqueRacks.length}`);
    console.log(`====================================================\n`);

    const successMessage = `Chain ${sanitizedChain} from DC ${sanitizedDc} added to maintenance`;
    logger.info(`${successMessage} (${result.insertedCount}/${uniqueRacks.length} racks)`);

    res.json({
      success: true,
      message: `${successMessage}: ${result.insertedCount} racks added successfully${result.failedCount > 0 ? `, ${result.failedCount} skipped (already in maintenance)` : ''}`,
      data: {
        entryId: result.entryId,
        chain: sanitizedChain,
        dc: sanitizedDc,
        racksAdded: result.insertedCount,
        racksFailed: result.failedCount,
        totalRacks: uniqueRacks.length,
        totalPdusFiltered: chainRacks.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error adding chain to maintenance:', error);
    logger.error('Add chain to maintenance failed', { error: error.message, body: req.body });

    res.status(500).json({
      success: false,
      message: 'Failed to add chain to maintenance',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Remove a single rack from maintenance
app.delete('/api/maintenance/rack/:rackId', async (req, res) => {
  try {
    const { rackId } = req.params;

    if (!rackId) {
      return res.status(400).json({
        success: false,
        message: 'rackId parameter is required',
        timestamp: new Date().toISOString()
      });
    }

    const sanitizedRackId = String(rackId).trim();

    const result = await executeQuery(async (pool) => {
      // Get the maintenance entry ID for this rack
      const entryResult = await pool.request()
        .input('rack_id', sql.NVarChar, sanitizedRackId)
        .query(`
          SELECT maintenance_entry_id, entry_type
          FROM maintenance_rack_details mrd
          JOIN maintenance_entries me ON mrd.maintenance_entry_id = me.id
          WHERE mrd.rack_id = @rack_id
        `);

      if (entryResult.recordset.length === 0) {
        return { error: 'not_found' };
      }

      const entryId = entryResult.recordset[0].maintenance_entry_id;
      const entryType = entryResult.recordset[0].entry_type;

      // Delete the rack detail
      await pool.request()
        .input('rack_id', sql.NVarChar, sanitizedRackId)
        .query(`
          DELETE FROM maintenance_rack_details
          WHERE rack_id = @rack_id
        `);

      // If this was an individual rack entry, delete the entry too
      // If it was a chain entry, check if there are any racks left
      if (entryType === 'individual_rack') {
        await pool.request()
          .input('entry_id', sql.UniqueIdentifier, entryId)
          .query(`
            DELETE FROM maintenance_entries
            WHERE id = @entry_id
          `);
      } else {
        // Check if the chain entry has any remaining racks
        const remainingRacks = await pool.request()
          .input('entry_id', sql.UniqueIdentifier, entryId)
          .query(`
            SELECT COUNT(*) as count
            FROM maintenance_rack_details
            WHERE maintenance_entry_id = @entry_id
          `);

        // If no racks remain, delete the entry
        if (remainingRacks.recordset[0].count === 0) {
          await pool.request()
            .input('entry_id', sql.UniqueIdentifier, entryId)
            .query(`
              DELETE FROM maintenance_entries
              WHERE id = @entry_id
            `);
        }
      }

      return { success: true };
    });

    if (result.error === 'not_found') {
      return res.status(404).json({
        success: false,
        message: `Rack ${sanitizedRackId} is not in maintenance`,
        timestamp: new Date().toISOString()
      });
    }

    logger.info(`Rack ${sanitizedRackId} removed from maintenance`);

    res.json({
      success: true,
      message: `Rack ${sanitizedRackId} removed from maintenance`,
      data: { rackId: sanitizedRackId },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error removing rack from maintenance:', error);
    logger.error('Remove rack from maintenance failed', { error: error.message, rackId: req.params.rackId });

    res.status(500).json({
      success: false,
      message: 'Failed to remove rack from maintenance',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Remove an entire maintenance entry (individual rack or full chain) by entry ID
app.delete('/api/maintenance/entry/:entryId', async (req, res) => {
  try {
    const { entryId } = req.params;

    if (!entryId) {
      return res.status(400).json({
        success: false,
        message: 'entryId parameter is required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await executeQuery(async (pool) => {
      // Get entry info before deleting
      const entryInfo = await pool.request()
        .input('entry_id', sql.UniqueIdentifier, entryId)
        .query(`
          SELECT entry_type, rack_id, chain, dc,
                 (SELECT COUNT(*) FROM maintenance_rack_details WHERE maintenance_entry_id = @entry_id) as rack_count
          FROM maintenance_entries
          WHERE id = @entry_id
        `);

      if (entryInfo.recordset.length === 0) {
        return { error: 'not_found' };
      }

      const entry = entryInfo.recordset[0];

      // Delete the maintenance entry (CASCADE will delete all related rack details)
      await pool.request()
        .input('entry_id', sql.UniqueIdentifier, entryId)
        .query(`
          DELETE FROM maintenance_entries
          WHERE id = @entry_id
        `);

      return { success: true, entry };
    });

    if (result.error === 'not_found') {
      return res.status(404).json({
        success: false,
        message: 'Maintenance entry not found',
        timestamp: new Date().toISOString()
      });
    }

    const entry = result.entry;

    const message = entry.entry_type === 'chain'
      ? `Chain ${entry.chain} from DC ${entry.dc} removed from maintenance (${entry.rack_count} racks)`
      : `Rack ${entry.rack_id} removed from maintenance`;

    logger.info(message);

    res.json({
      success: true,
      message,
      data: {
        entryId,
        entryType: entry.entry_type,
        chain: entry.chain,
        dc: entry.dc,
        racksRemoved: entry.rack_count
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error removing maintenance entry:', error);
    logger.error('Remove maintenance entry failed', { error: error.message, entryId: req.params.entryId });

    res.status(500).json({
      success: false,
      message: 'Failed to remove maintenance entry',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Energy Monitoring API is running',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Endpoint para exportar alertas a Excel
app.post('/api/export/alerts', async (req, res) => {
  try {

    const result = await executeQuery(async (pool) => {
      // Query active critical alerts from database
      return await pool.request().query(`
        SELECT
          pdu_id,
          rack_id,
          name,
          country,
          site,
          dc,
          phase,
          chain,
          node,
          serial,
          alert_type,
          metric_type,
          alert_reason,
          alert_value,
          alert_field,
          threshold_exceeded,
          alert_started_at,
          last_updated_at
        FROM active_critical_alerts
        ORDER BY alert_started_at DESC
      `);
    });

    const alerts = result.recordset || [];

    if (alerts.length === 0) {
      return res.json({
        success: true,
        message: 'No alerts found to export',
        count: 0,
        timestamp: new Date().toISOString()
      });
    }
    
    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Alertas Activas');

    // Define columns
    worksheet.columns = [
      { header: 'ID PDU', key: 'pdu_id', width: 20 },
      { header: 'ID Rack', key: 'rack_id', width: 20 },
      { header: 'Nombre PDU', key: 'name', width: 30 },
      { header: 'País', key: 'country', width: 15 },
      { header: 'Sitio', key: 'site', width: 20 },
      { header: 'Data Center', key: 'dc', width: 15 },
      { header: 'Fase', key: 'phase', width: 15 },
      { header: 'Chain', key: 'chain', width: 12 },
      { header: 'Node', key: 'node', width: 12 },
      { header: 'N° Serie', key: 'serial', width: 20 },
      { header: 'Tipo de Alerta', key: 'alert_type', width: 15 },
      { header: 'Métrica', key: 'metric_type', width: 15 },
      { header: 'Razón', key: 'alert_reason', width: 35 },
      { header: 'Valor Actual', key: 'alert_value', width: 15 },
      { header: 'Campo', key: 'alert_field', width: 25 },
      { header: 'Umbral Excedido', key: 'threshold_exceeded', width: 15 },
      { header: 'Detectada', key: 'alert_started_at', width: 20 },
      { header: 'Última Actualización', key: 'last_updated_at', width: 20 }
    ];

    // Style the header row
    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      cell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Add data rows
    alerts.forEach(alert => {
      const row = worksheet.addRow({
        pdu_id: alert.pdu_id,
        rack_id: alert.rack_id,
        name: alert.name,
        country: alert.country || 'N/A',
        site: alert.site || 'N/A',
        dc: alert.dc || 'N/A',
        phase: alert.phase || 'N/A',
        chain: alert.chain || 'N/A',
        node: alert.node || 'N/A',
        serial: alert.serial || 'N/A',
        alert_type: alert.alert_type === 'critical' ? 'CRÍTICO' : 'ADVERTENCIA',
        metric_type: alert.metric_type,
        alert_reason: alert.alert_reason,
        alert_value: alert.alert_value,
        alert_field: alert.alert_field,
        threshold_exceeded: alert.threshold_exceeded,
        alert_started_at: new Date(alert.alert_started_at).toLocaleString('es-ES'),
        last_updated_at: new Date(alert.last_updated_at).toLocaleString('es-ES')
      });

      // Color-code alert type column
      const alertTypeCell = row.getCell('alert_type');
      if (alert.alert_type === 'critical') {
        alertTypeCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF0000' }
        };
        alertTypeCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else if (alert.alert_type === 'warning') {
        alertTypeCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFF00' }
        };
        alertTypeCell.font = { color: { argb: 'FF000000' }, bold: true };
      }
    });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `alertas_activas_${timestamp}.xlsx`;
    const filepath = path.join(__dirname, filename);

    // Write the Excel file to project root
    await workbook.xlsx.writeFile(filepath);

    // Excel export completed

    res.json({
      success: true,
      message: 'Alerts exported successfully to Excel',
      filename: filename,
      filepath: filepath,
      count: alerts.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error exporting alerts to Excel:', error);
    logger.error('Excel export failed', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'Failed to export alerts to Excel',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Unhandled error
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    url: req.url,
    method: req.method 
  });
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Start server
const server = app.listen(port, () => {
  console.log(`🚀 Energy Monitoring API server running on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  logger.info(`Server started on port ${port}`);
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`⏹️ ${signal} received, shutting down gracefully...`);

  // Close server first
  server.close(async () => {
    console.log('🔌 HTTP server closed');

    // Close database connection pool
    if (globalPool && globalPool.connected) {
      try {
        await globalPool.close();
        console.log('🔌 Database connection pool closed');
      } catch (error) {
        console.error('❌ Error closing database pool:', error.message);
      }
    }

    console.log('✅ Process terminated');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});