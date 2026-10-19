// PM2: pm2 start deploy/ecosystem.config.js && pm2 save
// Cluster-Modus mit einer Instanz: „pm2 reload tri-hotel“ startet erst die neue Instanz, dann endet die alte
// (kein Ausfall). Mehr Instanzen sind möglich – alle Hintergrund-Jobs laufen über pg-boss-Warteschlangen.
// Wechsel von fork auf cluster: einmalig „pm2 delete tri-hotel && pm2 start deploy/ecosystem.config.js && pm2 save“.
module.exports = {
  apps: [
    {
      name: 'tri-hotel',
      cwd: '/var/www/tri-hotel',
      script: 'src/server.js',
      exec_mode: 'cluster',
      instances: 1,
      kill_timeout: 10000, // Zeit für laufende Anfragen und Jobs beim Herunterfahren
      listen_timeout: 10000,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
    },
  ],
};
