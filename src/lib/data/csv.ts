import fs from "node:fs/promises";
import path from "node:path";

export interface LocalityRow {
  id: string;
  nombre: string;
  departamento: string;
  poblacion2022: number;
  superficieKm2: number;
  densidad: number;
}

export interface KioskRow {
  id: string;
  nombreSucursal: string;
  calle: string;
  cadena: string;
  latitud: number;
  longitud: number;
}

export interface LocalityPointRow {
  id: string;
  nombre: string;
  departamento: string;
  latitud: number;
  longitud: number;
  poblacion2022: number;
  superficieKm2: number;
  densidad: number;
  source: "geocoded" | "estimated_department_centroid";
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
  const localityPointsRaw = await fs.readFile(path.join(base, "Locality-Points-Tucuman.csv"), "utf8");

  const locLines = locRaw.split(/\r?\n/).filter((l) => l.trim());
  const kiosLines = kiosRaw.split(/\r?\n/).filter((l) => l.trim());
  const localityPointLines = localityPointsRaw.split(/\r?\n/).filter((l) => l.trim());

  const localities: LocalityRow[] = locLines.slice(1).map((line, idx) => {
    const cols = parseCsvLine(line);
    const nombre = cols[0] ?? "";
    const departamento = cols[1] ?? "";
    const poblacionRaw = cols[5] ?? "0";
    const superficieRaw = cols[7] ?? "0";
    const densidadRaw = cols[8] ?? "0";
    const poblacion2022 = parseNumber(poblacionRaw);
    const superficieKm2 = parseNumber(superficieRaw);
    const densidad = superficieKm2 > 0 ? poblacion2022 / superficieKm2 : parseNumber(densidadRaw);
    return { id: `loc-${idx + 1}`, nombre, departamento, poblacion2022, superficieKm2, densidad };
  });

  const kiosks: KioskRow[] = kiosLines.slice(1).map((line, idx) => {
    const [nombreSucursal = "", calle = "", cadena = "", latitudRaw = "0", longitudRaw = "0"] = parseCsvLine(line);
    return {
      id: `csv-${idx + 1}`,
      nombreSucursal,
      calle,
      cadena,
      latitud: parseNumber(latitudRaw),
      longitud: parseNumber(longitudRaw),
    };
  }).filter((k) => k.latitud <= -26 && k.latitud >= -28 && k.longitud <= -65 && k.longitud >= -66);

  const geocodedRows = localityPointLines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return {
      id: cols[0] ?? "",
      nombre: cols[1] ?? "",
      departamento: cols[2] ?? "",
      latitud: parseNumber(cols[3]),
      longitud: parseNumber(cols[4]),
      poblacion2022: parseNumber(cols[5]),
      superficieKm2: parseNumber(cols[6]),
      densidad: parseNumber(cols[7]),
    };
  });

  const departmentCentroids = new Map<string, { lat: number; lon: number; count: number }>();
  for (const row of geocodedRows) {
    const current = departmentCentroids.get(row.departamento) ?? { lat: 0, lon: 0, count: 0 };
    current.lat += row.latitud;
    current.lon += row.longitud;
    current.count += 1;
    departmentCentroids.set(row.departamento, current);
  }

  const geocodedByName = new Map(geocodedRows.map((row) => [`${row.nombre}::${row.departamento}`, row]));

  const localityPoints: LocalityPointRow[] = localities.map((loc) => {
    const geocoded = geocodedByName.get(`${loc.nombre}::${loc.departamento}`);
    if (geocoded) {
      return {
        id: loc.id,
        nombre: loc.nombre,
        departamento: loc.departamento,
        latitud: geocoded.latitud,
        longitud: geocoded.longitud,
        poblacion2022: loc.poblacion2022,
        superficieKm2: loc.superficieKm2,
        densidad: loc.densidad,
        source: "geocoded",
      };
    }

    const department = departmentCentroids.get(loc.departamento);
    if (!department || department.count === 0) {
      throw new Error(`No se pudo estimar coordenadas para ${loc.nombre} (${loc.departamento})`);
    }

    return {
      id: loc.id,
      nombre: loc.nombre,
      departamento: loc.departamento,
      latitud: department.lat / department.count,
      longitud: department.lon / department.count,
      poblacion2022: loc.poblacion2022,
      superficieKm2: loc.superficieKm2,
      densidad: loc.densidad,
      source: "estimated_department_centroid",
    };
  });

  return { localities, kiosks, localityPoints };
}
