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
const multer = require('multer');
const crypto = require('crypto');
const session = require('express-session');

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
    logger.info('Establishing database connection');
    globalPool = await sql.connect(sqlConfig);

    // Set up connection event handlers
    globalPool.on('error', (err) => {
      // Database pool error logged by winston
      logger.error('Database pool error', { error: err.message });
      globalPool = null;
    });

    logger.info('Database connection established');
    reconnectAttempts = 0;
    isConnecting = false;
    return globalPool;
  } catch (error) {
    isConnecting = false;
    reconnectAttempts++;
    // Database connection failed logged by winston
    logger.error('Database connection failed', { error: error.message, attempt: reconnectAttempts });

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      logger.info(`Retrying connection in ${reconnectAttempts * 2}s`);
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
          logger.info('Retrying query after connection reset');
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
    logger.info('Database initialization complete');
  } catch (error) {
    // Database initialization failed logged by winston
    logger.error('Database initialization failed', { error: error.message });
  }
}

initializeDatabaseConnection();

// Middleware Configuration
app.use(helmet({
  contentSecurityPolicy: false,
}));

// CORS configuration - Allow requests from frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || true, // Allow all origins in production when serving from same server
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from 'dist' folder in production
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  logger.info('Serving static files from dist folder');
  app.use(express.static(distPath));
}

// Morgan logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Session configuration for authentication
app.use(session({
  secret: process.env.SESSION_SECRET || 'energy-monitor-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to false to work with HTTP in production
    httpOnly: true,
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year (maximum practical duration)
    sameSite: 'lax' // Allow cookies to be sent with same-site requests
  }
}));

// Authentication middleware to check if user is logged in
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'No autorizado. Por favor inicie sesión.' });
}

// Authorization middleware to check user role
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ success: false, message: 'No autorizado. Por favor inicie sesión.' });
    }

    if (!allowedRoles.includes(req.session.userRole)) {
      return res.status(403).json({ success: false, message: 'No tiene permisos para realizar esta acción.' });
    }

    return next();
  };
}

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

    // Check for voltage thresholds
    const voltageThresholds = thresholds.filter(t => t.key && t.key.includes('voltage'));
    if (voltageThresholds.length > 0) {
      logger.info('Voltage thresholds loaded from database', { count: voltageThresholds.length });
    } else {
      logger.error('No voltage thresholds found in database');
    }

    // Update cache
    thresholdsCache.data = thresholds;
    thresholdsCache.timestamp = Date.now();

    return thresholds;

  } catch (error) {
    console.error('❌ Error al cargar umbrales de BD:', error.message);
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

  // Get maintenance rack IDs and chain IDs
  const maintenanceRackIds = await getMaintenanceRackIds();
  const maintenanceChainIds = await getMaintenanceChainIds();

  let voltageDebugCount = 0;
  const processedRacks = racks.map(rack => {
    // Merge global thresholds with rack-specific overrides
    const rackId = rack.rackId || rack.id;
    const chainId = rack.chain;
    const rackOverrides = rackThresholdsMap.get(rackId) || {};

    // Check if this rack or its chain is in maintenance
    const isInMaintenance = maintenanceRackIds.has(rackId) || (chainId && maintenanceChainIds.has(chainId));

    // If in maintenance, set status to 'normal' and skip all alert evaluation
    if (isInMaintenance) {
      return {
        ...rack,
        status: 'normal',
        reasons: []
      };
    }

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
    
    // Amperage evaluation - ONLY evaluate MAXIMUM thresholds (not minimum)
    // Only evaluate if high thresholds are defined
    if (criticalHigh !== undefined && warningHigh !== undefined) {
      if (current >= criticalHigh) {
        reasons.push(`critical_amperage_high_${isSinglePhase ? 'single_phase' : '3_phase'}`);
        status = 'critical';
      } else if (current >= warningHigh) {
        reasons.push(`warning_amperage_high_${isSinglePhase ? 'single_phase' : '3_phase'}`);
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

    // Voltage evaluation
    // Skip evaluation if voltage is N/A or missing
    // IMPORTANT: 0V is a valid critical condition (no power) and MUST be evaluated
    if (rack.voltage !== 'N/A' && rack.voltage !== null && rack.voltage !== undefined) {
      const voltage = parseFloat(rack.voltage);

      if (!isNaN(voltage) && voltage >= 0) {
      const voltageCriticalLow = getThresholdValue(effectiveThresholds, 'critical_voltage_low');
      const voltageCriticalHigh = getThresholdValue(effectiveThresholds, 'critical_voltage_high');
      const voltageWarningLow = getThresholdValue(effectiveThresholds, 'warning_voltage_low');
      const voltageWarningHigh = getThresholdValue(effectiveThresholds, 'warning_voltage_high');

      // Voltage evaluation (debug logging disabled)

      // Only evaluate if all thresholds are defined
      // Note: Low thresholds can be 0 (to detect no power condition)
      if (voltageCriticalLow !== undefined && voltageCriticalHigh !== undefined &&
          voltageWarningLow !== undefined && voltageWarningHigh !== undefined &&
          voltageCriticalLow >= 0 && voltageCriticalHigh > 0 &&
          voltageWarningLow >= 0 && voltageWarningHigh > 0) {

        // Check critical thresholds first (values from database)
        // Critical LOW: voltage at or below critical minimum
        // Critical HIGH: voltage at or above critical maximum
        if (voltage <= voltageCriticalLow || voltage >= voltageCriticalHigh) {
          if (voltage <= voltageCriticalLow) {
            reasons.push('critical_voltage_low');
          } else {
            reasons.push('critical_voltage_high');
          }
          status = 'critical';
        }
        // Check warning thresholds (only if not already critical, values from database)
        // Warning LOW: voltage at or below warning low
        // Warning HIGH: voltage at or above warning high
        else if (voltage <= voltageWarningLow || voltage >= voltageWarningHigh) {
          if (voltage <= voltageWarningLow) {
            reasons.push('warning_voltage_low');
          } else {
            reasons.push('warning_voltage_high');
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

  // Voltage evaluation summary
  const voltageStats = {
    total: 0,
    withVoltage: 0,
    criticalLow: 0,
    criticalHigh: 0,
    warningLow: 0,
    warningHigh: 0,
    normal: 0
  };

  processedRacks.forEach(rack => {
    voltageStats.total++;
    const voltage = parseFloat(rack.voltage);
    if (voltage && !isNaN(voltage) && voltage > 0) {
      voltageStats.withVoltage++;
      if (rack.reasons) {
        if (rack.reasons.includes('critical_voltage_low')) voltageStats.criticalLow++;
        if (rack.reasons.includes('critical_voltage_high')) voltageStats.criticalHigh++;
        if (rack.reasons.includes('warning_voltage_low')) voltageStats.warningLow++;
        if (rack.reasons.includes('warning_voltage_high')) voltageStats.warningHigh++;
      }
      const hasVoltageAlert = rack.reasons && rack.reasons.some(r => r.includes('voltage'));
      if (!hasVoltageAlert) voltageStats.normal++;
    }
  });

  // Get threshold values from database for display
  const voltageCriticalLowValue = getThresholdValue(thresholds, 'critical_voltage_low') || 'N/A';
  const voltageCriticalHighValue = getThresholdValue(thresholds, 'critical_voltage_high') || 'N/A';
  const voltageWarningLowValue = getThresholdValue(thresholds, 'warning_voltage_low') || 'N/A';
  const voltageWarningHighValue = getThresholdValue(thresholds, 'warning_voltage_high') || 'N/A';

  // Log voltage evaluation summary only if there are alerts
  if (voltageStats.criticalLow > 0 || voltageStats.criticalHigh > 0 || voltageStats.warningLow > 0 || voltageStats.warningHigh > 0) {
    logger.info('Voltage alerts detected', {
      total: voltageStats.total,
      withVoltage: voltageStats.withVoltage,
      normal: voltageStats.normal,
      criticalLow: voltageStats.criticalLow,
      criticalHigh: voltageStats.criticalHigh,
      warningLow: voltageStats.warningLow,
      warningHigh: voltageStats.warningHigh
    });
  }

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
 * Get list of chain IDs currently in maintenance mode
 * Returns chains that have been put into maintenance as entire chains
 */
async function getMaintenanceChainIds() {
  try {
    const result = await executeQuery(async (pool) => {
      return await pool.request().query(`
        SELECT DISTINCT chain
        FROM maintenance_rack_details
        WHERE chain IS NOT NULL
        GROUP BY chain, maintenance_entry_id
        HAVING COUNT(DISTINCT rack_id) > 1
      `);
    });
    return new Set(result.recordset.map(r => r.chain));
  } catch (error) {
    console.error('⚠️ Error fetching maintenance chains:', error.message);
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

    logger.info('Alerts processed', { count: processedCount, errors: errorCount });

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
    // Extract metric type and field from reason (passing thresholds)
    const metricInfo = extractMetricInfo(reason, pdu, thresholds);

    if (!metricInfo) {
      logger.warn('Could not extract metric from reason', { reason });
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
function extractMetricInfo(reason, pdu, thresholds) {
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
  } else if (reason.includes('voltage')) {
    metricType = 'voltage';
    alertField = 'voltage';
    alertValue = parseFloat(pdu.voltage) || null;
  } else {
    return null;
  }

  // Extract threshold exceeded from database thresholds
  const thresholdExceeded = getThresholdFromReason(reason, thresholds);

  return {
    metricType,
    alertField,
    alertValue,
    thresholdExceeded
  };
}

/**
 * Gets the threshold value that was exceeded based on the reason
 * Looks up values from database thresholds - NO hardcoded values
 */
function getThresholdFromReason(reason, thresholds) {
  if (!thresholds || thresholds.length === 0) return null;

  // Map reason patterns to threshold keys
  const reasonToKeyMap = {
    'critical_amperage_high_single_phase': 'critical_amperage_high_single_phase',
    'critical_amperage_low_single_phase': 'critical_amperage_low_single_phase',
    'critical_amperage_high_3_phase': 'critical_amperage_high_3_phase',
    'critical_amperage_low_3_phase': 'critical_amperage_low_3_phase',
    'warning_amperage_high_single_phase': 'warning_amperage_high_single_phase',
    'warning_amperage_low_single_phase': 'warning_amperage_low_single_phase',
    'warning_amperage_high_3_phase': 'warning_amperage_high_3_phase',
    'warning_amperage_low_3_phase': 'warning_amperage_low_3_phase',
    'critical_temperature_high': 'critical_temperature_high',
    'critical_temperature_low': 'critical_temperature_low',
    'warning_temperature_high': 'warning_temperature_high',
    'warning_temperature_low': 'warning_temperature_low',
    'critical_humidity_high': 'critical_humidity_high',
    'critical_humidity_low': 'critical_humidity_low',
    'warning_humidity_high': 'warning_humidity_high',
    'warning_humidity_low': 'warning_humidity_low',
    'critical_voltage_high': 'critical_voltage_high',
    'critical_voltage_low': 'critical_voltage_low',
    'warning_voltage_high': 'warning_voltage_high',
    'warning_voltage_low': 'warning_voltage_low'
  };

  // Find the matching threshold key
  let thresholdKey = null;
  for (const [reasonPattern, key] of Object.entries(reasonToKeyMap)) {
    if (reason.includes(reasonPattern)) {
      thresholdKey = key;
      break;
    }
  }

  if (!thresholdKey) return null;

  // Look up the threshold value from database
  const threshold = thresholds.find(t => t.key === thresholdKey);
  return threshold ? threshold.value : null;
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

// ============================================================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================================================

// POST /api/auth/login - Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({
        success: false,
        message: 'Usuario y contraseña son requeridos'
      });
    }

    // Query user from database
    const result = await executeQuery(async (pool) => {
      return await pool.request()
        .input('usuario', sql.NVarChar, usuario)
        .query('SELECT id, usuario, password, rol, sitios_asignados, activo FROM usersAlertado WHERE usuario = @usuario');
    });

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Usuario o contraseña incorrectos'
      });
    }

    const user = result.recordset[0];

    // Check if user is active
    if (!user.activo) {
      return res.status(401).json({
        success: false,
        message: 'Este usuario está desactivado'
      });
    }

    // Verify password (plain text comparison - no hashing)
    const passwordMatch = password === user.password;

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Usuario o contraseña incorrectos'
      });
    }

    // Parse sitios_asignados JSON
    const sitiosAsignados = user.sitios_asignados ? JSON.parse(user.sitios_asignados) : null;

    // Create session
    req.session.userId = user.id;
    req.session.usuario = user.usuario;
    req.session.userRole = user.rol;
    req.session.sitiosAsignados = sitiosAsignados;

    logger.info(`User logged in: ${user.usuario} (${user.rol})`);

    res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      user: {
        id: user.id,
        usuario: user.usuario,
        rol: user.rol,
        sitios_asignados: sitiosAsignados
      }
    });

  } catch (error) {
    console.error('Error in login:', error);
    logger.error('Login error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Error en el servidor al iniciar sesión'
    });
  }
});

