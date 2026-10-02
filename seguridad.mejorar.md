# Cómo endurecer la seguridad más adelante

Este documento explica **qué protege hoy** CoachPanel, **qué no**, y **cómo mejorarlo**
cuando haga falta. Ninguna de las mejoras exige rehacer la aplicación: los datos y las
pantallas se quedan igual.

---

## 1. Lo que hay hoy

El acceso se resuelve con un **token compartido**, escrito en `docs/js/config.js` y
guardado en la tabla `app_ajustes`. Se eligió así a propósito: cero fricción para las
familias, nada que recordar.

### Lo que SÍ protege (y no se puede saltar)

| Protección | Cómo funciona |
|---|---|
| **Sin RLS no se devuelve nada** | Las 9 tablas tienen *Row Level Security* activado. La clave `anon` sola no basta: hacen falta las políticas. |
| **Borrar está prohibido desde la web** | El rol `anon` no tiene permiso `DELETE` en `estudiantes`, `equipos`, `sesiones`, `asistencia`, `practicas`, `retos` ni `app_ajustes`. Nadie puede eliminar el historial a través de la app ni con `curl`. La única tabla donde sí se puede borrar es `equipo_integrantes`, porque quitar a un niño de un equipo es una operación normal. |
| **La clave `service_role` nunca sale de Supabase** | La app usa solo la `anon`. |
| **Las reglas del club viven en la base de datos** | El máximo de 3 integrantes y la pertenencia a un solo equipo están en disparadores y restricciones de PostgreSQL: se cumplen aunque alguien escriba directo por la API. |
| **El token no queda en el historial** | Cuando se entra con un enlace `?t=…`, la app limpia la barra de direcciones con `history.replaceState`. |
| **Auditoría de entradas** | La tabla `log_acceso` registra fecha y dispositivo de cada acceso. |
| **Sin datos en el repositorio** | `datos/` y `respaldos/` están en `.gitignore`. Los nombres de los niños viven solo en Supabase. |

### Lo que NO protege (sé honesto con esto)

| Limitación | Consecuencia real |
|---|---|
| **El token es visible en el código fuente** | GitHub Pages es público: cualquiera puede abrir el código de la página y leer el token y la clave `anon`. |
| **No hay usuarios ni roles** | Quien tenga el link puede **editar**: marcar asistencia, crear equipos, registrar prácticas. No puede borrar. |
| **Un curioso con conocimientos podría leer toda la base** | Con la URL y la clave `anon` se puede consultar la API directamente. Las políticas de lectura son abiertas (`using (true)`), filtradas solo por el token a nivel de interfaz. |

**En resumen**: el token es "la llave del salón". Mantiene fuera a quien no tiene el link,
y el bloqueo de borrado evita daños irreversibles. No es seguridad de nivel bancario y no
hace falta que lo sea para nombres y puntajes de un club de robótica.

### Señales de que conviene mejorarlo

- El link circuló por un grupo grande o público.
- Quieres que las familias **solo miren**, sin poder cambiar nada.
- Necesitas saber **quién** registró cada asistencia.
- Aparecen datos más sensibles (evaluaciones, información médica).

---

## 2. Qué hacer si el link se filtra

Cinco minutos, sin tocar código de las pantallas:

1. En el SQL Editor de Supabase:
   ```sql
   update public.app_ajustes
      set valor = 'nuevo-token-largo-y-dificil'
    where clave = 'token_acceso';
   ```
2. Edita `TOKEN_ACCESO` en `docs/js/config.js` con el mismo valor.
3. Sube el cambio:
   ```bash
   git add docs/js/config.js
   git commit -m "Rotar token de acceso"
   git push
   ```
4. Espera un minuto (GitHub Pages se actualiza solo) y comparte el link nuevo.

El token viejo deja de funcionar de inmediato. Los datos no se tocan.

---

## 3. Mejora intermedia (30 min): que nadie pueda leer sin token

Hoy las políticas de lectura son abiertas. Se pueden cerrar usando los **claims del JWT**,
que es un valor firmado por Supabase que no se puede falsificar desde el cliente.

> Esto ya no es solo un filtro visual: sin el token correcto, la API devuelve cero filas.

### Paso 1 — Activar el Auth anónimo

En Supabase: **Authentication → Providers → Anonymous sign-ins → Enable**.

### Paso 2 — Iniciar sesión como anónimo desde la app

En `docs/js/arranque.js`, tras validar el token, añade el inicio de sesión anónimo y
guarda el token en los metadatos del usuario:

```js
// Ilustrativo: pide el JWT anónimo a la API de Auth.
const respuesta = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: CONFIG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { acceso: token } }),
});
const { access_token } = await respuesta.json();
cliente.conToken(access_token);   // el cliente ya soporta esto
```

### Paso 3 — Cambiar las políticas de lectura

```sql
-- Quitar las políticas abiertas
drop policy if exists p_estudiantes_leer on public.estudiantes;
-- (repetir para el resto de las tablas)

-- Nueva política: leer solo si el JWT trae el token correcto
create or replace function public.token_valido()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'acceso') = (select valor from public.app_ajustes where clave = 'token_acceso'),
    false
  );
$$;

create policy p_estudiantes_leer on public.estudiantes
  for select to authenticated using (public.token_valido());
```

