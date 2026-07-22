const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const { SerialPort, ReadlineParser } = require("serialport");

const app    = express();
const server = http.createServer(app);

// ── Socket.IO — izinkan semua origin untuk akses dari browser di jaringan lokal ──
const io = new Server(server, {
  cors: {
    origin: "*",  // Izinkan semua — cocok untuk jaringan lokal RPi
    methods: ["GET", "POST"],
  },
  // Opsi performa untuk RPi
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"], // Prefer WebSocket
});

// ── Serial Port Configuration ─────────────────────────────────────────────────
// Ganti sesuai port serial di Raspberry Pi
// Biasanya: /dev/ttyUSB0 (USB Serial) atau /dev/ttyACM0 (Arduino via USB)
// Cek dengan perintah: ls /dev/tty*
const PORT_NAME = process.env.SERIAL_PORT || "/dev/ttyUSB0";
const BAUD_RATE = parseInt(process.env.BAUD_RATE || "9600");

let port = null;
let parser = null;
let lastData = null;

function initSerial() {
  try {
    port = new SerialPort({ path: PORT_NAME, baudRate: BAUD_RATE });
    parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

    port.on("open", () => {
      console.log(`✅ Serial port ${PORT_NAME} terbuka @ ${BAUD_RATE} baud`);
    });

    port.on("error", (err) => {
      console.error(`❌ Serial error: ${err.message}`);
    });

    parser.on("data", (rawData) => {
      try {
        const jsonData = JSON.parse(rawData.trim());
        lastData = jsonData;
        // Broadcast ke semua client yang terhubung
        io.emit("serialdata", jsonData);
        console.log("📡 Data:", JSON.stringify(jsonData));
      } catch (error) {
        console.warn("⚠️  Gagal parse JSON:", rawData.trim());
      }
    });

  } catch (err) {
    console.warn(`⚠️  Serial port tidak tersedia: ${err.message}`);
    console.warn("    Server tetap berjalan (mode tanpa serial).");
  }
}

// ── Socket.IO Events ──────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`🔌 Client terhubung: ${socket.id} dari ${socket.handshake.address}`);

  // Kirim data terakhir segera ke client baru agar tidak menunggu tick berikutnya
  if (lastData) {
    socket.emit("serialdata", lastData);
  }

  socket.on("disconnect", (reason) => {
    console.log(`🔌 Client terputus: ${socket.id} (${reason})`);
  });
});

// ── Health check endpoint ─────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    serial: port?.isOpen ? "connected" : "disconnected",
    port: PORT_NAME,
    clients: io.engine.clientsCount,
    uptime: Math.floor(process.uptime()),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const HTTP_PORT = parseInt(process.env.PORT || "3001");

// Inisialisasi serial setelah server siap
server.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`🚀 Socket.IO server berjalan di http://0.0.0.0:${HTTP_PORT}`);
  console.log(`📡 Health check: http://localhost:${HTTP_PORT}/health`);
  initSerial();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGINT",  () => { console.log("\n🛑 Menutup server..."); if (port?.isOpen) port.close(); process.exit(0); });
process.on("SIGTERM", () => { console.log("\n🛑 Menutup server..."); if (port?.isOpen) port.close(); process.exit(0); });
