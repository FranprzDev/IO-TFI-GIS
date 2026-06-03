# PRD-2 — Alineación del simulador con el modelo verbal (EcoATM Kiosk)

## 1. Propósito

Este documento define los requisitos para que el **simulador** coincida totalmente
con el **modelo verbal** (`documentation/modelo_verbal.md`). Toma como base el estado
ya implementado tras la reescritura del modelo (llegadas Poisson + costos fijos en ARS)
y especifica lo que falta para cerrar la brecha funcional.

El objetivo de negocio que la simulación debe responder es binario:
decidir **SI ES RENTABLE O NO** instalar una cantidad dada de kioscos, bajo una
configuración dada, en un horizonte dado.

- **S1 — Invertir:** si la ganancia de la red supera el costo de inversión total.
- **S2 — No invertir:** caso contrario.

## 2. Estado de alineación (modelo verbal vs simulación)

| Aspecto | Modelo verbal (spec) | Implementado | Estado |
|---|---|---|---|
| Optimización de puntos | Paso previo ideal por densidad poblacional; **no modifica** la tasa de llegada | Optimizador (Voronoi/cobertura) separado; no toca λ | ✅ |
| Llegadas | Poisson, λ = 2 usuarios/hora por kiosko | Poisson λ=2/h, por kiosko | ✅ |
| Horario operativo | 9:00–22:00 (13 h/día); luego pasa el día | 13 h/día, λ plano por hora | ✅ |
| Tiempo de servicio | Uniforme U[4, 10] minutos | U[4,10] | ✅ |
| Costo de adquisición | USD 20.000 ≈ ARS 28.000.000, fijo, una vez | ARS 28.000.000 constante | ✅ |
| Costo de mantenimiento | USD 5.000 ≈ ARS 7.000.000 por 30 días | ARS 7.000.000 / 30 días, recurrente | ✅ |
| Horizonte | 365 días (configurable) | `horizonDays` editable | ✅ |
| Tipo de dispositivo | 60% reacondicionable / 40% chatarra | Bernoulli 60/40 por dispositivo | ✅ |
| Valor reacondicionado | Normal μ=$120.000, σ=$40.000; ganancia 10% | N(120k,40k), ganancia 10% | ✅ |
| Valor chatarra | Normal μ=$10.000, σ=$3.000; ganancia 30% | N(10k,3k), ganancia 30% | ✅ |
| Aceptación de oferta | Binomial p = 0,60 | Binomial(arribos, 0,60) por hora | ✅ |
| Ingreso por equipo | valor × % de ganancia (10% / 30%) | valor × ganancia% | ✅ |
| Salidas detalladas | por kiosko + totales de red | por kiosko + red (ResultModal) | ✅ |

**Estado: el simulador coincide totalmente con el modelo verbal.** Tanto la operación
(optimización de puntos, llegadas, horario, tiempo de servicio) como el modelo económico
(costos fijos, modelo de ingresos con split/aceptación/ganancia) y las salidas requeridas
están implementados.

> Aclaración del modelo verbal: la optimización de ubicaciones por densidad poblacional
> es un paso previo *ideal* para elegir dónde instalar kioscos, pero **no modifica la tasa
> de llegada** (λ = 2 usuarios/hora se mantiene fija e independiente de la ubicación). El
> simulador respeta esta separación: el optimizador decide *dónde*, la simulación evalúa
> *si es rentable* con λ constante.

## 3. Modelo de ingresos a implementar

Por cada **usuario que arriba** (Poisson) y **completa la tasación** (servicio U[4,10]):

1. **Oferta y aceptación.** La cantidad de usuarios que aceptan la oferta se modela como
   **Binomial(arribos, p=0,60)** (cada usuario es un ensayo independiente con probabilidad
   constante de aceptar). Los que rechazan (40%) se retiran sin entregar el dispositivo: no
   generan recolección ni ingreso.

2. **Clasificación del dispositivo entregado.**
   - De los aceptados, los reacondicionables son **Binomial(aceptados, p=0,60)**; el resto
     (40%) es chatarra.

3. **Valor económico del dispositivo** (Normal, truncada a ≥ 0):
   - Reacondicionable: μ = $120.000 ARS, σ = $40.000 ARS.
   - Chatarra: μ = $10.000 ARS, σ = $3.000 ARS.

4. **Ganancia (ingreso neto por equipo) = valor × % de ganancia:**
   - Reacondicionable: **10%**.
   - Chatarra: **30%**.