### Paso 4 — Repetir para las políticas de escritura

Igual que arriba, pero en las políticas de `insert` y `update`: `with check (public.token_valido())`.

**Qué se gana**: quien no tenga el token no puede leer NADA por la API, ni siquiera
teniendo la URL y la clave `anon`. Es la mejora con mejor relación esfuerzo/beneficio.

---

## 4. Mejora completa (2-4 horas): usuarios con rol

Si quieres que las familias solo miren y que el coach sea el único que edita:

### Paso 1 — Activar cuentas con correo

**Authentication → Providers → Email → Enable**. Desactiva "Allow new users to sign up"
si quieres controlar tú quién entra, y crea las cuentas desde el panel.

### Paso 2 — Tabla de roles

```sql
create table public.perfiles (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  nombre     text,
  rol        text not null default 'lector' check (rol in ('coach', 'lector')),
  creado_en  timestamptz not null default now()
);

alter table public.perfiles enable row level security;

create policy p_perfiles_leer on public.perfiles
  for select to authenticated using (usuario_id = auth.uid());

create policy p_perfiles_propio on public.perfiles
  for insert to authenticated with check (usuario_id = auth.uid());

-- Función de apoyo
create or replace function public.es_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
     where usuario_id = auth.uid() and rol = 'coach'
  );
$$;

-- Solo el coach escribe
create policy p_estudiantes_insertar on public.estudiantes
  for insert to authenticated with check (public.es_coach());
-- (repetir para update en el resto de las tablas)
```

### Paso 3 — En la app

- Añadir una pantalla de inicio de sesión (correo y contraseña) en `arranque.js`, en lugar
  de la puerta de token. Puedes conservar el token como segunda barrera.
- `api.js` ya está separado por operaciones: para dejar la interfaz en modo lectura basta
  con ocultar los botones cuando el rol sea `lector`.
- Añadir `registrado_por` en asistencia y prácticas (la columna ya existe): se rellena con
  `auth.uid()`.

**Qué se gana**: cada quien entra con su cuenta, las familias no pueden modificar nada,
y queda registro de quién hizo cada cambio.

---

## 5. Otras mejoras útiles

| Mejora | Cuándo conviene | Esfuerzo |
|---|---|---|
| **Respaldos automáticos** con GitHub Actions llamando a `scripts/respaldar.mjs` cada noche | Si el volumen de datos crece | 1 h |
| **Realtime para avisar cambios** entre dispositivos | Si dos personas toman asistencia a la vez en equipos distintos | 2 h |
| **Plan Pro de Supabase** ($25/mes) | Si el proyecto pausándose te molesta o quieres respaldos diarios y PITR | 5 min |
| **Dominio propio** en lugar de `tuusuario.github.io` | Si quieres una dirección más seria para las familias | 2 h |
| **Bloqueo de fuerza bruta** en la puerta de token (límite de intentos) | Si alguien intenta adivinar el token | 1 h |

---

## 6. Lista de verificación antes de compartir el link

- [ ] El token **no** es `CAMBIA-ESTE-TOKEN` ni algo obvio.
- [ ] `node scripts/verificar.mjs` dice *Todo correcto*.
- [ ] Confirmé que **borrar está prohibido**: el verificador lo comprueba en `estudiantes` y `practicas`.
- [ ] El repositorio **no** contiene la carpeta `respaldos/` ni ningún archivo con nombres de niños.
- [ ] Corrí `node scripts/respaldar.mjs` y guardé el respaldo fuera del repositorio.
- [ ] El link lo comparto solo en un grupo privado de representantes.
- [ ] Sé que, si el link se filtra, tengo que **rotar el token** (sección 2).

---

## 7. Por qué se eligió este diseño

**La alternativa era un servidor propio** (Python o Node) con una base de datos SQLite. Se
descartó por tres razones concretas:

1. **Los datos se borran al reiniciar**: las plataformas gratuitas de aplicaciones tienen
   disco efímero. Sería perder la asistencia del mes con un reinicio del servicio.
2. **Más cosas que mantener**: un servidor que se cae, dependencias que actualizar,
   certificados, dominio. Nada de eso aporta valor a un club de robótica.
3. **Más difícil de desplegar para ti**: habrías dependido de una plataforma extra (Render,
   Railway…) además de GitHub.

Con GitHub Pages + Supabase la app **no tiene servidor que se caiga**: son archivos
estáticos servidos por GitHub, y una base de datos gestionada. A cambio, se acepta la
limitación de seguridad documentada arriba — que se puede resolver cuando haga falta con
la sección 3.

Además, la app **no tiene ni una sola dependencia de npm**: el cliente que habla con
Supabase es propio (`docs/js/postgrest.js`, unas 200 líneas). Eso significa que no hay
paquetes que actualizar, ni vulnerabilidades heredadas, ni sorpresas cuando una librería
cambia de versión.
