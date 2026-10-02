# CoachPanel

Sistema web para controlar la **asistencia** de las clases vespertinas de robótica LEGO,
las **prácticas de pista** (tiempo y puntaje de cada robot) y la **participación en la
WRO Venezuela**.

Funciona en el navegador, desde una URL pública, y **todos los dispositivos que la
abran ven los mismos datos**.

---

## Qué hace

**Dos modalidades, un solo sistema.** Al entrar, el portal pregunta cómo quieres hacerlo:

| Modalidad | Contraseña | Qué puede hacer |
|---|---|---|
| **Coach / Profesor** | Sí | Todo: tomar asistencia, crear estudiantes, armar equipos, registrar prácticas y editar la WRO. |
| **Alumno o representante** | No | Solo consulta: asistencia del club, equipos con sus integrantes, tiempos de pista, puntajes y participación en la WRO. |

El modo consulta está bloqueado **en la capa de datos**, no solo escondiendo botones: si una pantalla pidiera guardar algo, el sistema lo rechaza con un mensaje claro. Así una familia no puede cambiar nada por descuido.

### Las secciones

| Sección | Quién la ve | Para qué sirve |
|---|---|---|
| **Panel** | Coach | Estudiantes activos, asistencia del mes, gráfico de 8 semanas, pendientes. |
| **Asistencia** | Coach | Se elige la fecha y se marca a cada estudiante con un toque: *Presente / Ausente / Tarde / Justificado*. Historial con porcentajes. |
| **Estudiantes** | Coach | Niños y niñas del club: datos, representante, equipo, asistencia y mejor puntaje. La baja **no borra** el historial. |
| **El club** | Alumnos y representantes | Todo el club en una pantalla: indicadores, última clase, asistencia del mes, equipos y mejores marcas por pista. |
| **Equipos** | Todos | Nombre del equipo y hasta **3 integrantes**. Un estudiante pertenece a un solo equipo. |
| **Prácticas** | Todos | Fecha, equipo, intento, reto, **tiempo en que el robot completa la pista** (`mm:ss.ms`) y **puntaje**. Ranking por reto. |
| **WRO** | Todos | Qué equipos participan en la WRO Venezuela, categoría, resultado y reporte imprimible. |

Todo está pensado para el teléfono: menú deslizable, botones de 44 px, tablas que se desplazan y modales que caben en la pantalla.


---

## Cómo está hecho (y por qué)

- **Sin servidor que mantener**: la aplicación son archivos estáticos (HTML, CSS y
  JavaScript puro) publicados en **GitHub Pages**.
- **Sin dependencias**: cero paquetes de npm. El cliente que habla con la base de datos
  es propio (`docs/js/postgrest.js`). Nada que instalar, nada que actualizar, nada que
  se rompa solo.
- **La base de datos es Supabase** (PostgreSQL en la nube). Por eso los datos se ven
  igual desde la computadora, la tablet o el teléfono.
