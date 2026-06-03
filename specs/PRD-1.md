# PRD - Simulador de Factibilidad de Configuraciones (EcoATM Kiosk)

## 1. Resumen Ejecutivo

Construir una plataforma de simulaci�n para la materia **Simulaci�n** que permita evaluar, bajo incertidumbre, la factibilidad operativa y econ�mica de distintas configuraciones de un kiosco EcoATM.

El simulador debe modelar variabilidad real mediante distribuciones de probabilidad y entregar m�tricas de desempe�o con intervalos de confianza, para apoyar decisiones de dise�o/configuraci�n.

## 2. Problema y Oportunidad

Tomar decisiones de configuraci�n sin modelar incertidumbre produce conclusiones fr�giles. Se necesita una herramienta que capture:

- Variabilidad de llegadas de clientes.
- Variabilidad en tiempos de atenci�n/procesamiento.
- Variabilidad en fallas, reintentos y abandono.
- Variabilidad en ingresos/costos.

## 3. Objetivo del Producto

Permitir que un usuario defina configuraciones del sistema, compare escenarios y determine manualmente la opci�n m�s rentable con evidencia estad�stica, asegurando factibilidad operativa y econ�mica.

## 4. Objetivos Espec�ficos

- Simular escenarios por eventos discretos y/o corridas Monte Carlo.
- Comparar Escenario A vs Escenario B bajo el mismo horizonte temporal.
- Asistir la identificaci�n manual de la opci�n m�s rentable entre escenarios factibles.
- Calcular KPIs con estimaci�n de error estad�stico.
- Identificar restricciones operativas y sensibilidad de variables cr�ticas.
- Exportar resultados para informe acad�mico.

## 5. Alcance

### 5.1 En alcance (V1)

- Definici�n de par�metros de entrada por configuraci�n.
- Soporte de distribuciones �nicamente: Uniforme, Normal y Poisson.
- Implementaci�n propia del motor estad�stico sin librer�as externas para generaci�n de distribuciones o pseudoaleatorios.
- Motor de simulaci�n con semilla basada en Date.now() de JavaScript.
- Corridas m�ltiples con warm-up opcional.
- Dashboard de resultados por escenario.
- Comparador de escenarios A vs B.

### 5.2 Fuera de alcance (V1)

- Cualquier distribuci�n distinta de Uniforme, Normal y Poisson.
- Uso de librer�as externas para generaci�n de n�meros pseudoaleatorios o muestreo de distribuciones.
- Optimizaci�n autom�tica exacta/metaheur�stica.
- Integraci�n con hardware real o sensores en tiempo real.
- Pron�stico ML avanzado.

## 6. Usuarios

- Estudiante/analista (usuario principal): define hip�tesis y eval�a factibilidad.
- Docente/evaluador: revisa trazabilidad y validez metodol�gica.

## 7. Preguntas de Negocio/Academia que debe responder

- �La configuraci�n cumple SLA de tiempo de procesamiento?
- �La utilizaci�n del recurso clave est� en rango deseado?
- �El throughput esperado justifica costos?
- �Qu� tan robusto es el resultado ante cambios en demanda?
- �Cu�l es la probabilidad de incumplir un objetivo cr�tico?
- �En qu� per�odo (3, 6, 12 meses o a�os) se amortiza la inversi�n por kiosco?
- �Qu� escenario resulta m�s rentable seg�n los KPIs observados en la corrida?

## 8. Definici�n de Factibilidad

Una configuraci�n se considera factible si cumple simult�neamente criterios parametrizables, por ejemplo:

- P(tiempo_procesamiento_promedio <= umbral_procesamiento) >= 95%
- P(utilizacion_recurso <= umbral_utilizacion) >= 90%
- P(margen_operativo >= 0) >= 80%
- P(periodo_amortizacion <= horizonte_objetivo) >= 80%

> Nota: los umbrales ser�n editables por escenario.

## 9. Modelo Conceptual del Sistema

### 9.1 Entidades

- Cliente
- Kiosk/terminal
- Evento de falla

### 9.2 Eventos

- Llegada de cliente
- Inicio de atenci�n
- Fin de atenci�n
- Reintento
- Abandono
- Falla/recuperaci�n

### 9.3 Recursos operativos

- Servidores (kiosks)

## 10. Inputs del Simulador

### 10.1 Par�metros estructurales

