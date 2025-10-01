module.exports = {
  apps: [{
    // Application Configuration
    name: 'energy-monitoring-api',
    script: './backend/server.js',
    cwd: '/d/nginx/pdus',
    
    // Process Management
    instances: 2,
    exec_mode: 'cluster',
    
    // Environment
    env: {
      NODE_ENV: 'development',
      PORT: 3001,
      LOG_LEVEL: 'debug'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      LOG_LEVEL: 'debug'
    },
    
    // Restart Policy
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'dist'],
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Logging
    log_file: './logs/pm2-combined.log',
    out_file: './logs/pm2-out.log',
    error_file: './logs/pm2-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    
    // Advanced Configuration
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Resource Limits
    max_memory_restart: '500M',
    
    // Auto-restart on file changes (development only)
    watch_delay: 1000,
    
    // Environment Variables
    instance_var: 'INSTANCE_ID',
    
    // Windows Service Configuration
    windowsHide: true,
    
    // Health Check
    health_check: {
      url: 'http://localhost:3001/api/health',
      interval: 30000,
      timeout: 5000,
      max_failures: 3
    }
  }],

  // Deployment Configuration
  deploy: {
    production: {
      user: 'administrator',
      host: 'localhost',
      ref: 'origin/master',
      repo: 'git@github.com:company/energy-monitoring.git',
      path: '/d/nginx/pdus',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && npm run build && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': ''
    }
  }
};