// POST /api/auth/logout - Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error('Logout error', { error: err.message });
      return res.status(500).json({
        success: false,
        message: 'Error al cerrar sesión'
      });
    }

    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });
  });
});

// GET /api/auth/session - Check if user has active session
app.get('/api/auth/session', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({
      success: true,
      authenticated: true,
      user: {
        id: req.session.userId,
        usuario: req.session.usuario,
        rol: req.session.userRole,
        sitios_asignados: req.session.sitiosAsignados
      }
    });
  }

  res.json({
    success: true,
    authenticated: false,
    user: null
  });
});

// ============================================================================================================
// USER MANAGEMENT ENDPOINTS (Only for Administrador role)
// ============================================================================================================

// GET /api/sites - Get all available sites from rack data
app.get('/api/sites', requireAuth, async (req, res) => {
  try {
    // First check if we have cache of rack data with sites
    let sites = [];

    // Try to get sites from the cache first (faster)
    if (racksCache.data && Array.isArray(racksCache.data)) {
      const allRacks = racksCache.data.flat();
      const siteSet = new Set();
      allRacks.forEach(rack => {
        if (rack.site && rack.site.trim() !== '') {
          siteSet.add(rack.site.trim());
        }
      });
      sites = Array.from(siteSet).sort();
    }

    // If no sites from cache, try database
    if (sites.length === 0) {
      try {
        const result = await executeQuery(async (pool) => {
          return await pool.request().query(`
            SELECT DISTINCT site
            FROM dbo.active_critical_alerts
            WHERE site IS NOT NULL AND site != ''
            ORDER BY site
          `);
        });
        sites = result.recordset.map(row => row.site);
      } catch (dbError) {
        console.warn('Could not fetch sites from database:', dbError.message);
      }
    }

    // If still no sites, provide default fallback or fetch from API
    if (sites.length === 0) {
      logger.warn('No sites found in cache or database');
    }

    res.json({
      success: true,
      sites: sites
    });

  } catch (error) {
    console.error('Error fetching sites:', error);
    logger.error('Fetch sites error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Error al obtener sitios',
      sites: []
    });
  }
});

