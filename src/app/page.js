"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRive, useViewModelInstanceNumber } from "@rive-app/react-canvas";
import { io } from "socket.io-client";

// ── Sensor config ─────────────────────────────────────────────────────────────
const SENSORS = [
  { key: "lpmWater",   label: "Flow Water",  min: 0, max: 30,  step: 0.1, unit: "L/m"  },
  { key: "lpmGas",     label: "Flow Gas",    min: 0, max: 20,  step: 0.1, unit: "L/m"  },
  { key: "pureGas",    label: "Pure Gas",    min: 0, max: 100, step: 1,   unit: "%"    },
  { key: "rawGas",     label: "Raw Gas",     min: 0, max: 100, step: 1,   unit: "%"    },
  { key: "pressure_A", label: "Pressure A",  min: 0, max: 5,   step: 0.1, unit: "bar"  },
  { key: "pressure_B", label: "Pressure B",  min: 0, max: 5,   step: 0.1, unit: "bar"  },
];

// History lebih pendek untuk hemat RAM di RPi
const HISTORY_LEN = 30;
const ACCENT = "#8892a4";
const ACCENT_FILL = "rgba(136,146,164,0.55)";
const ACCENT_DIM = "rgba(136,146,164,0.18)";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || null;
const SENSOR_KEYS = SENSORS.map((sensor) => sensor.key);
const INITIAL_SENSOR_DATA = {
  lpmWater: 0,
  lpmGas: 0,
  pureGas: 0,
  rawGas: 0,
  pressure_A: 0,
  pressure_B: 0,
};

function getSocketUrl() {
  if (SOCKET_URL) return SOCKET_URL;
  if (typeof window === "undefined") return "http://localhost:3001";
  return window.location.protocol + "//" + window.location.hostname + ":3001";
}

function toSensorNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function normalizeIncomingData(rawData, previousData) {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return null;

  const next = { ...previousData };
  let hasValue = false;
  for (const key of SENSOR_KEYS) {
    const value = toSensorNumber(rawData[key]);
    if (value !== null) {
      next[key] = value;
      hasValue = true;
    }
  }

  return hasValue ? next : null;
}

