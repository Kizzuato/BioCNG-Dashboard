"use client";

import { useEffect, useState, useRef } from "react";

// Posisi awal overlay (dalam persentase agar responsif).
// Nanti kamu bisa sesuaikan angka top & left ini berdasarkan hasil drag & drop.
const INITIAL_POSITIONS = {
  lpmWater:   { top: 40, left: 20 },
  lpmGas:     { top: 40, left: 40 },
  pureGas:    { top: 60, left: 60 },
  rawGas:     { top: 60, left: 80 },
  pressure_A: { top: 20, left: 70 },
  pressure_B: { top: 20, left: 90 },
};

const SENSORS = [
  { key: "lpmWater",   label: "LPM Water",   min: 0, max: 30,  step: 0.1, unit: "L/m" },
  { key: "lpmGas",     label: "LPM Gas",     min: 0, max: 20,  step: 0.1, unit: "L/m" },
  { key: "pureGas",    label: "Pure Gas",    min: 0, max: 100, step: 1,   unit: "%"   },
  { key: "rawGas",     label: "Raw Gas",     min: 0, max: 100, step: 1,   unit: "%"   },
  { key: "pressure_A", label: "Pressure A",  min: 0, max: 5,   step: 0.1, unit: "bar" },
  { key: "pressure_B", label: "Pressure B",  min: 0, max: 5,   step: 0.1, unit: "bar" },
];