// GET /api/users - Get all users
app.get('/api/users', requireAuth, requireRole('Administrador'), async (req, res) => {
  try {
    const result = await executeQuery(async (pool) => {
      return await pool.request().query(`
        SELECT id, usuario, rol, sitios_asignados, activo, fecha_creacion, fecha_modificacion
        FROM usersAlertado
        ORDER BY fecha_creacion DESC
      `);
    });

    // Parse sitios_asignados JSON
    const users = result.recordset.map(user => ({
      ...user,
      sitios_asignados: user.sitios_asignados ? JSON.parse(user.sitios_asignados) : null
    }));

    res.json({
      success: true,
      users: users
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    logger.error('Fetch users error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios'
    });
  }
});

// POST /api/users - Create new user
app.post('/api/users', requireAuth, requireRole('Administrador'), async (req, res) => {
  try {
    const { usuario, password, rol, sitios_asignados } = req.body;

    // Validation
    if (!usuario || !password || !rol) {
      return res.status(400).json({
        success: false,
        message: 'Usuario, contraseña y rol son requeridos'
      });
    }

    // Validate role
    const validRoles = ['Administrador', 'Operador', 'Tecnico', 'Observador'];
    if (!validRoles.includes(rol)) {
      return res.status(400).json({
        success: false,
        message: 'Rol inválido'
      });
    }

    // No password validation - allow any password

    // Check if user already exists
    const existingUser = await executeQuery(async (pool) => {
      return await pool.request()
        .input('usuario', sql.NVarChar, usuario)
        .query('SELECT id FROM usersAlertado WHERE usuario = @usuario');
    });

    if (existingUser.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El usuario ya existe'
      });
    }

    // Use plain text password (as requested)
    const plainPassword = password;

    // Convert sitios_asignados array to JSON string
    const sitiosJson = sitios_asignados && Array.isArray(sitios_asignados) && sitios_asignados.length > 0
      ? JSON.stringify(sitios_asignados)
      : null;

    // Insert user
    await executeQuery(async (pool) => {
      return await pool.request()
        .input('usuario', sql.NVarChar, usuario)
        .input('password', sql.NVarChar, plainPassword)
        .input('rol', sql.NVarChar, rol)
        .input('sitios_asignados', sql.NVarChar, sitiosJson)
        .input('activo', sql.Bit, true)
        .input('fecha_creacion', sql.DateTime, new Date())
        .input('fecha_modificacion', sql.DateTime, new Date())
        .query(`
          INSERT INTO usersAlertado (id, usuario, password, rol, sitios_asignados, activo, fecha_creacion, fecha_modificacion)
          VALUES (NEWID(), @usuario, @password, @rol, @sitios_asignados, @activo, @fecha_creacion, @fecha_modificacion)
        `);
    });

    logger.info(`User created: ${usuario} (${rol}) with sites: ${sitiosJson || 'all'} by ${req.session.usuario}`);

    res.json({
      success: true,
      message: 'Usuario creado exitosamente'
    });

  } catch (error) {
    console.error('Error creating user:', error);
    logger.error('Create user error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Error al crear usuario'
    });
  }
});

// PUT /api/users/:id - Update user
app.put('/api/users/:id', requireAuth, requireRole('Administrador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, password, rol, activo, sitios_asignados } = req.body;

    // Validation
    if (!usuario || !rol) {
      return res.status(400).json({
        success: false,
        message: 'Usuario y rol son requeridos'
      });
    }

    // Validate role
    const validRoles = ['Administrador', 'Operador', 'Tecnico', 'Observador'];
    if (!validRoles.includes(rol)) {
      return res.status(400).json({
        success: false,
        message: 'Rol inválido'
      });
    }

    // Check if user exists
    const existingUser = await executeQuery(async (pool) => {
      return await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('SELECT id FROM usersAlertado WHERE id = @id');
    });

    if (existingUser.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Check if new username is already taken by another user
    const duplicateCheck = await executeQuery(async (pool) => {
      return await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .input('usuario', sql.NVarChar, usuario)
        .query('SELECT id FROM usersAlertado WHERE usuario = @usuario AND id != @id');
    });

    if (duplicateCheck.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de usuario ya está en uso'
      });
    }

    // Convert sitios_asignados array to JSON string
    const sitiosJson = sitios_asignados && Array.isArray(sitios_asignados) && sitios_asignados.length > 0
      ? JSON.stringify(sitios_asignados)
      : null;

    // Build update query
    let updateQuery = `
      UPDATE usersAlertado
      SET usuario = @usuario, rol = @rol, activo = @activo, sitios_asignados = @sitios_asignados, fecha_modificacion = @fecha_modificacion
    `;

    const request = await executeQuery(async (pool) => {
      const req = pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .input('usuario', sql.NVarChar, usuario)
        .input('rol', sql.NVarChar, rol)
        .input('activo', sql.Bit, activo !== undefined ? activo : true)
        .input('sitios_asignados', sql.NVarChar, sitiosJson)
        .input('fecha_modificacion', sql.DateTime, new Date());

      // If password is provided, update it
      if (password && password.trim() !== '') {
        req.input('password', sql.NVarChar, password);
        updateQuery += ', password = @password';
      }

      updateQuery += ' WHERE id = @id';

      return await req.query(updateQuery);
    });

    logger.info(`User updated: ${usuario} (${rol}) with sites: ${sitiosJson || 'all'} by ${req.session.usuario}`);

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente'
    });

  } catch (error) {
    console.error('Error updating user:', error);
    logger.error('Update user error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Error al actualizar usuario'
    });
  }
});

// DELETE /api/users/:id - Delete user (hard delete)
app.delete('/api/users/:id', requireAuth, requireRole('Administrador'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await executeQuery(async (pool) => {
      return await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('SELECT id, usuario FROM usersAlertado WHERE id = @id');
    });

    if (existingUser.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Prevent deleting yourself
    if (existingUser.recordset[0].id === req.session.userId) {
      return res.status(400).json({
        success: false,
        message: 'No puede eliminar su propio usuario'
      });
    }

    // Hard delete: permanently remove user from database
    await executeQuery(async (pool) => {
      return await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('DELETE FROM usersAlertado WHERE id = @id');
    });

    logger.info(`User permanently deleted: ${existingUser.recordset[0].usuario} by ${req.session.usuario}`);

    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    logger.error('Delete user error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Error al eliminar usuario'
    });
  }
});

// ============================================================================================================
// PROTECTED API ENDPOINTS - Apply authentication to existing endpoints
// ============================================================================================================