// ── Mini Sparkline SVG — dioptimasi (memoized) ────────────────────────────────
const Sparkline = ({ history, max }) => {
  const W = 160, H = 34;
  const pts = useMemo(() => {
    if (history.length < 2) return null;
    return history.map((v, i) => {
      const x = (i / (HISTORY_LEN - 1)) * W;
      const y = H - Math.max(2, (v / (max || 1)) * (H - 4));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
  }, [history, max]);

  if (!pts) return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
    </svg>
  );

  const lastIdx = history.length - 1;
  const lastX = (lastIdx / (HISTORY_LEN - 1)) * W;
  const lastY = H - Math.max(2, (history[lastIdx] / (max || 1)) * (H - 4));
  const areaPath = `M 0,${H} L ${pts.join(" L ")} L ${(lastIdx / (HISTORY_LEN - 1)) * W},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={ACCENT} stopOpacity="0.20" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkGrad)" />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill={ACCENT} opacity="0.9" />
    </svg>
  );
};

// ── Parameter Card — TANPA backdropFilter (berat di RPi GPU) ─────────────────
const ParamCard = ({ sensor, value, history }) => {
  const pct = useMemo(() =>
    Math.min(100, Math.max(0, (value / sensor.max) * 100)),
    [value, sensor.max]
  );
  const prev      = history.length >= 2 ? history[history.length - 2] : value;
  const delta     = value - prev;
  const trendUp   = delta >  0.01;
  const trendDown = delta < -0.01;

  return (
    <div style={cardStyles.card}>
      <div style={cardStyles.header}>
        <span style={cardStyles.label}>{sensor.label.toUpperCase()}</span>
        <span style={{
          ...cardStyles.trend,
          color: trendUp ? "#9ca3af" : trendDown ? "#6b7280" : "#3f3f46",
        }}>
          {trendUp ? "▲" : trendDown ? "▼" : "—"}
        </span>
      </div>

      <div style={cardStyles.valueRow}>
        <span style={cardStyles.value}>
          {value.toFixed(sensor.step < 1 ? 1 : 0)}
        </span>
        <span style={cardStyles.unit}>{sensor.unit}</span>
      </div>

      <div style={cardStyles.chartWrap}>
        <Sparkline history={history} max={sensor.max} />
      </div>

      <div style={cardStyles.barBg}>
        <div style={{ ...cardStyles.barFill, width: `${pct}%` }} />
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function Home() {
  const { rive, RiveComponent } = useRive({
    src: "/rive/display_biocng.riv",
    viewModel: "View Model 1",
    stateMachines: "State Machine 1",
    autoBind: true,
    autoplay: true,
    // Gunakan canvas renderer yang lebih ringan (default)
    useDevicePixelRatio: false, // Matikan DPR scaling — hemat GPU di RPi
  });

  const [vmReady,       setVmReady]       = useState(false);
  const [isConnected,   setIsConnected]   = useState(false);
  const [isSimulating,  setIsSimulating]  = useState(false);
  const [simMode,       setSimMode]       = useState("auto");
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [simValues,     setSimValues]     = useState({
    lpmWater: 10, lpmGas: 5, pureGas: 50, rawGas: 50, pressure_A: 2, pressure_B: 2,
  });
  const [sensorData,    setSensorData]    = useState(INITIAL_SENSOR_DATA);
  const [history, setHistory] = useState({
    lpmWater: [], lpmGas: [], pureGas: [], rawGas: [], pressure_A: [], pressure_B: [],
  });

  const readerRef      = useRef(null);
  const portRef        = useRef(null);
  const simIntervalRef = useRef(null);
  const socketRef      = useRef(null);
  const settersRef     = useRef({});
  // Batch update: kumpulkan perubahan history agar tidak re-render tiap tick
  const pendingHistoryRef = useRef(null);
  const latestDataRef = useRef(INITIAL_SENSOR_DATA);

  useEffect(() => {
    if (rive?.viewModelInstance) setVmReady(true);
  }, [rive]);

  // ── Auto-start simulasi begitu Rive siap ─────────────────────────────────
  useEffect(() => {
    if (!vmReady) return;
    if (simIntervalRef.current) return; // cegah double-start
    simIntervalRef.current = setInterval(tickRealistic, 1000);
    setIsSimulating(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmReady]);

  const vmInst = vmReady ? rive.viewModelInstance : null;
  const { setValue: setLpmWater  } = useViewModelInstanceNumber("LPM_WATER",        vmInst);
  const { setValue: setLpmGas    } = useViewModelInstanceNumber("LPM_GAS",          vmInst);
  const { setValue: setPureGas   } = useViewModelInstanceNumber("Progress_puregas", vmInst);
  const { setValue: setRawGas    } = useViewModelInstanceNumber("Progress_rawgas",  vmInst);
  const { setValue: setPressureA } = useViewModelInstanceNumber("PRESSURE_A",       vmInst);
  const { setValue: setPressureB } = useViewModelInstanceNumber("PRESSURE_B",       vmInst);

  useEffect(() => {
    settersRef.current = { setLpmWater, setLpmGas, setPureGas, setRawGas, setPressureA, setPressureB };
  }, [setLpmWater, setLpmGas, setPureGas, setRawGas, setPressureA, setPressureB]);

  // Update Rive langsung tanpa React state (lebih cepat)
  const applyRive = useCallback((vals) => {
    const { setLpmWater, setLpmGas, setPureGas, setRawGas, setPressureA, setPressureB } = settersRef.current;
    setLpmWater?.(vals.lpmWater);
    setLpmGas?.(vals.lpmGas);
    setPureGas?.(vals.pureGas);
    setRawGas?.(vals.rawGas);
    setPressureA?.(vals.pressure_A);
    setPressureB?.(vals.pressure_B);
  }, []);

  const applyData = useCallback((vals) => {
    latestDataRef.current = vals;
    applyRive(vals);
    setSensorData({ ...vals });
    // Simpan ke ref dulu, flush ke state setiap 2 detik (kurangi re-render)
    pendingHistoryRef.current = vals;
  }, [applyRive]);

  useEffect(() => {
    const socket = io(getSocketUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("serialdata", (rawData) => {
      const nextData = normalizeIncomingData(rawData, latestDataRef.current);
      if (!nextData) return;

      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
      setIsSimulating(false);
      applyData(nextData);
    });

    socket.on("connect_error", (error) => {
      console.warn("Socket.IO serial bridge belum terhubung:", error.message);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("serialdata");
      socket.off("connect_error");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyData]);

  // Flush history ke state setiap 2 detik agar card tidak re-render tiap tick
  useEffect(() => {
    const flush = setInterval(() => {
      const vals = pendingHistoryRef.current;
      if (!vals) return;
      pendingHistoryRef.current = null;
      setHistory(prev => {
        const next = { ...prev };
        SENSORS.forEach(s => {
          const arr = [...(prev[s.key] || []), vals[s.key]];
          next[s.key] = arr.length > HISTORY_LEN ? arr.slice(arr.length - HISTORY_LEN) : arr;
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(flush);
  }, []);

  // ── Realistic BioCNG simulation ──────────────────────────────────────────
  const clamp = useCallback((v, lo, hi) => Math.min(hi, Math.max(lo, v)), []);
  const walk  = useCallback((cur, target, speed, noise) =>
    cur + (target - cur) * speed + (Math.random() - 0.5) * noise, []);

  const simStateRef = useRef({
    lpmGas: 12, lpmWater: 19, rawGas: 63, pureGas: 93,
    pressure_A: 3.1, pressure_B: 2.6, gasTarget: 12,
  });

  const tickRealistic = useCallback(() => {
    const s = simStateRef.current;
    s.gasTarget = clamp(walk(s.gasTarget, 12, 0.04, 1.2), 8, 17);
    const lpmGas = clamp(walk(s.lpmGas, s.gasTarget, 0.18, 0.4), 6, 18);
    const waterTarget = lpmGas * 1.65 + (Math.random() - 0.5) * 0.6;
    const lpmWater = clamp(walk(s.lpmWater, waterTarget, 0.15, 0.35), 5, 28);
    const rawGas = clamp(walk(s.rawGas, 63, 0.05, 0.8), 54, 71);
    const ratio = lpmWater / Math.max(lpmGas, 0.1);
    const efficiency = clamp((ratio - 0.8) / 1.4, 0, 1);
    const pureTarget = 84 + efficiency * 14;
    const pureGas = clamp(walk(s.pureGas, pureTarget, 0.12, 0.5), 80, 98);
    const pATarget = 1.8 + lpmGas * 0.11;
    const pressure_A = clamp(walk(s.pressure_A, pATarget, 0.14, 0.06), 1.5, 5.0);
    const pBTarget = pressure_A * 0.87 - 0.05;
    const pressure_B = clamp(walk(s.pressure_B, pBTarget, 0.14, 0.05), 1.2, 4.5);
    Object.assign(s, { lpmGas, lpmWater, rawGas, pureGas, pressure_A, pressure_B });
    const vals = { lpmGas, lpmWater, rawGas, pureGas, pressure_A, pressure_B };
    setSimValues(vals);
    applyData(vals);
  }, [applyData, clamp, walk]);

  const handleStartSim = useCallback(() => {
    if (!vmReady) { alert("Animasi Rive belum siap. Tunggu sebentar lalu coba lagi."); return; }
    setIsSimulating(true);
    if (simMode === "auto") {
      // 1000ms cukup untuk display — setengah lebih hemat CPU dari 600ms
      simIntervalRef.current = setInterval(tickRealistic, 1000);
    } else {
      applyData(simValues);
    }
  }, [vmReady, simMode, tickRealistic, applyData, simValues]);

  const handleStopSim = useCallback(() => {
    clearInterval(simIntervalRef.current);
    simIntervalRef.current = null;
    setIsSimulating(false);
  }, []);

  const handleSliderChange = useCallback((key, value) => {
    const next = { ...simValues, [key]: +value };
    setSimValues(next);
    if (isSimulating && simMode === "manual") applyData(next);
  }, [simValues, isSimulating, simMode, applyData]);

  const handleModeChange = useCallback((mode) => {
    if (isSimulating) handleStopSim();
    setSimMode(mode);
  }, [isSimulating, handleStopSim]);

  useEffect(() => { return () => clearInterval(simIntervalRef.current); }, []);

  // ── Web Serial ─────────────────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!("serial" in navigator)) {
      alert("Browser Anda tidak mendukung Web Serial API.\nGunakan Chrome atau Chromium.");
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      portRef.current = port;
      await port.open({ baudRate: 115200 });
      setIsConnected(true);
      readFromPort(port);
    } catch (error) { console.error("Gagal menghubungkan ke serial port:", error); }
  }, []);

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
          const jsonString   = lineBuffer.substring(0, newlineIndex).trim();
          lineBuffer         = lineBuffer.substring(newlineIndex + 1);
          if (jsonString) {
            try { applyData(JSON.parse(jsonString)); }
            catch (e) { console.warn("⚠️ Gagal parse JSON:", jsonString); }
          }
        }
      }
    } catch (error) { console.error("Error membaca data:", error); }
    finally { reader.releaseLock(); }
  };

  const handleDisconnect = useCallback(async () => {
    if (readerRef.current) {
      try { await readerRef.current.cancel(); } catch {}
      try { readerRef.current.releaseLock(); } catch {}
      readerRef.current = null;
    }
    if (portRef.current) {
      try { await portRef.current.close(); } catch {}
      portRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // ── Memoized sensor cards agar tidak re-render semua saat satu berubah ──
  const sensorCards = useMemo(() =>
    SENSORS.map(s => (
      <ParamCard
        key={s.key}
        sensor={s}
        value={sensorData[s.key]}
        history={history[s.key] || []}
      />
    )),
    [sensorData, history]
  );

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#313131", position: "relative", overflow: "hidden" }} suppressHydrationWarning={true}>
      <RiveComponent style={{ width: "100%", height: "100%" }} />

      {/* ── Parameter Cards — horizontal top bar ─────────────────────────── */}
      <div style={topBarStyles.wrapper}>
        {sensorCards}
      </div>

      {/* Panel simulasi disembunyikan — simulasi berjalan otomatis */}
      {false && <div style={panelStyles.wrapper}>
        <div style={panelStyles.header}>
          <button
            onClick={isConnected ? handleDisconnect : handleConnect}
            style={{ ...panelStyles.chipBtn, background: isConnected ? "#7f1d1d" : "#1c3a5e" }}
          >
            <span style={panelStyles.dot(isConnected ? "#f87171" : "#60a5fa")} />
            {isConnected ? "Disconnect" : "Serial"}
          </button>
          <span style={panelStyles.title}>SIMULASI</span>
          <button onClick={() => setPanelOpen(p => !p)} style={panelStyles.toggleBtn}>
            {panelOpen ? "▾" : "▸"}
          </button>
        </div>

        {panelOpen && (
          <div style={panelStyles.body}>
            <div style={panelStyles.modeRow}>
              {["auto", "manual"].map(m => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  style={{ ...panelStyles.modeBtn, ...(simMode === m ? panelStyles.modeBtnActive : {}) }}
                >
                  {m === "auto" ? "Auto" : "Manual"}
                </button>
              ))}
            </div>

            {simMode === "manual" && (
              <div style={panelStyles.sliderList}>
                {SENSORS.map(s => (
                  <div key={s.key} style={panelStyles.sliderRow}>
                    <div style={panelStyles.sliderMeta}>
                      <span style={panelStyles.sliderLabel}>{s.label}</span>
                      <span style={panelStyles.sliderVal}>{simValues[s.key]} {s.unit}</span>
                    </div>
                    <input
                      type="range"
                      min={s.min} max={s.max} step={s.step}
                      value={simValues[s.key]}
                      onChange={e => handleSliderChange(s.key, e.target.value)}
                      style={{ ...panelStyles.slider, accentColor: ACCENT }}
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={isSimulating ? handleStopSim : handleStartSim}
              style={{ ...panelStyles.runBtn, background: isSimulating ? "#3d2b00" : "#0e2a1a" }}
            >
              <span style={panelStyles.dot(isSimulating ? "#fbbf24" : "#4ade80")} />
              {isSimulating ? "Stop Simulasi" : "Mulai Simulasi"}
            </button>
          </div>
        )}
      </div>}
    </div>
  );
}

// ── Top Bar Styles ────────────────────────────────────────────────────────────
const topBarStyles = {
  wrapper: {
    position: "fixed",
    top: "14px",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "row",
    gap: "8px",
    zIndex: 1000,
    pointerEvents: "none",
  },
};

// ── Card Styles — TANPA backdropFilter untuk performa RPi ─────────────────────
const cardStyles = {
  card: {
    width: "148px",
    // Solid dark bg sebagai pengganti blur — tidak butuh GPU compositing
    background: "rgba(22, 22, 26, 0.92)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "8px",
    padding: "10px 11px 8px",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    fontFamily: "'Inter', 'Geist', sans-serif",
    // Akan-render sebagai CSS contain untuk mengurangi layout thrash
    contain: "layout style",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: "8.5px",
    fontWeight: "700",
    letterSpacing: "1px",
    color: "#5a6270",
  },
  trend: {
    fontSize: "8px",
    fontWeight: "700",
    transition: "color 0.3s",
  },
  valueRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "3px",
    lineHeight: 1,
  },
  value: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#c8cdd6",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.5px",
    fontFamily: "'Inter', monospace",
  },
  unit: {
    fontSize: "10px",
    fontWeight: "500",
    color: "#4a5060",
  },
  chartWrap: {
    height: "34px",
    margin: "0 -2px",
    overflow: "hidden",
  },
  barBg: {
    height: "2px",
    background: "rgba(255,255,255,0.07)",
    borderRadius: "99px",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: "99px",
    background: ACCENT_DIM,
    backgroundImage: `linear-gradient(90deg, ${ACCENT_DIM}, ${ACCENT_FILL})`,
    transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
    willChange: "width",
  },
};

// ── Panel Styles ──────────────────────────────────────────────────────────────
const panelStyles = {
  wrapper: {
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
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    background: "#2c2c2c",
    borderBottom: "1px solid #3a3a3a",
  },
  title: {
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
  body: {
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  modeRow:       { display: "flex", gap: "6px" },
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
  sliderList:  { display: "flex", flexDirection: "column", gap: "8px" },
  sliderRow:   { display: "flex", flexDirection: "column", gap: "3px" },
  sliderMeta:  { display: "flex", justifyContent: "space-between", alignItems: "center" },
  sliderLabel: { fontSize: "11px", color: "#9ca3af", fontWeight: "500" },
  sliderVal:   { fontSize: "11px", color: "#d1d5db", fontWeight: "600", fontVariantNumeric: "tabular-nums" },
  slider:      { width: "100%", cursor: "pointer" },
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