- Cantidad de kiosks
- Precio de adquisici�n por kiosco (configurable por escenario)
- Asignaci�n de m�ltiples kiosks por conglomerado comercial
- Capacidad m�xima de almacenamiento por kiosko (valor global editable; default: 100 dispositivos)
- Pol�tica de atenci�n
- Horario operativo del conglomerado comercial

### 10.2 Par�metros estoc�sticos

- Flujo diario de personas por conglomerado (distribuci�n Normal + par�metros)
- Porcentaje de inter�s en recambio de celular por dinero (tasa de conversi�n potencial)
- Tiempo de servicio por tipo de operaci�n
- Probabilidad de abandono por tiempo en sistema
- Frecuencia y duraci�n de fallas
- Ticket promedio / costo por operaci�n

### 10.3 Configuraci�n de experimento

- Horizonte de simulaci�n configurable en meses (3, 6, 12) o en a�os
- Cantidad de r�plicas
- Semilla base inicial derivada de `Date.now()`
- Per�odo warm-up
- Nivel de confianza (ej. 95%)

## 11. Outputs y KPIs

- Throughput (clientes/hora)
- Tiempo total en sistema
- Utilizaci�n por recurso
- Tasa de abandono
- Ingreso, costo, margen esperado
- Punto de equilibrio y per�odo estimado de amortizaci�n del kiosco
- Probabilidad de cumplimiento de restricciones de factibilidad
- Intervalos de confianza por KPI

## 12. Reglas de Simulaci�n y Supuestos Iniciales

- Eventos ordenados por timestamp (calendario de eventos).
- Independencia inicial entre variables aleatorias (configurable a futuro).
- El generador pseudoaleatorio base ser� propio y se inicializa con Date.now() para cada corrida, salvo configuraci�n manual posterior.
- Un cliente procesa una operaci�n por ciclo.
- Abandono ocurre cuando tiempo en sistema supera umbral o por probabilidad condicional.
- Falla de recurso suspende servicio y reduce capacidad efectiva durante la recuperaci�n.
- La demanda potencial por kiosko se calcula desde el flujo diario del conglomerado y un porcentaje de inter�s.
- El flujo diario base se modela con distribuci�n Normal para aproximar asistencia promedio al supermercado/conglomerado.
- La llegada esperada al kiosko se aproxima como: `personas_interesadas = flujo_diario * porcentaje_interes`.
- Todos los kiosks comparten una misma capacidad m�xima de almacenamiento por escenario.
- El valor de capacidad m�xima es editable y se inicializa por defecto en `100` dispositivos por kiosko.
- Cada kiosko tiene umbral operativo del `85%` de su capacidad m�xima.
- Al alcanzar el umbral del `85%`, se dispara evento de recolecci�n para evitar saturaci�n f�sica del kiosko.

## 13. Arquitectura Funcional (alto nivel)

- M�dulo de definici�n de escenario.
- M�dulo de validaci�n de par�metros.
- Motor de simulaci�n.
- M�dulo estad�stico (IC, percentiles, prob. de cumplimiento).
- M�dulo geoespacial para visualizaci�n de kiosks y conglomerados en mapa.
- Visualizaci�n y comparaci�n.
- Exportaci�n (CSV/JSON/Reporte).

### 13.1 Lineamientos de interfaz (basado en prototipo)

- Layout principal con sidebar izquierda de configuraci�n y panel central de mapa.
- Secciones funcionales visibles: `Config`, `Datos`, `Puntos`, `Par�metros Iniciales`, `Par�metros del Simulador`.
- Acciones principales visibles: `Ejecutar Simulaci�n` y `Comparar`.
- Barra superior con b�squeda y filtros.
- Mapa como superficie principal para ubicar y analizar kiosks por conglomerado comercial.

## 14. Requisitos Funcionales

