// PM2 Ecosystem Config — BioCNG Dashboard
// Gunakan di Raspberry Pi dengan: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    // ── Next.js Web Server ─────────────────────────────────────────────
    {
      name: "biocng-web",
      script: "node_modules/.bin/next",
      args: "start -p 3000 -H 0.0.0.0",
      env: {
        NODE_ENV: "production",
        // Batasi memory ke 512MB (RPi 4 punya 2–8GB, ini aman)
        NODE_OPTIONS: "--max-old-space-size=512",
      },
      // Restart otomatis jika melebihi batas memory
      max_memory_restart: "480M",
      // Jeda 3 detik sebelum restart jika crash
      restart_delay: 3000,
      // Jangan restart terlalu sering (max 10x dalam 10 menit)
      max_restarts: 10,
      min_uptime: "10s",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      out_file: "./logs/web-out.log",
      error_file: "./logs/web-err.log",
    },

    // ── Serial Bridge Server ───────────────────────────────────────────
    {
      name: "biocng-serial",
      script: "src/app/server.js",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        // Ganti sesuai port serial Arduino di RPi kamu:
        // Arduino via USB-Serial  → /dev/ttyUSB0
        // Arduino Uno/Mega via USB → /dev/ttyACM0
        SERIAL_PORT: "/dev/ttyUSB0",
        BAUD_RATE: "115200",
      },
      restart_delay: 5000,
      max_restarts: 5,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      out_file: "./logs/serial-out.log",
      error_file: "./logs/serial-err.log",
    },
  ],
};
