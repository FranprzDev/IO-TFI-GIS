import fs from "node:fs/promises";
import path from "node:path";
import { isWithinTucumanBounds } from "@/lib/geo/tucuman";

export interface LocalityRow {
  nombre: string;
  departamento: string;
  poblacion: number;
  superficieKm2: number;
  densidad: number;
}

export interface KioskRow {
  nombreSucursal: string;
  calle: string;
  cadena: string;
  latitud: number;
  longitud: number;
}

function parseCsvLine(line: string): string[] {
  const delimiter = line.includes(";") ? ";" : ",";
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.map((x) => x.replace(/^"|"$/g, ""));
}

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/\s/g, "");
  let normalized = cleaned;
  if (cleaned.includes(".") && cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(/,/g, ".");
  }
  const t = normalized.replace(/[^0-9.-]/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export async function loadDatasets() {
  const base = path.join(process.cwd(), "information");
  const locRaw = await fs.readFile(path.join(base, "EcoAtm-Localidades.csv"), "utf8");
  const kiosRaw = await fs.readFile(path.join(base, "Kiosk-Position-ecoATM-Tucuman.csv"), "utf8");

  const locLines = locRaw.split(/\r?\n/).filter((l) => l.trim());
  const kiosLines = kiosRaw.split(/\r?\n/).filter((l) => l.trim());

  const localities: LocalityRow[] = locLines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const nombre = cols[0] ?? "";
    const departamento = cols[1] ?? "";
    const poblacionRaw = cols[2] ?? "0";
    const superficieRaw = cols[5] ?? "0";
    const densidadRaw = cols[6] ?? "0";
    const poblacion = parseNumber(poblacionRaw);
    const superficieKm2 = parseNumber(superficieRaw);
    const densidad = superficieKm2 > 0 ? poblacion / superficieKm2 : parseNumber(densidadRaw);
    return { nombre, departamento, poblacion, superficieKm2, densidad };
  });

  const kiosks: KioskRow[] = kiosLines.slice(1).map((line) => {
    const [nombreSucursal = "", calle = "", cadena = "", latitudRaw = "0", longitudRaw = "0"] = parseCsvLine(line);
    return {
      nombreSucursal,
      calle,
      cadena,
      latitud: parseNumber(latitudRaw),
      longitud: parseNumber(longitudRaw),
    };
  }).filter((k) => isWithinTucumanBounds(k.latitud, k.longitud));

  return { localities, kiosks };
}
