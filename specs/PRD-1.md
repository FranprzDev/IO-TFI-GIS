# PRD - Simulador de Factibilidad de Configuraciones (EcoATM Kiosk)

## 1. Resumen Ejecutivo

Construir una plataforma de simulación para la materia **Simulación** que permita evaluar, bajo incertidumbre, la factibilidad operativa y económica de distintas configuraciones de un kiosco EcoATM.

El simulador debe modelar variabilidad real mediante distribuciones de probabilidad y entregar métricas de desempeño con intervalos de confianza, para apoyar decisiones de diseño/configuración.

## 2. Problema y Oportunidad

Tomar decisiones de configuración sin modelar incertidumbre produce conclusiones frágiles. Se necesita una herramienta que capture:

- Variabilidad de llegadas de clientes.
- Variabilidad en tiempos de atención/procesamiento.
- Variabilidad en fallas, reintentos y abandono.
- Variabilidad en ingresos/costos.

## 3. Objetivo del Producto

Permitir que un usuario defina configuraciones del sistema, compare escenarios y determine manualmente la opción más rentable con evidencia estadística, asegurando factibilidad operativa y económica.

## 4. Objetivos Específicos

- Simular escenarios por eventos discretos y/o corridas Monte Carlo.
- Comparar Escenario A vs Escenario B bajo el mismo horizonte temporal.
- Asistir la identificación manual de la opción más rentable entre escenarios factibles.
- Calcular KPIs con estimación de error estadístico.
- Identificar restricciones operativas y sensibilidad de variables críticas.
- Exportar resultados para informe académico.

## 5. Alcance

### 5.1 En alcance (V1)

- Definición de parámetros de entrada por configuración.
- Soporte de distribuciones únicamente: Uniforme, Normal y Poisson.
- Implementación propia del motor estadístico sin librerías externas para generación de distribuciones o pseudoaleatorios.
- Motor de simulación con semilla basada en Date.now() de JavaScript.
- Corridas múltiples con warm-up opcional.
- Dashboard de resultados por escenario.
- Comparador de escenarios A vs B.

### 5.2 Fuera de alcance (V1)

- Cualquier distribución distinta de Uniforme, Normal y Poisson.
- Uso de librerías externas para generación de números pseudoaleatorios o muestreo de distribuciones.
- Optimización automática exacta/metaheurística.
- Integración con hardware real o sensores en tiempo real.
- Pronóstico ML avanzado.

## 6. Usuarios

- Estudiante/analista (usuario principal): define hipótesis y evalúa factibilidad.
- Docente/evaluador: revisa trazabilidad y validez metodológica.

## 7. Preguntas de Negocio/Academia que debe responder

- ¿La configuración cumple SLA de tiempo de procesamiento?
- ¿La utilización del recurso clave está en rango deseado?
- ¿El throughput esperado justifica costos?
- ¿Qué tan robusto es el resultado ante cambios en demanda?
- ¿Cuál es la probabilidad de incumplir un objetivo crítico?
- ¿En qué período (3, 6, 12 meses o años) se amortiza la inversión por kiosco?
- ¿Qué escenario resulta más rentable según los KPIs observados en la corrida?

## 8. Definición de Factibilidad

Una configuración se considera factible si cumple simultáneamente criterios parametrizables, por ejemplo:

- P(tiempo_procesamiento_promedio <= umbral_procesamiento) >= 95%
- P(utilizacion_recurso <= umbral_utilizacion) >= 90%
- P(margen_operativo >= 0) >= 80%
- P(periodo_amortizacion <= horizonte_objetivo) >= 80%

> Nota: los umbrales serán editables por escenario.

## 9. Modelo Conceptual del Sistema

### 9.1 Entidades

- Cliente
- Kiosk/terminal
- Evento de falla

### 9.2 Eventos

- Llegada de cliente
- Inicio de atención
- Fin de atención
- Reintento
- Abandono
- Falla/recuperación

### 9.3 Recursos operativos

- Servidores (kiosks)

## 10. Inputs del Simulador

### 10.1 Parámetros estructurales

- Cantidad de kiosks
- Precio de adquisición por kiosco (configurable por escenario)
- Asignación de múltiples kiosks por conglomerado comercial
- Capacidad máxima de almacenamiento por kiosko (valor global editable; default: 100 dispositivos)
- Política de atención
- Horario operativo del conglomerado comercial

### 10.2 Parámetros estocásticos

- Flujo diario de personas por conglomerado (distribución Normal + parámetros)
- Porcentaje de interés en recambio de celular por dinero (tasa de conversión potencial)
- Tiempo de servicio por tipo de operación
- Probabilidad de abandono por tiempo en sistema
- Frecuencia y duración de fallas
- Ticket promedio / costo por operación