- RF-01: Crear, editar y duplicar escenarios.
- RF-02: Seleccionar distribuci�n por variable y cargar par�metros.
- RF-03: Ejecutar N r�plicas por escenario.
- RF-04: Ver KPIs agregados y por r�plica.
- RF-05: Definir reglas de factibilidad y evaluarlas autom�ticamente.
- RF-06: Comparar Escenario A vs Escenario B y resaltar dominancia (cuando aplique).
- RF-07: Exportar resultados para informe.
- RF-08: Configurar horizonte temporal por meses (3, 6, 12) o a�os para an�lisis de amortizaci�n.
- RF-09: Cargar y visualizar en mapa m�ltiples kiosks por conglomerado comercial.
- RF-10: Permitir precio por kiosco configurable y reflejar su impacto en amortizaci�n y factibilidad.
- RF-11: Toda acci�n iniciada por bot�n debe requerir modal de confirmaci�n con mensaje `�Est�s seguro?` antes de ejecutar.
- RF-12: Los inputs editables por cliente deben validar formato/tipo/rango en frontend antes del submit.
- RF-13: Todo input validado en frontend debe volver a validarse en backend con las mismas reglas de negocio.
- RF-14: Permitir generaci�n de kiosks sobre mapa mediante click en una posici�n geogr�fica.
- RF-15: Cada click v�lido en mapa debe crear un marcador y un kiosko asociado con su `latitud` y `longitud`.
- RF-16: El sistema debe soportar creaci�n de m�ltiples kiosks en mapa sin l�mite fijo predefinido por interfaz.
- RF-17: Permitir configurar por conglomerado los par�metros de demanda Normal (`mu`, `sigma`) y el porcentaje de inter�s.
- RF-18: Calcular autom�ticamente demanda potencial por kiosko a partir de flujo diario y porcentaje de inter�s.
- RF-19: Advertir al usuario cuando la densidad de kiosks configurada sea inconsistente con la demanda potencial estimada.
- RF-20: Permitir configurar un �nico valor global de capacidad m�xima por kiosko para todo el escenario (default: 100 dispositivos).
- RF-21: Ejecutar comparaci�n Escenario A vs Escenario B y mostrar KPIs comparativos para decisi�n manual del usuario sobre rentabilidad.
- RF-22: Gestionar umbral operativo de capacidad por kiosko en `85%` y disparar recolecci�n al alcanzarlo.
- RF-23: Guardar historial de ejecuciones del simulador en `localStorage` del navegador.
- RF-24: Permitir consultar historial local de corridas con detalle de escenario, par�metros, seed, timestamp y resultados.

## 15. Requisitos No Funcionales

- RNF-01: Reproducibilidad total por semilla.
- RNF-02: Trazabilidad de par�metros usados en cada corrida.
- RNF-03: Tiempo de ejecuci�n razonable (objetivo inicial: < 10s para 1e5 eventos).
- RNF-04: Robustez ante inputs inv�lidos.
- RNF-05: UX clara para justificar decisiones acad�micas.
- RNF-06: Tolerancia cero a datos inv�lidos persistidos; el backend debe rechazar cualquier input mal tipado o fuera de rango.
- RNF-07: Mensajes de validaci�n claros, espec�ficos y accionables para cada campo.
- RNF-08: Persistencia local-first: en esta etapa todo dato operativo e historial se almacena exclusivamente en `localStorage` (modo `localhost`).

## 16. Criterios de Aceptaci�n (MVP)

- Se pueden ejecutar al menos 3 escenarios distintos con 100+ r�plicas cada uno.
- El sistema calcula IC al 95% para 5 KPIs principales.
- La evaluaci�n de factibilidad devuelve dictamen (Factible/No factible) + evidencia estad�stica.
- El 100% de acciones de botones cr�ticos muestran modal `�Est�s seguro?` y solo contin�an tras confirmaci�n expl�cita.
- El 100% de campos editables num�ricos bloquea letras/s�mbolos inv�lidos en frontend y valida nuevamente en backend.
- No se permite guardar ni ejecutar escenarios con datos inv�lidos; el sistema responde con errores por campo.
- Cada ejecuci�n queda registrada en `localStorage` y puede recuperarse desde el historial del simulador.

## 17. Metodolog�a Estad�stica

- Estimaci�n puntual por media muestral.
- Intervalos de confianza por t-Student (n moderado) o aproximaci�n normal (n grande).
- An�lisis de sensibilidad one-at-a-time (OAT) en V1.
- Preparado para extensi�n a dise�o de experimentos (DOE) en V2.


## 21. Dise�o Estad�stico en TypeScript (sin librer�as externas)

### 21.1 Restricci�n tecnol�gica

- Todo el motor probabil�stico se implementar� en TypeScript.
- No se permite usar librer�as externas para PRNG, muestreo o distribuciones.
- Se permite �nicamente API est�ndar del runtime (Math, Date, etc.).

### 21.2 PRNG base

- Semilla inicial por defecto: `Date.now()`.
- Se definir� un PRNG propio de prop�sito general para generar `U(0,1)`.
- Todas las distribuciones derivar�n exclusivamente de ese `U(0,1)`.
- El PRNG deber� permitir semilla inyectable para reproducibilidad.

### 21.3 Distribuci�n Uniforme