- **Base de datos en local, opcional**: si prefieres trabajar sin internet en una sola
  máquina, mira [Trabajar sin internet](#trabajar-sin-internet).

### Arquitectura

```
  Navegador (GitHub Pages)              Supabase (nube)
  ┌────────────────────────┐            ┌──────────────────────┐
  │  docs/index.html       │            │  PostgreSQL          │
  │  docs/styles/*.css     │  HTTPS     │  · estudiantes       │
  │  docs/js/*.js          │ ─────────► │  · equipos           │
  │    ├─ arranque.js      │  REST      │  · equipo_integrantes│
  │    ├─ api.js           │            │  · sesiones          │
  │    ├─ postgrest.js     │ ◄───────── │  · asistencia        │
  │    └─ vistas/*.js      │  JSON      │  · practicas         │
  └────────────────────────┘            │  · retos             │
                                        └──────────────────────┘
```

---

## Puesta en marcha

La explicación paso a paso, para quien nunca lo ha hecho, está en
**[GUIA-DESPLIEGUE.md](GUIA-DESPLIEGUE.md)**. Resumen:

1. Crear un proyecto en [supabase.com](https://supabase.com) (gratis).
2. En **SQL Editor**, ejecutar en orden los 4 archivos de `supabase/`.
3. Copiar *Project URL* y la clave *anon public* (Settings → API).
4. Pegarlas en `docs/js/config.js`, junto con tu token de acceso.
5. `node scripts/verificar.mjs` → debe decir "Todo correcto".
6. Subir a GitHub y activar Pages (*Settings → Pages → Deploy from a branch → `/docs`*).
7. Compartir el link `https://tuusuario.github.io/coachpanel-subida/#/acceso?t=TU-TOKEN`.

### Probar en tu computadora antes de publicar

```bash
node scripts/servir.mjs
# abre http://127.0.0.1:8765/
```

> Abrir `docs/index.html` con doble clic **no funciona**: los módulos de JavaScript
> necesitan `http://`, no `file://`. Por eso existe el servidor local.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `node scripts/servir.mjs` | Sirve la app localmente en `http://127.0.0.1:8765`. |
| `node scripts/verificar.mjs` | Comprueba configuración, conexión, tablas, RLS, token y que la regla de 3 integrantes se cumpla. |
| `node scripts/respaldar.mjs` | Descarga **toda** la base a JSON y CSV en `respaldos/`. |
| `node scripts/revisar-importaciones.mjs` | Revisa que todos los módulos importen cosas que existen (una importación rota deja la app en blanco). |
| `node --test tests/` | Corre las pruebas. |

Con npm disponible: `npm run servir`, `npm run verificar`, `npm run respaldar`, `npm test`.

---

## Respaldos: léelo, es importante

El plan gratuito de Supabase **no tiene respaldos automáticos**. La red de seguridad
es tuya:

```bash
node scripts/respaldar.mjs
```

Genera en `respaldos/`:

- `respaldo-<fecha>.json` — todo, listo para reimportar.
- `respaldo-<fecha>-<tabla>.csv` — una hoja de cálculo por tabla (se abre con Excel).

Córrelo cada semana y **guarda los archivos fuera del repositorio** (Drive, pendrive).
También puedes descargar el respaldo desde la app: botón *Descargar respaldo* del menú.

---

## Acceso: dos llaves

| Qué | Dónde se configura | Para qué |
|---|---|---|
| **Token del club** | `docs/js/config.js` → `TOKEN_ACCESO`, y la tabla `app_ajustes` (fila `token_acceso`) | La llave que comparte el coach. Sin ella no se llega a los datos. |
| **Contraseña del coach** | `docs/js/config.js` → `CONTRASENA_COACH` | Protege el modo que edita. El modo consulta no la necesita. |

El link compartible es:

```
https://tuusuario.github.io/coachpanel-subida/#/acceso?t=TU-TOKEN
```

Con ese link, cada familia elige *Alumno o representante*, ve los datos del club y no puede cambiar nada. Tú eliges *Coach* y escribes tu contraseña para trabajar.

Cada dispositivo **recuerda la modalidad elegida**, así no se pregunta en cada clase. Si alguien necesita cambiar, hay un botón *Cambiar de modalidad* al pie del menú.

## Seguridad: qué protege y qué no

| Sí protege | No protege |
|---|---|
| Sin el token del club no se llega a los datos. | El token y la contraseña están **visibles en el código** de la página, porque GitHub Pages es público. |
| Sin RLS no se devuelve ni una fila. | El modo consulta es una barrera del programa: alguien con conocimientos podría llamar a la base directamente con la clave publicable. |
| **Borrar está prohibido** desde la web: nadie puede eliminar el historial. | Quien entre como coach puede editar todo. Cuida la contraseña. |
| El modo consulta **no puede escribir**: la barrera está en la capa de datos, no solo en los botones. | No hay usuarios individuales: todos los representantes ven el club completo. |

Para endurecerlo de verdad (usuarios, roles y políticas por fila en la base de datos), el camino está descrito paso a paso en [seguridad.mejorar.md](seguridad.mejorar.md) — y no requiere rehacer la app.

**Datos de menores**: el repositorio no contiene datos de niños. Los nombres viven únicamente en tu base de datos de Supabase. Comparte el link solo con las familias del club.


---

## Pruebas

```bash
node --test tests/
```

164 pruebas que cubren:

- **formato.js** — tiempos de pista (`1:23.45`, `83.45`, `83s`), fechas sin sustos de
  zona horaria, puntajes con separador de miles venezolano.
- **equipos.js** — máximo 3 integrantes, un estudiante en un solo equipo, un capitán.
- **asistencia.js** — lista de la sesión, estados, porcentajes (`sin datos` ≠ `0 %`), rachas.
- **estadisticas.js** — mejor tiempo = mínimo, mejor puntaje = máximo, mediana, rankings.
- **postgrest.js** — el cliente REST con `fetch` simulado: URLs, filtros, paginación,
  traducción de errores, reintentos y modo sin conexión.
- **cache.js** — el modo "sin conexión" con `localStorage`.
- **vistas.test.mjs** — renderiza **las 6 pantallas de verdad** contra una API simulada,
  usando un DOM mínimo (`tests/ayudas/dom-falso.mjs`). Encuentra errores que la revisión
  de sintaxis no ve: datos con otra forma, propiedades mal escritas, lógica de guardado.

### Si `node --test` falla con `spawn EPERM`

En entornos muy restringidos (sandbox) Node no puede lanzar el subproceso de cada
archivo de prueba. Usa el modo en proceso:

```bash
node --test --experimental-test-isolation=none "tests/*.test.mjs"
```

---

## Trabajar sin internet

La app necesita internet para leer y escribir (los datos están en Supabase). Si no hay
conexión, **no queda en blanco**: muestra la última información que vio ese dispositivo,
con un aviso ámbar que indica de cuándo son los datos. No se encolan cambios: si no hay
conexión, no se guarda a medias.

Para trabajar en local de verdad haría falta una base de datos local (SQLite). No está
incluido para no mantener dos caminos de datos sincronizados; el respaldo en JSON sí te
permite mover la información de un lado a otro.

---

## Estructura del proyecto

```
CoachPanel/
├─ docs/                     ← esto es lo que se publica en GitHub Pages
│  ├─ index.html
│  ├─ icono.svg
│  ├─ styles/                tokens.css · app.css · print.css
│  └─ js/
│     ├─ config.js           ← TUS datos de Supabase (editar)
│     ├─ config.ejemplo.js   plantilla
│     ├─ arranque.js         comprobación de conexión y puerta de acceso
│     ├─ main.js             enrutador por hash y cascarón
│     ├─ postgrest.js        cliente REST propio (reemplaza a supabase-js)
│     ├─ api.js              capa de datos de la app
│     ├─ cache.js            modo sin conexión
│     ├─ store.js            estado y tema claro/oscuro
│     ├─ formato.js          tiempos, fechas, puntajes, textos
│     ├─ equipos.js          reglas de los equipos
│     ├─ asistencia.js       reglas de la asistencia
│     ├─ estadisticas.js     cálculos y gráfico SVG
│     ├─ ui.js               elementos, modal, avisos, esqueletos
│     ├─ componentes/        piezas visuales (studs, KPIs, tablas)
│     └─ vistas/             panel · asistencia · estudiantes · equipos · prácticas · wro
├─ supabase/                 los 4 archivos .sql (esquema, RLS, datos, vistas)
├─ scripts/                  servir · verificar · respaldar · revisar importaciones
├─ tests/                    pruebas automáticas + DOM mínimo de prueba
├─ respaldos/                (se crea al respaldar; no se sube)
└─ GUIA-DESPLIEGUE.md · seguridad.mejorar.md
```

---

## Preguntas frecuentes

**¿Cuánto cuesta?** Nada. GitHub Pages y el plan gratuito de Supabase alcanzan de sobra
para un club (límite: 500 MB de base de datos).

**¿Y si Supabase pausa el proyecto?** El plan gratuito pausa un proyecto tras **una
semana sin uso**. En un club que se reúne cada semana no debería pasar, pero si pasa:
entra a supabase.com/dashboard, elige el proyecto y pulsa *Restore project*. La app lo
detecta y te lo dice con esas palabras.

**¿Puedo usarlo sin teléfono, solo en la computadora del club?** Sí. Y si quieres tener
copia en papel, los botones *Imprimir* generan listas de asistencia y el reporte WRO.

**¿Varios equipos en la misma clase?** Sí, cada equipo tiene su propio nombre, integrantes
y prácticas. También puedes tener varios equipos inscritos en la WRO.

**¿Y si un niño se cambia de equipo?** Edita el equipo: quítalo de donde estaba y
agrégalo al nuevo. La app te impide tenerlo en dos equipos a la vez, con el mensaje que
te dice en cuál está.

**¿Se puede borrar un estudiante?** No desde la web, a propósito: se da de baja
(`activo = false`) y conserva todo su historial. Borrar es una operación de
administrador, en el panel de Supabase.

---

## Licencia

Uso libre para clubes de robótica educativa. Úsalo, cámbialo y compártelo.