### 10.3 Configuración de experimento

- Horizonte de simulación configurable en meses (3, 6, 12) o en años
- Cantidad de réplicas
- Semilla base inicial derivada de `Date.now()`
- Período warm-up
- Nivel de confianza (ej. 95%)

## 11. Outputs y KPIs

- Throughput (clientes/hora)
- Tiempo total en sistema
- Utilización por recurso
- Tasa de abandono
- Ingreso, costo, margen esperado
- Punto de equilibrio y período estimado de amortización del kiosco
- Probabilidad de cumplimiento de restricciones de factibilidad
- Intervalos de confianza por KPI

## 12. Reglas de Simulación y Supuestos Iniciales

- Eventos ordenados por timestamp (calendario de eventos).
- Independencia inicial entre variables aleatorias (configurable a futuro).
- El generador pseudoaleatorio base será propio y se inicializa con Date.now() para cada corrida, salvo configuración manual posterior.
- Un cliente procesa una operación por ciclo.
- Abandono ocurre cuando tiempo en sistema supera umbral o por probabilidad condicional.
- Falla de recurso suspende servicio y reduce capacidad efectiva durante la recuperación.
- La demanda potencial por kiosko se calcula desde el flujo diario del conglomerado y un porcentaje de interés.
- El flujo diario base se modela con distribución Normal para aproximar asistencia promedio al supermercado/conglomerado.
- La llegada esperada al kiosko se aproxima como: `personas_interesadas = flujo_diario * porcentaje_interes`.
- Todos los kiosks comparten una misma capacidad máxima de almacenamiento por escenario.
- El valor de capacidad máxima es editable y se inicializa por defecto en `100` dispositivos por kiosko.
- Cada kiosko tiene umbral operativo del `85%` de su capacidad máxima.
- Al alcanzar el umbral del `85%`, se dispara evento de recolección para evitar saturación física del kiosko.

## 13. Arquitectura Funcional (alto nivel)

- Módulo de definición de escenario.
- Módulo de validación de parámetros.
- Motor de simulación.
- Módulo estadístico (IC, percentiles, prob. de cumplimiento).
- Módulo geoespacial para visualización de kiosks y conglomerados en mapa.
- Visualización y comparación.
- Exportación (CSV/JSON/Reporte).

### 13.1 Lineamientos de interfaz (basado en prototipo)

- Layout principal con sidebar izquierda de configuración y panel central de mapa.
- Secciones funcionales visibles: `Config`, `Datos`, `Puntos`, `Parámetros Iniciales`, `Parámetros del Simulador`.
- Acciones principales visibles: `Ejecutar Simulación` y `Comparar`.
- Barra superior con búsqueda y filtros.
- Mapa como superficie principal para ubicar y analizar kiosks por conglomerado comercial.

## 14. Requisitos Funcionales

- RF-01: Crear, editar y duplicar escenarios.
- RF-02: Seleccionar distribución por variable y cargar parámetros.
- RF-03: Ejecutar N réplicas por escenario.
- RF-04: Ver KPIs agregados y por réplica.
- RF-05: Definir reglas de factibilidad y evaluarlas automáticamente.
- RF-06: Comparar Escenario A vs Escenario B y resaltar dominancia (cuando aplique).
- RF-07: Exportar resultados para informe.
- RF-08: Configurar horizonte temporal por meses (3, 6, 12) o años para análisis de amortización.
- RF-09: Cargar y visualizar en mapa múltiples kiosks por conglomerado comercial.
- RF-10: Permitir precio por kiosco configurable y reflejar su impacto en amortización y factibilidad.
- RF-11: Toda acción iniciada por botón debe requerir modal de confirmación con mensaje `¿Estás seguro?` antes de ejecutar.
- RF-12: Los inputs editables por cliente deben validar formato/tipo/rango en frontend antes del submit.
- RF-13: Todo input validado en frontend debe volver a validarse en backend con las mismas reglas de negocio.
- RF-14: Permitir generación de kiosks sobre mapa mediante click en una posición geográfica.
- RF-15: Cada click válido en mapa debe crear un marcador y un kiosko asociado con su `latitud` y `longitud`.
- RF-16: El sistema debe soportar creación de múltiples kiosks en mapa sin límite fijo predefinido por interfaz.
- RF-17: Permitir configurar por conglomerado los parámetros de demanda Normal (`mu`, `sigma`) y el porcentaje de interés.
- RF-18: Calcular automáticamente demanda potencial por kiosko a partir de flujo diario y porcentaje de interés.
- RF-19: Advertir al usuario cuando la densidad de kiosks configurada sea inconsistente con la demanda potencial estimada.
- RF-20: Permitir configurar un único valor global de capacidad máxima por kiosko para todo el escenario (default: 100 dispositivos).
- RF-21: Ejecutar comparación Escenario A vs Escenario B y mostrar KPIs comparativos para decisión manual del usuario sobre rentabilidad.
- RF-22: Gestionar umbral operativo de capacidad por kiosko en `85%` y disparar recolección al alcanzarlo.
- RF-23: Guardar historial de ejecuciones del simulador en `localStorage` del navegador.
- RF-24: Permitir consultar historial local de corridas con detalle de escenario, parámetros, seed, timestamp y resultados.

