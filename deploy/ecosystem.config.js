// PM2: pm2 start deploy/ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: 'tri-hotel',
      cwd: '/var/www/tri-hotel',
      script: 'src/server.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
    },
  ],
};
