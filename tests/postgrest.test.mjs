/**
 * Pruebas de postgrest.js — el cliente REST propio.
 *
 * Se usa un `fetch` simulado: así se comprueba exactamente qué URL y qué
 * cabeceras se envían a Supabase, sin tocar la red.
 *
 * Se ejecutan con:  node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ClientePostgrest, ErrorApi, traducirError, comprobarConexion } from '../docs/js/postgrest.js';

const URL_BASE = 'https://proyecto.supabase.co';
const CLAVE = 'clave-anon-de-prueba';

/** Crea un fetch falso que registra las peticiones y devuelve respuestas preparadas. */
function crearFetchFalso(respuestas = []) {
  const peticiones = [];
  let indice = 0;

  const falso = async (url, opciones = {}) => {
    peticiones.push({
      url,
      metodo: opciones.method ?? 'GET',
      cabeceras: opciones.headers ?? {},
      cuerpo: opciones.body ? JSON.parse(opciones.body) : null,
    });

    const preparada = Array.isArray(respuestas) ? respuestas[indice] : respuestas;
    indice += 1;

    const config = typeof preparada === 'function' ? preparada(peticiones[peticiones.length - 1]) : preparada;

    if (config instanceof Error) throw config;

    const cuerpo = config?.cuerpo === undefined ? [] : config.cuerpo;
    const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    const cabeceras = new Map(Object.entries(config?.cabeceras ?? {}).map(([k, v]) => [String(k).toLowerCase(), String(v)]));

    return {
      ok: config?.estado ? config.estado < 400 : true,
      status: config?.estado ?? 200,
      headers: { get: (nombre) => cabeceras.get(String(nombre).toLowerCase()) ?? null },
      text: async () => texto,
    };
  };

  falso.peticiones = peticiones;
  return falso;
}

function cliente(fetchFalso, extra = {}) {
  return new ClientePostgrest({
    baseUrl: URL_BASE,
    apiKey: CLAVE,
    fetch: fetchFalso,
    reintentos: 0,
    espera: async () => {},
    ...extra,
  });
}

/* ------------------------------------------------------------------ *
 * CONSTRUCCIÓN DE LA CONSULTA
 * ------------------------------------------------------------------ */

test('exige configuración: sin URL o sin clave no arranca', () => {
  assert.throws(() => new ClientePostgrest({ baseUrl: '', apiKey: 'x' }), (e) => e.codigo === 'sin_configurar');
  assert.throws(() => new ClientePostgrest({ baseUrl: 'https://x.supabase.co' }), (e) => e.codigo === 'sin_configurar');
});

test('quita la barra final de la URL para no armar rutas con doble barra', () => {
  const c = cliente(crearFetchFalso([]), { baseUrl: `${URL_BASE}/` });
  assert.equal(c.baseUrl, URL_BASE);
});

test('construye la URL de un select simple con las cabeceras correctas', async () => {
  const falso = crearFetchFalso([{ cuerpo: [{ id: 1, nombre: 'Ana' }] }]);
  const c = cliente(falso);

  const filas = await c.desde('estudiantes').seleccionar('id,nombre').ordenar('nombre').ejecutar();

  assert.deepEqual(filas, [{ id: 1, nombre: 'Ana' }]);
  assert.equal(falso.peticiones.length, 1);

  const p = falso.peticiones[0];
  assert.match(p.url, /\/rest\/v1\/estudiantes\?/);
  assert.match(p.url, /select=id%2Cnombre/);
  assert.match(p.url, /order=nombre\.asc/);
  assert.equal(p.cabeceras.apikey, CLAVE);
  assert.equal(p.cabeceras.Authorization, `Bearer ${CLAVE}`);
});

test('traduce los filtros a la sintaxis de PostgREST', async () => {
  const falso = crearFetchFalso([{ cuerpo: [] }]);
  const c = cliente(falso);

  await c.desde('estudiantes').seleccionar('*').filtrar({
    activo: true,
    id: { gt: 10 },
    nombre: { ilike: '%ana%' },
    borrado: null,
    equipo_id: [1, 2, 3],
  }).ejecutar();

  const { url } = falso.peticiones[0];
  assert.match(url, /activo=is\.true/);
  assert.match(url, /id=gt\.10/);
  assert.match(url, /nombre=ilike\.%25ana%25/);
  assert.match(url, /borrado=is\.null/);
  assert.match(url, /equipo_id=in\.\(1%2C2%2C3\)/);
});

