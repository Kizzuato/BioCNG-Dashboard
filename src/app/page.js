"use client";

import { useEffect, useState, useRef } from "react";
import { useRive, useViewModelInstanceNumber } from "@rive-app/react-canvas";

// Konfigurasi slider untuk setiap sensor
const SENSORS = [
  { key: "lpmWater",   label: "LPM Water",   min: 0, max: 30,  step: 0.1, unit: "L/m" },
  { key: "lpmGas",     label: "LPM Gas",     min: 0, max: 20,  step: 0.1, unit: "L/m" },
  { key: "pureGas",    label: "Pure Gas",    min: 0, max: 100, step: 1,   unit: "%"   },
  { key: "rawGas",     label: "Raw Gas",     min: 0, max: 100, step: 1,   unit: "%"   },
  { key: "pressure_A", label: "Pressure A",  min: 0, max: 5,   step: 0.1, unit: "bar" },
  { key: "pressure_B", label: "Pressure B",  min: 0, max: 5,   step: 0.1, unit: "bar" },
];

export default function Home() {
  const { rive, RiveComponent } = useRive({
    src: "/rive/display_biocng.riv",
    viewModel: "View Model 1",
    stateMachines: "State Machine 1",
    autoBind: true,
    autoplay: true,
  });

  const [vmReady, setVmReady]         = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simMode, setSimMode]         = useState("auto"); // "auto" | "manual"
  const [panelOpen, setPanelOpen]     = useState(false);
  const [simValues, setSimValues]     = useState({
    lpmWater: 10, lpmGas: 5, pureGas: 50, rawGas: 50, pressure_A: 2, pressure_B: 2,
  });

  // useRef untuk menyimpan referensi ke reader agar tidak hilang saat re-render
  const readerRef      = useRef(null);
  const portRef        = useRef(null);
  const simIntervalRef = useRef(null);
  // Ref untuk setter Rive agar bisa diakses di dalam interval simulasi
  const settersRef     = useRef({});

  useEffect(() => {
    if (rive?.viewModelInstance) {
      console.log("✅ viewModelInstance ready");
      setVmReady(true);
    }
  }, [rive]);

  // Bind semua input number yang ingin dikontrol
  const { setValue: setLpmWater  } = useViewModelInstanceNumber("LPM_WATER",        vmReady ? rive.viewModelInstance : null);
  const { setValue: setLpmGas    } = useViewModelInstanceNumber("LPM_GAS",          vmReady ? rive.viewModelInstance : null);
  const { setValue: setPureGas   } = useViewModelInstanceNumber("Progress_puregas", vmReady ? rive.viewModelInstance : null);
  const { setValue: setRawGas    } = useViewModelInstanceNumber("Progress_rawgas",  vmReady ? rive.viewModelInstance : null);
  const { setValue: setPressureA } = useViewModelInstanceNumber("PRESSURE_A",       vmReady ? rive.viewModelInstance : null);
  const { setValue: setPressureB } = useViewModelInstanceNumber("PRESSURE_B",       vmReady ? rive.viewModelInstance : null);

  // Simpan semua setter ke ref agar bisa dipakai di dalam interval tanpa stale closure
  useEffect(() => {
    settersRef.current = { setLpmWater, setLpmGas, setPureGas, setRawGas, setPressureA, setPressureB };
  }, [setLpmWater, setLpmGas, setPureGas, setRawGas, setPressureA, setPressureB]);

  // Kirim nilai ke Rive
  const applyToRive = (vals) => {
    const { setLpmWater, setLpmGas, setPureGas, setRawGas, setPressureA, setPressureB } = settersRef.current;
    setLpmWater?.(vals.lpmWater);
    setLpmGas?.(vals.lpmGas);
    setPureGas?.(vals.pureGas);
    setRawGas?.(vals.rawGas);
    setPressureA?.(vals.pressure_A);
    setPressureB?.(vals.pressure_B);
  };

  // Helper: angka acak dalam rentang [min, max]
  const rand = (min, max) => +(Math.random() * (max - min) + min).toFixed(2);

  // Mulai simulasi
  const handleStartSim = () => {
    if (!vmReady) { alert("Animasi Rive belum siap. Tunggu sebentar lalu coba lagi."); return; }
    setIsSimulating(true);
    if (simMode === "auto") {
      simIntervalRef.current = setInterval(() => {
        const auto = {
          lpmWater: rand(0, 30), lpmGas: rand(0, 20),
          pureGas: rand(0, 100), rawGas: rand(0, 100),
          pressure_A: rand(0, 5), pressure_B: rand(0, 5),
        };
        setSimValues(auto);
        applyToRive(auto);
        console.log("🎮 Auto simulasi:", auto);
      }, 1000);
    } else {
      // Manual: langsung terapkan nilai slider saat ini
      applyToRive(simValues);
    }
  };

  // Stop simulasi
  const handleStopSim = () => {
    clearInterval(simIntervalRef.current);
    simIntervalRef.current = null;
    setIsSimulating(false);
    console.log("🛑 Simulasi dihentikan.");
  };

  // Saat slider berubah di mode manual + sedang simulasi
  const handleSliderChange = (key, value) => {
    const next = { ...simValues, [key]: +value };
    setSimValues(next);
    if (isSimulating && simMode === "manual") applyToRive(next);
  };

  // Jika mode berubah saat sedang simulasi, restart
  const handleModeChange = (mode) => {
    if (isSimulating) handleStopSim();
    setSimMode(mode);
  };

  // Bersihkan interval saat komponen di-unmount
  useEffect(() => { return () => clearInterval(simIntervalRef.current); }, []);

  // Fungsi untuk meminta akses port dan mulai membaca data
  const handleConnect = async () => {
    if (!("serial" in navigator)) {
      alert("Browser Anda tidak mendukung Web Serial API. Gunakan Chrome atau Edge.");
      return;
    }
    try {
      // Minta pengguna untuk memilih port serial
      const port = await navigator.serial.requestPort();
      portRef.current = port;
      // Buka port dengan baud rate yang sesuai
      await port.open({ baudRate: 9600 });
      setIsConnected(true);
      console.log("🔌 Serial port connected!");
      // Mulai membaca data dari port
      readFromPort(port);
    } catch (error) {
      console.error("Gagal menghubungkan ke serial port:", error);
    }
  };

  const readFromPort = async (port) => {
    // Pastikan semua setter Rive sudah siap
    if (!setLpmWater || !setLpmGas || !setPureGas || !setRawGas || !setPressureA || !setPressureB) return;

    // Buffer untuk menampung data yang masuk
    let lineBuffer = "";
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // Tambahkan potongan data yang baru diterima ke buffer
        lineBuffer += value;

        // Proses setiap baris lengkap (diakhiri dengan newline) yang ada di buffer
        // Menggunakan 'while' untuk menangani kasus jika ada lebih dari satu baris di buffer
        while (lineBuffer.includes("\n")) {
          const newlineIndex = lineBuffer.indexOf("\n");
          // Ambil satu baris data utuh (sebelum newline)
          const jsonString = lineBuffer.substring(0, newlineIndex).trim();
          // Potong buffer, sisakan data yang belum diproses
          lineBuffer = lineBuffer.substring(newlineIndex + 1);
          if (jsonString) {
            try {
              const data = JSON.parse(jsonString);
              setLpmWater(data.lpmWater);
              setLpmGas(data.lpmGas);
              setPureGas(data.pureGas);
              setRawGas(data.rawGas);
              setPressureA(data.pressure_A);
              setPressureB(data.pressure_B);
              console.log("✅ Data utuh diterima:", data);
            } catch (e) {
              console.warn("⚠️ Gagal parse JSON, data diterima:", jsonString);
            }
          }
        }
      }
    } catch (error) {
      console.error("Terjadi error saat membaca data:", error);
    } finally {
      reader.releaseLock();
    }
  };

  // Fungsi untuk disconnect
  const handleDisconnect = async () => {
    if (readerRef.current) {
      await readerRef.current.cancel();
      readerRef.current.releaseLock();
      readerRef.current = null;
    }
    if (portRef.current) {
      await portRef.current.close();
      portRef.current = null;
    }
    setIsConnected(false);
    console.log("🔌 Serial port disconnected.");
  };

  return (
    <div className="w-screen h-screen bg-[#313131]" suppressHydrationWarning={true}>
      <RiveComponent className="w-screen h-full" />

      {/* ── Panel Simulasi ── */}
      <div style={styles.panelWrapper}>

        {/* Header panel — selalu tampil */}
        <div style={styles.panelHeader}>

          {/* Tombol Serial */}
          <button
            onClick={isConnected ? handleDisconnect : handleConnect}
            style={{ ...styles.chipBtn, background: isConnected ? "#7f1d1d" : "#1c3a5e" }}
          >
            <span style={styles.dot(isConnected ? "#f87171" : "#60a5fa")} />
            {isConnected ? "Disconnect" : "Serial"}
          </button>

          {/* Label judul */}
          <span style={styles.panelTitle}>SIMULASI</span>

          {/* Toggle expand */}
          <button onClick={() => setPanelOpen(p => !p)} style={styles.toggleBtn}>
            {panelOpen ? "▾" : "▸"}
          </button>
        </div>

        {/* Body panel — hanya tampil saat terbuka */}
        {panelOpen && (
          <div style={styles.panelBody}>

            {/* Mode toggle */}
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

            {/* Sliders — hanya di mode manual */}
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

            {/* Tombol start/stop */}
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

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = {
  panelWrapper: {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "240px",
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
  panelTitle: {
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "2px",
    color: "#6b6b6b",
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