## 15. Requisitos No Funcionales

- RNF-01: Reproducibilidad total por semilla.
- RNF-02: Trazabilidad de parámetros usados en cada corrida.
- RNF-03: Tiempo de ejecución razonable (objetivo inicial: < 10s para 1e5 eventos).
- RNF-04: Robustez ante inputs inválidos.
- RNF-05: UX clara para justificar decisiones académicas.
- RNF-06: Tolerancia cero a datos inválidos persistidos; el backend debe rechazar cualquier input mal tipado o fuera de rango.
- RNF-07: Mensajes de validación claros, específicos y accionables para cada campo.
- RNF-08: Persistencia local-first: en esta etapa todo dato operativo e historial se almacena exclusivamente en `localStorage` (modo `localhost`).

## 16. Criterios de Aceptación (MVP)

- Se pueden ejecutar al menos 3 escenarios distintos con 100+ réplicas cada uno.
- El sistema calcula IC al 95% para 5 KPIs principales.
- La evaluación de factibilidad devuelve dictamen (Factible/No factible) + evidencia estadística.
- El 100% de acciones de botones críticos muestran modal `¿Estás seguro?` y solo continúan tras confirmación explícita.
- El 100% de campos editables numéricos bloquea letras/símbolos inválidos en frontend y valida nuevamente en backend.
- No se permite guardar ni ejecutar escenarios con datos inválidos; el sistema responde con errores por campo.
- Cada ejecución queda registrada en `localStorage` y puede recuperarse desde el historial del simulador.

## 17. Metodología Estadística

- Estimación puntual por media muestral.
- Intervalos de confianza por t-Student (n moderado) o aproximación normal (n grande).
- Análisis de sensibilidad one-at-a-time (OAT) en V1.
- Preparado para extensión a diseño de experimentos (DOE) en V2.


## 21. Diseño Estadístico en TypeScript (sin librerías externas)

### 21.1 Restricción tecnológica

- Todo el motor probabilístico se implementará en TypeScript.
- No se permite usar librerías externas para PRNG, muestreo o distribuciones.
- Se permite únicamente API estándar del runtime (Math, Date, etc.).

### 21.2 PRNG base

- Semilla inicial por defecto: `Date.now()`.
- Se definirá un PRNG propio de propósito general para generar `U(0,1)`.
- Todas las distribuciones derivarán exclusivamente de ese `U(0,1)`.
- El PRNG deberá permitir semilla inyectable para reproducibilidad.

### 21.3 Distribución Uniforme

- Tipo: continua en `[a,b)`.
- Muestreo: transformación lineal `x = a + (b-a)u`.
- Validaciones: `a < b`, chequeo de rango y contraste de media/varianza muestral.

### 21.4 Distribución Normal

- Tipo: continua con parámetros `mu` y `sigma`.
- Muestreo recomendado: método de Marsaglia polar (Box-Muller polar).
- Restricción: `sigma > 0`.
- Validaciones: media, desvío estándar y percentiles teóricos aproximados.
- Uso en dominio: modelar asistencia diaria promedio de personas al conglomerado comercial.

### 21.5 Distribución Poisson

- Tipo: discreta con parámetro `lambda`.
- Muestreo por rango:
- Para `lambda < 30`: algoritmo de Knuth.
- Para `lambda >= 30`: método aproximado/alternativo definido en spec técnica posterior.
- Restricción: `lambda > 0`.
- Validaciones: contraste de media y varianza con `lambda`.

### 21.6 Interfaz técnica mínima esperada

- `Rng.nextU01(): number`.
- `sampleUniform(rng, a, b): number`.
- `sampleNormal(rng, mu, sigma): number`.
- `samplePoisson(rng, lambda): number`.
- Todas las funciones deberán recibir `rng` explícito para trazabilidad y testeo.