test('ignora los filtros con valor undefined (no ensucia la consulta)', async () => {
  const falso = crearFetchFalso([{ cuerpo: [] }]);
  await cliente(falso).desde('estudiantes').filtrar({ activo: undefined, id: 5 }).ejecutar();
  assert.doesNotMatch(falso.peticiones[0].url, /activo/);
  assert.match(falso.peticiones[0].url, /id=eq\.5/);
});

test('arma el select anidado para traer equipos con sus integrantes en una sola llamada', async () => {
  const falso = crearFetchFalso([{ cuerpo: [] }]);
  await cliente(falso)
    .desde('equipos')
    .seleccionar('id,nombre,equipo_integrantes(estudiante_id,rol,estudiantes(id,nombre))')
    .ejecutar();

  const { url } = falso.peticiones[0];
  assert.match(url, /select=/);
  assert.ok(
    decodeURIComponent(url).includes('equipo_integrantes(estudiante_id,rol,estudiantes(id,nombre))'),
    'la relación anidada debe llegar intacta',
  );
});

test('la paginación usa la cabecera Range y el límite', async () => {
  const falso = crearFetchFalso([{ cuerpo: [] }]);
  await cliente(falso).desde('practicas').seleccionar('*').rango(0, 49).limitar(50).ejecutar();

  const p = falso.peticiones[0];
  assert.equal(p.cabeceras.Range, '0-49');
  assert.match(p.url, /limit=50/);
});

test('el orden descendente y los nulos al final se traducen bien', async () => {
  const falso = crearFetchFalso([{ cuerpo: [] }]);
  await cliente(falso).desde('practicas').ordenar('fecha', { ascendente: false }).ejecutar();
  assert.match(falso.peticiones[0].url, /order=fecha\.desc\.nullslast/);
});

/* ------------------------------------------------------------------ *
 * CONTEO
 * ------------------------------------------------------------------ */

test('lee el conteo exacto de la cabecera Content-Range', async () => {
  const falso = crearFetchFalso([
    { cuerpo: [{ id: 1 }], cabeceras: { 'content-range': '0-0/137' } },
  ]);
  const c = cliente(falso);

  const { filas, conteo } = await c.desde('practicas').seleccionar('id').contar('exact').ejecutar();

  assert.deepEqual(filas, [{ id: 1 }]);
  assert.equal(conteo, 137);
  assert.equal(c.ultimoConteo, 137);
  assert.equal(falso.peticiones[0].cabeceras.Prefer, 'count=exact');
});

test('sin cabecera de conteo, el conteo es null (no revienta)', async () => {
  const falso = crearFetchFalso([{ cuerpo: [] }]);
  const { conteo } = await cliente(falso).desde('practicas').contar().ejecutar();
  assert.equal(conteo, null);
});

/* ------------------------------------------------------------------ *
 * ESCRITURAS
 * ------------------------------------------------------------------ */

test('insertar envía la fila y pide que devuelva lo insertado', async () => {
  const falso = crearFetchFalso([{ cuerpo: [{ id: 9, nombre: 'Ana' }] }]);
  const nuevo = await cliente(falso).desde('estudiantes').insertar({ nombre: 'Ana' });

  const p = falso.peticiones[0];
  assert.equal(p.metodo, 'POST');
  assert.deepEqual(p.cuerpo, [{ nombre: 'Ana' }], 'siempre se envía un arreglo');
  assert.equal(p.cabeceras.Prefer, 'return=representation');
  assert.deepEqual(nuevo, [{ id: 9, nombre: 'Ana' }]);
});

test('actualizar exige un filtro: nunca toca la tabla completa', async () => {
  const falso = crearFetchFalso([{ cuerpo: [] }]);
  const c = cliente(falso);

  await assert.rejects(
    () => c.desde('estudiantes').actualizar({ activo: false }),
    (e) => e.codigo === 'sin_filtro',
  );
  assert.equal(falso.peticiones.length, 0, 'no debe llegar ninguna petición a la red');
});

test('actualizar con filtro usa PATCH y manda el filtro en la URL', async () => {
  const falso = crearFetchFalso([{ cuerpo: [{ id: 3, activo: false }] }]);
  await cliente(falso).desde('estudiantes').filtrar({ id: 3 }).actualizar({ activo: false });

  const p = falso.peticiones[0];
  assert.equal(p.metodo, 'PATCH');
  assert.match(p.url, /id=eq\.3/);
  assert.deepEqual(p.cuerpo, { activo: false });
});

