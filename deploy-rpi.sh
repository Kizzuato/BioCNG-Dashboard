#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
# deploy-rpi.sh — Script deploy BioCNG Dashboard ke Raspberry Pi 4
# Jalankan di RASPBERRY PI, bukan di PC pengembangan
# Cara: chmod +x deploy-rpi.sh && ./deploy-rpi.sh
# ════════════════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════"
echo "   BioCNG Dashboard — Setup Raspberry Pi 4"
echo "═══════════════════════════════════════════"

# ── 1. Update sistem ────────────────────────────────────────────────────
echo ""
echo "▶ [1/7] Update package list..."
sudo apt update -qq

# ── 2. Install Node.js (v20 LTS) ────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "▶ [2/7] Install Node.js v20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
else
  echo "▶ [2/7] Node.js sudah terinstall: $(node -v)"
fi

# ── 3. Install PM2 (process manager) ────────────────────────────────────
if ! command -v pm2 &> /dev/null; then
  echo "▶ [3/7] Install PM2..."
  sudo npm install -g pm2
else
  echo "▶ [3/7] PM2 sudah terinstall: $(pm2 -v)"
fi

# ── 4. Install dependencies ──────────────────────────────────────────────
echo "▶ [4/7] Install npm dependencies..."
npm install --production=false

# ── 5. Build Next.js ─────────────────────────────────────────────────────
echo "▶ [5/7] Build Next.js (production)..."
NODE_OPTIONS='--max-old-space-size=512' npm run build

# ── 6. Setup PM2 untuk autostart ─────────────────────────────────────────
echo "▶ [6/7] Setup PM2 ecosystem..."

cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: "biocng-web",
      script: "node_modules/.bin/next",
      args: "start -p 3000 -H 0.0.0.0",
      cwd: "/home/pi/BioCNG-Dashboard",  // Ganti dengan path aktual di RPi
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=512",
      },
      max_memory_restart: "450M",
      restart_delay: 3000,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "biocng-serial",
      script: "src/app/server.js",
      cwd: "/home/pi/BioCNG-Dashboard",  // Ganti dengan path aktual di RPi
      env: {
        PORT: "3001",
        SERIAL_PORT: "/dev/ttyUSB0",      // Ganti sesuai port Arduino
        BAUD_RATE: "9600",
      },
      restart_delay: 5000,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
EOF

# ── 7. Start dengan PM2 ───────────────────────────────────────────────────
echo "▶ [7/7] Start aplikasi dengan PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -1 | sudo bash -  # Autostart saat boot

echo ""
echo "✅ SELESAI!"
echo ""
echo "Dashboard tersedia di:"
IPADDR=$(hostname -I | awk '{print $1}')
echo "  → http://$IPADDR:3000"
echo "  → http://localhost:3000"
echo ""
echo "Serial server:"
echo "  → http://$IPADDR:3001/health"
echo ""
echo "Perintah berguna:"
echo "  pm2 status          — lihat status proses"
echo "  pm2 logs            — lihat log real-time"
echo "  pm2 restart all     — restart semua"
echo ""
echo "Ganti port serial Arduino di ecosystem.config.js:"
echo "  Cari portnya: ls /dev/tty*"
echo "  Lalu edit env SERIAL_PORT di ecosystem.config.js"