### 21.7 Interfaces TypeScript obligatorias para typing seguro

- Cada distribución debe tener su propia interfaz de parámetros.
- No se permite compartir objetos `any` ni estructuras ambiguas entre distribuciones.
- El motor deberá trabajar con tipos discriminados por `kind`.

Interfaces base esperadas:

- `UniformDistributionParams`: `{ kind: "uniform"; a: number; b: number }`
- `NormalDistributionParams`: `{ kind: "normal"; mu: number; sigma: number }`
- `PoissonDistributionParams`: `{ kind: "poisson"; lambda: number }`
- `DistributionParams`: unión tipada de las tres anteriores.

Reglas:

- Validación estática: typing estricto en compile-time.
- Validación dinámica: mismas reglas en runtime/backend.
- Cualquier nuevo tipo de distribución futura debe incorporar su propia interfaz explícita.

### 21.8 Criterios de calidad estadística

- Se definirá un set de pruebas estadísticas básicas por distribución.
- Los errores tolerados de media/varianza dependerán del tamaño muestral.
- Cada corrida almacenará semilla, tamaño muestral, parámetros y resultados de validación.

### 21.9 Estrategia de validación de entradas (frontend + backend)

- Frontend (validación HTML + lógica de formulario):
- `type="number"` para campos numéricos.
- Restricciones por campo con `min`, `max`, `step`, `required` y patrones cuando aplique.
- Prevención de caracteres inválidos para campos estrictamente numéricos.
- Mensajes inline por campo antes de permitir envío.
- Backend (validación autoritativa):
- Parseo estricto de tipos.
- Rechazo de `NaN`, `Infinity`, nulos no permitidos y rangos fuera de contrato.
- Validación de consistencia entre campos (ejemplo: `a < b` en Uniforme, `sigma > 0` en Normal, `lambda > 0` en Poisson).
- Respuesta de error estructurada por campo para trazabilidad.

### 21.10 Modelo de kiosko georreferenciado

- Cada kiosko creado en mapa debe almacenar:
- `id` único.
- `latitud` y `longitud` de origen del click.
- `conglomeradoId` asociado (si aplica por flujo de negocio).
- `estado` del kiosko dentro del escenario.

Regla de creación:

- Evento de mapa: click en coordenada válida.
- Acción del sistema: crear marcador visible + entidad kiosko en estado del escenario.

### 21.11 Regla de realismo para múltiples kiosks

- El sistema permite crear múltiples kiosks en el mapa.
- La factibilidad final debe considerar coherencia entre cantidad de kiosks y demanda potencial.
- Debe existir alerta de sobreconfiguración cuando la cantidad de kiosks supere umbrales definidos respecto de `personas_interesadas` por zona.
- El análisis de sobreconfiguración debe considerar la capacidad máxima por kiosko y su umbral operativo del `85%`.

### 21.12 Historial local de simulaciones

- La aplicación debe registrar corridas en `localStorage`.
- Cada registro de corrida debe incluir como mínimo:
- `id` de corrida.
- `timestamp`.
- `escenario` (`A` o `B`).
- `seed`.
- parámetros de entrada relevantes.
- KPIs de salida y dictamen de factibilidad.
- El historial debe ser consultable desde la interfaz del simulador en `localhost`.

### 21.13 Contratos de datos de entrada (CSV actuales)

Fuentes iniciales en `./information`:

- `EcoAtm-Localidades.csv`
- `Kiosk-Position-ecoATM-Tucuman.csv`

Campos útiles mínimos:

- Localidades:
- `Nombre`
- `Departamento`
- `Población Censo 2022`
- `Superficie`
- `Densidad` (solo como referencia; se recalcula internamente)

- Kiosks:
- `Nombre Sucursal`
- `Calle`
- `Cadena`
- `Latitud`
- `Longitud`

Reglas obligatorias de ingesta:

- Normalizar encoding a UTF-8.
- Eliminar filas vacías/no útiles.
- Normalizar numéricos con parser locale-aware:
- población: coma como miles.
- superficie/densidad/%: coma como decimal.
- coordenadas: convertir coma decimal a punto y limpiar caracteres sucios.
- Validar coordenadas de Tucumán:
- latitud esperada aproximada: `[-28, -26]`
- longitud esperada aproximada: `[-66, -65]`
- Rechazar o enviar a revisión filas con coordenadas inválidas.
- Recalcular `densidad = poblacion_2022 / superficie_km2`.

### 21.14 Matching kiosko-localidad y claves de negocio

