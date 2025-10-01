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

// DEBUG: Log environment variables on startup
console.log('🔍 DEBUGGING ENVIRONMENT VARIABLES:');
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('   PORT:', process.env.PORT);
console.log('   FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('   NENG_API_URL:', process.env.NENG_API_URL ? '✅ SET' : '❌ NOT SET');
console.log('   NENG_API_KEY:', process.env.NENG_API_KEY ? '✅ SET' : '❌ NOT SET');
console.log('   SQL_SERVER_HOST:', process.env.SQL_SERVER_HOST);
console.log('   SQL_SERVER_DATABASE:', process.env.SQL_SERVER_DATABASE);
console.log('   SQL_SERVER_USER:', process.env.SQL_SERVER_USER);
console.log('   SQL_SERVER_PASSWORD:', process.env.SQL_SERVER_PASSWORD ? '✅ SET' : '❌ NOT SET');
console.log('   SQL_SERVER_PORT:', process.env.SQL_SERVER_PORT);
console.log('   Working Directory:', process.cwd());
console.log('   .env file location should be:', path.join(process.cwd(), '.env'));
console.log('   .env file exists?:', fs.existsSync(path.join(process.cwd(), '.env')) ? '✅ YES' : '❌ NO');
console.log('');

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
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Test SQL connection on startup
async function testSqlConnection() {
  try {
    console.log('🔗 Testing SQL Server connection...');
    const pool = await sql.connect(sqlConfig);
    console.log('✅ SQL Server connection established');
    await pool.close();
  } catch (error) {
    console.error('❌ SQL Server connection failed:', error.message);
    logger.error('SQL connection failed', { error: error.message });
  }
}

testSqlConnection();

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
  
  console.log(`🌐 Making real API call to: ${url}`);
  
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
    
    console.log(`✅ NENG API Response successful - Status: ${response.status}`);
    
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
      console.log('📦 Using cached thresholds data');
      return thresholdsCache.data;
    }

    console.log('🔍 Fetching thresholds from SQL Server...');
    const pool = await sql.connect(sqlConfig);

    const result = await pool.request().query(`
      SELECT threshold_key as [key], value, unit, description, created_at as createdAt, updated_at as updatedAt
      FROM dbo.threshold_configs
      ORDER BY threshold_key
    `);
    
    await pool.close();
    
    const thresholds = result.recordset || [];
    console.log(`✅ Fetched ${thresholds.length} thresholds from database`);
    
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
    console.log('💾 Saving thresholds to SQL Server...');
    const pool = await sql.connect(sqlConfig);
    
    let updatedCount = 0;
    
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
        updatedCount++;
        console.log(`✅ Updated threshold: ${key} = ${value}`);
      }
    }
    
    await pool.close();
    
    // Clear cache to force reload
    thresholdsCache.data = null;
    thresholdsCache.timestamp = null;
    
    console.log(`💾 Successfully updated ${updatedCount} thresholds in database`);
    return updatedCount;
    
  } catch (error) {
    console.error('❌ Error saving thresholds to database:', error);
    logger.error('Database threshold save failed', { error: error.message });
    throw error;
  }
}

