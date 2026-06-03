# PRD-3 — Optimización de performance del optimizador espacial

## 1. Propósito

El optimizador de ubicaciones (`src/lib/optimize/engine.ts`) escalaba muy mal: con
los kioscos del CSV andaba, pero **agregar unos pocos puntos disparaba el tiempo y
la memoria** (se lo vio llegar a ~1,7 GB y no terminar). Este documento define las
optimizaciones aplicadas para acotar el costo y volverlo predecible.

## 2. Diagnóstico (causa raíz)

- **Complejidad polinómica de grado alto:** se explora `siteCount = minSites..maxSites`,
  y para cada uno corre greedy + swap. Evaluaciones ≈ O(N³); cada evaluación reconstruye
  un snapshot espacial O(M·k) (M = 181 zonas). Total ≈ **O(N⁴·M)** en el peor caso.
- **`maxSites = kiosks.length`:** no había tope; el optimizador buscaba configuraciones
  de hasta *todos* los kioscos, así que N escalaba el bucle externo y el tamaño de los sets.
- **`spatialCache` sin límite:** acumulaba **todos** los snapshots evaluados (≈ O(N³),
  cada uno O(M)). La memoria crecía hasta cruzar un umbral → **GC thrashing / swap** →
  el "muchísimo más lento" (efecto acantilado).
- *First-improvement ya estaba* implementado en el swap; lo que faltaba era acotar pasadas.

## 3. Optimizaciones implementadas

| # | Cambio | Constante | Ataca |
|---|---|---|---|
| 1 | **Tope de `maxSites`** a 17 | `MAX_OPTIMIZER_SITES = 17` | Tiempo y memoria |
| 2 | **`spatialCache` con LRU acotado** | `SPATIAL_CACHE_LIMIT = 50.000` | Memoria (acantilado) |
| 3 | **Tope de pasadas del swap** | `MAX_SWAP_PASSES = 30` | Tiempo (loops patológicos) |

Detalle:
- **(1) Tope de sites:** `effectiveMaxSites = min(request.maxSites, kiosks.length, 17)`
  en el engine, y la ruta (`/api/optimize`) normaliza `maxSites = min(kiosks.length, 17)`
  (así el `siteSpan` y la barra de progreso quedan correctos). La constante es la única
  fuente de verdad (exportada y reutilizada por la ruta).
- **(2) LRU:** el cache "toca" la entrada al leerla (la mueve al final) y, al superar el
  límite, descarta la más antigua. Acota la memoria sin cambiar resultados (solo puede
  recalcular algún snapshot expulsado).
- **(3) Pasadas de swap:** el `while (improved)` corta a las 30 pasadas como guarda.

## 4. Requisitos

- **RF-32:** El optimizador no debe explorar configuraciones de más de `MAX_OPTIMIZER_SITES`
  kioscos.
- **RF-33:** El `spatialCache` debe tener un límite superior de entradas (LRU).
- **RF-34:** La fase de swap debe acotar la cantidad de pasadas por `siteCount`.
- **RF-35:** El tope de sites debe aplicarse de forma consistente en engine y ruta para no
  romper el cálculo del progreso.

## 5. Resultado medido (53 kioscos, dataset real)

| Métrica | Antes | Después |
|---|---|---|
| Tiempo de optimización | No terminaba (>32 s) | **~4 s** |
| Memoria pico (dev) | ~1,7 GB y subiendo | acotada |
| `siteCount` máximo explorado | N (= 53) | 17 |
| Resultado / barra de progreso | (no completaba) | 101 eventos, resultado OK |

## 6. Notas

- No cambia el modelo ni las distribuciones; solo la estrategia de búsqueda y el cacheo.
- El cap de 17 es una decisión de producto (no se buscan redes de más de 17 kioscos);
  ajustable vía `MAX_OPTIMIZER_SITES`.
- Pendiente (futuro, mayor riesgo): **score incremental** (no reconstruir el Delaunay +
  recorrer las 181 zonas por evaluación) para bajar la base O(N⁴·M); requiere test de
  regresión contra la salida actual.

## 7. Checklist

- [x] RF-32: tope de `maxSites` a 17 (`MAX_OPTIMIZER_SITES`).
- [x] RF-33: `spatialCache` LRU acotado (`SPATIAL_CACHE_LIMIT`).
- [x] RF-34: tope de pasadas de swap (`MAX_SWAP_PASSES`).
- [x] RF-35: tope aplicado en engine y en la ruta (progreso correcto).
- [ ] Futuro: score incremental con test de regresión.
