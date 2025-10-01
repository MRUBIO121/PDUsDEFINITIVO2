module.exports = {
  apps: [{
    name: 'energy-monitoring-api',
    script: './server.js',

    instances: 2,
    exec_mode: 'cluster',

    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },

    watch: false,
    ignore_watch: ['node_modules', 'logs', 'dist', 'exports'],
    max_restarts: 10,
    min_uptime: '10s',

    log_file: './logs/pm2-combined.log',
    out_file: './logs/pm2-out.log',
    error_file: './logs/pm2-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,

    max_memory_restart: '500M',

    windowsHide: true
  }]
};