5. **Margen de la red** = Σ ganancias de equipos recolectados − costos fijos
   (adquisición + mantenimiento por kiosko).

> Nota de moneda: todo el modelo está denominado en ARS. Los valores de dispositivo
> (reacondicionable y chatarra) son constantes fijas en `lib/sim/engine.ts`; ya no hay
> campos editables de valor ni costo operativo por dispositivo en la UI.

## 4. Requisitos funcionales

- **RF-25:** Modelar la aceptación de oferta como Binomial con `p = 0,60`; solo los
  usuarios que aceptan generan recolección e ingreso.
- **RF-26:** Clasificar cada dispositivo entregado como reacondicionable (60%) o
  chatarra (40%).
- **RF-27:** Muestrear el valor económico por tipo: Normal(120.000, 40.000) para
  reacondicionado y Normal(10.000, 3.000) para chatarra, truncadas a ≥ 0.
- **RF-28:** Calcular el ingreso (ganancia) por equipo como `valor × % ganancia`
  (10% reacondicionado, 30% chatarra).
- **RF-29:** Reportar, **por kiosko**: usuarios que arribaron, tiempo promedio de
  servicio, usuarios que aceptaron la oferta, y ganancia económica total recolectada.
- **RF-30:** Reportar, **a nivel de red** al finalizar el horizonte: total de
  dispositivos recolectados, cantidad de reacondicionados y de chatarra, ingreso
  económico total, y recomendación de inversión (S1 / S2).
- **RF-31:** La recomendación de inversión se decide comparando la ganancia total de la
  red contra el costo de inversión total (adquisición + mantenimiento del período).

## 5. Parámetros del modelo (fijos, no configurables)

| Parámetro | Valor | Constante |
|---|---|---|
| λ llegadas | 2 usuarios/hora/kiosko | `ARRIVALS_LAMBDA_PER_HOUR` |
| Horario operativo | 13 h/día (9:00–22:00) | `OPERATING_HOURS_PER_DAY` |
| Tiempo de servicio | U[4, 10] min | — |
| Prob. aceptación | 0,60 | `OFFER_ACCEPTANCE_P` |
| Split reacondicionable | 0,60 | `REFURBISH_RATE` |
| Valor reacondicionado | N(120.000, 40.000) ARS | `REFURBISHED_VALUE_MU` / `_SIGMA` |
| Valor chatarra | N(10.000, 3.000) ARS | `SCRAP_VALUE_MU` / `_SIGMA` |
| Ganancia reacondicionado | 10% | `REFURBISHED_PROFIT` |
| Ganancia chatarra | 30% | `SCRAP_PROFIT` |
| Adquisición | $28.000.000 ARS (una vez) | `KIOSK_ACQUISITION_COST_ARS` |
| Mantenimiento | $7.000.000 ARS / 30 días | `KIOSK_MAINTENANCE_COST_ARS_PER_30D` |

## 6. Salidas requeridas (reporte)

**Por kiosko evaluado:**
- Cantidad de usuarios que arribaron.
- Tiempo promedio de servicio registrado.
- Cantidad de usuarios que aceptaron la oferta.
- Valor económico total (ganancia) de los dispositivos recolectados.

**Al finalizar el período (red):**
- Cantidad total de dispositivos recolectados por la red.
- Cantidad de equipos reacondicionados y cantidad de equipos chatarra.
- Ingreso económico total estimado de la red.
- Recomendación de inversión (S1 invertir / S2 no invertir) para el período dado.

## 7. Checklist de implementación

- [x] RF-25: aceptación Binomial p=0,60 en el motor (`lib/sim/engine.ts`).
- [x] RF-26: clasificación reacondicionable/chatarra (60/40).
- [x] RF-27: distribuciones de valor por tipo (Normal truncada).
- [x] RF-28: ingreso = valor × % ganancia (10% / 30%).
- [x] RF-29: métricas por kiosko (arribos, servicio prom., aceptados, ganancia).
- [x] RF-30: totales de red (dispositivos, reacond./chatarra, ingreso, recomendación).
- [x] RF-31: dictamen S1/S2 contra costo de inversión total.
- [x] Extender `KioskRunMetrics` / `SimulationResult` con los nuevos campos.
- [x] Actualizar `ResultModal` para mostrar las salidas requeridas (red + por kiosko).
- [x] Tests: cobertura de aceptación, split y cálculo de ganancia.
