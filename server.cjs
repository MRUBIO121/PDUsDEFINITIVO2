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
    logger.debug('Establishing database connection');
    globalPool = await sql.connect(sqlConfig);

    // Set up connection event handlers
    globalPool.on('error', (err) => {
      // Database pool error logged by winston
      logger.error('Database pool error', { error: err.message });
      globalPool = null;
    });

    logger.debug('Database connection established');
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
        logger.warn('Database connection error, retrying', { attempt: attempt + 1, maxRetries: retries + 1, error: error.message });

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
    logger.debug('Database initialization complete');
  } catch (error) {
    // Database initialization failed logged by winston
    logger.error('Database initialization failed', { error: error.message });
  }
}

initializeDatabaseConnection();

// SONAR API Configuration
const SONAR_CONFIG = {
  apiUrl: process.env.SONAR_API_URL,
  bearerToken: process.env.SONAR_BEARER_TOKEN,
  enabled: !!(process.env.SONAR_API_URL && process.env.SONAR_BEARER_TOKEN),
  skipSslVerify: process.env.SONAR_SKIP_SSL_VERIFY === 'true'
};

const https = require('https');
const http = require('http');

const httpsAgent = new https.Agent({
  rejectUnauthorized: !SONAR_CONFIG.skipSslVerify
});

function makeHttpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      agent: isHttps ? httpsAgent : undefined,
      timeout: 30000
    };

    logger.info('[SONAR] HTTP Request starting', {
      url,
      method: requestOptions.method,
      hostname: requestOptions.hostname,
      port: requestOptions.port,
      path: requestOptions.path,
      isHttps,
      bodyLength: body?.length || 0
    });

    const req = requestModule.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        logger.info('[SONAR] HTTP Response received', {
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          responseLength: data.length,
          responsePreview: data.substring(0, 500)
        });
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          text: async () => data,
          json: async () => JSON.parse(data)
        });
      });
    });

    req.on('error', (error) => {
      logger.error('[SONAR] HTTP Request error', {
        url,
        error: error.message,
        code: error.code,
        stack: error.stack
      });
      reject(error);
    });

    req.on('timeout', () => {
      logger.error('[SONAR] HTTP Request timeout', { url });
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

if (SONAR_CONFIG.enabled) {
  const tokenPreview = SONAR_CONFIG.bearerToken ?
    `${SONAR_CONFIG.bearerToken.substring(0, 10)}...${SONAR_CONFIG.bearerToken.substring(SONAR_CONFIG.bearerToken.length - 5)}` :
    'NOT SET';
  logger.info('SONAR integration enabled', {
    url: SONAR_CONFIG.apiUrl,
    tokenPreview: tokenPreview,
    tokenLength: SONAR_CONFIG.bearerToken?.length || 0,
    skipSslVerify: SONAR_CONFIG.skipSslVerify
  });
  if (SONAR_CONFIG.skipSslVerify) {
    logger.warn('SONAR SSL verification disabled - accepting self-signed certificates');
  }
} else {
  logger.warn('SONAR integration disabled - missing SONAR_API_URL or SONAR_BEARER_TOKEN', {
    hasUrl: !!process.env.SONAR_API_URL,
    hasToken: !!process.env.SONAR_BEARER_TOKEN
  });
}

// Store for tracking SONAR errors per rack (in-memory cache)
const sonarErrorCache = new Map();

/**
 * Send alert to SONAR API (open or close)
 * @param {Object} alertData - Alert data to send
 * @param {string} state - 'OPEN' or 'CLOSED'
 * @returns {Promise<{success: boolean, uuid?: string, error?: string}>}
 */
async function sendToSonar(alertData, state) {
  logger.info('[SONAR] Starting sendToSonar', {
    state,
    pdu_id: alertData.pdu_id || alertData.PID,
    rack_name: alertData.name || alertData.rack_id
  });

  if (!SONAR_CONFIG.enabled) {
    logger.warn('[SONAR] Integration disabled, skipping API call');
    return { success: false, error: 'SONAR integration disabled' };
  }

  try {
    const rackName = alertData.name || alertData.rack_id || 'UNKNOWN';
    const alertIdentifier = `ALERTA_${rackName}`;

    let payload;

    if (state === 'CLOSED') {
      payload = {
        pid: alertIdentifier,
        state: 'CLOSED',
        origin: 'NGEN_ALERT'
      };
    } else {
      payload = {
        pid: alertIdentifier,
        state: state,
        impactedentity: 'LOGICAL_ENGINE',
        problemimpact: 'APPLICATION',
        origin: 'NGEN_ALERT',
        entity: 'SGT',
        problemdetailstext: alertIdentifier,
        problemtitle: alertIdentifier,
        problemdetailsjson: {
          rack_id: alertData.rack_id || '',
          name: alertData.name || '',
          country: alertData.country || '',
          site: alertData.site || '',
          dc: alertData.dc || '',
          phase: alertData.phase || '',
          chain: alertData.chain || '',
          node: alertData.node || '',
          serial: alertData.serial || '',
          alert_reason: alertData.alert_reason || '',
          amperaje: alertData.current != null ? alertData.current : 0,
          voltage: alertData.voltage != null ? alertData.voltage : 0,
          temperature: alertData.temperature != null ? alertData.temperature : 'N/A',
          humidity: alertData.humidity != null ? alertData.humidity : 'N/A',
          gwName: alertData.gwName || 'N/A',
          gwIp: alertData.gwIp || 'N/A'
        }
      };
    }

    logger.info('[SONAR] Preparing request', {
      url: SONAR_CONFIG.apiUrl,
      method: 'POST',
      state,
      pid: alertIdentifier,
      payloadSize: JSON.stringify(payload).length
    });

    logger.info('[SONAR] Full payload being sent', { payload: JSON.stringify(payload) });

    const response = await makeHttpsRequest(
      SONAR_CONFIG.apiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SONAR_CONFIG.bearerToken}`
        }
      },
      JSON.stringify(payload)
    );

    logger.info('[SONAR] Response received', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[SONAR] API returned error', {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText
      });
      throw new Error(`SONAR API error: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();
    const uuid = responseData.reason;

    logger.info('[SONAR] Response parsed', {
      responseData: JSON.stringify(responseData),
      uuid: uuid || 'NO_UUID'
    });

    if (uuid) {
      logger.info('[SONAR] SUCCESS - Alert sent', {
        state,
        uuid,
        pid: alertIdentifier,
        pdu_id: alertData.pdu_id || alertData.PID
      });
      return { success: true, uuid };
    } else {
      logger.warn('[SONAR] Response missing UUID in reason field', { responseData });
      return { success: true, uuid: null };
    }

  } catch (error) {
    logger.error('[SONAR] FAILED - API call error', {
      error: error.message,
      stack: error.stack,
      state,
      pdu_id: alertData.pdu_id || alertData.PID,
      url: SONAR_CONFIG.apiUrl
    });
    return { success: false, error: error.message };
  }
}

/**
 * Open alert in SONAR and save UUID to database
 * @param {Object} pdu - PDU data
 * @param {string} alertReason - Alert reason
 * @param {number} alertId - Database alert ID
 * @returns {Promise<{success: boolean, uuid?: string, error?: string}>}
 */
async function openSonarAlert(pdu, alertReason, alertId) {
  const pduIdStr = String(pdu.id);
  const rackIdStr = String(pdu.rackId || pdu.id);

  const currentValue = parseFloat(pdu.current) || 0;
  const voltageValue = parseFloat(pdu.voltage) || 0;
  const tempValue = (pdu.sensorTemperature !== 'N/A' && pdu.sensorTemperature != null)
    ? parseFloat(pdu.sensorTemperature)
    : ((pdu.temperature != null) ? parseFloat(pdu.temperature) : null);
  const humidityValue = (pdu.sensorHumidity !== 'N/A' && pdu.sensorHumidity != null)
    ? parseFloat(pdu.sensorHumidity)
    : null;

  logger.info('[SONAR] openSonarAlert called', {
    pdu_id: pduIdStr,
    rack_id: rackIdStr,
    name: pdu.name,
    alertReason,
    alertId,
    pdu_current: pdu.current,
    pdu_voltage: pdu.voltage,
    pdu_sensorTemperature: pdu.sensorTemperature,
    pdu_sensorHumidity: pdu.sensorHumidity,
    pdu_gwName: pdu.gwName,
    pdu_gwIp: pdu.gwIp,
    parsed_current: currentValue,
    parsed_voltage: voltageValue,
    parsed_temperature: tempValue,
    parsed_humidity: humidityValue
  });

  const alertData = {
    pdu_id: pduIdStr,
    rack_id: rackIdStr,
    name: pdu.name,
    country: pdu.country,
    site: pdu.site,
    dc: pdu.dc,
    phase: pdu.phase,
    chain: pdu.chain,
    node: pdu.node,
    serial: pdu.serial,
    alert_reason: alertReason,
    current: currentValue,
    voltage: voltageValue,
    temperature: tempValue,
    humidity: humidityValue,
    gwName: pdu.gwName && pdu.gwName !== '' ? pdu.gwName : 'N/A',
    gwIp: pdu.gwIp && pdu.gwIp !== '' ? pdu.gwIp : 'N/A'
  };

  const result = await sendToSonar(alertData, 'OPEN');

  if (result.success && result.uuid) {
    try {
      await executeQuery(async (pool) => {
        await pool.request()
          .input('uuid_open', sql.NVarChar, result.uuid)
          .input('alert_id', sql.UniqueIdentifier, alertId)
          .query(`
            UPDATE active_critical_alerts
            SET uuid_open = @uuid_open
            WHERE id = @alert_id
          `);
      });
      sonarErrorCache.delete(rackIdStr);
      logger.info('[SONAR] UUID_OPEN saved to database', { alertId, uuid: result.uuid, pdu_id: pduIdStr });
    } catch (dbError) {
      logger.error('[SONAR] Failed to save UUID_OPEN to database', { alertId, error: dbError.message });
    }
  } else if (!result.success) {
    sonarErrorCache.set(rackIdStr, {
      error: result.error,
      timestamp: new Date(),
      alertReason
    });
    logger.warn('[SONAR] Alert open failed, cached error', { pdu_id: pduIdStr, error: result.error });
  }

  return result;
}

/**
 * Close alert in SONAR and save UUID to database
 * @param {Object} alert - Alert data from database
 * @returns {Promise<{success: boolean, uuid?: string, error?: string}>}
 */
async function closeSonarAlert(alert) {
  logger.info('[SONAR] closeSonarAlert called', {
    pdu_id: alert.pdu_id,
    rack_id: alert.rack_id,
    name: alert.name,
    uuid_open: alert.uuid_open,
    alert_id: alert.id
  });

  if (!alert.uuid_open) {
    logger.warn('[SONAR] No UUID_OPEN for alert, skipping SONAR close', { pdu_id: alert.pdu_id, alert_id: alert.id });
    return { success: false, error: 'No UUID_OPEN to close' };
  }

  const alertData = {
    pdu_id: alert.pdu_id,
    rack_id: alert.rack_id,
    name: alert.name,
    country: alert.country,
    site: alert.site,
    dc: alert.dc,
    uuid_open: alert.uuid_open,
    alert_reason: alert.alert_reason
  };

  const result = await sendToSonar(alertData, 'CLOSED');

  if (result.success && result.uuid) {
    try {
      await executeQuery(async (pool) => {
        await pool.request()
          .input('uuid_closed', sql.NVarChar, result.uuid)
          .input('alert_id', sql.UniqueIdentifier, alert.id)
          .query(`
            UPDATE active_critical_alerts
            SET uuid_closed = @uuid_closed
            WHERE id = @alert_id
          `);
      });
      sonarErrorCache.delete(alert.rack_id);
      logger.info('[SONAR] UUID_CLOSED saved to database', { alertId: alert.id, uuid: result.uuid, pdu_id: alert.pdu_id });
    } catch (dbError) {
      logger.error('[SONAR] Failed to save UUID_CLOSED to database', { alertId: alert.id, error: dbError.message });
    }
  } else if (!result.success) {
    sonarErrorCache.set(alert.rack_id, {
      error: result.error,
      timestamp: new Date(),
      type: 'close_failed'
    });
    logger.warn('[SONAR] Alert close failed, cached error', { pdu_id: alert.pdu_id, error: result.error });
  }

  return result;
}

/**
 * Get SONAR error for a specific rack
 * @param {string} rackId - Rack ID
 * @returns {Object|null} Error info or null
 */
function getSonarError(rackId) {
  return sonarErrorCache.get(rackId) || null;
}

/**
 * Get all SONAR errors
 * @returns {Object} Map of rack IDs to error info
 */
function getAllSonarErrors() {
  return Object.fromEntries(sonarErrorCache);
}

/**
 * Send existing alerts without uuid_open to SONAR on startup
 * This ensures all active critical alerts are registered in SONAR
 * @returns {Promise<{sent: number, errors: number, skipped: number}>}
 */
async function sendExistingAlertsToSonar() {
  if (!SONAR_CONFIG.enabled) {
    logger.info('[SONAR] STARTUP: Integration disabled, skipping existing alerts sync');
    return { sent: 0, errors: 0, skipped: 0 };
  }

  logger.info('[SONAR] STARTUP: Checking for existing alerts without uuid_open');

  try {
    const alertsResult = await executeQuery(async (pool) => {
      return await pool.request().query(`
        SELECT id, pdu_id, rack_id, name, country, site, dc, phase, chain, node, serial,
               metric_type, alert_reason, alert_value, alert_field, threshold_exceeded,
               alert_started_at
        FROM active_critical_alerts
        WHERE uuid_open IS NULL
        ORDER BY alert_started_at ASC
      `);
    });

    const alerts = alertsResult.recordset;

    if (alerts.length === 0) {
      logger.info('[SONAR] STARTUP: No existing alerts without uuid_open found');
      return { sent: 0, errors: 0, skipped: 0 };
    }

    logger.info('[SONAR] STARTUP: Found alerts to send to SONAR', {
      count: alerts.length,
      alerts: alerts.map(a => ({ id: a.id, name: a.name, reason: a.alert_reason }))
    });

    let sent = 0;
    let errors = 0;
    let skipped = 0;

    for (const alert of alerts) {
      try {
        const pduData = {
          id: alert.pdu_id,
          rackId: alert.rack_id,
          name: alert.name,
          country: alert.country,
          site: alert.site,
          dc: alert.dc,
          phase: alert.phase,
          chain: alert.chain,
          node: alert.node,
          serial: alert.serial,
          current: alert.alert_field === 'current' ? alert.alert_value : 0,
          voltage: alert.alert_field === 'voltage' ? alert.alert_value : 0,
          sensorTemperature: alert.alert_field === 'temperature' ? alert.alert_value : null,
          sensorHumidity: alert.alert_field === 'humidity' ? alert.alert_value : null,
          gwName: 'N/A',
          gwIp: 'N/A'
        };

        logger.info('[SONAR] STARTUP: Sending existing alert to SONAR', {
          alertId: alert.id,
          name: alert.name,
          reason: alert.alert_reason,
          pdu_id: alert.pdu_id
        });

        const result = await sendToSonar({
          pdu_id: alert.pdu_id,
          rack_id: alert.rack_id,
          name: alert.name,
          country: alert.country,
          site: alert.site,
          dc: alert.dc,
          phase: alert.phase,
          chain: alert.chain,
          node: alert.node,
          serial: alert.serial,
          alert_reason: alert.alert_reason,
          current: pduData.current,
          voltage: pduData.voltage,
          temperature: pduData.sensorTemperature,
          humidity: pduData.sensorHumidity,
          gwName: pduData.gwName,
          gwIp: pduData.gwIp
        }, 'OPEN');

        if (result.success && result.uuid) {
          await executeQuery(async (pool) => {
            await pool.request()
              .input('uuid_open', sql.NVarChar, result.uuid)
              .input('alert_id', sql.UniqueIdentifier, alert.id)
              .query(`
                UPDATE active_critical_alerts
                SET uuid_open = @uuid_open
                WHERE id = @alert_id
              `);
          });
          sonarErrorCache.delete(alert.rack_id);
          logger.info('[SONAR] STARTUP: Alert sent and uuid_open saved', {
            alertId: alert.id,
            uuid: result.uuid,
            name: alert.name
          });
          sent++;
        } else if (result.success) {
          logger.warn('[SONAR] STARTUP: Alert sent but no UUID received', {
            alertId: alert.id,
            name: alert.name
          });
          skipped++;
        } else {
          sonarErrorCache.set(alert.rack_id, {
            error: result.error,
            timestamp: new Date(),
            alertReason: alert.alert_reason
          });
          logger.error('[SONAR] STARTUP: Failed to send alert', {
            alertId: alert.id,
            name: alert.name,
            error: result.error
          });
          errors++;
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        logger.error('[SONAR] STARTUP: Error processing alert', {
          alertId: alert.id,
          error: err.message
        });
        errors++;
      }
    }

    logger.info('[SONAR] STARTUP: Completed sending existing alerts', {
      sent,
      errors,
      skipped,
      total: alerts.length
    });

    return { sent, errors, skipped };
  } catch (error) {
    logger.error('[SONAR] STARTUP: Failed to query existing alerts', {
      error: error.message
    });
    return { sent: 0, errors: 0, skipped: 0 };
  }
}

/**
 * Close SONAR alerts for a rack when it enters maintenance
 * @param {string} rackId - Rack ID
 * @returns {Promise<{closed: number, errors: number}>}
 */
async function closeSonarAlertsForMaintenance(rackId) {
  if (!SONAR_CONFIG.enabled) {
    return { closed: 0, errors: 0 };
  }

  try {
    const alerts = await executeQuery(async (pool) => {
      return await pool.request()
        .input('rack_id', sql.NVarChar, rackId)
        .query(`
          SELECT id, pdu_id, rack_id, name, country, site, dc, alert_reason, uuid_open
          FROM active_critical_alerts
          WHERE (rack_id = @rack_id OR pdu_id = @rack_id) AND uuid_open IS NOT NULL AND uuid_closed IS NULL
        `);
    });

    let closed = 0;
    let errors = 0;

    for (const alert of alerts.recordset) {
      try {
        const result = await closeSonarAlert(alert);
        if (result.success) {
          closed++;
        } else {
          errors++;
        }
      } catch (err) {
        logger.error('Failed to close SONAR alert for maintenance', { rackId, alertId: alert.id, error: err.message });
        errors++;
      }
    }

    if (closed > 0) {
      logger.info(`Closed ${closed} SONAR alerts for rack entering maintenance`, { rackId });
    }

    return { closed, errors };
  } catch (error) {
    logger.error('Error closing SONAR alerts for maintenance', { rackId, error: error.message });
    return { closed: 0, errors: 1 };
  }
}

/**
 * Close SONAR alerts for multiple racks when entering maintenance
 * @param {string[]} rackIds - Array of rack IDs
 * @returns {Promise<{closed: number, errors: number}>}
 */
async function closeSonarAlertsForMaintenanceBatch(rackIds) {
  if (!SONAR_CONFIG.enabled || !rackIds || rackIds.length === 0) {
    return { closed: 0, errors: 0 };
  }

  let totalClosed = 0;
  let totalErrors = 0;

  for (const rackId of rackIds) {
    const result = await closeSonarAlertsForMaintenance(rackId);
    totalClosed += result.closed;
    totalErrors += result.errors;
  }

  return { closed: totalClosed, errors: totalErrors };
}

/**
 * Get rack IDs that have alerts sent to SONAR (uuid_open exists and not closed)
 * @returns {Promise<Set<string>>}
 */
async function getRacksWithSonarAlerts() {
  try {
    const result = await executeQuery(async (pool) => {
      return await pool.request().query(`
        SELECT DISTINCT rack_id
        FROM active_critical_alerts
        WHERE uuid_open IS NOT NULL AND uuid_closed IS NULL
      `);
    });
    return new Set(result.recordset.map(r => r.rack_id));
  } catch (error) {
    logger.error('Error fetching racks with SONAR alerts', { error: error.message });
    return new Set();
  }
}

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
  logger.debug('Serving static files from dist folder');
  app.use(express.static(distPath));
}

// Morgan logging middleware (debug level to reduce noise)
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.debug(message.trim())
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

// Helper function to check if user has access to a site (handles Cantabria unification)
function userHasAccessToSiteMaintenance(userSites, siteName) {
  if (!userSites || !Array.isArray(userSites) || userSites.length === 0) {
    return true;
  }
  if (!siteName || siteName === 'Unknown') {
    return false;
  }
  if (userSites.includes(siteName)) {
    return true;
  }
  const normalizedSite = siteName.toLowerCase().includes('cantabria') ? 'Cantabria' : siteName;
  if (normalizedSite === 'Cantabria') {
    return userSites.some(assignedSite =>
      assignedSite.toLowerCase().includes('cantabria')
    );
  }
  return false;
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
      logger.error('NENG API timeout', { timeout: apiTimeout });
      throw new Error(`API request timeout after ${apiTimeout}ms`);
    }

    logger.error('NENG API error', { error: error.message });
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
      logger.debug('Voltage thresholds loaded from database', { count: voltageThresholds.length });
    } else {
      logger.error('No voltage thresholds found in database');
    }

    // Update cache
    thresholdsCache.data = thresholds;
    thresholdsCache.timestamp = Date.now();

    return thresholds;

  } catch (error) {
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
      const rackIdsList = rackIds.map(id => `'${String(id).replace("'", "''")}'`).join(',');

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

    return rackThresholdsMap;
  } catch (error) {
    logger.error('Error loading rack-specific thresholds', { error: error.message });
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
    logger.debug('Voltage alerts detected', {
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
    logger.error('Error fetching maintenance racks', { error: error.message });
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
    logger.error('Error fetching maintenance chains', { error: error.message });
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
 * Guarda un registro en el historial de alertas
 * Se llama cuando se crea una nueva alerta o cuando se resuelve
 */
async function saveAlertToHistory(alertData, resolvedBy = null, resolutionType = 'auto') {
  try {
    await executeQuery(async (pool) => {
      if (resolvedBy) {
        await pool.request()
          .input('pdu_id', sql.NVarChar, String(alertData.pdu_id))
          .input('metric_type', sql.NVarChar, alertData.metric_type)
          .input('alert_reason', sql.NVarChar, alertData.alert_reason)
          .input('resolved_at', sql.DateTime, new Date())
          .input('resolved_by', sql.NVarChar, resolvedBy)
          .input('resolution_type', sql.NVarChar, resolutionType)
          .query(`
            UPDATE alerts_history
            SET resolved_at = @resolved_at,
                resolved_by = @resolved_by,
                resolution_type = @resolution_type,
                duration_minutes = DATEDIFF(MINUTE, created_at, @resolved_at)
            WHERE pdu_id = @pdu_id
              AND metric_type = @metric_type
              AND alert_reason = @alert_reason
              AND resolved_at IS NULL
          `);
      } else {
        await pool.request()
          .input('pdu_id', sql.NVarChar, String(alertData.pdu_id))
          .input('rack_id', sql.NVarChar, String(alertData.rack_id))
          .input('name', sql.NVarChar, alertData.name)
          .input('country', sql.NVarChar, alertData.country)
          .input('site', sql.NVarChar, alertData.site)
          .input('dc', sql.NVarChar, alertData.dc)
          .input('phase', sql.NVarChar, alertData.phase)
          .input('chain', sql.NVarChar, alertData.chain)
          .input('node', sql.NVarChar, alertData.node)
          .input('serial', sql.NVarChar, alertData.serial)
          .input('metric_type', sql.NVarChar, alertData.metric_type)
          .input('alert_reason', sql.NVarChar, alertData.alert_reason)
          .input('alert_value', sql.Decimal(18, 4), alertData.alert_value)
          .input('alert_field', sql.NVarChar, alertData.alert_field)
          .input('threshold_exceeded', sql.Decimal(18, 4), alertData.threshold_exceeded)
          .query(`
            INSERT INTO alerts_history
            (pdu_id, rack_id, name, country, site, dc, phase, chain, node, serial,
             metric_type, alert_reason, alert_value, alert_field, threshold_exceeded)
            VALUES
            (@pdu_id, @rack_id, @name, @country, @site, @dc, @phase, @chain, @node, @serial,
             @metric_type, @alert_reason, @alert_value, @alert_field, @threshold_exceeded)
          `);
      }
    });
  } catch (error) {
    logger.error('Error saving alert to history', { error: error.message, pdu_id: alertData.pdu_id });
  }
}

/**
 * Guarda registros de mantenimiento en el historial
 * Se llama cuando un rack o chain sale de mantenimiento
 */
async function saveMaintenanceToHistory(pool, entryId, endedBy) {
  try {
    const dataResult = await pool.request()
      .input('entry_id', sql.UniqueIdentifier, entryId)
      .query(`
        SELECT
          me.id as original_entry_id,
          me.entry_type,
          me.reason,
          me.started_by,
          me.started_at,
          mrd.rack_id,
          mrd.name as rack_name,
          mrd.country,
          mrd.site,
          mrd.dc,
          mrd.phase,
          mrd.chain,
          mrd.node,
          mrd.gwName,
          mrd.gwIp
        FROM maintenance_entries me
        JOIN maintenance_rack_details mrd ON me.id = mrd.maintenance_entry_id
        WHERE me.id = @entry_id
      `);

    for (const row of dataResult.recordset) {
      await pool.request()
        .input('original_entry_id', sql.UniqueIdentifier, row.original_entry_id)
        .input('entry_type', sql.NVarChar, row.entry_type)
        .input('rack_id', sql.NVarChar, String(row.rack_id))
        .input('rack_name', sql.NVarChar, row.rack_name)
        .input('country', sql.NVarChar, row.country)
        .input('site', sql.NVarChar, row.site)
        .input('dc', sql.NVarChar, row.dc)
        .input('phase', sql.NVarChar, row.phase)
        .input('chain', sql.NVarChar, row.chain)
        .input('node', sql.NVarChar, row.node)
        .input('gwName', sql.NVarChar, row.gwName)
        .input('gwIp', sql.NVarChar, row.gwIp)
        .input('reason', sql.NVarChar, row.reason)
        .input('started_by', sql.NVarChar, row.started_by)
        .input('started_at', sql.DateTime, row.started_at)
        .input('ended_by', sql.NVarChar, endedBy)
        .input('ended_at', sql.DateTime, new Date())
        .query(`
          INSERT INTO maintenance_history
          (original_entry_id, entry_type, rack_id, rack_name, country, site, dc, phase, chain, node, gwName, gwIp,
           reason, started_by, ended_by, started_at, ended_at, duration_minutes)
          VALUES
          (@original_entry_id, @entry_type, @rack_id, @rack_name, @country, @site, @dc, @phase, @chain, @node, @gwName, @gwIp,
           @reason, @started_by, @ended_by, @started_at, @ended_at, DATEDIFF(MINUTE, @started_at, @ended_at))
        `);
    }

    logger.info(`Saved ${dataResult.recordset.length} racks to maintenance history for entry ${entryId}`);
  } catch (error) {
    logger.error('Error saving maintenance to history', { error: error.message, entryId });
  }
}

/**
 * Guarda un rack individual en el historial de mantenimiento
 */
async function saveRackMaintenanceToHistory(pool, rackId, endedBy) {
  try {
    const dataResult = await pool.request()
      .input('rack_id', sql.NVarChar, rackId)
      .query(`
        SELECT
          me.id as original_entry_id,
          me.entry_type,
          me.reason,
          me.started_by,
          me.started_at,
          mrd.rack_id,
          mrd.name as rack_name,
          mrd.country,
          mrd.site,
          mrd.dc,
          mrd.phase,
          mrd.chain,
          mrd.node,
          mrd.gwName,
          mrd.gwIp
        FROM maintenance_rack_details mrd
        JOIN maintenance_entries me ON mrd.maintenance_entry_id = me.id
        WHERE mrd.rack_id = @rack_id
      `);

    if (dataResult.recordset.length > 0) {
      const row = dataResult.recordset[0];
      await pool.request()
        .input('original_entry_id', sql.UniqueIdentifier, row.original_entry_id)
        .input('entry_type', sql.NVarChar, row.entry_type)
        .input('rack_id', sql.NVarChar, String(row.rack_id))
        .input('rack_name', sql.NVarChar, row.rack_name)
        .input('country', sql.NVarChar, row.country)
        .input('site', sql.NVarChar, row.site)
        .input('dc', sql.NVarChar, row.dc)
        .input('phase', sql.NVarChar, row.phase)
        .input('chain', sql.NVarChar, row.chain)
        .input('node', sql.NVarChar, row.node)
        .input('gwName', sql.NVarChar, row.gwName)
        .input('gwIp', sql.NVarChar, row.gwIp)
        .input('reason', sql.NVarChar, row.reason)
        .input('started_by', sql.NVarChar, row.started_by)
        .input('started_at', sql.DateTime, row.started_at)
        .input('ended_by', sql.NVarChar, endedBy)
        .input('ended_at', sql.DateTime, new Date())
        .query(`
          INSERT INTO maintenance_history
          (original_entry_id, entry_type, rack_id, rack_name, country, site, dc, phase, chain, node, gwName, gwIp,
           reason, started_by, ended_by, started_at, ended_at, duration_minutes)
          VALUES
          (@original_entry_id, @entry_type, @rack_id, @rack_name, @country, @site, @dc, @phase, @chain, @node, @gwName, @gwIp,
           @reason, @started_by, @ended_by, @started_at, @ended_at, DATEDIFF(MINUTE, @started_at, @ended_at))
        `);

      logger.info(`Saved rack ${rackId} to maintenance history`);
    }
  } catch (error) {
    logger.error('Error saving rack maintenance to history', { error: error.message, rackId });
  }
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

    logger.info('[SONAR] === ALERT PROCESSING CYCLE START ===', {
      totalPdus: allPdus.length,
      criticalPdus: currentCriticalPdus.length,
      maintenanceRacks: maintenanceRackIds.size,
      SONAR_ENABLED: SONAR_CONFIG.enabled,
      SONAR_URL: SONAR_CONFIG.apiUrl || 'NOT_SET',
      SONAR_TOKEN_LENGTH: SONAR_CONFIG.bearerToken?.length || 0
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
              logger.error('Error processing critical alert', { pdu_id: pdu.id, error: alertError.message });
            }
          }
        }
      }

      // Small delay between batches to avoid overwhelming the database
      if (i + BATCH_SIZE < currentCriticalPdus.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logger.debug('Alerts processed', { count: processedCount, errors: errorCount });

    // Clean up resolved alerts
    try {
      await cleanupResolvedAlerts(currentCriticalPdus);
    } catch (cleanupError) {
      logger.error('Error during alert cleanup', { error: cleanupError.message });
    }

  } catch (error) {
    logger.error('Error managing active critical alerts', { error: error.message });
  }
}

/**
 * Processes a single critical alert for a PDU
 */
async function processCriticalAlert(pdu, reason, thresholds) {
  try {
    const pduIdStr = String(pdu.id);
    const rackIdStr = String(pdu.rackId || pdu.id);

    const metricInfo = extractMetricInfo(reason, pdu, thresholds);

    if (!metricInfo) {
      logger.debug('Could not extract metric from reason', { reason });
      return;
    }

    const { metricType, alertField, alertValue, thresholdExceeded } = metricInfo;

    await executeQuery(async (pool) => {
      const existingAlert = await pool.request()
        .input('pdu_id', sql.NVarChar, pduIdStr)
        .input('metric_type', sql.NVarChar, metricType)
        .input('alert_reason', sql.NVarChar, reason)
        .query(`
          SELECT id FROM active_critical_alerts
          WHERE pdu_id = @pdu_id AND metric_type = @metric_type AND alert_reason = @alert_reason
        `);

      if (existingAlert.recordset.length > 0) {
        logger.info('[SONAR] Alert already exists, updating values only', {
          pdu_id: pduIdStr,
          rack_id: rackIdStr,
          name: pdu.name,
          reason,
          existing_alert_id: existingAlert.recordset[0].id
        });
        await pool.request()
          .input('pdu_id', sql.NVarChar, pduIdStr)
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
        const insertResult = await pool.request()
          .input('pdu_id', sql.NVarChar, pduIdStr)
          .input('rack_id', sql.NVarChar, rackIdStr)
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
            OUTPUT INSERTED.id
            VALUES
            (@pdu_id, @rack_id, @name, @country, @site, @dc, @phase, @chain, @node, @serial,
             @metric_type, @alert_reason, @alert_value, @alert_field, @threshold_exceeded)
          `);

        const insertedAlertId = insertResult.recordset[0]?.id;

        logger.info('[SONAR] NEW ALERT INSERTED - checking if should send to SONAR', {
          insertedAlertId,
          pdu_id: pduIdStr,
          rack_id: rackIdStr,
          name: pdu.name,
          reason,
          SONAR_ENABLED: SONAR_CONFIG.enabled,
          SONAR_URL: SONAR_CONFIG.apiUrl || 'NOT_SET',
          SONAR_TOKEN_SET: !!SONAR_CONFIG.bearerToken,
          willCallSonar: !!(insertedAlertId && SONAR_CONFIG.enabled)
        });

        if (insertedAlertId && SONAR_CONFIG.enabled) {
          logger.info('[SONAR] CALLING openSonarAlert NOW', { insertedAlertId, pdu_id: pduIdStr, reason });
          openSonarAlert(pdu, reason, insertedAlertId).catch(err => {
            logger.error('[SONAR] Failed to send alert to SONAR', { error: err.message, pdu_id: pduIdStr });
          });
        } else {
          logger.warn('[SONAR] NOT calling SONAR', {
            reason: !insertedAlertId ? 'NO_INSERTED_ID' : 'SONAR_DISABLED',
            insertedAlertId,
            SONAR_ENABLED: SONAR_CONFIG.enabled
          });
        }

        await saveAlertToHistory({
          pdu_id: pduIdStr,
          rack_id: rackIdStr,
          name: pdu.name,
          country: pdu.country,
          site: pdu.site,
          dc: pdu.dc,
          phase: pdu.phase,
          chain: pdu.chain,
          node: pdu.node,
          serial: pdu.serial,
          metric_type: metricType,
          alert_reason: reason,
          alert_value: alertValue,
          alert_field: alertField,
          threshold_exceeded: thresholdExceeded
        });
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
 * Also marks them as resolved in alerts_history
 */
async function cleanupResolvedAlerts(currentCriticalPdus) {
  try {
    await executeQuery(async (pool) => {
      const currentCriticalPduIds = currentCriticalPdus.map(pdu => pdu.id);

      if (currentCriticalPduIds.length === 0) {
        const alertsToResolve = await pool.request().query(`
          SELECT id, pdu_id, rack_id, name, country, site, dc, metric_type, alert_reason, uuid_open, uuid_closed
          FROM active_critical_alerts
        `);

        for (const alert of alertsToResolve.recordset) {
          let uuidClosed = alert.uuid_closed;
          if (SONAR_CONFIG.enabled && alert.uuid_open) {
            const sonarResult = await closeSonarAlert(alert).catch(err => {
              logger.error('Failed to close alert in SONAR', { error: err.message, pdu_id: alert.pdu_id });
              return { success: false };
            });
            if (sonarResult && sonarResult.uuid) {
              uuidClosed = sonarResult.uuid;
            }
          }

          await pool.request()
            .input('pdu_id', sql.NVarChar, String(alert.pdu_id))
            .input('metric_type', sql.NVarChar, alert.metric_type)
            .input('alert_reason', sql.NVarChar, alert.alert_reason)
            .input('resolved_at', sql.DateTime, new Date())
            .input('uuid_open', sql.NVarChar, alert.uuid_open || null)
            .input('uuid_closed', sql.NVarChar, uuidClosed || null)
            .query(`
              UPDATE alerts_history
              SET resolved_at = @resolved_at,
                  resolved_by = 'Sistema',
                  resolution_type = 'auto',
                  duration_minutes = DATEDIFF(MINUTE, created_at, @resolved_at),
                  uuid_open = @uuid_open,
                  uuid_closed = @uuid_closed
              WHERE pdu_id = @pdu_id
                AND metric_type = @metric_type
                AND alert_reason = @alert_reason
                AND resolved_at IS NULL
            `);
        }

        const deleteResult = await pool.request().query(`
          DELETE FROM active_critical_alerts
        `);
        return deleteResult;
      }

      const pduIdsList = currentCriticalPduIds.map(id => `'${String(id).replace("'", "''")}'`).join(',');

      const alertsToResolve = await pool.request().query(`
        SELECT id, pdu_id, rack_id, name, country, site, dc, metric_type, alert_reason, uuid_open, uuid_closed
        FROM active_critical_alerts
        WHERE pdu_id NOT IN (${pduIdsList})
      `);

      for (const alert of alertsToResolve.recordset) {
        let uuidClosed = alert.uuid_closed;
        if (SONAR_CONFIG.enabled && alert.uuid_open) {
          const sonarResult = await closeSonarAlert(alert).catch(err => {
            logger.error('Failed to close alert in SONAR', { error: err.message, pdu_id: alert.pdu_id });
            return { success: false };
          });
          if (sonarResult && sonarResult.uuid) {
            uuidClosed = sonarResult.uuid;
          }
        }

        await pool.request()
          .input('pdu_id', sql.NVarChar, String(alert.pdu_id))
          .input('metric_type', sql.NVarChar, alert.metric_type)
          .input('alert_reason', sql.NVarChar, alert.alert_reason)
          .input('resolved_at', sql.DateTime, new Date())
          .input('uuid_open', sql.NVarChar, alert.uuid_open || null)
          .input('uuid_closed', sql.NVarChar, uuidClosed || null)
          .query(`
            UPDATE alerts_history
            SET resolved_at = @resolved_at,
                resolved_by = 'Sistema',
                resolution_type = 'auto',
                duration_minutes = DATEDIFF(MINUTE, created_at, @resolved_at),
                uuid_open = @uuid_open,
                uuid_closed = @uuid_closed
            WHERE pdu_id = @pdu_id
              AND metric_type = @metric_type
              AND alert_reason = @alert_reason
              AND resolved_at IS NULL
          `);
      }

      const deleteResult = await pool.request().query(`
        DELETE FROM active_critical_alerts
        WHERE pdu_id NOT IN (${pduIdsList})
      `);

      for (const criticalPdu of currentCriticalPdus) {
        const currentReasons = criticalPdu.reasons.filter(r => r.startsWith('critical_'));

        if (currentReasons.length > 0) {
          const reasonsList = currentReasons.map(reason => `'${reason.replace("'", "''")}'`).join(',');

          const alertsToResolveByReason = await pool.request()
            .input('pdu_id', sql.NVarChar, String(criticalPdu.id))
            .query(`
              SELECT id, pdu_id, rack_id, name, country, site, dc, metric_type, alert_reason, uuid_open, uuid_closed
              FROM active_critical_alerts
              WHERE pdu_id = @pdu_id AND alert_reason NOT IN (${reasonsList})
            `);

          for (const alert of alertsToResolveByReason.recordset) {
            let uuidClosed = alert.uuid_closed;
            if (SONAR_CONFIG.enabled && alert.uuid_open) {
              const sonarResult = await closeSonarAlert(alert).catch(err => {
                logger.error('Failed to close alert in SONAR', { error: err.message, pdu_id: alert.pdu_id });
                return { success: false };
              });
              if (sonarResult && sonarResult.uuid) {
                uuidClosed = sonarResult.uuid;
              }
            }

            await pool.request()
              .input('pdu_id', sql.NVarChar, String(alert.pdu_id))
              .input('metric_type', sql.NVarChar, alert.metric_type)
              .input('alert_reason', sql.NVarChar, alert.alert_reason)
              .input('resolved_at', sql.DateTime, new Date())
              .input('uuid_open', sql.NVarChar, alert.uuid_open || null)
              .input('uuid_closed', sql.NVarChar, uuidClosed || null)
              .query(`
                UPDATE alerts_history
                SET resolved_at = @resolved_at,
                    resolved_by = 'Sistema',
                    resolution_type = 'auto',
                    duration_minutes = DATEDIFF(MINUTE, created_at, @resolved_at),
                    uuid_open = @uuid_open,
                    uuid_closed = @uuid_closed
                WHERE pdu_id = @pdu_id
                  AND metric_type = @metric_type
                  AND alert_reason = @alert_reason
                  AND resolved_at IS NULL
              `);
          }

          await pool.request()
            .input('pdu_id', sql.NVarChar, String(criticalPdu.id))
            .query(`
              DELETE FROM active_critical_alerts
              WHERE pdu_id = @pdu_id AND alert_reason NOT IN (${reasonsList})
            `);
        }
      }

      return deleteResult;
    });

  } catch (error) {
    logger.error('Error cleaning up resolved alerts', { error: error.message });
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
        logger.warn('Could not fetch sites from database', { error: dbError.message });
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
        sonarErrors: getAllSonarErrors(),
        sonarSentRacks: racksCache.sonarSentRacks || [],
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
        if (powerSkip === 0 && pageData.length > 0) {
          const sampleItem = pageData[0];
          logger.info('[API DEBUG] Sample power data item from NENG API', {
            availableFields: Object.keys(sampleItem),
            gwName: sampleItem.gwName,
            gwIp: sampleItem.gwIp,
            totalAmps: sampleItem.totalAmps,
            totalVolts: sampleItem.totalVolts,
            rackName: sampleItem.rackName
          });
        }
        allPowerData = allPowerData.concat(pageData);
        powerSkip += pageSize;

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
            logger.debug('Sensor page failed, stopping pagination');
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
      } catch (sensorError) {
        logger.debug('Sensors API failed, continuing without sensor data', { error: sensorError.message });
      }
    } else {
      logger.debug('NENG_SENSORS_API_URL not configured', { requestId });
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
      logger.debug('PDUs without rack name filtered', { count: itemsWithoutRackName.length });
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
      logger.debug('Added racks from sensors without power data', { count: addedFromSensorsBeforeProcessing.length });
    }

    // Process data with thresholds evaluation (includes sensor-only racks now)
    const processedData = await processRackData(combinedData, thresholds);

    // DO NOT filter out maintenance racks - send them to frontend for visual indication
    const filteredData = processedData;
    const uniqueRacks = new Set(filteredData.map(pdu => pdu.rackId)).size;
    logger.debug('Data processed', { pdus: filteredData.length, racks: uniqueRacks, maintenance: maintenanceRackIds.size });

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
        logger.debug('Duplicate PDU detected', {
          pdu_id: pduId,
          existing: { rack: existing.rackId, dc: existing.dc, site: existing.site },
          current: { rack: rackId, dc: pdu.dc, site: pdu.site }
        });
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
    Array.from(rackMap.values()).forEach(rackGroup => {
      const rackId = rackGroup[0].rackId || rackGroup[0].id;
      const dcs = new Set(rackGroup.map(pdu => pdu.dc));

      if (dcs.size > 1) {
        logger.debug('Rack appears in multiple datacenters', { rack_id: rackId, datacenters: Array.from(dcs) });
      }
    });

    // Convertir el Map en arrays
    Array.from(rackMap.values()).forEach(rackGroup => {
      rackGroups.push(rackGroup);
    });

    // Grouped into rack groups

    // Get racks with alerts sent to SONAR
    const sonarSentRacks = await getRacksWithSonarAlerts();

    // Update cache
    racksCache.data = rackGroups;
    racksCache.sonarSentRacks = Array.from(sonarSentRacks);
    racksCache.timestamp = Date.now();

    const response = {
      success: true,
      data: rackGroups,
      sonarErrors: getAllSonarErrors(),
      sonarSentRacks: Array.from(sonarSentRacks),
      message: 'Rack data retrieved successfully',
      count: processedData.length,
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    logger.error('Energy racks fetch failed', { error: error.message, requestId });
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch energy racks data',
      error: error.message,
      requestId,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para obtener umbrales globales (requires auth)
app.get('/api/thresholds', requireAuth, async (req, res) => {
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
    logger.error('Thresholds fetch failed', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch thresholds',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para actualizar umbrales globales (only Administrador and Operador)
app.put('/api/thresholds', requireAuth, requireRole('Administrador', 'Operador'), async (req, res) => {
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
    logger.error('Thresholds update failed', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'Failed to update thresholds',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para obtener umbrales específicos de un rack (requires auth)
app.get('/api/racks/:rackId/thresholds', requireAuth, async (req, res) => {
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
    logger.error('Rack thresholds fetch failed', { error: error.message, rackId: req.params.rackId });
    
    res.status(500).json({
      success: false,
      message: `Failed to fetch thresholds for rack ${req.params.rackId}`,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para actualizar umbrales específicos de un rack (only Administrador and Operador)
app.put('/api/racks/:rackId/thresholds', requireAuth, requireRole('Administrador', 'Operador'), async (req, res) => {
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
    logger.error('Rack thresholds update failed', { error: error.message, rackId: req.params.rackId });
    
    res.status(500).json({
      success: false,
      message: `Failed to update thresholds for rack ${req.params.rackId}`,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para resetear umbrales específicos de un rack (only Administrador and Operador)
app.delete('/api/racks/:rackId/thresholds', requireAuth, requireRole('Administrador', 'Operador'), async (req, res) => {
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
  try {
    const results = await executeQuery(async (pool) => {
      const entriesResult = await pool.request().query(`
        SELECT id, entry_type, rack_id, chain, site, dc, reason, [user], started_at, started_by, created_at
        FROM maintenance_entries
        ORDER BY started_at DESC
      `);

      const detailsResult = await pool.request().query(`
        SELECT mrd.maintenance_entry_id, mrd.rack_id, mrd.name, mrd.country, mrd.site, mrd.dc, mrd.phase, mrd.chain, mrd.node, mrd.gwName, mrd.gwIp
        FROM maintenance_rack_details mrd
      `);

      return {
        entries: entriesResult.recordset || [],
        details: detailsResult.recordset || []
      };
    });

    const { entries, details } = results;

    logger.debug('Maintenance data retrieved', { entries: entries.length, racks: details.length });

    const detailsNeedingEnrichment = details.filter(d => {
      const site = String(d.site || '').trim();
      const dc = String(d.dc || '').trim();
      const gwName = String(d.gwName || '').trim();
      return site === 'Unknown' || dc === 'Unknown' || !gwName || gwName === 'N/A';
    });

    if (detailsNeedingEnrichment.length > 0 && process.env.NENG_API_URL && process.env.NENG_API_KEY) {
      try {
        let allPowerData = [];
        let skip = 0;
        const limit = 500;
        let hasMore = true;

        while (hasMore) {
          const response = await fetchFromNengApi(
            `${process.env.NENG_API_URL}?skip=${skip}&limit=${limit}`,
            { method: 'GET', headers: { 'Authorization': `Bearer ${process.env.NENG_API_KEY}`, 'Content-Type': 'application/json' } }
          );

          if (response.success && Array.isArray(response.data)) {
            allPowerData = allPowerData.concat(response.data);
            hasMore = response.data.length >= limit;
            skip += limit;
          } else {
            hasMore = false;
          }
        }

        const rackApiDataMap = new Map();
        const rackApiDataMapLower = new Map();
        allPowerData.forEach(pdu => {
          const rackName = String(pdu.rackName || '').trim();
          if (rackName) {
            const apiData = {
              site: pdu.site || null,
              dc: pdu.dc || null,
              phase: pdu.phase || null,
              chain: pdu.chain !== undefined && pdu.chain !== null ? String(pdu.chain) : null,
              node: pdu.node !== undefined && pdu.node !== null ? String(pdu.node) : null,
              gwName: pdu.gwName || null,
              gwIp: pdu.gwIp || null
            };
            rackApiDataMap.set(rackName, apiData);
            rackApiDataMapLower.set(rackName.toLowerCase(), apiData);
          }
        });

        let enrichedCount = 0;
        const pool = await getPool();

        for (const detail of detailsNeedingEnrichment) {
          const rackName = String(detail.name || detail.rack_id || '').trim();
          let apiData = rackApiDataMap.get(rackName);
          if (!apiData) {
            apiData = rackApiDataMapLower.get(rackName.toLowerCase());
          }

          if (apiData) {
            let needsUpdate = false;
            const updates = {};

            if (apiData.site && (detail.site === 'Unknown' || !detail.site)) {
              detail.site = apiData.site;
              updates.site = apiData.site;
              needsUpdate = true;
            }
            if (apiData.dc && (detail.dc === 'Unknown' || !detail.dc)) {
              detail.dc = apiData.dc;
              updates.dc = apiData.dc;
              needsUpdate = true;
            }
            if (apiData.phase && (detail.phase === 'Unknown' || !detail.phase)) {
              detail.phase = apiData.phase;
              updates.phase = apiData.phase;
              needsUpdate = true;
            }
            if (apiData.chain && (detail.chain === 'Unknown' || !detail.chain)) {
              detail.chain = apiData.chain;
              updates.chain = apiData.chain;
              needsUpdate = true;
            }
            if (apiData.node && (detail.node === 'Unknown' || !detail.node)) {
              detail.node = apiData.node;
              updates.node = apiData.node;
              needsUpdate = true;
            }
            if (apiData.gwName && (!detail.gwName || detail.gwName === 'N/A')) {
              detail.gwName = apiData.gwName;
              updates.gwName = apiData.gwName;
              needsUpdate = true;
            }
            if (apiData.gwIp && (!detail.gwIp || detail.gwIp === 'N/A')) {
              detail.gwIp = apiData.gwIp;
              updates.gwIp = apiData.gwIp;
              needsUpdate = true;
            }

            if (needsUpdate) {
              try {
                const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
                const request = pool.request()
                  .input('rack_id', sql.NVarChar, String(detail.rack_id))
                  .input('maintenance_entry_id', sql.UniqueIdentifier, detail.maintenance_entry_id);

                Object.entries(updates).forEach(([key, value]) => {
                  request.input(key, sql.NVarChar, String(value));
                });

                await request.query(`UPDATE maintenance_rack_details SET ${setClauses} WHERE rack_id = @rack_id AND maintenance_entry_id = @maintenance_entry_id`);
                enrichedCount++;
              } catch (updateError) {
                logger.warn('Failed to update rack data', { rack: rackName, error: updateError.message });
              }
            }
          }
        }

        if (enrichedCount > 0) {
          logger.info('Enriched racks with API data', { count: enrichedCount, total: detailsNeedingEnrichment.length });
        }
      } catch (apiError) {
        logger.warn('Failed to enrich rack data from API', { error: apiError.message });
      }
    }

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

    const sanitizedRackId = String(rackId || '').trim();
    if (!sanitizedRackId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rackId: must be a non-empty string',
        timestamp: new Date().toISOString()
      });
    }

    let rack = rackData || {};
    let chain = rackData?.chain;

    const needsEnrichment = !rack.site || rack.site === 'Unknown' || !rack.dc || rack.dc === 'Unknown' || !rack.gwName;

    if (needsEnrichment && process.env.NENG_API_URL && process.env.NENG_API_KEY) {
      try {
        logger.info('Fetching rack data from NENG API for maintenance', { rackName: sanitizedRackId });
        let skip = 0;
        const limit = 500;
        let hasMore = true;
        let found = false;

        while (hasMore && !found) {
          const response = await fetchFromNengApi(
            `${process.env.NENG_API_URL}?skip=${skip}&limit=${limit}`,
            { method: 'GET' }
          );

          if (response.success && Array.isArray(response.data)) {
            for (const pdu of response.data) {
              const pduRackName = String(pdu.rackName || '').trim();
              if (pduRackName.toLowerCase() === sanitizedRackId.toLowerCase()) {
                rack = {
                  ...rack,
                  name: pdu.rackName || rack.name || sanitizedRackId,
                  site: pdu.site || rack.site,
                  dc: pdu.dc || rack.dc,
                  phase: pdu.phase || rack.phase,
                  chain: pdu.chain !== undefined && pdu.chain !== null ? String(pdu.chain) : rack.chain,
                  node: pdu.node !== undefined && pdu.node !== null ? String(pdu.node) : rack.node,
                  gwName: pdu.gwName || rack.gwName,
                  gwIp: pdu.gwIp || rack.gwIp,
                  country: 'Spain'
                };
                chain = rack.chain;
                found = true;
                logger.info('Found rack data from NENG API', { rackName: sanitizedRackId, site: rack.site, dc: rack.dc });
                break;
              }
            }
            hasMore = response.data.length >= limit;
            skip += limit;
          } else {
            hasMore = false;
          }
        }

        if (!found) {
          logger.warn('Rack not found in NENG API', { rackName: sanitizedRackId });
        }
      } catch (apiError) {
        logger.warn('Failed to fetch rack data from NENG API', { error: apiError.message, rackName: sanitizedRackId });
      }
    }

    const result = await executeQuery(async (pool) => {
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

      if ((!rack.site || rack.site === 'Unknown') && (!rack.dc || rack.dc === 'Unknown')) {
        const rackDbData = await pool.request()
          .input('rack_id', sql.NVarChar, sanitizedRackId)
          .query(`
            SELECT TOP 1
              pdu_id, rack_id, name, country, site, dc, phase, chain, node, serial
            FROM active_critical_alerts
            WHERE rack_id = @rack_id OR name = @rack_id
          `);

        if (rackDbData.recordset.length > 0) {
          const dbRack = rackDbData.recordset[0];
          rack = {
            ...rack,
            name: rack.name || dbRack.name || sanitizedRackId,
            site: rack.site || dbRack.site,
            dc: rack.dc || dbRack.dc,
            phase: rack.phase || dbRack.phase,
            chain: rack.chain || dbRack.chain,
            node: rack.node || dbRack.node,
            country: rack.country || dbRack.country
          };
          chain = rack.chain;
        }
      }

      const dc = rack.dc || 'Unknown';
      const site = rack.site || 'Unknown';

      // Check site permission for users with assigned sites (but NOT for Administrators)
      if (req.session.userRole !== 'Administrador') {
        if (!userHasAccessToSiteMaintenance(req.session.sitiosAsignados, site)) {
          if (!site || site === 'Unknown') {
            return { error: 'site_unknown', message: 'No se puede determinar el sitio del rack.' };
          }
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
        .input('name', sql.NVarChar, String(rack.name || sanitizedRackId))
        .input('country', sql.NVarChar, String(rack.country || 'Unknown'))
        .input('site', sql.NVarChar, site)
        .input('dc', sql.NVarChar, dc)
        .input('phase', sql.NVarChar, String(rack.phase || 'Unknown'))
        .input('chain', sql.NVarChar, String(chain || 'Unknown'))
        .input('node', sql.NVarChar, String(rack.node || 'Unknown'))
        .input('gwName', sql.NVarChar, String(rack.gwName || 'N/A'))
        .input('gwIp', sql.NVarChar, String(rack.gwIp || 'N/A'))
        .query(`
          INSERT INTO maintenance_rack_details
          (maintenance_entry_id, rack_id, name, country, site, dc, phase, chain, node, gwName, gwIp)
          VALUES
          (@entry_id, @rack_id, @name, @country, @site, @dc, @phase, @chain, @node, @gwName, @gwIp)
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

    closeSonarAlertsForMaintenance(sanitizedRackId).catch(err => {
      logger.error('Failed to close SONAR alerts for rack maintenance', { rackId: sanitizedRackId, error: err.message });
    });

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
  try {
    const {
      chain,
      site,
      dc,
      reason = 'Mantenimiento programado de chain',
      user = 'Sistema'
    } = req.body;

    if (!chain || !dc) {
      return res.status(400).json({
        success: false,
        message: 'chain and dc are required',
        timestamp: new Date().toISOString()
      });
    }

    // Check site permission for users with assigned sites (but NOT for Administrators)
    if (req.session.userRole !== 'Administrador') {
      if (!userHasAccessToSiteMaintenance(req.session.sitiosAsignados, site)) {
        if (!site) {
          return res.status(400).json({
            success: false,
            message: 'No se puede determinar el sitio de la chain. Información de sitio requerida para usuarios con sitios asignados.',
            timestamp: new Date().toISOString()
          });
        }
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
    let chainRacks = allPowerData.filter(rack => {
      const rackChain = String(rack.chain).trim();
      const rackDc = String(rack.dc).trim();
      return rackChain === sanitizedChain && rackDc === sanitizedDc;
    });

    // Filter out items without valid rackName
    const beforeRackNameFilter = chainRacks.length;

    chainRacks = chainRacks.filter(rack => {
      const hasValidRackName = rack.rackName &&
                                String(rack.rackName).trim() !== '' &&
                                String(rack.rackName).trim() !== 'null' &&
                                String(rack.rackName).trim() !== 'undefined';
      return hasValidRackName;
    });

    const filteredOutCount = beforeRackNameFilter - chainRacks.length;
    if (filteredOutCount > 0) {
      logger.debug('PDUs filtered out due to missing rackName', { filtered: filteredOutCount, remaining: chainRacks.length });
    }

    if (chainRacks.length === 0) {
      return res.status(200).json({
        success: true,
        message: `No se encontraron racks para la chain ${sanitizedChain} en DC ${sanitizedDc}. Es posible que la chain esté vacía o que los racks no tengan rackName válido.`,
        racksAdded: 0,
        timestamp: new Date().toISOString()
      });
    }

    // Group by rackId to avoid inserting multiple records for the same physical rack
    const rackMap = new Map();

    chainRacks.forEach((rack) => {
      let rackId = null;

      if (rack.rackId && String(rack.rackId).trim()) {
        rackId = String(rack.rackId).trim();
      } else if (rack.id && String(rack.id).trim()) {
        rackId = String(rack.id).trim();
      }

      if (rackId && !rackMap.has(rackId)) {
        rackMap.set(rackId, { ...rack, sanitizedRackId: rackId });
      }
    });

    const uniqueRacks = Array.from(rackMap.values());

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
            .input('name', sql.NVarChar, String(rack.rackName || rack.name || 'Unknown'))
            .input('country', sql.NVarChar, 'España')
            .input('site', sql.NVarChar, site || String(rack.site || 'Unknown'))
            .input('dc', sql.NVarChar, sanitizedDc)
            .input('phase', sql.NVarChar, String(rack.phase || 'Unknown'))
            .input('chain', sql.NVarChar, sanitizedChain)
            .input('node', sql.NVarChar, String(rack.node || 'Unknown'))
            .input('gwName', sql.NVarChar, String(rack.gwName || 'N/A'))
            .input('gwIp', sql.NVarChar, String(rack.gwIp || 'N/A'))
            .query(`
              INSERT INTO maintenance_rack_details
              (maintenance_entry_id, rack_id, name, country, site, dc, phase, chain, node, gwName, gwIp)
              VALUES
              (@entry_id, @rack_id, @name, @country, @site, @dc, @phase, @chain, @node, @gwName, @gwIp)
            `);

          insertedCount++;
        } catch (insertError) {
          failedCount++;
          logger.error(`Failed to insert rack ${rack.sanitizedRackId} to maintenance:`, insertError);
        }
      }

      return { entryId, insertedCount, failedCount };
    });

    logger.info('Chain added to maintenance', {
      chain: sanitizedChain,
      dc: sanitizedDc,
      inserted: result.insertedCount,
      skipped: result.failedCount,
      total: uniqueRacks.length
    });

    const rackIdsForSonar = uniqueRacks.map(r => r.sanitizedRackId).filter(Boolean);
    closeSonarAlertsForMaintenanceBatch(rackIdsForSonar).catch(err => {
      logger.error('Failed to close SONAR alerts for chain maintenance', { chain: sanitizedChain, error: err.message });
    });

    res.json({
      success: true,
      message: `Chain ${sanitizedChain} from DC ${sanitizedDc} added to maintenance: ${result.insertedCount} racks added successfully${result.failedCount > 0 ? `, ${result.failedCount} skipped (already in maintenance)` : ''}`,
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
      if (req.session.userRole !== 'Administrador') {
        if (!userHasAccessToSiteMaintenance(req.session.sitiosAsignados, rackSite)) {
          if (!rackSite || rackSite === 'Unknown') {
            return { error: 'site_unknown', message: 'No se puede determinar el sitio del rack.' };
          }
          return { error: 'forbidden', message: `No tienes permisos para gestionar mantenimientos en el sitio "${rackSite}". Solo puedes gestionar: ${req.session.sitiosAsignados.join(', ')}`, site: rackSite };
        }
      }

      // Guardar en historial antes de eliminar
      const endedBy = req.session.usuario || 'Sistema';
      await saveRackMaintenanceToHistory(pool, sanitizedRackId, endedBy);

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
      if (req.session.userRole !== 'Administrador') {
        if (!userHasAccessToSiteMaintenance(req.session.sitiosAsignados, entry.site)) {
          if (!entry.site || entry.site === 'Unknown') {
            return { error: 'site_unknown', message: 'No se puede determinar el sitio de esta entrada de mantenimiento.' };
          }
          return { error: 'forbidden', message: `No tienes permisos para gestionar mantenimientos en el sitio "${entry.site}". Solo puedes gestionar: ${req.session.sitiosAsignados.join(', ')}`, site: entry.site };
        }
      }

      // Guardar en historial antes de eliminar
      const endedBy = req.session.usuario || 'Sistema';
      await saveMaintenanceToHistory(pool, entryId, endedBy);

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

      // Obtener todos los entry IDs para guardar en historial
      const endedBy = req.session.usuario || 'Sistema';
      let entriesQuery = `SELECT id FROM maintenance_entries ${whereClause}`;
      const entriesResult = await pool.request().query(entriesQuery);

      // Guardar cada entrada en el historial antes de eliminar
      for (const row of entriesResult.recordset) {
        await saveMaintenanceToHistory(pool, row.id, endedBy);
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

      return { entry_count, rack_count, deleted: true };
    });

    if (!result.deleted) {
      return res.status(404).json({
        success: false,
        message: 'No maintenance entries to remove',
        timestamp: new Date().toISOString()
      });
    }

    logger.info('Maintenance entries removed', {
      entries: result.entry_count,
      racks: result.rack_count,
      user: req.session.usuario,
      sites: req.session.sitiosAsignados || 'all'
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
    logger.error('Remove all maintenance entries failed', { error: error.message });
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

// Endpoint to import racks from Excel (requires auth, not for Observador)
app.post('/api/maintenance/import-excel', requireAuth, upload.single('file'), async (req, res) => {
  if (req.session.userRole === 'Observador') {
    return res.status(403).json({
      success: false,
      message: 'No tiene permisos para importar mantenimientos.',
      timestamp: new Date().toISOString()
    });
  }
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
        timestamp: new Date().toISOString()
      });
    }

    const { defaultReason = 'Mantenimiento' } = req.body;
    const user = req.session.usuario || 'Sistema';

    logger.info('Excel import started', {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      user
    });

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
    const rackNamesInFile = new Set();
    const exampleRackNames = new Set(['RACK-001', 'RACK-002', 'RACK-003']);

    const getCellValue = (cell) => {
      if (!cell) return '';
      const value = cell.value;
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number') return String(value).trim();
      if (typeof value === 'boolean') return String(value);
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'object') {
        if (value.richText && Array.isArray(value.richText)) {
          return value.richText.map(rt => rt.text || '').join('').trim();
        }
        if (value.text !== undefined) return String(value.text).trim();
        if (value.result !== undefined) return String(value.result).trim();
        if (value.hyperlink) return String(value.text || value.hyperlink).trim();
        if (value.formula && value.result !== undefined) return String(value.result).trim();
      }
      return String(value).trim();
    };

    const rowCount = worksheet.rowCount;
    logger.info('Excel worksheet info', {
      rowCount,
      columnCount: worksheet.columnCount,
      actualRowCount: worksheet.actualRowCount
    });

    let skippedEmpty = 0;
    let skippedExample = 0;
    let skippedNote = 0;
    let skippedDuplicate = 0;

    for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);

      const cell1 = row.getCell(1);
      const cell2 = row.getCell(2);

      const rackNameValue = getCellValue(cell1);
      const reasonValue = getCellValue(cell2);

      if (!rackNameValue || rackNameValue === '') {
        skippedEmpty++;
        continue;
      }

      if (rackNameValue.toUpperCase().startsWith('NOTA:') ||
          rackNameValue.toUpperCase().startsWith('NOTE:') ||
          rackNameValue.toUpperCase().startsWith('EJEMPLO') ||
          rackNameValue.toUpperCase().startsWith('EXAMPLE')) {
        skippedNote++;
        continue;
      }

      if (exampleRackNames.has(rackNameValue)) {
        skippedExample++;
        continue;
      }

      if (rackNamesInFile.has(rackNameValue)) {
        duplicatesInFile.add(rackNameValue);
        skippedDuplicate++;
        errors.push({
          row: rowNumber,
          error: `Duplicado en Excel: ${rackNameValue}`,
          rackName: rackNameValue
        });
        continue;
      }

      rackNamesInFile.add(rackNameValue);
      racks.push({
        rackName: rackNameValue,
        reason: reasonValue || defaultReason,
        rowNumber
      });
    }

    logger.info('Excel import: rows parsed', {
      totalRows: rowCount - 1,
      validRacksFound: racks.length,
      skippedEmpty,
      skippedExample,
      skippedNote,
      skippedDuplicate,
      user,
      firstFewRacks: racks.slice(0, 5).map(r => r.rackName)
    });

    if (racks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se encontraron racks validos en el archivo Excel',
        summary: {
          totalRows: rowCount - 1,
          skippedEmpty,
          skippedExample,
          skippedNote,
          skippedDuplicate
        },
        errors,
        timestamp: new Date().toISOString()
      });
    }

    let allRackData = [];
    try {
      if (process.env.NENG_API_URL && process.env.NENG_API_KEY) {
        let skip = 0;
        const limit = 500;
        let hasMore = true;
        let apiPages = 0;

        while (hasMore) {
          apiPages++;
          const response = await fetchFromNengApi(
            `${process.env.NENG_API_URL}?skip=${skip}&limit=${limit}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${process.env.NENG_API_KEY}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (response.success && Array.isArray(response.data)) {
            allRackData = allRackData.concat(response.data);
            if (response.data.length < limit) {
              hasMore = false;
            } else {
              skip += limit;
            }
          } else {
            hasMore = false;
          }
        }
        logger.info('API data fetched for Excel import', {
          totalRecords: allRackData.length,
          pages: apiPages
        });
      }
    } catch (error) {
      logger.warn('Could not fetch rack data from API for Excel import', { error: error.message });
    }

    const rackDataMap = new Map();
    const rackDataMapLower = new Map();
    allRackData.forEach(pdu => {
      const rackName = String(pdu.rackName || '').trim();
      if (rackName) {
        const rackData = {
          name: rackName,
          rackName: rackName,
          country: 'España',
          site: pdu.site || 'Unknown',
          dc: pdu.dc || 'Unknown',
          phase: pdu.phase || 'Unknown',
          chain: pdu.chain !== undefined && pdu.chain !== null ? String(pdu.chain) : 'Unknown',
          node: pdu.node !== undefined && pdu.node !== null ? String(pdu.node) : 'Unknown',
          gwName: pdu.gwName || 'N/A',
          gwIp: pdu.gwIp || 'N/A'
        };
        if (!rackDataMap.has(rackName)) {
          rackDataMap.set(rackName, rackData);
        }
        const rackNameLower = rackName.toLowerCase();
        if (!rackDataMapLower.has(rackNameLower)) {
          rackDataMapLower.set(rackNameLower, rackData);
        }
      }
    });

    logger.info('Rack data map created', {
      uniqueRacks: rackDataMap.size,
      sampleKeys: Array.from(rackDataMap.keys()).slice(0, 10)
    });

    const alreadyInMaintenance = [];
    const successfulInserts = [];
    const failedInserts = [];
    const notFoundInAPI = [];

    const existingRacksResult = await executeQuery(async (pool) => {
      return await pool.request().query(`
        SELECT DISTINCT rack_id FROM maintenance_rack_details
      `);
    });
    const existingRackIds = new Set(existingRacksResult.recordset.map(r => r.rack_id));

    logger.info('Existing maintenance racks loaded', { count: existingRackIds.size });

    const racksToInsert = [];
    for (const rack of racks) {
      if (existingRackIds.has(rack.rackName)) {
        alreadyInMaintenance.push({
          row: rack.rowNumber,
          rackName: rack.rackName,
          message: 'Already in maintenance'
        });
        continue;
      }

      let foundRackData = rackDataMap.get(rack.rackName);
      if (!foundRackData) {
        foundRackData = rackDataMapLower.get(rack.rackName.toLowerCase());
      }

      let rackInfo;
      if (foundRackData) {
        rackInfo = {
          ...foundRackData,
          rack_id: rack.rackName,
          reason: rack.reason,
          rowNumber: rack.rowNumber,
          foundInAPI: true
        };
        logger.debug('Rack found in API', {
          rackName: rack.rackName,
          site: foundRackData.site,
          dc: foundRackData.dc,
          chain: foundRackData.chain
        });
      } else {
        notFoundInAPI.push(rack.rackName);
        rackInfo = {
          rack_id: rack.rackName,
          name: rack.rackName,
          country: 'España',
          site: 'Unknown',
          dc: 'Unknown',
          phase: 'Unknown',
          chain: 'Unknown',
          node: 'Unknown',
          gwName: 'N/A',
          gwIp: 'N/A',
          reason: rack.reason,
          rowNumber: rack.rowNumber,
          foundInAPI: false
        };
      }

      racksToInsert.push(rackInfo);
    }

    logger.info('Racks prepared for insertion', {
      toInsert: racksToInsert.length,
      alreadyInMaintenance: alreadyInMaintenance.length,
      notFoundInAPI: notFoundInAPI.length
    });

    const BATCH_SIZE = 50;
    for (let i = 0; i < racksToInsert.length; i += BATCH_SIZE) {
      const batch = racksToInsert.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(racksToInsert.length / BATCH_SIZE);

      logger.info(`Processing batch ${batchNum}/${totalBatches}`, {
        batchSize: batch.length,
        startIndex: i
      });

      try {
        await executeQuery(async (pool) => {
          for (const rackInfo of batch) {
            try {
              const entryId = crypto.randomUUID();

              await pool.request()
                .input('entry_id', sql.UniqueIdentifier, entryId)
                .input('entry_type', sql.NVarChar, 'individual_rack')
                .input('rack_id', sql.NVarChar, String(rackInfo.rack_id))
                .input('chain', sql.NVarChar, rackInfo.chain)
                .input('site', sql.NVarChar, rackInfo.site)
                .input('dc', sql.NVarChar, rackInfo.dc)
                .input('reason', sql.NVarChar, rackInfo.reason)
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
                .input('rack_id', sql.NVarChar, String(rackInfo.rack_id))
                .input('name', sql.NVarChar, rackInfo.name)
                .input('country', sql.NVarChar, rackInfo.country)
                .input('site', sql.NVarChar, rackInfo.site)
                .input('dc', sql.NVarChar, rackInfo.dc)
                .input('phase', sql.NVarChar, rackInfo.phase)
                .input('chain', sql.NVarChar, rackInfo.chain)
                .input('node', sql.NVarChar, rackInfo.node)
                .input('gwName', sql.NVarChar, rackInfo.gwName)
                .input('gwIp', sql.NVarChar, rackInfo.gwIp)
                .query(`
                  INSERT INTO maintenance_rack_details
                  (maintenance_entry_id, rack_id, name, country, site, dc, phase, chain, node, gwName, gwIp)
                  VALUES
                  (@entry_id, @rack_id, @name, @country, @site, @dc, @phase, @chain, @node, @gwName, @gwIp)
                `);

              successfulInserts.push({
                row: rackInfo.rowNumber,
                rackName: rackInfo.rack_id,
                dc: rackInfo.dc,
                foundInAPI: rackInfo.foundInAPI
              });

            } catch (insertError) {
              logger.error('Failed to insert rack', {
                rackName: rackInfo.rack_id,
                error: insertError.message
              });
              failedInserts.push({
                row: rackInfo.rowNumber,
                rackName: rackInfo.rack_id,
                error: insertError.message
              });
            }
          }
        });

        logger.info(`Batch ${batchNum} completed`, {
          successfulInBatch: batch.length - failedInserts.filter(f => batch.some(b => b.rack_id === f.rackName)).length
        });

      } catch (batchError) {
        logger.error(`Batch ${batchNum} failed entirely`, { error: batchError.message });
        for (const rackInfo of batch) {
          if (!successfulInserts.some(s => s.rackName === rackInfo.rack_id)) {
            failedInserts.push({
              row: rackInfo.rowNumber,
              rackName: rackInfo.rack_id,
              error: `Batch error: ${batchError.message}`
            });
          }
        }
      }
    }

    const result = {
      successfulInserts,
      alreadyInMaintenance,
      failedInserts,
      notFoundInAPI
    };

    const racksFoundInAPI = result.successfulInserts.filter(r => r.foundInAPI).length;
    const racksNotFoundInAPI = result.successfulInserts.filter(r => !r.foundInAPI).length;

    const summary = {
      total: racks.length,
      successful: result.successfulInserts.length,
      foundInAPI: racksFoundInAPI,
      notFoundInAPI: racksNotFoundInAPI,
      alreadyInMaintenance: result.alreadyInMaintenance.length,
      failed: result.failedInserts.length + errors.length,
      errors: [
        ...errors.map(e => ({ ...e, type: 'validation' })),
        ...result.alreadyInMaintenance.map(e => ({ ...e, type: 'duplicate', error: 'Already in maintenance' })),
        ...result.failedInserts.map(e => ({ ...e, type: 'insert_failed' }))
      ]
    };

    const rackIdsForSonar = result.successfulInserts.map(r => r.rackName).filter(Boolean);
    if (rackIdsForSonar.length > 0) {
      closeSonarAlertsForMaintenanceBatch(rackIdsForSonar).catch(err => {
        logger.error('Failed to close SONAR alerts for Excel import maintenance', { error: err.message });
      });
    }

    logger.info('Excel import completed', {
      fileName: req.file.originalname,
      successful: summary.successful,
      total: summary.total,
      foundInAPI: racksFoundInAPI,
      notFoundInAPI: racksNotFoundInAPI
    });

    res.json({
      success: true,
      message: `Import completed: ${summary.successful} racks added to maintenance`,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Excel import failed', { error: error.message });
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

// SONAR errors endpoint
app.get('/api/sonar/errors', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: getAllSonarErrors(),
    enabled: SONAR_CONFIG.enabled,
    timestamp: new Date().toISOString()
  });
});

// SONAR status endpoint
app.get('/api/sonar/status', requireAuth, (req, res) => {
  res.json({
    success: true,
    enabled: SONAR_CONFIG.enabled,
    configured: !!(SONAR_CONFIG.apiUrl && SONAR_CONFIG.bearerToken),
    errorCount: sonarErrorCache.size,
    timestamp: new Date().toISOString()
  });
});

// Endpoint para exportar alertas a Excel
app.post('/api/export/alerts', requireAuth, async (req, res) => {
  try {
    const { filterBySite } = req.body;
    const userSites = req.session.sitiosAsignados || [];

    // Use cached racks data if available and valid, otherwise return error
    if (!isCacheValid(racksCache)) {
      return res.status(503).json({
        success: false,
        message: 'Rack data not available. Please wait for data to be loaded or refresh the page.',
        timestamp: new Date().toISOString()
      });
    }

    const racksData = racksCache.data;

    if (!racksData || !Array.isArray(racksData)) {
      return res.status(503).json({
        success: false,
        message: 'Rack data is not in the expected format. Please refresh the page to reload data.',
        timestamp: new Date().toISOString()
      });
    }

    if (racksData.length === 0) {
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

    logger.info('Exporting alerts to Excel', { count: pdusWithAlerts.length });

    // Set headers to trigger download in browser
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    // Write the Excel file directly to the response stream
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
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
  logger.warn('Route not found', { method: req.method, url: req.originalUrl });
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Start server
const server = app.listen(port, async () => {
  logger.info('Server started', {
    port,
    environment: process.env.NODE_ENV || 'development',
    frontend: process.env.FRONTEND_URL || 'http://localhost:5173',
    sonar: SONAR_CONFIG.enabled ? 'enabled' : 'disabled'
  });

  if (SONAR_CONFIG.enabled) {
    setTimeout(async () => {
      try {
        logger.info('[SONAR] STARTUP: Beginning sync of existing alerts');
        const result = await sendExistingAlertsToSonar();
        logger.info('[SONAR] STARTUP: Sync completed', result);
      } catch (err) {
        logger.error('[SONAR] STARTUP: Failed to sync existing alerts', { error: err.message });
      }
    }, 3000);
  }
});

// Set server timeout to 5 minutes (for long-running operations like chain maintenance)
server.timeout = 300000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info('Shutdown initiated', { signal });

  server.close(async () => {
    logger.info('HTTP server closed');

    if (globalPool && globalPool.connected) {
      try {
        await globalPool.close();
        logger.info('Database connection pool closed');
      } catch (error) {
        logger.error('Error closing database pool', { error: error.message });
      }
    }

    logger.info('Process terminated');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
  process.exit(1);
});