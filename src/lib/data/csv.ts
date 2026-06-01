import fs from "node:fs/promises";
import path from "node:path";

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
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.map((x) => x.replace(/^"|"$/g, ""));
}

function parseNumber(raw: string): number {
  const t = raw.replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
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
    const [nombreSucursal, calle, cadena, latitudRaw, longitudRaw] = parseCsvLine(line);
    return {
      nombreSucursal,
      calle,
      cadena,
      latitud: parseNumber(latitudRaw),
      longitud: parseNumber(longitudRaw),
    };
  }).filter((k) => k.latitud <= -26 && k.latitud >= -28 && k.longitud <= -65 && k.longitud >= -66);

  return { localities, kiosks };
}
