# Base del Simulador

Este documento concentra los lineamientos generales y estables del simulador. Es la referencia transversal para mantener consistencia funcional, técnica y visual a lo largo de todas las ejecuciones.

## 1. Propósito General

- Simular factibilidad operativa y económica de configuraciones de kiosks EcoATM bajo incertidumbre.
- Permitir decisiones por evidencia estadística y comparación de escenarios.
- Evaluar amortización por horizonte configurable (meses/años).

## 2. Alcance General Estable

- Distribuciones permitidas: Uniforme, Normal y Poisson.
- Implementación probabilística propia en TypeScript.
- Prohibido usar librerías externas para PRNG y muestreo de distribuciones.
- Semilla inicial por defecto: `Date.now()`.
- Simulación sin enfoque de colas.

## 3. Preguntas Clave que Debe Responder

- ¿La configuración cumple SLA de tiempo de procesamiento?
- ¿La utilización del recurso está en rango objetivo?
- ¿El throughput esperado justifica costos?
- ¿Qué probabilidad hay de incumplir objetivos críticos?
- ¿En cuánto tiempo se amortiza la inversión (3, 6, 12 meses o años)?

## 4. Parámetros Fundamentales

- Cantidad de kiosks.
- Precio de adquisición por kiosco.
- Asignación de múltiples kiosks por conglomerado comercial.
- Horario operativo del conglomerado comercial.
- Parámetros estocásticos de interarribos, servicio, abandono y fallas.
- Horizonte de simulación, réplicas, semilla y nivel de confianza.

## 5. KPIs Fundamentales

- Throughput (clientes/hora).
- Tiempo total en sistema.
- Utilización por recurso.
- Tasa de abandono.
- Ingreso, costo y margen esperado.
- Punto de equilibrio y período de amortización.
- Probabilidad de cumplimiento de factibilidad.
- Intervalos de confianza por KPI.

## 6. Reglas de Interacción Obligatorias

- Todo botón que dispare una acción debe mostrar modal de confirmación: `¿Estás seguro?`.
- Ninguna acción crítica debe ejecutarse sin confirmación explícita.
- Todo input editable por cliente debe validarse en frontend y backend.
- No se permite persistir ni ejecutar escenarios con datos inválidos.

## 7. Estrategia de Validación de Inputs

- Frontend:
- Uso de validaciones HTML (`type`, `required`, `min`, `max`, `step`, patrones cuando aplique).
- Bloqueo de caracteres inválidos en campos numéricos.
- Mensajes de error claros por campo antes de enviar.

- Backend:
- Parseo estricto y validación autoritativa de tipos y rangos.
- Rechazo de `NaN`, `Infinity`, nulos no permitidos e inconsistencias.
- Validación de reglas de consistencia (`a < b`, `sigma > 0`, `lambda > 0`).
- Respuesta estructurada de errores por campo.

## 8. Base de Interfaz (prototipo)

- Layout: sidebar izquierda + mapa central.
- Secciones: `Config`, `Datos`, `Puntos`, `Parámetros Iniciales`, `Parámetros del Simulador`.
- Acciones principales: `Ejecutar Simulación` y `Comparar`.
- Barra superior con búsqueda y filtros.
- Mapa como superficie principal para analizar kiosks por conglomerado.

## 9. Paleta Oficial

- Fondo Principal: `#0B111E`
- Fondo Secundario (Sidebar / Navbar): `#111827`
- Botón Primario (Ejecutar Simulación): `#93C5FD`
- Botón Secundario (Comparar / Opciones de Menú): `#1F293D`
- Botón de Estado Activo (Pestaña Config): `#3B82F6`
- Botón de Acción Especial / Flotante (Capas): `#00E699`
- Texto Primario: `#FFFFFF`
- Texto Secundario: `#9CA3AF`
- Bordes y Elementos Desactivados: `#4B5563`

## 10. Reglas de Aplicación Visual

- Fondo global con `#0B111E`.
- Sidebar/navbar con `#111827`.
- `Ejecutar Simulación` usa siempre `#93C5FD`.
- `Comparar` y acciones secundarias usan `#1F293D`.
- Estados activos usan `#3B82F6`.
- Acciones especiales flotantes usan `#00E699`.
- Texto principal `#FFFFFF` y auxiliar `#9CA3AF`.
- Bordes/desactivados `#4B5563`.

## 11. Criterio de Consistencia

- Esta base no cambia por corrida o escenario.
- Nuevas pantallas o componentes deben cumplir estas reglas antes de aprobarse.
- Si aparece un componente nuevo, se mapea al rol visual y funcional más cercano sin romper jerarquía.