- El join principal de demanda se hará por `localidad_normalizada` + `departamento_normalizado`.
- No usar `Calle` cruda como clave de join.
- Crear campos derivados en kiosks:
- `kiosk_id`
- `localidad_normalizada`
- `departamento_normalizado`
- `cp` (si se puede extraer)
- `quality_status`
- Resolver colisiones/duplicados de localidades con revisión manual cuando el nombre se repita dentro del mismo departamento.

### 21.15 Datos faltantes críticos para correr A vs B

Debe definirse sí o sí antes de ejecutar simulación completa:

- Escenario A y Escenario B explícitos (qué cambia entre ambos).
- Parámetros por conglomerado/kiosko:
- `mu`, `sigma` de demanda Normal.
- `% interes` en recambio.
- Parámetros de operación:
- tiempo de servicio.
- abandono.
- fallas (frecuencia y duración).
- ticket promedio y costo por operación.
- Parámetros económicos:
- precio de adquisición por kiosko.
- costos operativos para amortización.
- Parámetros de experimento:
- horizonte, réplicas, warm-up, nivel de confianza.
- Reglas de factibilidad:
- umbrales y probabilidades objetivo configuradas.

### 21.16 Checklist de preparación de datos

Crítico:

1. Limpiar `Kiosk-Position-ecoATM-Tucuman.csv` (filas vacías y coordenadas inválidas).
2. Normalizar `EcoAtm-Localidades.csv` (encoding, placeholders y errores de fórmula).
3. Definir mapping kiosko -> localidad/departamento.
4. Completar campos obligatorios faltantes de escenarios A/B.

Medio:

1. Trazabilidad de cómo se derivan `mu` y `sigma` por conglomerado.
2. Normalización final de formatos numéricos (`%`, miles y decimales).
3. Política de horarios por conglomerado en dataset operativo.

Bajo:

1. Limpieza de acentos/mojibake en nombres para reporting.
2. Snapshot/versionado de datasets para reproducibilidad local.

### 21.17 Estado actual de datasets normalizados (localhost)

- `information/Kiosk-Position-ecoATM-Tucuman.csv`:
- Header canónico aplicado (`Nombre Sucursal`, `Calle`, `Cadena`, `Latitud`, `Longitud`).
- Coordenadas parseadas y validadas para Tucumán.
- Corrección aplicada a longitud inválida en Concepción (normalizada a valor negativo correcto).
- Fila con `Cadena` vacía completada manualmente:
- `Mercado Municipal - Tafi Viejo.` -> `Cadena = Gobierno`.

- `information/EcoAtm-Localidades.csv`:
- Header canónico aplicado sin acentos.
- Campos de población normalizados para cálculo.
- Densidad recalculada de forma consistente para filas válidas con la operación:
- `densidad = poblacion_2022 / superficie_km2`.
- Corrección puntual aplicada a `Juan Bautista Alberdi` (superficie `20.29`) y densidad recalculada.





## 22. Checklist de Implementacion (estado actual)

- [x] Motor de simulacion en TypeScript sin librerias externas para PRNG/distribuciones.
- [x] Soporte de distribuciones Uniforme, Normal y Poisson con interfaces tipadas por `kind`.
- [x] Seed por `Date.now()` con posibilidad de reproducibilidad por seed inyectada.
- [x] Validacion de inputs en frontend (`type=number`, `min`, `max`, `required`) y backend (`/api/simulate`).
- [x] Modal obligatorio de confirmacion `Estas seguro?` en botones de acciones criticas.
- [x] Mapa interactivo (canvas UI) con click para crear marcador y kiosko con lat/lon.
- [x] Multiples kioskos soportados por interfaz sin limite fijo.
- [x] Simulacion diaria por horizonte configurable y replicas.
- [x] Regla de capacidad global editable + umbral operativo 85% con disparo de recoleccion.
- [x] Comparacion Escenario A vs Escenario B con KPIs para decision manual.
- [x] Historial local en `localStorage` con metadata de corrida y resumen de KPIs.
- [x] Carga de datasets CSV desde `information/` por endpoint `/api/bootstrap`.
- [x] Alertas de sobreconfiguracion kiosko/demanda potencial.
- [x] Estimacion de IC 95% para KPIs principales (margen, ingreso, costo, dispositivos, amortizacion).
- [x] Pipeline de calidad ejecutable: `pnpm lint`, `pnpm test`, `pnpm build`.
- [x] Persistencia de escenarios A/B completos en localStorage con restauracion automatica.
- [x] Exportacion de resultados para informe (CSV/JSON UI).
- [x] Cobertura funcional ampliada del simulador/API/datasets y hardening adicional de UX.
