"use client";

import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { isWithinTucumanBounds } from "@/lib/geo/tucuman";
import type { Kiosk } from "@/types/simulation";

export function useTucumanKioskPlacement(
  setKiosks: Dispatch<SetStateAction<Kiosk[]>>,
  acquisitionPrice: number,
) {
  const [placementError, setPlacementError] = useState<string | null>(null);

  const placeKiosk = useCallback(
    (lat: number, lon: number) => {
      if (!isWithinTucumanBounds(lat, lon)) {
        setPlacementError("Solo se pueden crear kioskos dentro de Tucuman.");
        return false;
      }

      setKiosks((prev) => [
        ...prev,
        {
          id: `k-${Date.now()}`,
          nombre: `Kiosko manual ${prev.length + 1}`,
          calle: "Punto manual",
          chain: "Gobierno",
          lat,
          lon,
          acquisitionPrice,
          source: "manual",
          active: true,
          attractivenessWeight: 1,
        },
      ]);
      setPlacementError(null);
      return true;
    },
    [acquisitionPrice, setKiosks],
  );

  const clearPlacementError = useCallback(() => setPlacementError(null), []);

  return { placeKiosk, placementError, clearPlacementError };
}
