const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { SerialPort, ReadlineParser } = require("serialport");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // Allow your React app to connect
    methods: ["GET", "POST"],
  },
});

// --- Serial Port Configuration ---
// IMPORTANT: Change '/dev/tty.usbmodem14201' to your actual serial port name.
// You can find this in the Arduino IDE, device manager, or by listing serial ports.
const portName = "/dev/tty.usbmodem14201"; // <-- CHANGE THIS
const port = new SerialPort({
  path: portName,
  baudRate: 9600,
});

const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

// --- WebSocket Connection ---
io.on("connection", (socket) => {
  console.log("✅ Client connected");

  // When data is received from the serial port, send it to the client
  parser.on("data", (data) => {
    try {
      // Assuming the serial data is a JSON string like:
      // {"lpmWater": 10, "lpmGas": 25, "pureGas": 80, "rawGas": 40}
      const jsonData = JSON.parse(data);
      socket.emit("serialdata", jsonData);
      console.log("Sent data to client:", jsonData);
    } catch (error) {
      console.error("Error parsing JSON from serial port:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected");
  });
});

// --- Start the Server ---
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