- Tipo: continua en `[a,b)`.
- Muestreo: transformaci�n lineal `x = a + (b-a)u`.
- Validaciones: `a < b`, chequeo de rango y contraste de media/varianza muestral.

### 21.4 Distribuci�n Normal

- Tipo: continua con par�metros `mu` y `sigma`.
- Muestreo recomendado: m�todo de Marsaglia polar (Box-Muller polar).
- Restricci�n: `sigma > 0`.
- Validaciones: media, desv�o est�ndar y percentiles te�ricos aproximados.
- Uso en dominio: modelar asistencia diaria promedio de personas al conglomerado comercial.

### 21.5 Distribuci�n Poisson

- Tipo: discreta con par�metro `lambda`.
- Muestreo por rango:
- Para `lambda < 30`: algoritmo de Knuth.
- Para `lambda >= 30`: m�todo aproximado/alternativo definido en spec t�cnica posterior.
- Restricci�n: `lambda > 0`.
- Validaciones: contraste de media y varianza con `lambda`.

### 21.6 Interfaz t�cnica m�nima esperada

- `MCM.nextU01(): number` (MCM = Metodo Congruencial Mixto, el PRNG).
- `sampleUniform(mcm, a, b): number`.
- `sampleNormal(mcm, mu, sigma): number`.
- `samplePoisson(mcm, lambda): number`.
- `sampleBinomial(mcm, n, p): number`.
- Todas las funciones deber�n recibir `mcm` expl�cito para trazabilidad y testeo.

### 21.7 Interfaces TypeScript obligatorias para typing seguro

- Cada distribuci�n debe tener su propia interfaz de par�metros.
- No se permite compartir objetos `any` ni estructuras ambiguas entre distribuciones.
- El motor deber� trabajar con tipos discriminados por `kind`.

Interfaces base esperadas:

- `UniformDistributionParams`: `{ kind: "uniform"; a: number; b: number }`
- `NormalDistributionParams`: `{ kind: "normal"; mu: number; sigma: number }`
- `PoissonDistributionParams`: `{ kind: "poisson"; lambda: number }`
- `DistributionParams`: uni�n tipada de las tres anteriores.

Reglas:

- Validaci�n est�tica: typing estricto en compile-time.
- Validaci�n din�mica: mismas reglas en runtime/backend.
- Cualquier nuevo tipo de distribuci�n futura debe incorporar su propia interfaz expl�cita.

### 21.8 Criterios de calidad estad�stica

- Se definir� un set de pruebas estad�sticas b�sicas por distribuci�n.
- Los errores tolerados de media/varianza depender�n del tama�o muestral.
- Cada corrida almacenar� semilla, tama�o muestral, par�metros y resultados de validaci�n.

### 21.9 Estrategia de validaci�n de entradas (frontend + backend)

- Frontend (validaci�n HTML + l�gica de formulario):
- `type="number"` para campos num�ricos.
- Restricciones por campo con `min`, `max`, `step`, `required` y patrones cuando aplique.
- Prevenci�n de caracteres inv�lidos para campos estrictamente num�ricos.
- Mensajes inline por campo antes de permitir env�o.
- Backend (validaci�n autoritativa):
- Parseo estricto de tipos.
- Rechazo de `NaN`, `Infinity`, nulos no permitidos y rangos fuera de contrato.
- Validaci�n de consistencia entre campos (ejemplo: `a < b` en Uniforme, `sigma > 0` en Normal, `lambda > 0` en Poisson).
- Respuesta de error estructurada por campo para trazabilidad.

### 21.10 Modelo de kiosko georreferenciado

- Cada kiosko creado en mapa debe almacenar:
- `id` �nico.
- `latitud` y `longitud` de origen del click.
- `conglomeradoId` asociado (si aplica por flujo de negocio).
- `estado` del kiosko dentro del escenario.

Regla de creaci�n:

- Evento de mapa: click en coordenada v�lida.
- Acci�n del sistema: crear marcador visible + entidad kiosko en estado del escenario.

### 21.11 Regla de realismo para m�ltiples kiosks

- El sistema permite crear m�ltiples kiosks en el mapa.
- La factibilidad final debe considerar coherencia entre cantidad de kiosks y demanda potencial.
- Debe existir alerta de sobreconfiguraci�n cuando la cantidad de kiosks supere umbrales definidos respecto de `personas_interesadas` por zona.
- El an�lisis de sobreconfiguraci�n debe considerar la capacidad m�xima por kiosko y su umbral operativo del `85%`.

### 21.12 Historial local de simulaciones

