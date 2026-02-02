module.exports = {
  apps: [{
    name: 'claude-cli-provider',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug'
    },
    env_production: {
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      LOG_LEVEL: 'info'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    listen_timeout: 3000
  }]
};
