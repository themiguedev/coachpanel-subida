# Guía de despliegue paso a paso

Esta guía te lleva desde cero hasta tener la aplicación funcionando en una URL pública que
puedes compartir con los representantes y alumnos.

**No necesitas saber programar.** Solo seguir los pasos en orden. Tiempo estimado: 30 a 40
minutos la primera vez.

---

## Índice

1. [Antes de empezar](#1-antes-de-empezar)
2. [Crear la base de datos en Supabase](#2-crear-la-base-de-datos-en-supabase)
3. [Crear las tablas (ejecutar el SQL)](#3-crear-las-tablas-ejecutar-el-sql)
4. [Elegir tu token secreto](#4-elegir-tu-token-secreto)
5. [Conectar la app con tu base de datos](#5-conectar-la-app-con-tu-base-de-datos)
6. [Verificar que todo esté bien](#6-verificar-que-todo-esté-bien)
7. [Probar la app en tu computadora](#7-probar-la-app-en-tu-computadora)
8. [Subir el proyecto a GitHub](#8-subir-el-proyecto-a-github)
9. [Publicar la página (GitHub Pages)](#9-publicar-la-página-github-pages)
10. [Compartir el link](#10-compartir-el-link)
11. [Respaldos (muy importante)](#11-respaldos-muy-importante)
12. [Problemas y soluciones](#12-problemas-y-soluciones)

---

## 1. Antes de empezar

Necesitas:

- **Node.js instalado** en tu computadora. Compruébalo abriendo una terminal y escribiendo:
  ```bash
  node --version
  ```
  Debe responder algo como `v20.11.0` o mayor. Si no responde, descárgalo de
  [nodejs.org](https://nodejs.org) (versión LTS).
- **Una cuenta de GitHub** (gratis).
- **Una cuenta de Supabase** (gratis).
- El proyecto descargado en tu computadora.

> **¿Cómo abro una terminal?**
> En Windows: tecla Windows → escribe `PowerShell` → Enter.
> En Mac: `Cmd + Espacio` → escribe `Terminal` → Enter.

---

## 2. Crear la base de datos en Supabase

1. Entra a **[supabase.com](https://supabase.com)** y pulsa **Start your project**.
2. Crea la cuenta (puedes usar tu cuenta de GitHub para no inventar otra contraseña).
3. Pulsa **New project** y llena:
   - **Name**: `coachpanel` (o `robotica-lego`).
   - **Database Password**: pulsa *Generate a password* y **guárdala** en un lugar seguro.
     No la vas a necesitar para la app, pero no se puede recuperar si la pierdes.
   - **Region**: elige la más cercana a Venezuela. `East US (North Virginia)` suele ser la
     más rápida desde aquí.
   - **Plan**: **Free**.
4. Pulsa **Create new project** y espera 1 o 2 minutos mientras se prepara.

> **Muy importante**: el plan gratuito **pausa el proyecto después de una semana sin uso**.
> Si el club se reúne cada semana, no pasará. Si llegara a pasar, entra al proyecto y pulsa
> **Restore project**. La app te avisa con ese mismo mensaje cuando lo detecta.

---

## 3. Crear las tablas (ejecutar el SQL)

En el menú lateral de Supabase, pulsa **SQL Editor** → **New query**.

Vas a pegar el contenido de **4 archivos**, uno por uno, **en este orden**:

| Orden | Archivo | Qué crea |
|---|---|---|
| 1 | `supabase/01_esquema.sql` | Las tablas, reglas e índices |
| 2 | `supabase/02_rls.sql` | La seguridad (quién puede leer y escribir) |
| 3 | `supabase/03_datos_iniciales.sql` | Los retos por defecto y el token |
| 4 | `supabase/04_vistas.sql` | Los resúmenes y el ranking |

### Cómo ejecutar cada uno

1. Abre el archivo en un editor de texto (Notepad, VS Code…) y **copia todo** (`Ctrl+A`, `Ctrl+C`).
2. Pégalo en el SQL Editor de Supabase (`Ctrl+V`).
3. Pulsa **Run** (o `Ctrl+Enter`).
4. Debe aparecer **Success. No rows returned**. Eso significa que salió bien.
5. Limpia el editor (**New query**) y repite con el siguiente archivo.

> ⚠️ **Antes de ejecutar el archivo 3**, léelo y cambia `CAMBIA-ESTE-TOKEN` por tu token
> secreto (paso 4). Si lo ejecutas sin cambiarlo, la app te lo señalará después y podrás
> corregirlo con una consulta sencilla.

### Comprobar que quedó bien

En el menú lateral, pulsa **Table Editor**. Debes ver 9 tablas:

`app_ajustes` · `asistencia` · `equipo_integrantes` · `equipos` · `estudiantes` ·
`log_acceso` · `practicas` · `retos` · `sesiones`

Si ves esas 9, ya está.

---

## 4. Elegir tu token secreto

El token es lo que permite entrar a la app. **Invéntate uno**. Sugerencias:

- Entre 12 y 20 caracteres.
- Mezcla letras, números y algún guion. Ejemplo: `lego-vespertino-2026`.
- **No** uses tu nombre, ni la palabra `robotica`, ni nada obvio.

Puedes separar el token del link dándoselo aparte a las familias, o incluirlo en el link
(paso 10). Como el token queda escrito en el código de la página, trátalo más bien como
"la llave del salón" que como una contraseña de banco.

Debes poner **el mismo texto** en dos sitios:

| Dónde | Qué |
|---|---|
| Supabase, tabla `app_ajustes`, fila `token_acceso` | Con la consulta de abajo |
| `docs/js/config.js`, valor `TOKEN_ACCESO` | Paso 5 |

Para cambiarlo en Supabase, pega esto en el SQL Editor (con tu token):

```sql
update public.app_ajustes
   set valor = 'tu-token-secreto-aqui'
 where clave = 'token_acceso';
```

Pulsa **Run**. Debe decir `Success. 1 row affected`.

---

## 5. Conectar la app con tu base de datos

1. En Supabase, en el menú lateral baja hasta **Project Settings** (el engranaje) → **API**.
2. Copia dos valores:

   | En Supabase se llama | Va en `config.js` como |
   |---|---|
   | **Project URL** (`https://xxxxx.supabase.co`) | `SUPABASE_URL` |
   | **anon public** (una clave larga que empieza por `eyJ…`) | `SUPABASE_ANON_KEY` |

   > Usa la clave **anon public**, nunca la `service_role`. La `service_role` da acceso
   > total y no debe salir nunca de Supabase.

3. Abre `docs/js/config.js` con un editor de texto y reemplaza los tres valores:

```js
export const CONFIG = {
  SUPABASE_URL: 'https://tuproyecto.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',     // la clave larga completa
  TOKEN_ACCESO: 'lego-vespertino-2026',   // el mismo del paso 4
  NOMBRE_CLUB: 'Club de Robótica LEGO',   // tu nombre, aparece arriba
  ZONA_HORARIA: 'America/Caracas',
  CREDITOS: '',
};
```

4. **Guarda el archivo.**

---

## 6. Verificar que todo esté bien

Abre una terminal **en la carpeta del proyecto** y escribe:

```bash
node scripts/verificar.mjs
```

Este comando revisa todo y te dice exactamente qué arreglar si algo falta. Al final debe
decir:

```
  Todo correcto — N comprobaciones pasaron.
```

Si dice algo en rojo, **lee el mensaje**: cada error trae la solución debajo.

> El verificador comprueba, entre otras cosas, que la regla de **máximo 3 integrantes** de
> verdad funcione en tu base de datos. Crea datos de prueba y los borra al terminar.

---

## 7. Probar la app en tu computadora

```bash
node scripts/servir.mjs
```

Verás:

```
  CoachPanel está corriendo en:
    http://127.0.0.1:8765/
```

Abre esa dirección en el navegador y prueba:

1. Te debe pedir el token → escríbelo.
2. Agrega un estudiante de prueba.
3. Crea un equipo con 3 integrantes e intenta agregar un cuarto: **debe impedirlo**.
4. Toma la asistencia de hoy.
5. Registra una práctica (por ejemplo tiempo `1:23.45`, puntaje `250`).
6. Mira el panel.

Para detener el servidor: `Ctrl + C` en la terminal.

> Abrir `docs/index.html` con doble clic **no funciona** (los módulos de JavaScript
> necesitan `http://`). Usa siempre el servidor local para probar.

---

## 8. Subir el proyecto a GitHub

### Opción A: con Git (recomendado)

En la terminal, dentro de la carpeta del proyecto:

```bash
git init
git add .
git commit -m "CoachPanel: asistencia y practicas de robotica LEGO"
git branch -M main
```

Ahora crea el repositorio en GitHub:

1. Entra a [github.com/new](https://github.com/new).
2. **Repository name**: `CoachPanel`.
3. **Visibility**: **Public** (GitHub Pages gratuito necesita repositorio público).
4. **No** marques "Add a README file" (ya tienes uno).
5. Pulsa **Create repository**.
6. Copia la dirección que aparece y conéctala:

```bash
git remote add origin https://github.com/TU-USUARIO/CoachPanel.git
git push -u origin main
```

Si te pide usuario y contraseña, la "contraseña" **no** es tu clave de GitHub: hay que
usar un **token de acceso personal**. Si no lo tienes, usa la Opción B.

### Opción B: subir archivos desde la web (sin Git)

1. Entra a [github.com/new](https://github.com/new), crea el repositorio como arriba.
2. En la página del repositorio, pulsa **uploading an existing file**.
3. Arrastra **todo el contenido** de la carpeta del proyecto (incluidas las carpetas
   `docs`, `supabase`, `scripts` y `tests`).
4. Escribe un mensaje de commit y pulsa **Commit changes**.

> **Lo que NO debe subirse**: nada de la carpeta `respaldos/` ni bases de datos. El archivo
> `.gitignore` ya lo evita si usas Git. Si subes desde la web, simplemente no arrastres esas
> carpetas. **Nunca subas los nombres de los niños al repositorio.**

---

## 9. Publicar la página (GitHub Pages)

1. En tu repositorio, pulsa **Settings**.
2. En el menú lateral, **Pages**.
3. En **Source**, elige **Deploy from a branch**.
4. En **Branch**, elige **main** y en la carpeta al lado elige **`/docs`**.
   ⚠️ Esto es importante: la carpeta es `docs`, no `/ (root)`.
5. Pulsa **Save**.
6. Espera 1 minuto y recarga la página. Aparecerá:

```
  Your site is live at https://tuusuario.github.io/coachpanel-subida/
```

---

## 10. Compartir el link

Puedes compartir el link de dos formas:

**Con el token incluido** (lo más cómodo para las familias — no tienen que escribir nada):

```
https://tuusuario.github.io/coachpanel-subida/#/acceso?t=tu-token-secreto-aqui
```

La app toma el token, entra sola, y **lo borra de la barra de direcciones** para que no
quede en el historial.

**Pidiendo el token aparte**: comparte `https://tuusuario.github.io/coachpanel-subida/` y diles
el token por otro medio (WhatsApp, en persona). Es un poco más seguro.

### Recomendaciones

- Manda el link por un grupo **privado** de representantes, no en un muro público.
- Si alguna vez sientes que el link se filtró de más, cambia el token (paso 4, la consulta
  SQL) y el de `config.js`, sube el cambio, y comparte el link nuevo. El viejo deja de
  funcionar de inmediato.
- Revisa el tráfico de accesos desde Supabase (tabla `log_acceso`) si quieres ver por dónde
  circuló.

---

## 11. Respaldos (muy importante)

**El plan gratuito de Supabase no hace respaldos automáticos.** Si algo se borra por error,
no hay "deshacer" del lado de Supabase. La red de seguridad es tuya:

```bash
node scripts/respaldar.mjs
```

Crea en `respaldos/`:

- `respaldo-<fecha>.json` → todo, listo para reimportar.
- `respaldo-<fecha>-<tabla>.csv` → hojas de cálculo que se abren con Excel.

**Hazlo cada semana** (por ejemplo, cada vez que termines una clase) y **guarda los
archivos fuera del repositorio**, en una carpeta de Drive o un pendrive.

También hay un botón **Descargar respaldo** en la app (menú lateral).

---

## 12. Problemas y soluciones

### "Falta configurar la conexión"
`docs/js/config.js` todavía tiene los valores de ejemplo. Vuelve al paso 5.

### "No pude conectar con la base de datos" y habla de pausa
El proyecto de Supabase se pausó por una semana sin uso. Entra a
[supabase.com/dashboard](https://supabase.com/dashboard), elige tu proyecto y pulsa
**Restore project**. Espera un minuto y recarga la app.

### "La base de datos está vacía: falta ejecutar los archivos SQL"
No se ejecutaron (o no salieron bien) los archivos del paso 3. Repítelo, en orden.

### "Ese token no es válido"
El token de `config.js` no coincide con el de la tabla `app_ajustes`. Deben ser
**exactamente iguales**: mismo texto, sin espacios de más. Compruébalo con:

```sql
select valor from public.app_ajustes where clave = 'token_acceso';
```

### "La sesión está cerrada"
Alguien cerró esa clase para darla por revisada. Abre la fecha en la pestaña *Tomar
asistencia*, pulsa **Editar datos de la clase** y quita la marca de **cerrar la sesión**.

### "Un equipo no puede tener más de 3 integrantes"
Es la regla del club, a propósito. Quita a uno antes de agregar otro.

### "Ese estudiante ya pertenece al equipo X"
Un estudiante solo puede estar en un equipo a la vez. Quítalo del equipo anterior.

### La página se ve en blanco
Casi siempre es una importación rota. En la terminal:

```bash
node scripts/revisar-importaciones.mjs
```

Y revisa la consola del navegador con `F12` → pestaña **Console**.

### Los acentos se ven raros en Excel
Los CSV se generan con BOM, así que deberían verse bien. Si no, al abrir el archivo elige
la codificación **UTF-8**.

### `node --test` falla con `spawn EPERM`
Usa el modo en proceso:

```bash
node --test --experimental-test-isolation=none "tests/*.test.mjs"
```

### La app tarda en abrir la primera vez del día
Es normal: el plan gratuito de Supabase "duerme" el proyecto tras un rato sin uso. La
primera consulta del día puede tardar unos segundos. Después va rápido.

---

## Actualizar la app más adelante

Si modificas archivos (por ejemplo, para cambiar el nombre del club):

1. Guarda los cambios.
2. `node scripts/verificar.mjs` para confirmar que todo sigue bien.
3. Sube a GitHub:
   ```bash
   git add .
   git commit -m "Describe lo que cambiaste"
   git push
   ```
4. Espera 1 minuto: GitHub Pages se actualiza solo. Recarga la página con `Ctrl + F5`
   para no ver la versión vieja en caché.

---

## Resumen de la puesta en marcha

| Paso | Acción | Tiempo |
|---|---|---|
| 1 | Crear proyecto en Supabase | 3 min |
| 2 | Ejecutar los 4 archivos SQL | 8 min |
| 3 | Elegir token y ponerlo en `app_ajustes` | 2 min |
| 4 | Copiar URL y clave anon a `config.js` | 3 min |
| 5 | `node scripts/verificar.mjs` | 2 min |
| 6 | `node scripts/servir.mjs` y probar | 5 min |
| 7 | Subir a GitHub | 8 min |
| 8 | Activar Pages y compartir el link | 3 min |
| 9 | `node scripts/respaldar.mjs` | 1 min |

¡Listo! Ya puedes tomar asistencia desde el teléfono en plena clase.