- La aplicaci�n debe registrar corridas en `localStorage`.
- Cada registro de corrida debe incluir como m�nimo:
- `id` de corrida.
- `timestamp`.
- `escenario` (`A` o `B`).
- `seed`.
- par�metros de entrada relevantes.
- KPIs de salida y dictamen de factibilidad.
- El historial debe ser consultable desde la interfaz del simulador en `localhost`.

### 21.13 Contratos de datos de entrada (CSV actuales)

Fuentes iniciales en `./information`:

- `EcoAtm-Localidades.csv`
- `Kiosk-Position-ecoATM-Tucuman.csv`

Campos �tiles m�nimos:

- Localidades:
- `Nombre`
- `Departamento`
- `Poblaci�n Censo 2022`
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
- Eliminar filas vac�as/no �tiles.
- Normalizar num�ricos con parser locale-aware:
- poblaci�n: coma como miles.
- superficie/densidad/%: coma como decimal.
- coordenadas: convertir coma decimal a punto y limpiar caracteres sucios.
- Validar coordenadas de Tucum�n:
- latitud esperada aproximada: `[-28, -26]`
- longitud esperada aproximada: `[-66, -65]`
- Rechazar o enviar a revisi�n filas con coordenadas inv�lidas.
- Recalcular `densidad = poblacion_2022 / superficie_km2`.

### 21.14 Matching kiosko-localidad y claves de negocio

- El join principal de demanda se har� por `localidad_normalizada` + `departamento_normalizado`.
- No usar `Calle` cruda como clave de join.
- Crear campos derivados en kiosks:
- `kiosk_id`
- `localidad_normalizada`
- `departamento_normalizado`
- `cp` (si se puede extraer)
- `quality_status`
- Resolver colisiones/duplicados de localidades con revisi�n manual cuando el nombre se repita dentro del mismo departamento.

### 21.15 Datos faltantes cr�ticos para correr A vs B

Debe definirse s� o s� antes de ejecutar simulaci�n completa:

- Escenario A y Escenario B expl�citos (qu� cambia entre ambos).
- Par�metros por conglomerado/kiosko:
- `mu`, `sigma` de demanda Normal.
- `% interes` en recambio.
- Par�metros de operaci�n:
- tiempo de servicio.
- abandono.
- fallas (frecuencia y duraci�n).
- ticket promedio y costo por operaci�n.
- Par�metros econ�micos:
- precio de adquisici�n por kiosko.
- costos operativos para amortizaci�n.
- Par�metros de experimento:
- horizonte, r�plicas, warm-up, nivel de confianza.
- Reglas de factibilidad:
- umbrales y probabilidades objetivo configuradas.

### 21.16 Checklist de preparaci�n de datos

Cr�tico:

1. Limpiar `Kiosk-Position-ecoATM-Tucuman.csv` (filas vac�as y coordenadas inv�lidas).
2. Normalizar `EcoAtm-Localidades.csv` (encoding, placeholders y errores de f�rmula).
3. Definir mapping kiosko -> localidad/departamento.
4. Completar campos obligatorios faltantes de escenarios A/B.

Medio:

1. Trazabilidad de c�mo se derivan `mu` y `sigma` por conglomerado.
2. Normalizaci�n final de formatos num�ricos (`%`, miles y decimales).
3. Pol�tica de horarios por conglomerado en dataset operativo.

Bajo:

1. Limpieza de acentos/mojibake en nombres para reporting.
2. Snapshot/versionado de datasets para reproducibilidad local.

### 21.17 Estado actual de datasets normalizados (localhost)

- `information/Kiosk-Position-ecoATM-Tucuman.csv`:
- Header can�nico aplicado (`Nombre Sucursal`, `Calle`, `Cadena`, `Latitud`, `Longitud`).
- Coordenadas parseadas y validadas para Tucum�n.
- Correcci�n aplicada a longitud inv�lida en Concepci�n (normalizada a valor negativo correcto).
- Fila con `Cadena` vac�a completada manualmente:
- `Mercado Municipal - Tafi Viejo.` -> `Cadena = Gobierno`.

- `information/EcoAtm-Localidades.csv`:
- Header can�nico aplicado sin acentos.
- Campos de poblaci�n normalizados para c�lculo.
- Densidad recalculada de forma consistente para filas v�lidas con la operaci�n:
- `densidad = poblacion_2022 / superficie_km2`.
- Correcci�n puntual aplicada a `Juan Bautista Alberdi` (superficie `20.29`) y densidad recalculada.





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