test('upsert de asistencia usa merge-duplicates para guardar el lote de una sola vez', async () => {
  const falso = crearFetchFalso([{ cuerpo: [] }]);
  const c = cliente(falso);

  await c.desde('asistencia').upsert(
    [
      { sesion_id: 1, estudiante_id: 1, estado: 'presente' },
      { sesion_id: 1, estudiante_id: 2, estado: 'ausente' },
    ],
    { sobre: 'sesion_id,estudiante_id' },
  );

  const p = falso.peticiones[0];
  assert.equal(p.metodo, 'POST');
  assert.equal(p.cuerpo.length, 2, 'las dos filas van en una sola petición');
  assert.ok(p.cabeceras.Prefer.includes('resolution=merge-duplicates'));
  assert.equal(p.cabeceras['on-conflict'], 'sesion_id,estudiante_id');
});

test('upsert con lista vacía no llama a la red', async () => {
  const falso = crearFetchFalso([{ cuerpo: [] }]);
  const resultado = await cliente(falso).desde('asistencia').upsert([]);
  assert.deepEqual(resultado, []);
  assert.equal(falso.peticiones.length, 0);
});

test('borrar avisa con claridad que la base no lo permite (el historial es sagrado)', async () => {
  const falso = crearFetchFalso([{
    estado: 403,
    cuerpo: { message: 'permission denied for table estudiantes' },
  }]);

  await assert.rejects(
    () => cliente(falso).desde('estudiantes').filtrar({ id: 1 }).borrar(),
    (e) => {
      assert.equal(e.codigo, 'sin_permiso');
      assert.ok(e.message.includes('panel de Supabase'), 'debe explicar dónde sí se puede borrar');
      return true;
    },
  );
});

/* ------------------------------------------------------------------ *
 * LEER UNO SOLO
 * ------------------------------------------------------------------ */

test('unico() ejecuta la consulta de una vez y devuelve el objeto', async () => {
  const falsoUno = crearFetchFalso([{ cuerpo: [{ id: 1, nombre: 'Ana' }] }]);
  const fila = await cliente(falsoUno).desde('estudiantes').seleccionar('*').unico();
  assert.deepEqual(fila, { id: 1, nombre: 'Ana' });
  assert.equal(falsoUno.peticiones.length, 1);

  const falsoVacio = crearFetchFalso([{ cuerpo: [] }]);
  await assert.rejects(
    () => cliente(falsoVacio).desde('estudiantes').unico(),
    (e) => e.codigo === 'no_encontrado',
  );
});

test('quizasUnico() devuelve null en vez de fallar', async () => {
  const falso = crearFetchFalso([{ cuerpo: [] }]);
  assert.equal(await cliente(falso).desde('sesiones').filtrar({ fecha: '2026-10-02' }).quizasUnico(), null);
  assert.equal(falso.peticiones.length, 1, 'sí consultó a la base, no solo devolvió null');
});

test('quizasUnico() devuelve la fila cuando existe', async () => {
  const falso = crearFetchFalso([{ cuerpo: [{ id: 4, fecha: '2026-10-02' }] }]);
  const sesion = await cliente(falso).desde('sesiones').filtrar({ fecha: '2026-10-02' }).quizasUnico();
  assert.equal(sesion.id, 4);
});

/* ------------------------------------------------------------------ *
 * TRADUCCIÓN DE ERRORES
 * ------------------------------------------------------------------ */

test('traducirError convierte los errores de la base en mensajes entendibles', () => {
  // Un bloqueo por RLS es un problema de acceso (el token no es válido):
  assert.equal(traducirError(403, { message: 'new row violates row-level security policy' }).codigo, 'sin_acceso');
  assert.equal(traducirError(401, {}).codigo, 'sin_acceso');
  assert.equal(traducirError(404, {}).codigo, 'no_encontrado');
  assert.equal(traducirError(409, {}).codigo, 'duplicado');
  assert.equal(traducirError(500, {}).codigo, 'servidor');
  assert.ok(traducirError(500, {}).message.includes('pausado'), 'debe sugerir la pausa del plan gratuito');
});

test('traducirError explica que borrar no se puede hacer desde la web', () => {
  const borrado = traducirError(403, { message: 'permission denied for table estudiantes' });
  assert.equal(borrado.codigo, 'sin_permiso');
  assert.ok(borrado.message.includes('panel de Supabase'));
});

test('traducirError reconoce las reglas propias de CoachPanel', () => {
  const integrantes = traducirError(400, {
    message: 'Un equipo no puede tener más de 3 integrantes.',
  });
  assert.equal(integrantes.codigo, 'limite_integrantes');
  assert.ok(integrantes.message.includes('3 integrantes'));

  const cerrada = traducirError(400, {
    message: 'La sesión está cerrada: reábrela antes de modificar la asistencia.',
  });
  assert.equal(cerrada.codigo, 'sesion_cerrada');

  const duplicado = traducirError(400, {
    message: 'duplicate key value violates unique constraint "equipos_nombre_busqueda"',
  });
  assert.equal(duplicado.codigo, 'nombre_duplicado');
  assert.ok(duplicado.message.includes('equipo'));
});