// Endpoint para obtener datos de racks de energía
app.get('/api/racks/energy', requireAuth, async (req, res) => {
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
      logger.info('NENG_SENSORS_API_URL not configured', { requestId });
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
          // Log if this filtered rack is in maintenance
          const rackIdStr = String(powerItem.rackId || '').trim();
          if (rackIdStr) {
            // We'll check this after loading maintenance IDs
            powerItem._shouldCheckMaintenance = true;
          }
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
          voltage: parseFloat(powerItem.totalVolts) || 0,
          temperature: parseFloat(powerItem.avgVolts) || 0,
          gwName: powerItem.gwName || 'N/A',
          gwIp: powerItem.gwIp || 'N/A',
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

    // Simplified log
    if (itemsWithoutRackName.length > 0) {
      logger.info('PDUs without rack name filtered', { count: itemsWithoutRackName.length });
    }
    
    if (combinedData.length === 0) {
      logger.warn('No data received from API', { requestId });
      return res.json({
        success: true,
        data: [],
        message: 'No rack data available from NENG API',
        count: 0,
        timestamp: new Date().toISOString()
      });
    }
    
    // Data collected and combined

    // Get maintenance rack IDs BEFORE processing
    const maintenanceRackIds = await getMaintenanceRackIds();

    // Check if any filtered items (without rackName) are in maintenance
    const filteredMaintenanceRacks = itemsWithoutRackName.filter(item => {
      const rackIdStr = String(item.rackId || '').trim();
      return rackIdStr && maintenanceRackIds.has(rackIdStr);
    });

    if (filteredMaintenanceRacks.length > 0) {
      console.warn(`⚠️ ${filteredMaintenanceRacks.length} racks EN MANTENIMIENTO fueron FILTRADOS por no tener rackName válido:`,
        filteredMaintenanceRacks.slice(0, 10).map(r => ({ rackId: r.rackId, rackName: r.rackName, id: r.id }))
      );

      // RECOVER FILTERED MAINTENANCE RACKS - Add them back with a generated name
      filteredMaintenanceRacks.forEach(powerItem => {
        const rackIdStr = String(powerItem.rackId || powerItem.id || '').trim();
        if (!rackIdStr) return;

        const recovered = {
          id: String(powerItem.id),
          rackId: rackIdStr,
          name: rackIdStr, // Use rackId as name if no valid rackName
          country: 'España',
          site: powerItem.site,
          dc: powerItem.dc,
          phase: powerItem.phase,
          chain: powerItem.chain,
          node: powerItem.node,
          serial: powerItem.serial,
          current: parseFloat(powerItem.totalAmps) || 0,
          voltage: parseFloat(powerItem.totalVolts) || 0,
          temperature: parseFloat(powerItem.avgVolts) || 0,
          gwName: powerItem.gwName || 'N/A',
          gwIp: powerItem.gwIp || 'N/A',
          lastUpdated: powerItem.lastUpdate || new Date().toISOString()
        };

        // Try to find matching sensor data
        const matchingSensor = allSensorsData.find(sensor =>
          String(sensor.rackId) === rackIdStr
        );

        if (matchingSensor) {
          recovered.sensorTemperature = (matchingSensor.temperature === 'N/A' || matchingSensor.temperature === null || matchingSensor.temperature === undefined)
            ? 'N/A'
            : (parseFloat(matchingSensor.temperature) || null);

          recovered.sensorHumidity = (matchingSensor.humidity === 'N/A' || matchingSensor.humidity === null || matchingSensor.humidity === undefined)
            ? 'N/A'
            : (parseFloat(matchingSensor.humidity) || null);
        }

        combinedData.push(recovered);
      });

      console.log(`✅ Recuperados ${filteredMaintenanceRacks.length} racks en mantenimiento que fueron filtrados`);
    }

    // ADD RACKS FROM SENSORS THAT ARE NOT IN POWER DATA
    // This ensures all racks (especially in maintenance) are visible and evaluated
    const powerRackIds = new Set(combinedData.map(pdu => pdu.rackId));
    const addedFromSensorsBeforeProcessing = [];

    // Check all sensors for racks not in power data
    allSensorsData.forEach(sensorData => {
      const sensorRackId = String(sensorData.rackId);

      // Only add if not already in power data
      if (!powerRackIds.has(sensorRackId)) {
        // Create a PDU entry from sensor data
        const pduFromSensor = {
          id: sensorData.id || sensorRackId,
          rackId: sensorRackId,
          name: sensorData.rackName || sensorRackId,
          country: 'España',
          site: sensorData.site || 'Unknown',
          dc: sensorData.dc || 'Unknown',
          phase: sensorData.phase || 'Unknown',
          chain: sensorData.chain || 'Unknown',
          node: sensorData.node || 'Unknown',
          serial: sensorData.serial || 'Unknown',
          current: 0,
          voltage: 0,
          temperature: 0,
          sensorTemperature: (sensorData.temperature === 'N/A' || sensorData.temperature === null || sensorData.temperature === undefined)
            ? 'N/A'
            : (parseFloat(sensorData.temperature) || null),
          sensorHumidity: (sensorData.humidity === 'N/A' || sensorData.humidity === null || sensorData.humidity === undefined)
            ? 'N/A'
            : (parseFloat(sensorData.humidity) || null),
          gwName: sensorData.gwName || 'N/A',
          gwIp: sensorData.gwIp || 'N/A',
          lastUpdated: sensorData.lastUpdate || new Date().toISOString()
        };

        combinedData.push(pduFromSensor);
        powerRackIds.add(sensorRackId);
        addedFromSensorsBeforeProcessing.push(sensorRackId);
      }
    });

    if (addedFromSensorsBeforeProcessing.length > 0) {
      console.log(`✅ Agregados ${addedFromSensorsBeforeProcessing.length} racks desde sensores (sin datos de power):`, addedFromSensorsBeforeProcessing.slice(0, 10));
    }

    // Process data with thresholds evaluation (includes sensor-only racks now)
    const processedData = await processRackData(combinedData, thresholds);

    // DO NOT filter out maintenance racks - send them to frontend for visual indication
    const filteredData = processedData;
    const uniqueRacks = new Set(filteredData.map(pdu => pdu.rackId)).size;
    logger.info('Data processed', { pdus: filteredData.length, racks: uniqueRacks, maintenance: maintenanceRackIds.size });

    // Manage active critical alerts in database (excluding maintenance racks from alerts)
    const nonMaintenanceData = processedData.filter(pdu => {
      const isInMaintenance = maintenanceRackIds.has(pdu.rackId);
      return !isInMaintenance;
    });
    await manageActiveCriticalAlerts(nonMaintenanceData, thresholds);

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
      'warning_amperage_low_3_phase', 'warning_amperage_high_3_phase',
      'critical_voltage_low', 'critical_voltage_high',
      'warning_voltage_low', 'warning_voltage_high'
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
app.get('/api/maintenance', requireAuth, async (req, res) => {
  const requestId = `GET_MAINT_${Date.now()}`;
  console.log(`\n[${requestId}] 📥 GET /api/maintenance - Request received`);

  try {
    const results = await executeQuery(async (pool) => {
      // Get all maintenance entries - NO FILTERING
      const entriesResult = await pool.request().query(`
        SELECT
          id,
          entry_type,
          rack_id,
          chain,
          site,
          dc,
          reason,
          [user],
          started_at,
          started_by,
          created_at
        FROM maintenance_entries
        ORDER BY started_at DESC
      `);

      // Get all rack details - NO FILTERING
      const detailsResult = await pool.request().query(`
        SELECT
          mrd.maintenance_entry_id,
          mrd.rack_id,
          mrd.pdu_id,
          mrd.name,
          mrd.country,
          mrd.site,
          mrd.dc,
          mrd.phase,
          mrd.chain,
          mrd.node,
          mrd.serial
        FROM maintenance_rack_details mrd
      `);

      return {
        entries: entriesResult.recordset || [],
        details: detailsResult.recordset || []
      };
    });

    const { entries, details } = results;

    console.log(`\n========== CONSULTA DE MANTENIMIENTO (SQL Server) ==========`);
    console.log(`[${requestId}] 📊 Resultados de la Base de Datos:`);
    console.log(`   ✅ Entradas encontradas: ${entries.length}`);
    console.log(`   ✅ Detalles de racks encontrados: ${details.length}`);

    if (entries.length > 0) {
      console.log(`\n📋 ENTRADAS DE MANTENIMIENTO:`);
      entries.forEach((entry, i) => {
        console.log(`\n   Entrada ${i + 1}:`);
        console.log(`      Tipo: ${entry.entry_type}`);
        console.log(`      Rack ID: "${entry.rack_id || 'N/A'}"`);
        console.log(`      Chain: "${entry.chain || 'N/A'}"`);
        console.log(`      Site: "${entry.site || 'N/A'}"`);
        console.log(`      DC: "${entry.dc}"`);
        console.log(`      Razón: "${entry.reason}"`);
        console.log(`      Iniciado: ${entry.started_at}`);
      });
    }

    if (details.length > 0) {
      console.log(`\n📦 DETALLES DE RACKS EN MANTENIMIENTO:`);
      const uniqueRackIds = new Set();
      details.forEach((d, i) => {
        const rackIdStr = String(d.rack_id || '').trim();
        uniqueRackIds.add(rackIdStr);
        if (i < 10) {
          console.log(`   ${i + 1}. rack_id="${d.rack_id}" (type: ${typeof d.rack_id})`);
          console.log(`      Name: "${d.name}"`);
          console.log(`      Chain: "${d.chain}"`);
          console.log(`      DC: "${d.dc}"`);
        }
      });
      console.log(`\n   🔢 Total de rack_id únicos en mantenimiento: ${uniqueRackIds.size}`);
      console.log(`   📋 Lista de todos los rack_id únicos:`);
      console.log(`   [${Array.from(uniqueRackIds).join(', ')}]`);
    }

    // Map details to their entries
    const maintenanceData = entries.map(entry => ({
      ...entry,
      racks: details.filter(d => d.maintenance_entry_id === entry.id)
    }));

    console.log(`\n[${requestId}] 📤 Enviando respuesta con ${maintenanceData.length} entradas`);
    console.log(`============================================================\n`);

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

    res.json({
      success: false,
      message: 'Failed to fetch maintenance entries',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add single rack to maintenance
app.post('/api/maintenance/rack', requireAuth, async (req, res) => {
  try {
    const {
      rackId,
      rackData,
      reason = 'Mantenimiento programado',
      user = 'Sistema'
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

    // Extract site from rackData if provided, otherwise will be fetched from DB
    const providedSite = rackData?.site;

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

      // Check site permission for users with assigned sites (but NOT for Administrators)
      if (req.session.userRole !== 'Administrador' && req.session.sitiosAsignados && Array.isArray(req.session.sitiosAsignados) && req.session.sitiosAsignados.length > 0) {
        if (!site || site === 'Unknown') {
          return { error: 'site_unknown', message: 'No se puede determinar el sitio del rack.' };
        }
        if (!req.session.sitiosAsignados.includes(site)) {
          return { error: 'forbidden', message: `No tienes permisos para gestionar mantenimientos en el sitio "${site}". Solo puedes gestionar: ${req.session.sitiosAsignados.join(', ')}`, site: site };
        }
      }

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
        .input('user', sql.NVarChar, user)
        .input('started_by', sql.NVarChar, user)
        .query(`
          INSERT INTO maintenance_entries
          (id, entry_type, rack_id, chain, site, dc, reason, [user], started_by)
          VALUES
          (@entry_id, @entry_type, @rack_id, @chain, @site, @dc, @reason, @user, @started_by)
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

    if (result.error === 'site_unknown') {
      return res.status(400).json({
        success: false,
        message: result.message || 'No se puede determinar el sitio del rack.',
        timestamp: new Date().toISOString()
      });
    }

    if (result.error === 'forbidden') {
      return res.status(403).json({
        success: false,
        message: result.message,
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
app.post('/api/maintenance/chain', requireAuth, async (req, res) => {
  const requestId = `CHAIN_MAINT_${Date.now()}`;
  console.log(`\n[${requestId}] 📥 POST /api/maintenance/chain - Request received`);
  console.log(`[${requestId}] 📋 Body:`, JSON.stringify(req.body, null, 2));

  try {
    const {
      chain,
      site,
      dc,
      reason = 'Mantenimiento programado de chain',
      user = 'Sistema'
    } = req.body;

    if (!chain || !dc) {
      console.log(`[${requestId}] ❌ Validation failed: missing chain or dc`);
      return res.status(400).json({
        success: false,
        message: 'chain and dc are required',
        timestamp: new Date().toISOString()
      });
    }

    // Check site permission for users with assigned sites (but NOT for Administrators)
    if (req.session.userRole !== 'Administrador' && req.session.sitiosAsignados && Array.isArray(req.session.sitiosAsignados) && req.session.sitiosAsignados.length > 0) {
      if (!site) {
        return res.status(400).json({
          success: false,
          message: 'No se puede determinar el sitio de la chain. Información de sitio requerida para usuarios con sitios asignados.',
          timestamp: new Date().toISOString()
        });
      }
      if (!req.session.sitiosAsignados.includes(site)) {
        return res.status(403).json({
          success: false,
          message: `No tienes permisos para gestionar mantenimientos en el sitio "${site}". Solo puedes gestionar: ${req.session.sitiosAsignados.join(', ')}`,
          timestamp: new Date().toISOString()
        });
      }
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

    // Filter racks that belong to this chain in the specified datacenter only
    console.log(`\n========== ENVIANDO CHAIN A MANTENIMIENTO ==========`);
    console.log(`📋 Chain: "${sanitizedChain}" | DC: "${sanitizedDc}"`);

    // Filter by chain and dc only (dc names are unique, no need to check site)
    let chainRacks = allPowerData.filter(rack => {
      const rackChain = String(rack.chain).trim();
      const rackDc = String(rack.dc).trim();

      const chainMatch = rackChain === sanitizedChain;
      const dcMatch = rackDc === sanitizedDc;

      return chainMatch && dcMatch;
    });

    console.log(`📊 PDUs filtrados por chain/dc: ${chainRacks.length}`);

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
      console.log(`⚠️ No se encontraron racks para esta chain`);
      console.log(`====================================================\n`);
      return res.status(200).json({
        success: true,
        message: `No se encontraron racks para la chain ${sanitizedChain} en DC ${sanitizedDc}. Es posible que la chain esté vacía o que los racks no tengan rackName válido.`,
        racksAdded: 0,
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
        .input('user', sql.NVarChar, user)
        .input('started_by', sql.NVarChar, user)
        .query(`
          INSERT INTO maintenance_entries
          (id, entry_type, rack_id, chain, site, dc, reason, [user], started_by)
          VALUES
          (@entry_id, @entry_type, NULL, @chain, @site, @dc, @reason, @user, @started_by)
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

    console.log(`[${requestId}] ✅ Sending success response...`);

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

    console.log(`[${requestId}] ✅ Response sent successfully`);

  } catch (error) {
    console.error(`[${requestId}] ❌ Error adding chain to maintenance:`, error);
    logger.error('Add chain to maintenance failed', { error: error.message, stack: error.stack, body: req.body });

    console.log(`[${requestId}] ❌ Sending error response...`);

    res.status(500).json({
      success: false,
      message: 'Failed to add chain to maintenance',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Remove a single rack from maintenance
app.delete('/api/maintenance/rack/:rackId', requireAuth, async (req, res) => {
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
      // Get the maintenance entry ID for this rack and check permissions
      const entryResult = await pool.request()
        .input('rack_id', sql.NVarChar, sanitizedRackId)
        .query(`
          SELECT mrd.maintenance_entry_id, me.entry_type, mrd.site
          FROM maintenance_rack_details mrd
          JOIN maintenance_entries me ON mrd.maintenance_entry_id = me.id
          WHERE mrd.rack_id = @rack_id
        `);

      if (entryResult.recordset.length === 0) {
        return { error: 'not_found' };
      }

      const entryId = entryResult.recordset[0].maintenance_entry_id;
      const entryType = entryResult.recordset[0].entry_type;
      const rackSite = entryResult.recordset[0].site;

      // Check site permission for users with assigned sites (but NOT for Administrators)
      if (req.session.userRole !== 'Administrador' && req.session.sitiosAsignados && Array.isArray(req.session.sitiosAsignados) && req.session.sitiosAsignados.length > 0) {
        if (!rackSite || rackSite === 'Unknown') {
          return { error: 'site_unknown', message: 'No se puede determinar el sitio del rack.' };
        }
        if (!req.session.sitiosAsignados.includes(rackSite)) {
          return { error: 'forbidden', message: `No tienes permisos para gestionar mantenimientos en el sitio "${rackSite}". Solo puedes gestionar: ${req.session.sitiosAsignados.join(', ')}`, site: rackSite };
        }
      }

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
app.delete('/api/maintenance/entry/:entryId', requireAuth, async (req, res) => {
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
      // Get entry info before deleting and check permissions
      const entryInfo = await pool.request()
        .input('entry_id', sql.UniqueIdentifier, entryId)
        .query(`
          SELECT me.entry_type, me.rack_id, me.chain, me.dc, me.site,
                 (SELECT COUNT(*) FROM maintenance_rack_details WHERE maintenance_entry_id = @entry_id) as rack_count
          FROM maintenance_entries me
          WHERE me.id = @entry_id
        `);

      if (entryInfo.recordset.length === 0) {
        return { error: 'not_found' };
      }

      const entry = entryInfo.recordset[0];

      // Check site permission for users with assigned sites (but NOT for Administrators)
      if (req.session.userRole !== 'Administrador' && req.session.sitiosAsignados && Array.isArray(req.session.sitiosAsignados) && req.session.sitiosAsignados.length > 0) {
        if (!entry.site || entry.site === 'Unknown') {
          return { error: 'site_unknown', message: 'No se puede determinar el sitio de esta entrada de mantenimiento.' };
        }
        if (!req.session.sitiosAsignados.includes(entry.site)) {
          return { error: 'forbidden', message: `No tienes permisos para gestionar mantenimientos en el sitio "${entry.site}". Solo puedes gestionar: ${req.session.sitiosAsignados.join(', ')}`, site: entry.site };
        }
      }

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

    if (result.error === 'site_unknown') {
      return res.status(400).json({
        success: false,
        message: result.message || 'No se puede determinar el sitio de esta entrada.',
        timestamp: new Date().toISOString()
      });
    }

    if (result.error === 'forbidden') {
      return res.status(403).json({
        success: false,
        message: result.message,
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

// Remove ALL maintenance entries and racks
app.delete('/api/maintenance/all', requireAuth, async (req, res) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`\n[${requestId}] 📥 DELETE /api/maintenance/all - Request received`);

  try {
    const result = await executeQuery(async (pool) => {
      // For users with assigned sites (but NOT Administrators), only delete entries from their sites
      let whereClause = '';
      if (req.session.userRole !== 'Administrador' && req.session.sitiosAsignados && Array.isArray(req.session.sitiosAsignados) && req.session.sitiosAsignados.length > 0) {
        const sitesCondition = req.session.sitiosAsignados.map(site => `'${site.replace("'", "''")}'`).join(',');
        whereClause = `WHERE site IN (${sitesCondition})`;
      }

      // Get count before deletion
      let countQuery = '';
      if (whereClause) {
        countQuery = `
          SELECT
            (SELECT COUNT(*) FROM maintenance_entries ${whereClause}) as entry_count,
            (SELECT COUNT(*) FROM maintenance_rack_details mrd
             JOIN maintenance_entries me ON mrd.maintenance_entry_id = me.id
             WHERE me.site IN (${req.session.sitiosAsignados.map(site => `'${site.replace("'", "''")}'`).join(',')})) as rack_count
        `;
      } else {
        countQuery = `
          SELECT
            (SELECT COUNT(*) FROM maintenance_entries) as entry_count,
            (SELECT COUNT(*) FROM maintenance_rack_details) as rack_count
        `;
      }

      const countResult = await pool.request().query(countQuery);

      const { entry_count, rack_count } = countResult.recordset[0];

      if (entry_count === 0) {
        return { entry_count: 0, rack_count: 0, deleted: false };
      }

      // Delete rack details first (foreign key constraint)
      if (whereClause) {
        await pool.request().query(`
          DELETE FROM maintenance_rack_details
          WHERE maintenance_entry_id IN (
            SELECT id FROM maintenance_entries ${whereClause}
          )
        `);
      } else {
        await pool.request().query(`DELETE FROM maintenance_rack_details`);
      }

      // Delete maintenance entries
      await pool.request().query(`DELETE FROM maintenance_entries ${whereClause}`);

      console.log(`[${requestId}] ✅ Deleted ${entry_count} entries and ${rack_count} racks from maintenance`);

      return { entry_count, rack_count, deleted: true };
    });

    if (!result.deleted) {
      return res.status(404).json({
        success: false,
        message: 'No maintenance entries to remove',
        timestamp: new Date().toISOString()
      });
    }

    const logMessage = req.session.sitiosAsignados && req.session.sitiosAsignados.length > 0
      ? `Maintenance entries removed for sites: ${req.session.sitiosAsignados.join(', ')}`
      : 'All maintenance entries removed';

    logger.info(logMessage, {
      requestId,
      entry_count: result.entry_count,
      rack_count: result.rack_count,
      user: req.session.usuario,
      sites: req.session.sitiosAsignados
    });

    const responseMessage = req.session.sitiosAsignados && req.session.sitiosAsignados.length > 0
      ? `Maintenance entries removed for your assigned sites (${result.entry_count} entries, ${result.rack_count} racks)`
      : `All maintenance entries removed (${result.entry_count} entries, ${result.rack_count} racks)`;

    res.json({
      success: true,
      message: responseMessage,
      data: {
        entriesRemoved: result.entry_count,
        racksRemoved: result.rack_count
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[${requestId}] ❌ Error removing all maintenance entries:`, error);
    logger.error('Remove all maintenance entries failed', { error: error.message, stack: error.stack });

    res.status(500).json({
      success: false,
      message: 'Failed to remove all maintenance entries',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

// Endpoint to download template
app.get('/api/maintenance/template', (req, res) => {
  const filePath = path.join(__dirname, 'plantilla_mantenimiento.xlsx');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'Template file not found',
      timestamp: new Date().toISOString()
    });
  }

  res.download(filePath, 'plantilla_mantenimiento_racks.xlsx', (err) => {
    if (err) {
      logger.error('Error downloading template:', err);
      res.status(500).json({
        success: false,
        message: 'Error downloading template',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });
});

// Endpoint to import racks from Excel
app.post('/api/maintenance/import-excel', upload.single('file'), async (req, res) => {
  const requestId = crypto.randomUUID();
  console.log(`\n[${requestId}] 📥 POST /api/maintenance/import-excel - Request received`);

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
        timestamp: new Date().toISOString()
      });
    }

    const { user = 'Sistema', defaultReason = 'Mantenimiento' } = req.body;

    console.log(`[${requestId}] 📄 File received: ${req.file.originalname} (${req.file.size} bytes)`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.getWorksheet('Datos');
    if (!worksheet) {
      return res.status(400).json({
        success: false,
        message: 'Excel file must contain a sheet named "Datos"',
        timestamp: new Date().toISOString()
      });
    }

    const racks = [];
    const errors = [];
    const duplicatesInFile = new Set();
    const rackIdsInFile = [];

    let rowIndex = 0;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      rowIndex++;

      const rackData = {
        rack_id: row.getCell(1).value?.toString().trim() || '',
        dc: row.getCell(2).value?.toString().trim() || '',
        chain: row.getCell(3).value?.toString().trim() || null,
        pdu_id: row.getCell(4).value?.toString().trim() || null,
        name: row.getCell(5).value?.toString().trim() || null,
        country: row.getCell(6).value?.toString().trim() || null,
        site: row.getCell(7).value?.toString().trim() || null,
        phase: row.getCell(8).value?.toString().trim() || null,
        node: row.getCell(9).value?.toString().trim() || null,
        serial: row.getCell(10).value?.toString().trim() || null,
        reason: row.getCell(11).value?.toString().trim() || defaultReason
      };

      if (!rackData.rack_id && !rackData.dc) {
        return;
      }

      if (!rackData.rack_id) {
        errors.push({
          row: rowNumber,
          error: 'rack_id is required',
          data: rackData
        });
        return;
      }

      if (!rackData.dc) {
        errors.push({
          row: rowNumber,
          error: 'dc is required',
          data: rackData
        });
        return;
      }

      if (rackIdsInFile.includes(rackData.rack_id)) {
        duplicatesInFile.add(rackData.rack_id);
        errors.push({
          row: rowNumber,
          error: `Duplicate rack_id in Excel: ${rackData.rack_id}`,
          data: rackData
        });
        return;
      }

      rackIdsInFile.push(rackData.rack_id);
      racks.push({ ...rackData, rowNumber });
    });

    console.log(`[${requestId}] 📊 Parsed ${racks.length} racks from Excel, ${errors.length} errors found`);

    if (racks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid racks found in Excel file',
        errors,
        timestamp: new Date().toISOString()
      });
    }

    const result = await executeQuery(async (pool) => {
      const alreadyInMaintenance = [];
      const successfulInserts = [];
      const failedInserts = [];

      for (const rack of racks) {
        try {
          const existingCheck = await pool.request()
            .input('rack_id', sql.NVarChar, rack.rack_id)
            .query(`
              SELECT COUNT(*) as count
              FROM maintenance_rack_details
              WHERE rack_id = @rack_id
            `);

          if (existingCheck.recordset[0].count > 0) {
            alreadyInMaintenance.push({
              row: rack.rowNumber,
              rack_id: rack.rack_id,
              message: 'Already in maintenance'
            });
            continue;
          }

          const entryId = crypto.randomUUID();

          await pool.request()
            .input('entry_id', sql.UniqueIdentifier, entryId)
            .input('entry_type', sql.NVarChar, 'individual_rack')
            .input('rack_id', sql.NVarChar, rack.rack_id)
            .input('chain', sql.NVarChar, rack.chain || 'Unknown')
            .input('site', sql.NVarChar, rack.site || 'Unknown')
            .input('dc', sql.NVarChar, rack.dc)
            .input('reason', sql.NVarChar, rack.reason)
            .input('user', sql.NVarChar, user)
            .input('started_by', sql.NVarChar, user)
            .query(`
              INSERT INTO maintenance_entries
              (id, entry_type, rack_id, chain, site, dc, reason, [user], started_by)
              VALUES
              (@entry_id, @entry_type, @rack_id, @chain, @site, @dc, @reason, @user, @started_by)
            `);

          await pool.request()
            .input('entry_id', sql.UniqueIdentifier, entryId)
            .input('rack_id', sql.NVarChar, rack.rack_id)
            .input('pdu_id', sql.NVarChar, rack.pdu_id || rack.rack_id)
            .input('name', sql.NVarChar, rack.name || rack.rack_id)
            .input('country', sql.NVarChar, rack.country || 'Unknown')
            .input('site', sql.NVarChar, rack.site || 'Unknown')
            .input('dc', sql.NVarChar, rack.dc)
            .input('phase', sql.NVarChar, rack.phase || 'Unknown')
            .input('chain', sql.NVarChar, rack.chain || 'Unknown')
            .input('node', sql.NVarChar, rack.node || 'Unknown')
            .input('serial', sql.NVarChar, rack.serial || 'Unknown')
            .query(`
              INSERT INTO maintenance_rack_details
              (maintenance_entry_id, rack_id, pdu_id, name, country, site, dc, phase, chain, node, serial)
              VALUES
              (@entry_id, @rack_id, @pdu_id, @name, @country, @site, @dc, @phase, @chain, @node, @serial)
            `);

          successfulInserts.push({
            row: rack.rowNumber,
            rack_id: rack.rack_id,
            dc: rack.dc
          });

        } catch (error) {
          failedInserts.push({
            row: rack.rowNumber,
            rack_id: rack.rack_id,
            error: error.message
          });
        }
      }

      return {
        successfulInserts,
        alreadyInMaintenance,
        failedInserts
      };
    });

    const summary = {
      total: racks.length,
      successful: result.successfulInserts.length,
      alreadyInMaintenance: result.alreadyInMaintenance.length,
      failed: result.failedInserts.length + errors.length,
      errors: [
        ...errors.map(e => ({ ...e, type: 'validation' })),
        ...result.alreadyInMaintenance.map(e => ({ ...e, type: 'duplicate', error: 'Already in maintenance' })),
        ...result.failedInserts.map(e => ({ ...e, type: 'insert_failed' }))
      ]
    };

    console.log(`[${requestId}] ✅ Import completed: ${summary.successful} successful, ${summary.failed} failed`);

    logger.info(`Excel import completed: ${summary.successful}/${summary.total} racks added to maintenance`, {
      requestId,
      fileName: req.file.originalname,
      summary
    });

    res.json({
      success: true,
      message: `Import completed: ${summary.successful} racks added to maintenance`,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[${requestId}] ❌ Error importing Excel:`, error);
    logger.error('Excel import failed', { requestId, error: error.message });

    res.status(500).json({
      success: false,
      message: 'Failed to import Excel file',
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
app.post('/api/export/alerts', requireAuth, async (req, res) => {
  try {
    const { filterBySite } = req.body;
    const userSites = req.session.sitiosAsignados || [];

    // Use cached racks data if available and valid, otherwise return error
    if (!isCacheValid(racksCache)) {
      console.error('❌ EXPORT ALERTS: Cache is invalid or expired');
      return res.status(503).json({
        success: false,
        message: 'Rack data not available. Please wait for data to be loaded or refresh the page.',
        timestamp: new Date().toISOString()
      });
    }

    const racksData = racksCache.data;

    if (!racksData || !Array.isArray(racksData)) {
      console.error('❌ EXPORT ALERTS: Invalid cache data structure', {
        hasData: !!racksData,
        isArray: Array.isArray(racksData),
        dataType: typeof racksData,
        cacheAge: racksCache.timestamp ? Date.now() - racksCache.timestamp : 'unknown'
      });
      return res.status(503).json({
        success: false,
        message: 'Rack data is not in the expected format. Please refresh the page to reload data.',
        timestamp: new Date().toISOString()
      });
    }

    if (racksData.length === 0) {
      console.warn('⚠️ EXPORT ALERTS: Cache contains empty array');
      return res.status(503).json({
        success: false,
        message: 'No rack data available. Please wait for data to be loaded.',
        timestamp: new Date().toISOString()
      });
    }

    // Get maintenance racks from database
    const maintenanceResult = await executeQuery(async (pool) => {
      return await pool.request().query(`
        SELECT DISTINCT rack_id
        FROM maintenance_rack_details
      `);
    });

    const maintenanceRackIds = new Set(
      (maintenanceResult.recordset || []).map(row => String(row.rack_id).trim())
    );

    console.log(`\n📊 EXPORT ALERTS: ${maintenanceRackIds.size} racks in maintenance (excluded from export)`);

    // Flatten the nested array structure (racks come as array of arrays)
    const allPdus = [];
    racksData.forEach(rackGroup => {
      if (Array.isArray(rackGroup)) {
        rackGroup.forEach(pdu => {
          if (pdu && typeof pdu === 'object') {
            allPdus.push(pdu);
          }
        });
      }
    });

    // Helper function to check if user has access to a site (handles Cantabria unification)
    const userHasAccessToSite = (siteName) => {
      if (!filterBySite || userSites.length === 0) {
        return true; // No filtering or no restrictions
      }

      // Normalize site name for Cantabria check
      const normalizedSite = siteName && siteName.toLowerCase().includes('cantabria') ? 'Cantabria' : siteName;

      // Check if user has direct access
      if (userSites.includes(siteName)) {
        return true;
      }

      // Check if this is a Cantabria site and user has any Cantabria access
      if (normalizedSite === 'Cantabria') {
        return userSites.some(assignedSite =>
          assignedSite.toLowerCase().includes('cantabria')
        );
      }

      return false;
    };

    // Filter PDUs with alerts (critical OR warning), exclude maintenance racks, and apply site filter
    const pdusWithAlerts = allPdus.filter(pdu => {
      // Check if rack is in maintenance
      const rackId = String(pdu.rackId || pdu.id || '').trim();
      if (rackId && maintenanceRackIds.has(rackId)) {
        return false; // Exclude racks in maintenance
      }

      // Check site access if filtering is enabled
      if (!userHasAccessToSite(pdu.site)) {
        return false; // Exclude PDUs from sites user doesn't have access to
      }

      // Include PDUs with critical or warning status
      return pdu.status === 'critical' || pdu.status === 'warning';
    });

    const filterInfo = filterBySite && userSites.length > 0
      ? ` (filtered by sites: ${userSites.join(', ')})`
      : '';
    console.log(`📊 EXPORT ALERTS: ${allPdus.length} total PDUs, ${pdusWithAlerts.length} PDUs with alerts (excluding maintenance)${filterInfo}`);

    if (pdusWithAlerts.length === 0) {
      return res.json({
        success: true,
        message: 'No alerts found to export',
        count: 0,
        timestamp: new Date().toISOString()
      });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Alertas');

    // Define columns with all requested fields
    worksheet.columns = [
      { header: 'Nombre del Rack', key: 'rack_name', width: 30 },
      { header: 'ID Rack', key: 'rack_id', width: 20 },
      { header: 'ID PDU', key: 'pdu_id', width: 20 },
      { header: 'País', key: 'country', width: 15 },
      { header: 'Sitio', key: 'site', width: 20 },
      { header: 'Data Center', key: 'dc', width: 15 },
      { header: 'Chain', key: 'chain', width: 12 },
      { header: 'Node', key: 'node', width: 12 },
      { header: 'N° Serie', key: 'serial', width: 20 },
      { header: 'Fase', key: 'phase', width: 15 },
      { header: 'Amperaje (A)', key: 'current', width: 15 },
      { header: 'Voltaje (V)', key: 'voltage', width: 15 },
      { header: 'Temperatura (°C)', key: 'temperature', width: 18 },
      { header: 'Humedad (%)', key: 'humidity', width: 15 },
      { header: 'Estado de Alerta', key: 'alert_status', width: 18 },
      { header: 'Razones de Alerta', key: 'alert_reasons', width: 50 }
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
        bold: true,
        size: 11
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add data rows (one row per PDU)
    pdusWithAlerts.forEach(pdu => {
      const alertReasons = (pdu.reasons && Array.isArray(pdu.reasons))
        ? pdu.reasons.join(', ')
        : '';

      const row = worksheet.addRow({
        rack_name: pdu.name || 'N/A',
        rack_id: pdu.rackId || pdu.id || 'N/A',
        pdu_id: pdu.id || 'N/A',
        country: pdu.country || 'España',
        site: pdu.site || 'N/A',
        dc: pdu.dc || 'N/A',
        chain: pdu.chain || 'N/A',
        node: pdu.node || 'N/A',
        serial: pdu.serial || 'N/A',
        phase: pdu.phase || 'N/A',
        current: pdu.current != null ? parseFloat(pdu.current).toFixed(2) : 'N/A',
        voltage: pdu.voltage != null && !isNaN(pdu.voltage) && pdu.voltage > 0
          ? parseFloat(pdu.voltage).toFixed(2)
          : 'N/A',
        temperature: pdu.sensorTemperature != null
          ? parseFloat(pdu.sensorTemperature).toFixed(2)
          : (pdu.temperature != null ? parseFloat(pdu.temperature).toFixed(2) : 'N/A'),
        humidity: pdu.sensorHumidity != null
          ? parseFloat(pdu.sensorHumidity).toFixed(1)
          : 'N/A',
        alert_status: pdu.status === 'critical' ? 'CRÍTICO' : 'ADVERTENCIA',
        alert_reasons: alertReasons
      });

      // Determine alert color based on status
      const alertColor = pdu.status === 'critical' ? 'FFFF0000' : 'FFFFA500'; // Red or Orange
      const fontColor = 'FFFFFFFF'; // White text

      // Color-code the alert status column
      const alertStatusCell = row.getCell('alert_status');
      alertStatusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: alertColor }
      };
      alertStatusCell.font = { color: { argb: fontColor }, bold: true };

      // Color-code the metric cells that triggered the alert
      if (pdu.reasons && Array.isArray(pdu.reasons)) {
        pdu.reasons.forEach(reason => {
          const reasonLower = reason.toLowerCase();

          // Check if alert is related to amperage/current (only HIGH alerts, not low or zero)
          if (reasonLower.includes('amperage') && reasonLower.includes('high')) {
            const currentCell = row.getCell('current');
            currentCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: alertColor }
            };
            currentCell.font = { color: { argb: fontColor }, bold: true };
          }

          // Check if alert is related to voltage
          if (reasonLower.includes('voltage')) {
            const voltageCell = row.getCell('voltage');
            voltageCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: alertColor }
            };
            voltageCell.font = { color: { argb: fontColor }, bold: true };
          }

          // Check if alert is related to temperature
          if (reasonLower.includes('temperature')) {
            const tempCell = row.getCell('temperature');
            tempCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: alertColor }
            };
            tempCell.font = { color: { argb: fontColor }, bold: true };
          }

          // Check if alert is related to humidity
          if (reasonLower.includes('humidity')) {
            const humidityCell = row.getCell('humidity');
            humidityCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: alertColor }
            };
            humidityCell.font = { color: { argb: fontColor }, bold: true };
          }
        });
      }

      // Add borders to all cells
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `alertas_${timestamp}.xlsx`;

    console.log(`✅ EXPORT ALERTS: Sending Excel file to browser with ${pdusWithAlerts.length} PDUs with alerts`);

    // Set headers to trigger download in browser
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    // Write the Excel file directly to the response stream
    await workbook.xlsx.write(res);
    res.end();

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

// Catch-all handler: serve index.html for any non-API routes (for React Router)
app.get('*', (req, res) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }

  // 404 for API routes not found
  console.warn(`⚠️ 404 - Route not found: ${req.method} ${req.originalUrl}`);
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

// Set server timeout to 5 minutes (for long-running operations like chain maintenance)
server.timeout = 300000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

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