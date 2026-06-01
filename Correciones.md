# Correciones

## Estado

Este archivo documenta decisiones tomadas durante la implementacion, dudas resueltas y analisis de caminos viables con subagentes.

## Dudas/decisiones principales

1. Granularidad temporal: dia vs hora.
2. Persistencia local-first: que guardar en localStorage para evitar quota y perdida.
3. Comparacion de escenarios: decision manual vs optimizacion automatica.

## Subagentes spawneados y thinking resumido

### Subagente 1
- Agent ID: `019e80dc-546b-7733-af8c-b8a2fb234bee`
- Tema: reloj diario + Normal(mu,sigma) + % interes.
- Thinking/conclusion:
  - Es viable para MVP por simplicidad y rendimiento en horizontes largos.
  - Riesgo: menor realismo intradia.
  - Decision: avanzar diario y dejar extension intradia para post-MVP.

### Subagente 2
- Agent ID: `019e80dc-5518-7711-bda3-d3c0df20873d`
- Tema: persistencia total en localStorage.
- Thinking/conclusion:
  - Viable para localhost si se agregan guardrails.
  - Riesgos: quota, borrado global, corrupcion silenciosa.
  - Decision: aplicar namespace por claves, no usar `localStorage.clear()`, guardar historial resumido, fallback de poda ante quota.

### Subagente 3
- Agent ID: `019e80dc-55a4-7a82-91ab-fdafb6b3c4d3`
- Tema: comparacion A vs B con decision manual.
- Thinking/conclusion:
  - Es exactamente alineado al PRD-1 (sin optimizacion automatica obligatoria).
  - KPIs minimos: margen esperado, amortizacion, probabilidad de factibilidad, utilizacion.
  - Decision: mantener decision manual asistida por KPIs.

## Cambios derivados aplicados

- Se reforzo localStorage para no borrar todo el origen.
- El historial guarda resumen en lugar de todo el payload de replicas.
- Se agrego manejo de fallback por cuota en guardado de historial.
- Se mantuvo comparador A/B y motor diario con seed reproducible.

## Pendientes (no bloqueantes para MVP)

- Persistir escenarios A/B completos y restaurarlos automaticamente al abrir la app.
- Exportar resultados a CSV/JSON desde UI.
- Tests de UI end-to-end.

## Actualizacion de cierre (iteracion final)

- Se implemento persistencia y restauracion automatica de drafts de escenario A/B en localStorage.
- Se implemento persistencia de ultima corrida por escenario (A/B).
- Se agrego exportacion JSON y CSV desde UI, ambas protegidas por modal de confirmacion.
- Se elimino el borrado global de localStorage y se usa limpieza por claves del simulador.
- Se amplió test funcional para validar:
  - consistencia de IC en salida de simulacion,
  - rechazo de Uniforme invalida (`a >= b`),
  - carga real de datasets CSV y rango geografico de kioskos.