test('los mensajes de error nunca muestran el volcado crudo de Postgres', () => {
  const error = traducirError(400, { message: 'duplicate key value violates unique constraint "x"' });
  assert.doesNotMatch(error.message, /unique constraint|duplicate key/i);
});

/* ------------------------------------------------------------------ *
 * RED: REINTENTOS Y MODO SIN CONEXIÓN
 * ------------------------------------------------------------------ */

test('reintenta los errores del servidor y termina funcionando', async () => {
  let intentos = 0;
  const falso = async () => {
    intentos += 1;
    if (intentos === 1) throw new Error('network error');
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify([{ id: 1 }]),
    };
  };

  const c = new ClientePostgrest({
    baseUrl: URL_BASE, apiKey: CLAVE, fetch: falso, reintentos: 2, espera: async () => {},
  });

  const filas = await c.desde('estudiantes').seleccionar('*').ejecutar();
  assert.deepEqual(filas, [{ id: 1 }]);
  assert.equal(intentos, 2, 'el primero falló y el segundo sirvió');
});

test('cuando la red falla del todo, marca el error como "sin conexión"', async () => {
  const falso = async () => { throw new Error('Failed to fetch'); };
  const c = new ClientePostgrest({
    baseUrl: URL_BASE, apiKey: CLAVE, fetch: falso, reintentos: 1, espera: async () => {},
  });

  await assert.rejects(
    () => c.desde('estudiantes').seleccionar('*').ejecutar(),
    (e) => {
      assert.equal(e.codigo, 'sin_conexion');
      assert.equal(e.esFalloDeRed, true, 'la interfaz necesita esta marca para mostrar lo guardado');
      assert.ok(e.message.includes('última información guardada'));
      return true;
    },
  );
});

test('un error del servidor NO se disfraza de "sin conexión"', async () => {
  const falso = crearFetchFalso([{ estado: 500, cuerpo: { message: 'boom' } }]);
  await assert.rejects(
    () => cliente(falso).desde('estudiantes').seleccionar('*').ejecutar(),
    (e) => {
      assert.equal(e.codigo, 'servidor');
      assert.notEqual(e.esFalloDeRed, true);
      return true;
    },
  );
});

/* ------------------------------------------------------------------ *
 * RPC Y DIAGNÓSTICO
 * ------------------------------------------------------------------ */

test('rpc llama a las funciones de Postgres con los parámetros', async () => {
  const falso = crearFetchFalso([{ cuerpo: [{ fecha: '2026-10-02', porcentaje: 80 }] }]);
  const resultado = await cliente(falso).rpc('fn_resumen_ultima_sesion', { p_desde: '2026-10-01' });

  const p = falso.peticiones[0];
  assert.match(p.url, /\/rest\/v1\/rpc\/fn_resumen_ultima_sesion/);
  assert.equal(p.metodo, 'POST');
  assert.deepEqual(p.cuerpo, { p_desde: '2026-10-01' });
  assert.equal(resultado[0].porcentaje, 80);
});

test('comprobarConexion avisa cuando faltan ejecutar los archivos SQL', async () => {
  const falso = crearFetchFalso([{ estado: 404, cuerpo: { message: 'no such table' } }]);
  const resultado = await comprobarConexion(cliente(falso));

  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, 'sin_tablas');
  assert.ok(resultado.mensaje.includes('supabase/'));
});

test('comprobarConexion avisa cuando la clave anon es inválida', async () => {
  const falso = crearFetchFalso([{ estado: 401, cuerpo: { message: 'invalid api key' } }]);
  const resultado = await comprobarConexion(cliente(falso));

  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, 'clave_invalida');
  assert.ok(resultado.mensaje.includes('SUPABASE_ANON_KEY'));
});

test('comprobarConexion informa "sin conexión" sin lanzar excepción', async () => {
  const falso = async () => { throw new Error('Failed to fetch'); };
  const c = new ClientePostgrest({
    baseUrl: URL_BASE, apiKey: CLAVE, fetch: falso, reintentos: 0, espera: async () => {},
  });

  const resultado = await comprobarConexion(c);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, 'sin_conexion');
  assert.ok(resultado.mensaje.includes('pausado'), 'debe mencionar la pausa del plan gratuito');
});

test('comprobarConexion devuelve ok cuando todo está en su sitio', async () => {
  const falso = crearFetchFalso([{ cuerpo: [{ clave: 'token_acceso' }] }]);
  const resultado = await comprobarConexion(cliente(falso));
  assert.deepEqual(resultado, { ok: true });
});
