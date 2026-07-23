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
const BAUD_RATE = parseInt(process.env.BAUD_RATE || "115200", 10);

let port = null;
let parser = null;
let lastData = null;

const DEFAULT_SENSOR_DATA = {
  lpmWater: 0,
  lpmGas: 0,
  pureGas: 0,
  rawGas: 0,
  pressure_A: 0,
  pressure_B: 0,
};

const SENSOR_ALIASES = {
  lpmWater: ["lpmWater", "LPM_WATER", "flowWater", "waterFlow", "flow_rate", "flowRate", "debitAir", "debit", "water", "lpm"],
  lpmGas: ["lpmGas", "LPM_GAS", "flowGas", "gasFlow"],
  pureGas: ["pureGas", "Progress_puregas", "pure_gas"],
  rawGas: ["rawGas", "Progress_rawgas", "raw_gas"],
  pressure_A: ["pressure_A", "PRESSURE_A", "pressureA"],
  pressure_B: ["pressure_B", "PRESSURE_B", "pressureB"],
};

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (normalized) {
      const parsed = Number(normalized[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function readAliasedNumber(source, key) {
  for (const alias of SENSOR_ALIASES[key]) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) {
      const value = toNumber(source[alias]);
      if (value !== null) return value;
    }
  }
  return null;
}

function parseSerialLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    const numericLine = new RegExp("^\\s*-?\\d+(?:[.,]\\d+)?\\s*\x24").test(line);
    const flowMatch = line.match(new RegExp("\\bFlow\\s*:\\s*(-?\\d+(?:[.,]\\d+)?)", "i"));
    if (!numericLine && !flowMatch) return null;

    const value = flowMatch ? toNumber(flowMatch[1]) : toNumber(line);
    return value === null ? null : { lpmWater: value };
  }
}

function normalizeSensorData(rawData) {
  const previous = lastData || DEFAULT_SENSOR_DATA;
  const next = { ...previous };

  if (typeof rawData === "number") {
    next.lpmWater = rawData;
    return next;
  }

  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    return null;
  }

  let hasValue = false;
  for (const key of Object.keys(DEFAULT_SENSOR_DATA)) {
    const value = readAliasedNumber(rawData, key);
    if (value !== null) {
      next[key] = value;
      hasValue = true;
    }
  }

  return hasValue ? next : null;
}

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
      const line = rawData.trim();
      if (!line) return;

      try {
        const parsedData = parseSerialLine(line);
        const sensorData = normalizeSensorData(parsedData);
        if (!sensorData) {
          console.warn("⚠️  Format data serial tidak dikenali:", line);
          return;
        }

        lastData = sensorData;
        // Broadcast ke semua client yang terhubung
        io.emit("serialdata", sensorData);
        console.log("📡 Data:", JSON.stringify(sensorData));
      } catch (error) {
        console.warn("⚠️  Gagal proses data serial:", line, error.message);
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
