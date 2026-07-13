"use client";

import { useEffect, useState } from "react";
import { useRive, useViewModelInstanceNumber } from "@rive-app/react-canvas";

export default function Home() {
  const { rive, RiveComponent } = useRive({
    src: "/rive/display_biocng.riv",
    viewModel: "View Model 1",
    stateMachines: "State Machine 1",
    autoBind: true,
    autoplay: true,
  });

  const [vmReady, setVmReady] = useState(false);

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

  // Update semua nilai secara dinamis setiap 1.5 detik
  useEffect(() => {
    if (!setLpmWater || !setLpmGas) return;

    const interval = setInterval(() => {
      // const newLpmWater = Math.floor(Math.random() * 101);
      // const newLpmGas = Math.floor(Math.random() * 101);
      // const newPureGas = Math.floor(Math.random() * 101);
      // const newRawGas = Math.floor(Math.random() * 101);
      const newLpmWater = Math.floor(Math.random() * 101);
      const newLpmGas = Math.floor(Math.random() * 101);
      const newPureGas = Math.floor(Math.random() * 101);
      const newRawGas = Math.floor(Math.random() * 101);

      setLpmWater(newLpmWater);
      setLpmGas(newLpmGas);
      setPureGas(newPureGas);
      setRawGas(newRawGas);

      console.log("Updated values:", {
        LPM_WATER: newLpmWater,
        LPM_GAS: newLpmGas,
        Progress_puregas: newPureGas,
        Progress_rawgas: newRawGas,
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [setLpmWater, setLpmGas]);

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-[#313131]">
      <RiveComponent className="w-screen h-full" />
    </div>
  );
}