// Process rack data with threshold evaluation
async function processRackData(racks, thresholds) {
  console.log(`🔧 Processing ${racks.length} racks with threshold evaluation...`);
  
  const processedRacks = racks.map(rack => {
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
      criticalLow = getThresholdValue(thresholds, 'critical_amperage_low_single_phase');
      criticalHigh = getThresholdValue(thresholds, 'critical_amperage_high_single_phase');
      warningLow = getThresholdValue(thresholds, 'warning_amperage_low_single_phase');
      warningHigh = getThresholdValue(thresholds, 'warning_amperage_high_single_phase');
    } else if (is3Phase) {
      criticalLow = getThresholdValue(thresholds, 'critical_amperage_low_3_phase');
      criticalHigh = getThresholdValue(thresholds, 'critical_amperage_high_3_phase');
      warningLow = getThresholdValue(thresholds, 'warning_amperage_low_3_phase');
      warningHigh = getThresholdValue(thresholds, 'warning_amperage_high_3_phase');
    } else {
      // Default to single phase
      criticalLow = getThresholdValue(thresholds, 'critical_amperage_low_single_phase');
      criticalHigh = getThresholdValue(thresholds, 'critical_amperage_high_single_phase');
      warningLow = getThresholdValue(thresholds, 'warning_amperage_low_single_phase');
      warningHigh = getThresholdValue(thresholds, 'warning_amperage_high_single_phase');
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
      const tempCriticalLow = getThresholdValue(thresholds, 'critical_temperature_low');
      const tempCriticalHigh = getThresholdValue(thresholds, 'critical_temperature_high');
      const tempWarningLow = getThresholdValue(thresholds, 'warning_temperature_low');
      const tempWarningHigh = getThresholdValue(thresholds, 'warning_temperature_high');

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
      const humidCriticalLow = getThresholdValue(thresholds, 'critical_humidity_low');
      const humidCriticalHigh = getThresholdValue(thresholds, 'critical_humidity_high');
      const humidWarningLow = getThresholdValue(thresholds, 'warning_humidity_low');
      const humidWarningHigh = getThresholdValue(thresholds, 'warning_humidity_high');

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
  
  console.log(`🎯 Evaluation Summary: ${criticalCount} critical, ${warningCount} warning, ${normalCount} normal`);
  
  // Log some examples of critical PDUs for debugging
  const criticalExamples = processedRacks.filter(r => r.status === 'critical').slice(0, 3);
  if (criticalExamples.length > 0) {
    console.log('🚨 Critical PDU examples:');
    criticalExamples.forEach(pdu => {
      console.log(`   PDU ${pdu.id}: Current=${pdu.current}A, Temp=${pdu.sensorTemperature}°C, Humidity=${pdu.sensorHumidity}%, Reasons=[${pdu.reasons.join(', ')}]`);
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
 * Manages active critical alerts in the database
 * Inserts new critical alerts and removes resolved ones
 */
async function manageActiveCriticalAlerts(allPdus, thresholds) {
  try {
    console.log('🔄 Starting active critical alerts management...');
    
    const pool = await sql.connect(sqlConfig);
    
    // Get current critical PDUs with their reasons
    const currentCriticalPdus = allPdus.filter(pdu => 
      pdu.status === 'critical' && pdu.reasons && pdu.reasons.length > 0
    );
    
    console.log(`📊 Found ${currentCriticalPdus.length} PDUs with critical alerts`);
    
    // Process each critical PDU
    for (const pdu of currentCriticalPdus) {
      // Process each alert reason for this PDU
      for (const reason of pdu.reasons) {
        if (reason.startsWith('critical_')) {
          await processCriticalAlert(pool, pdu, reason, thresholds);
        }
      }
    }
    
    // Clean up resolved alerts
    await cleanupResolvedAlerts(pool, currentCriticalPdus);
    
    console.log('✅ Active critical alerts management completed');
    
  } catch (error) {
    console.error('❌ Error managing active critical alerts:', error);
  }
}

/**
 * Processes a single critical alert for a PDU
 */
async function processCriticalAlert(pool, pdu, reason, thresholds) {
  try {
    // Extract metric type and field from reason
    const metricInfo = extractMetricInfo(reason, pdu);
    
    if (!metricInfo) {
      console.log(`⚠️ Could not extract metric info from reason: ${reason}`);
      return;
    }
    
    const { metricType, alertField, alertValue, thresholdExceeded } = metricInfo;
    
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
      
      console.log(`🔄 Updated critical alert for PDU ${pdu.id}, metric: ${metricType}`);
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
      
      console.log(`🚨 NEW critical alert inserted for PDU ${pdu.id}, metric: ${metricType}, value: ${alertValue}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing critical alert for PDU ${pdu.id}:`, error);
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
async function cleanupResolvedAlerts(pool, currentCriticalPdus) {
  try {
    const currentCriticalPduIds = currentCriticalPdus.map(pdu => pdu.id);
    
    if (currentCriticalPduIds.length === 0) {
      // If no critical PDUs, delete all alerts
      const deleteResult = await pool.request().query(`
        DELETE FROM active_critical_alerts
      `);
      
      console.log(`🧹 Cleaned up all ${deleteResult.rowsAffected} resolved alerts (no critical PDUs)`);
      return;
    }
    
    // Create a string of PDU IDs for the NOT IN clause
    const pduIdsList = currentCriticalPduIds.map(id => `'${id.replace("'", "''")}'`).join(',');
    
    // Delete alerts for PDUs that are no longer critical
    const deleteResult = await pool.request().query(`
      DELETE FROM active_critical_alerts 
      WHERE pdu_id NOT IN (${pduIdsList})
    `);
    
    if (deleteResult.rowsAffected > 0) {
      console.log(`🧹 Cleaned up ${deleteResult.rowsAffected} resolved alerts`);
    }
    
    // Also clean up alerts for PDUs that are still critical but no longer have the specific reason
    for (const criticalPdu of currentCriticalPdus) {
      const currentReasons = criticalPdu.reasons.filter(r => r.startsWith('critical_'));
      
      if (currentReasons.length > 0) {
        const reasonsList = currentReasons.map(reason => `'${reason.replace("'", "''")}'`).join(',');
        
        const cleanupResult = await pool.request()
          .input('pdu_id', sql.NVarChar, criticalPdu.id)
          .query(`
            DELETE FROM active_critical_alerts 
            WHERE pdu_id = @pdu_id AND alert_reason NOT IN (${reasonsList})
          `);
        
        if (cleanupResult.rowsAffected > 0) {
          console.log(`🧹 Cleaned up ${cleanupResult.rowsAffected} resolved specific alerts for PDU ${criticalPdu.id}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error cleaning up resolved alerts:', error);
  }
}

// Endpoint para obtener datos de racks de energía
app.get('/api/racks/energy', async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  
  try {
    console.log(`[${requestId}] 📥 NEW REQUEST - Energy racks data`);
    
    // Check cache first
    if (isCacheValid(racksCache)) {
      console.log(`[${requestId}] 📦 Using cached rack data`);
      return res.json({
        success: true,
        data: racksCache.data,
        message: 'Rack data retrieved successfully (cached)',
        count: racksCache.data ? racksCache.data.flat().length : 0,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`[${requestId}] 🔄 Cache expired, fetching fresh data...`);
    
    // Get thresholds first
    const thresholds = await fetchThresholdsFromDatabase();
    console.log(`[${requestId}] 🎯 Loaded ${thresholds.length} thresholds for evaluation`);
    
    // Validate NENG API configuration
    if (!process.env.NENG_API_URL || !process.env.NENG_API_KEY) {
      throw new Error('NENG API configuration missing. Please check NENG_API_URL and NENG_API_KEY environment variables.');
    }

    // Fetch ALL power data with pagination (skip by 100)
    console.log(`[${requestId}] 🔌 Fetching all power data with pagination...`);
    let allPowerData = [];
    let powerSkip = 0;
    const pageSize = 100;
    let hasMorePowerData = true;

    while (hasMorePowerData) {
      console.log(`[${requestId}] 📄 Fetching power page: skip=${powerSkip}, limit=${pageSize}`);

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
      console.log(`[${requestId}] ✅ Power page received: ${pageData.length} PDUs`);

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

    console.log(`[${requestId}] ✅ Total Power API data collected: ${allPowerData.length} PDUs`);

    // Fetch ALL sensor data if sensors URL is configured
    let allSensorsData = [];
    if (process.env.NENG_SENSORS_API_URL) {
      console.log(`[${requestId}] 🌡️ Fetching all sensor data with pagination...`);
      let sensorSkip = 0;
      let hasMoreSensorData = true;

      try {
        while (hasMoreSensorData) {
          console.log(`[${requestId}] 📄 Fetching sensor page: skip=${sensorSkip}, limit=${pageSize}`);

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
          console.log(`[${requestId}] ✅ Sensor page received: ${pageData.length} sensors`);

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

        console.log(`[${requestId}] ✅ Total Sensors API data collected: ${allSensorsData.length} sensors`);
      } catch (sensorError) {
        console.warn(`[${requestId}] ⚠️ Sensors API failed (continuing without sensor data):`, sensorError.message);
      }
    } else {
      console.log(`[${requestId}] ⚠️ NENG_SENSORS_API_URL not configured, skipping sensor data`);
    }

    // Map and combine power and sensor data
    const combinedData = allPowerData.map(powerItem => {
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
    
    console.log(`[${requestId}] 📊 Data Summary:`);
    console.log(`[${requestId}]   - Total combined PDUs: ${combinedData.length}`);
    console.log(`[${requestId}]   - Power data items: ${allPowerData.length}`);
    console.log(`[${requestId}]   - Sensor data items: ${allSensorsData.length}`);

    const pdusWithSensorData = combinedData.filter(pdu => pdu.sensorTemperature != null).length;
    console.log(`[${requestId}]   - PDUs with sensor data: ${pdusWithSensorData}`);
    console.log(`[${requestId}]   - PDUs without sensor data: ${combinedData.length - pdusWithSensorData}`);
    console.log(`[${requestId}]   - Data source: NENG API (real)`);
    console.log(`[${requestId}]   - Request timestamp: ${new Date().toISOString()}`);

    // Debug: Log first few PDUs for inspection
    if (combinedData.length > 0) {
      console.log(`[${requestId}] 🔍 DEBUG - First PDU sample:`, {
        id: combinedData[0].id,
        rackId: combinedData[0].rackId,
        name: combinedData[0].name,
        site: combinedData[0].site,
        dc: combinedData[0].dc,
        phase: combinedData[0].phase,
        current: combinedData[0].current,
        temperature: combinedData[0].temperature,
        sensorTemperature: combinedData[0].sensorTemperature,
        sensorHumidity: combinedData[0].sensorHumidity
      });

      // Also log a PDU with sensor data if available
      const pduWithSensor = combinedData.find(pdu => pdu.sensorTemperature != null);
      if (pduWithSensor) {
        console.log(`[${requestId}] 🔍 DEBUG - PDU with sensor data sample:`, {
          id: pduWithSensor.id,
          rackId: pduWithSensor.rackId,
          name: pduWithSensor.name,
          current: pduWithSensor.current,
          sensorTemperature: pduWithSensor.sensorTemperature,
          sensorHumidity: pduWithSensor.sensorHumidity
        });
      }
    }
    
    // Procesar los datos con evaluación de umbrales
    console.log(`[${requestId}] 🔧 Processing data with thresholds evaluation...`);
    const processedData = await processRackData(combinedData, thresholds);
    
    // Manage active critical alerts in database
    await manageActiveCriticalAlerts(processedData, thresholds);
    
    // Agrupar por rackId para formar grupos
    const rackGroups = [];
    const rackMap = new Map();
    
    processedData.forEach(pdu => {
      const rackId = pdu.rackId || pdu.id;
      
      if (!rackMap.has(rackId)) {
        rackMap.set(rackId, []);
      }
      
      rackMap.get(rackId).push(pdu);
    });
    
    // Convertir el Map en arrays
    Array.from(rackMap.values()).forEach(rackGroup => {
      rackGroups.push(rackGroup);
    });
    
    console.log(`[${requestId}] 🏗️ Grouped ${processedData.length} PDUs into ${rackGroups.length} rack groups`);
    
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
    
    console.log(`[${requestId}] ✅ REQUEST COMPLETED - Returning ${rackGroups.length} rack groups`);
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
    console.log('🔍 Fetching global thresholds...');
    
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
    console.log('💾 Updating global thresholds...');
    
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
    console.log(`🔍 Fetching thresholds for rack: ${rackId}`);
    
    const pool = await sql.connect(sqlConfig);
    
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
    
    await pool.close();
    
    const globalThresholds = globalResult.recordset || [];
    const rackSpecificThresholds = rackResult.recordset || [];
    
    console.log(`✅ Found ${globalThresholds.length} global and ${rackSpecificThresholds.length} rack-specific thresholds`);
    
    res.json({
      success: true,
      data: {
        global: globalThresholds,
        rackSpecific: rackSpecificThresholds
      },
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
    
    console.log(`💾 Updating thresholds for rack: ${rackId}`);
    
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
    
    const pool = await sql.connect(sqlConfig);
    let updatedCount = 0;
    
    for (const [key, value] of Object.entries(filteredThresholds)) {
      const result = await pool.request()
        .input('rackId', sql.NVarChar, rackId)
        .input('key', sql.NVarChar, key)
        .input('value', sql.Decimal(18, 4), value)
        .query(`
          MERGE dbo.rack_threshold_overrides AS target
          USING (SELECT @rackId as rack_id, @key as threshold_key, @value as value) AS source
          ON target.rack_id = source.rack_id AND target.threshold_key = source.threshold_key
          WHEN MATCHED THEN
            UPDATE SET value = source.value, updated_at = GETDATE()
          WHEN NOT MATCHED THEN
            INSERT (rack_id, threshold_key, value) VALUES (source.rack_id, source.threshold_key, source.value);
        `);
      
      updatedCount++;
      console.log(`✅ Updated rack-specific threshold: ${rackId}.${key} = ${value}`);
    }
    
    await pool.close();
    
    console.log(`💾 Successfully updated ${updatedCount} rack-specific thresholds`);
    
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
    console.log(`🔄 Resetting thresholds for rack: ${rackId} to global values`);
    
    const pool = await sql.connect(sqlConfig);
    
    const result = await pool.request()
      .input('rackId', sql.NVarChar, rackId)
      .query(`
        DELETE FROM dbo.rack_threshold_overrides WHERE rack_id = @rackId
      `);
    
    await pool.close();
    
    const deletedCount = result.rowsAffected[0];
    console.log(`✅ Deleted ${deletedCount} rack-specific thresholds for ${rackId}`);
    
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
    console.log('📊 Starting alerts export to Excel...');
    
    // Get thresholds for processing
    const thresholds = await fetchThresholdsFromDatabase();
    
    // Fetch current rack data
    if (!process.env.NENG_API_URL || !process.env.NENG_API_KEY) {
      throw new Error('NENG API configuration missing. Please check NENG_API_URL and NENG_API_KEY environment variables.');
    }
    
    const nengResponse = await fetchFromNengApi(
      process.env.NENG_API_URL
    );
    
    if (!nengResponse.success || !nengResponse.data) {
      throw new Error('Failed to fetch current rack data for export');
    }
    
    // Process data with threshold evaluation
    const processedData = await processRackData(Array.isArray(nengResponse.data) ? nengResponse.data : [], thresholds);
    
    // Filter only PDUs with alerts (critical or warning)
    const alertingPdus = processedData.filter(pdu => 
      pdu.status === 'critical' || pdu.status === 'warning'
    );
    
    if (alertingPdus.length === 0) {
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
      { header: 'ID PDU', key: 'id', width: 20 },
      { header: 'ID Rack', key: 'rackId', width: 20 },
      { header: 'Nombre', key: 'name', width: 25 },
      { header: 'País', key: 'country', width: 15 },
      { header: 'Sitio', key: 'site', width: 20 },
      { header: 'Data Center', key: 'dc', width: 15 },
      { header: 'Fase', key: 'phase', width: 15 },
      { header: 'Chain', key: 'chain', width: 12 },
      { header: 'Node', key: 'node', width: 12 },
      { header: 'N° Serie', key: 'serial', width: 15 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Corriente (A)', key: 'current', width: 15 },
      { header: 'Temperatura (°C)', key: 'temperature', width: 18 },
      { header: 'Sensor Temp (°C)', key: 'sensorTemperature', width: 18 },
      { header: 'Sensor Humedad (%)', key: 'sensorHumidity', width: 20 },
      { header: 'Motivos de Alerta', key: 'reasons', width: 50 },
      { header: 'Última Actualización', key: 'lastUpdated', width: 20 }
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
    alertingPdus.forEach(pdu => {
      const row = worksheet.addRow({
        id: pdu.id,
        rackId: pdu.rackId || pdu.id,
        name: pdu.name,
        country: pdu.country,
        site: pdu.site,
        dc: pdu.dc,
        phase: pdu.phase,
        chain: pdu.chain || 'N/A',
        node: pdu.node || 'N/A',
        serial: pdu.serial || 'N/A',
        status: pdu.status === 'critical' ? 'CRÍTICO' : 'ADVERTENCIA',
        current: pdu.current,
        temperature: pdu.temperature,
        sensorTemperature: pdu.sensorTemperature,
        sensorHumidity: pdu.sensorHumidity,
        reasons: (pdu.reasons || []).join(', '),
        lastUpdated: new Date(pdu.lastUpdated).toLocaleString('es-ES')
      });
      
      // Color-code status column
      const statusCell = row.getCell('status');
      if (pdu.status === 'critical') {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF0000' }
        };
        statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else if (pdu.status === 'warning') {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFF00' }
        };
        statusCell.font = { color: { argb: 'FF000000' }, bold: true };
      }
    });
    
    // Auto-fit columns
    worksheet.columns.forEach(column => {
      if (column.key === 'reasons') {
        column.width = 60; // Keep reasons column wide
      }
    });
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `alertas_activas_${timestamp}.xlsx`;
    const filepath = path.join(__dirname, 'exports', filename);

    // Ensure exports directory exists
    const exportsDir = path.dirname(filepath);
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    // Write the Excel file
    await workbook.xlsx.writeFile(filepath);
    
    console.log(`✅ Excel export completed: ${filename} (${alertingPdus.length} alerts)`);
    
    res.json({
      success: true,
      message: 'Alerts exported successfully to Excel',
      filename: filename,
      count: alertingPdus.length,
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
  console.error('🚨 Unhandled error:', err);
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
process.on('SIGTERM', () => {
  console.log('⏹️ SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('⏹️ SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

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