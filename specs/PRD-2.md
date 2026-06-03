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
| Llegadas | Poisson, λ = 5 usuarios/hora por kiosko | Poisson λ=5/h, por kiosko | ✅ |
| Horario operativo | 9:00–22:00 (13 h/día); luego pasa el día | 13 h/día, λ plano por hora | ✅ |
| Tiempo de servicio | Uniforme U[4, 10] minutos | U[4,10] | ✅ |
| Costo de adquisición | USD 20.000 ≈ ARS 28.000.000, fijo, una vez | ARS 28.000.000 constante | ✅ |
| Costo de mantenimiento | USD 400 ≈ ARS 600.000 por 30 días | ARS 600.000 / 30 días, recurrente | ✅ |
| Horizonte | 365 días (configurable) | `horizonDays` editable | ✅ |
| **Tipo de dispositivo** | 75% reacondicionable / 25% chatarra | No se distingue | ❌ |
| **Valor reacondicionado** | Normal μ=$250.000, σ=$100.000; ganancia 30% | Normal genérica, valor pleno | ❌ |
| **Valor chatarra** | Normal μ=$15.000, σ=$10.000; ganancia 10% | No existe | ❌ |
| **Aceptación de oferta** | Binomial p = 0,70 | No se modela (todos venden) | ❌ |
| **Ingreso por equipo** | valor × % de ganancia (30% / 10%) | valor pleno | ❌ |
| **Salidas detalladas** | por kiosko + totales de red | parciales | ❌ |

Lo que ya está alineado: **llegadas, horario, tiempo de servicio, costos y horizonte**.
Lo que falta cerrar: el **modelo de ingresos** (split reacondicionable/chatarra, % de
ganancia, aceptación binomial) y el **reporte de salidas** requerido.

## 3. Modelo de ingresos a implementar

Por cada **usuario que arriba** (Poisson) y **completa la tasación** (servicio U[4,10]):

1. **Oferta y aceptación.** El usuario acepta la oferta con probabilidad **p = 0,70**
   (Binomial por evento independiente). Si rechaza (30%), se retira sin entregar el
   dispositivo: no genera recolección ni ingreso. Solo los aceptados continúan.

2. **Clasificación del dispositivo entregado.**
   - **75% reacondicionable**, **25% chatarra** (Binomial / Bernoulli por dispositivo).

3. **Valor económico del dispositivo** (Normal, truncada a ≥ 0):
   - Reacondicionable: μ = $250.000 ARS, σ = $100.000 ARS.
   - Chatarra: μ = $15.000 ARS, σ = $10.000 ARS.

4. **Ganancia (ingreso neto por equipo) = valor × % de ganancia:**
   - Reacondicionable: **30%**.
   - Chatarra: **10%**.

5. **Margen de la red** = Σ ganancias de equipos recolectados − costos fijos
   (adquisición + mantenimiento por kiosko).

> Nota de moneda: todo el modelo está denominado en ARS. Los valores del modelo verbal
> ya están en ARS, por lo que `valueMu`/`valueSigma` de la UI deben pasar a representar el
> equipo reacondicionable (250.000 / 100.000) y la chatarra debe agregarse como segunda
> distribución fija.

## 4. Requisitos funcionales

- **RF-25:** Modelar la aceptación de oferta como Binomial con `p = 0,70`; solo los
  usuarios que aceptan generan recolección e ingreso.
- **RF-26:** Clasificar cada dispositivo entregado como reacondicionable (75%) o
  chatarra (25%).
- **RF-27:** Muestrear el valor económico por tipo: Normal(250.000, 100.000) para
  reacondicionado y Normal(15.000, 10.000) para chatarra, truncadas a ≥ 0.
- **RF-28:** Calcular el ingreso (ganancia) por equipo como `valor × % ganancia`
  (30% reacondicionado, 10% chatarra).
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
| λ llegadas | 5 usuarios/hora/kiosko | `ARRIVALS_LAMBDA_PER_HOUR` |
| Horario operativo | 13 h/día (9:00–22:00) | `OPERATING_HOURS_PER_DAY` |
| Tiempo de servicio | U[4, 10] min | — |
| Prob. aceptación | 0,70 | a definir (`OFFER_ACCEPTANCE_P`) |
| Split reacondicionable | 0,75 | a definir (`REFURBISH_RATE`) |
| Valor reacondicionado | N(250.000, 100.000) ARS | a definir |
| Valor chatarra | N(15.000, 10.000) ARS | a definir |
| Ganancia reacondicionado | 30% | a definir |
| Ganancia chatarra | 10% | a definir |
| Adquisición | $28.000.000 ARS (una vez) | `KIOSK_ACQUISITION_COST_ARS` |
| Mantenimiento | $600.000 ARS / 30 días | `KIOSK_MAINTENANCE_COST_ARS_PER_30D` |

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

- [ ] RF-25: aceptación Binomial p=0,70 en el motor (`lib/sim/engine.ts`).
- [ ] RF-26: clasificación reacondicionable/chatarra (75/25).
- [ ] RF-27: distribuciones de valor por tipo (Normal truncada).
- [ ] RF-28: ingreso = valor × % ganancia (30% / 10%).
- [ ] RF-29: métricas por kiosko (arribos, servicio prom., aceptados, ganancia).
- [ ] RF-30: totales de red (dispositivos, reacond./chatarra, ingreso, recomendación).
- [ ] RF-31: dictamen S1/S2 contra costo de inversión total.
- [ ] Extender `KioskRunMetrics` / `SimulationResult` con los nuevos campos.
- [ ] Actualizar `ResultModal` y la exportación para mostrar las salidas requeridas.
- [ ] Tests: cobertura de aceptación, split y cálculo de ganancia.