export default function DashboardReact() {
  // --- STATE SENSOR ---
  const [data, setData] = useState({
    lpmWater: 0, lpmGas: 0, pureGas: 0, rawGas: 0, pressure_A: 0, pressure_B: 0,
  });

  // --- STATE POSISI OVERLAY (BISA DIDRAG) ---
  const [positions, setPositions] = useState(INITIAL_POSITIONS);
  const [isEditMode, setIsEditMode] = useState(true); // Default true agar bisa diposisikan dulu
  const containerRef = useRef(null);

  // --- STATE KONTROL ---
  const [isConnected, setIsConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simMode, setSimMode] = useState("auto");
  const [panelOpen, setPanelOpen] = useState(true);
  const [simValues, setSimValues] = useState({
    lpmWater: 15, lpmGas: 10, pureGas: 50, rawGas: 60, pressure_A: 2.5, pressure_B: 2.5,
  });

  const readerRef = useRef(null);
  const portRef = useRef(null);
  const simIntervalRef = useRef(null);

  // --- LOGIKA SERIAL ---
  const handleConnect = async () => {
    if (!("serial" in navigator)) { alert("Browser tidak mendukung Web Serial API."); return; }
    try {
      const port = await navigator.serial.requestPort();
      portRef.current = port;
      await port.open({ baudRate: 9600 });
      setIsConnected(true);
      readFromPort(port);
    } catch (error) { console.error(error); }
  };

  const readFromPort = async (port) => {
    let lineBuffer = "";
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        lineBuffer += value;
        while (lineBuffer.includes("\n")) {
          const newlineIndex = lineBuffer.indexOf("\n");
          const jsonString = lineBuffer.substring(0, newlineIndex).trim();
          lineBuffer = lineBuffer.substring(newlineIndex + 1);
          if (jsonString) {
            try {
              const parsed = JSON.parse(jsonString);
              setData({
                lpmWater: parsed.lpmWater || 0, lpmGas: parsed.lpmGas || 0,
                pureGas: parsed.pureGas || 0, rawGas: parsed.rawGas || 0,
                pressure_A: parsed.pressure_A || 0, pressure_B: parsed.pressure_B || 0,
              });
            } catch (e) {}
          }
        }
      }
    } catch (error) {} finally { reader.releaseLock(); }
  };

  const handleDisconnect = async () => {
    if (readerRef.current) { await readerRef.current.cancel(); readerRef.current.releaseLock(); readerRef.current = null; }
    if (portRef.current) { await portRef.current.close(); portRef.current = null; }
    setIsConnected(false);
  };

  // --- LOGIKA SIMULASI ---
  const rand = (min, max) => +(Math.random() * (max - min) + min).toFixed(2);
  const handleStartSim = () => {
    setIsSimulating(true);
    if (simMode === "auto") {
      simIntervalRef.current = setInterval(() => {
        const autoVals = {
          lpmWater: rand(0, 30), lpmGas: rand(0, 20),
          pureGas: rand(0, 100), rawGas: rand(0, 100),
          pressure_A: rand(0, 5), pressure_B: rand(0, 5),
        };
        setSimValues(autoVals); setData(autoVals);
      }, 1000);
    } else { setData(simValues); }
  };
  const handleStopSim = () => { clearInterval(simIntervalRef.current); simIntervalRef.current = null; setIsSimulating(false); };
  const handleSliderChange = (key, value) => {
    const next = { ...simValues, [key]: +value };
    setSimValues(next);
    if (isSimulating && simMode === "manual") setData(next);
  };
  const handleModeChange = (mode) => { if (isSimulating) handleStopSim(); setSimMode(mode); };
  useEffect(() => { return () => clearInterval(simIntervalRef.current); }, []);

  // --- LOGIKA DRAG & DROP UNTUK MENENTUKAN POSISI OVERLAY ---
  const handleDragEnd = (key, e) => {
    if (!containerRef.current || !isEditMode) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Hitung persentase
    const left = (x / rect.width) * 100;
    const top = (y / rect.height) * 100;
    
    setPositions(prev => {
      const newPos = { ...prev, [key]: { top, left } };
      console.log("📍 Posisi Baru:", JSON.stringify(newPos, null, 2));
      return newPos;
    });
  };

  return (
    <div className="w-screen h-screen bg-[#111111] flex items-center justify-center overflow-hidden font-sans relative">
      
      {/* Container utama gambar & overlay */}
      <div 
        ref={containerRef}
        className="relative shadow-2xl"
        style={{ width: "95vw", height: "95vh", maxHeight: "1080px", maxWidth: "1920px" }}
      >
        {/* Gambar desain dashboard asli dari user */}
        <img 
          src="/bg-dashboard.png" 
          alt="Dashboard UI" 
          className="w-full h-full object-contain pointer-events-none"
        />

        {/* OVERLAYS DATA */}
        {SENSORS.map(s => {
          const val = data[s.key];
          const pos = positions[s.key];
          
          return (
            <div
              key={s.key}
              draggable={isEditMode}
              onDragEnd={(e) => handleDragEnd(s.key, e)}
              style={{
                position: "absolute",
                top: `${pos.top}%`,
                left: `${pos.left}%`,
                transform: "translate(-50%, -50%)", // Center align
                cursor: isEditMode ? "move" : "default",
                border: isEditMode ? "2px dashed #fbbf24" : "none",
                backgroundColor: isEditMode ? "rgba(0,0,0,0.6)" : "transparent",
              }}
              className="flex flex-col items-center justify-center px-4 py-2 rounded-lg text-white"
            >
              {isEditMode && <span className="text-[10px] text-yellow-400 font-bold mb-1 uppercase tracking-widest">{s.key}</span>}
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black font-mono drop-shadow-md text-white">
                  {val.toFixed(1)}
                </span>
                {isEditMode && <span className="text-sm font-bold text-gray-300 drop-shadow-md">{s.unit}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* --- PANEL SIMULASI --- */}
      <div style={styles.panelWrapper}>
        <div style={styles.panelHeader}>
          <button
            onClick={isConnected ? handleDisconnect : handleConnect}
            style={{ ...styles.chipBtn, background: isConnected ? "#7f1d1d" : "#1c3a5e" }}
          >
            <span style={styles.dot(isConnected ? "#f87171" : "#60a5fa")} />
            {isConnected ? "Disconnect" : "Serial"}
          </button>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setIsEditMode(!isEditMode)} 
              className={`text-xs px-2 py-1 rounded border font-bold ${isEditMode ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500' : 'bg-gray-700 text-gray-400 border-gray-600'}`}
            >
              {isEditMode ? "🛠 EDIT POSISI" : "👁 VIEW MODE"}
            </button>
            <button onClick={() => setPanelOpen(p => !p)} style={styles.toggleBtn}>
              {panelOpen ? "▾" : "▸"}
            </button>
          </div>
        </div>

        {panelOpen && (
          <div style={styles.panelBody}>
            <div style={styles.modeRow}>
              {["auto", "manual"].map(m => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  style={{ ...styles.modeBtn, ...(simMode === m ? styles.modeBtnActive : {}) }}
                >
                  {m === "auto" ? "Auto" : "Manual"}
                </button>
              ))}
            </div>

            {simMode === "manual" && (
              <div style={styles.sliderList}>
                {SENSORS.map(s => (
                  <div key={s.key} style={styles.sliderRow}>
                    <div style={styles.sliderMeta}>
                      <span style={styles.sliderLabel}>{s.label}</span>
                      <span style={styles.sliderVal}>{simValues[s.key]} {s.unit}</span>
                    </div>
                    <input
                      type="range"
                      min={s.min} max={s.max} step={s.step}
                      value={simValues[s.key]}
                      onChange={e => handleSliderChange(s.key, e.target.value)}
                      style={styles.slider}
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={isSimulating ? handleStopSim : handleStartSim}
              style={{ ...styles.runBtn, background: isSimulating ? "#3d2b00" : "#0e2a1a" }}
            >
              <span style={styles.dot(isSimulating ? "#fbbf24" : "#4ade80")} />
              {isSimulating ? "Stop Simulasi" : "Mulai Simulasi"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles untuk Panel ────────────────────────────────────────────────────────
const styles = {
  panelWrapper: {
    position: "fixed",
    bottom: "20px",
    left: "20px", // Pindah ke kiri agar tidak nabrak gauge kanan
    width: "260px",
    background: "#272727",
    border: "1px solid #3f3f3f",
    borderRadius: "10px",
    overflow: "hidden",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    fontFamily: "'Geist', 'Inter', sans-serif",
    zIndex: 1000,
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    background: "#2c2c2c",
    borderBottom: "1px solid #3a3a3a",
  },
  chipBtn: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    border: "none",
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: "600",
    color: "#d1d5db",
    cursor: "pointer",
  },
  toggleBtn: {
    background: "none",
    border: "none",
    color: "#6b6b6b",
    fontSize: "14px",
    cursor: "pointer",
    padding: "0 2px",
    lineHeight: 1,
  },
  panelBody: {
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  modeRow: {
    display: "flex",
    gap: "6px",
  },
  modeBtn: {
    flex: 1,
    padding: "5px 0",
    border: "1px solid #3f3f3f",
    borderRadius: "6px",
    background: "#1e1e1e",
    color: "#6b6b6b",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  modeBtnActive: {
    background: "#2d3748",
    border: "1px solid #4a5568",
    color: "#e2e8f0",
  },
  sliderList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  sliderRow: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  sliderMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sliderLabel: {
    fontSize: "11px",
    color: "#9ca3af",
    fontWeight: "500",
  },
  sliderVal: {
    fontSize: "11px",
    color: "#d1d5db",
    fontWeight: "600",
    fontVariantNumeric: "tabular-nums",
  },
  slider: {
    width: "100%",
    accentColor: "#4a5568",
    cursor: "pointer",
  },
  runBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    width: "100%",
    padding: "8px 0",
    border: "1px solid #3a3a3a",
    borderRadius: "7px",
    color: "#d1d5db",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    letterSpacing: "0.5px",
  },
  dot: (color) => ({
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: color,
    display: "inline-block",
    flexShrink: 0,
  }),
};
