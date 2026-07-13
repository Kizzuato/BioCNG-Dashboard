"use client";

import { useEffect, useState, useRef } from "react";
import { useRive, useViewModelInstanceNumber } from "@rive-app/react-canvas";

export default function Home() {
  const { rive, RiveComponent } = useRive({
    src: "/rive/display_biocng.riv",
    artboard: "main",
    viewModel: "View Model 1",
    stateMachines: "State Machine 1",
    autoBind: true,
    autoplay: true,
  });

  const [vmReady, setVmReady] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  // useRef untuk menyimpan referensi ke reader agar tidak hilang saat re-render
  const readerRef = useRef(null);
  const portRef = useRef(null);

  useEffect(() => {
    if (rive?.viewModelInstance) {
      console.log("✅ viewModelInstance ready");
      setVmReady(true);
    }
  }, [rive]);

  // Bind semua input number yang ingin dikontrol
  const { setValue: setLpmWater } = useViewModelInstanceNumber(
    "LPM_WATER",
    vmReady ? rive.viewModelInstance : null
  );
  const { setValue: setLpmGas } = useViewModelInstanceNumber(
    "LPM_GAS",
    vmReady ? rive.viewModelInstance : null
  );
  const { setValue: setPureGas } = useViewModelInstanceNumber(
    "Progress_puregas",
    vmReady ? rive.viewModelInstance : null
  );
  const { setValue: setRawGas } = useViewModelInstanceNumber(
    "Progress_rawgas",
    vmReady ? rive.viewModelInstance : null
  );

  // Fungsi untuk meminta akses port dan mulai membaca data
  const handleConnect = async () => {
    if (!("serial" in navigator)) {
      alert(
        "Browser Anda tidak mendukung Web Serial API. Gunakan Chrome atau Edge."
      );
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
    if (!setLpmWater || !setLpmGas || !setPureGas || !setRawGas) return;

    // Buffer untuk menampung data yang masuk
    let lineBuffer = "";

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

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
    <div className="w-screen h-screen flex items-center justify-center bg-[#313131] relative">
      {/* Tombol untuk koneksi ditampilkan di atas animasi Rive */}
      <div className="absolute top-4 left-4 z-10">
        {!isConnected ? (
          <button
            onClick={handleConnect}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Hubungkan ke Perangkat Serial
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Putuskan Koneksi
          </button>
        )}
      </div>

      <RiveComponent className="w-screen h-full" />
    </div>
  );
}
