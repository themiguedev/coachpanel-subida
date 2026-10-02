/**
 * Pruebas de cache.js — el modo "sin conexión" y la memoria local.
 * Se ejecutan con:  node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Cache,
  crearAlmacenMemoria,
  almacenPorDefecto,
  conRespaldo,
  COLECCIONES,
  MAX_ANTIGUEDAD_MS,
} from '../docs/js/cache.js';
import { ErrorApi } from '../docs/js/postgrest.js';

function cacheConReloj(fecha) {
  const almacen = crearAlmacenMemoria();
  let ahora = fecha instanceof Date ? fecha : new Date(fecha);
  const cache = new Cache({ almacen, reloj: () => ahora });
  cache.avanzarTiempo = (ms) => { ahora = new Date(ahora.getTime() + ms); };
  return cache;
}

/* ------------------------------------------------------------------ *
 * GUARDAR Y LEER
 * ------------------------------------------------------------------ */

test('guarda y recupera datos', () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');

  assert.equal(cache.guardar('estudiantes', [{ id: 1, nombre: 'Ana' }]), true);
  assert.deepEqual(cache.datos('estudiantes'), [{ id: 1, nombre: 'Ana' }]);
  assert.equal(cache.existe('estudiantes'), true);
  assert.equal(cache.existe('equipos'), false);
});

test('devuelve el valor por defecto si no hay nada guardado', () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  assert.equal(cache.datos('practicas'), null);
  assert.deepEqual(cache.datos('practicas', []), []);
  assert.deepEqual(cache.datos('practicas', [{ porDefecto: true }]), [{ porDefecto: true }]);
});

test('los datos guardados sobreviven a una instancia nueva (persistencia real)', () => {
  const almacen = crearAlmacenMemoria();
  const primera = new Cache({ almacen, reloj: () => new Date('2026-10-02T14:00:00Z') });
  primera.guardar('equipos', [{ id: 7, nombre: 'Los Rayos' }]);

  const segunda = new Cache({ almacen, reloj: () => new Date('2026-10-02T15:00:00Z') });
  assert.deepEqual(segunda.datos('equipos'), [{ id: 7, nombre: 'Los Rayos' }]);
});

test('una entrada corrupta se ignora en vez de romper la app', () => {
  const almacen = crearAlmacenMemoria();
  const cache = new Cache({ almacen, reloj: () => new Date('2026-10-02T14:00:00Z') });

  almacen.setItem('coachpanel.cache.estudiantes', 'esto no es JSON {{{');
  assert.equal(cache.leer('estudiantes'), null);
  const respaldo = cache.datos('estudiantes', []);
  assert.ok(Array.isArray(respaldo) && respaldo.length === 0, 'debe caer al valor por defecto');

  // Y también si el JSON es válido pero no tiene la forma esperada:
  almacen.setItem('coachpanel.cache.equipos', JSON.stringify({ cualquier: 'cosa' }));
  assert.equal(cache.leer('equipos'), null);

  // O si viene de una versión distinta del formato:
  almacen.setItem('coachpanel.cache.retos', JSON.stringify({ version: 99, datos: [] }));
  assert.equal(cache.leer('retos'), null);
});

test('olvidar y limpiar borran lo guardado', () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  cache.guardar('estudiantes', [1]);
  cache.guardar('equipos', [2]);

  assert.equal(cache.olvidar('estudiantes'), true);
  assert.equal(cache.existe('estudiantes'), false);
  assert.equal(cache.existe('equipos'), true);

  assert.equal(cache.limpiar(), 1);
  assert.equal(cache.existe('equipos'), false);
});

test('no confunde las colecciones entre sí', () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  cache.guardar('estudiantes', ['estudiantes']);
  cache.guardar('equipos', ['equipos']);
  cache.guardar('practicas', ['practicas']);

  assert.deepEqual(cache.datos('estudiantes'), ['estudiantes']);
  assert.deepEqual(cache.datos('equipos'), ['equipos']);
  assert.deepEqual(cache.datos('practicas'), ['practicas']);
  assert.deepEqual(cache.colecciones().sort(), ['equipos', 'estudiantes', 'practicas']);
});

/* ------------------------------------------------------------------ *
 * ANTIGÜEDAD
 * ------------------------------------------------------------------ */

test('la antigüedad se describe en palabras', () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  cache.guardar('estudiantes', []);

  assert.equal(cache.antiguedadTexto('estudiantes'), 'hace unos segundos');

  cache.avanzarTiempo(5 * 60 * 1000);
  assert.equal(cache.antiguedadTexto('estudiantes'), 'hace 5 minutos');

  cache.avanzarTiempo(2 * 60 * 60 * 1000);
  assert.equal(cache.antiguedadTexto('estudiantes'), 'hace 2 horas');

  cache.avanzarTiempo(3 * 24 * 60 * 60 * 1000);
  assert.equal(cache.antiguedadTexto('estudiantes'), 'hace 3 días');

  assert.equal(cache.antiguedadTexto('inexistente'), null);
});

test('un minuto se reporta en singular', () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  cache.guardar('equipos', []);
  cache.avanzarTiempo(60 * 1000);
  assert.equal(cache.antiguedadTexto('equipos'), 'hace 1 minuto');
});

test('esAntiguo detecta datos pasados de moda', () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  cache.guardar('estudiantes', []);

  assert.equal(cache.esAntiguo('estudiantes'), false);
  assert.equal(cache.esAntiguo('no-existe'), true, 'sin datos se considera antiguo');

  cache.avanzarTiempo(MAX_ANTIGUEDAD_MS + 1000);
  assert.equal(cache.esAntiguo('estudiantes'), true);
});

test('limpiarAntiguos borra solo lo vencido', () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  cache.guardar('viejo', [1]);
  cache.avanzarTiempo(10 * 24 * 60 * 60 * 1000); // 10 días
  cache.guardar('nuevo', [2]);

  const borradas = cache.limpiarAntiguos({ maxAntiguedadMs: 7 * 24 * 60 * 60 * 1000 });

  assert.equal(borradas, 1);
  assert.equal(cache.existe('viejo'), false);
  assert.equal(cache.existe('nuevo'), true);
});

test('el tamaño guardado se reporta en texto legible', () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  assert.equal(cache.tamanoTexto(), '0 B');

  cache.guardar('estudiantes', [{ id: 1, nombre: 'Ana' }]);
  assert.match(cache.tamanoTexto(), /B$|KB$/);
});

/* ------------------------------------------------------------------ *
 * CON RESPALDO (LA PIEZA CLAVE DEL MODO SIN CONEXIÓN)
 * ------------------------------------------------------------------ */

test('si la consulta funciona, guarda y devuelve datos frescos', async () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');

  const resultado = await conRespaldo(cache, 'estudiantes', async () => [{ id: 1, nombre: 'Ana' }]);

  assert.deepEqual(resultado.datos, [{ id: 1, nombre: 'Ana' }]);
  assert.equal(resultado.deCache, false);
  assert.ok(resultado.guardadoEn);
  assert.deepEqual(cache.datos('estudiantes'), [{ id: 1, nombre: 'Ana' }]);
});

test('si se cae la red, muestra lo último guardado y lo avisa', async () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');

  // Primero una lectura exitosa que deja datos guardados.
  await conRespaldo(cache, 'estudiantes', async () => [{ id: 1, nombre: 'Ana' }]);
  cache.avanzarTiempo(10 * 60 * 1000);

  // Luego se cae la conexión.
  const fallo = new ErrorApi('sin_conexion', 'No hay conexión');
  fallo.esFalloDeRed = true;

  const resultado = await conRespaldo(cache, 'estudiantes', async () => { throw fallo; });

  assert.deepEqual(resultado.datos, [{ id: 1, nombre: 'Ana' }], 'debe mostrar lo guardado');
  assert.equal(resultado.deCache, true, 'la interfaz debe poder mostrar el aviso');
  assert.equal(resultado.antiguedad, 'hace 10 minutos');
  assert.equal(resultado.error, fallo);
});

test('sin conexión y sin nada guardado, devuelve la lista vacía sin reventar', async () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  const fallo = new ErrorApi('sin_conexion', 'No hay conexión');
  fallo.esFalloDeRed = true;

  const resultado = await conRespaldo(cache, 'practicas', async () => { throw fallo; }, {
    porDefecto: [],
  });

  assert.deepEqual(resultado.datos, []);
  assert.equal(resultado.deCache, true);
  assert.equal(resultado.guardadoEn, null);
  assert.equal(resultado.antiguedad, null);
});

test('un error que NO es de red se propaga: no se disfraza de "sin conexión"', async () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  await conRespaldo(cache, 'estudiantes', async () => [{ id: 1 }]);

  const errorReal = new ErrorApi('sin_permiso', 'La base rechazó el cambio');

  await assert.rejects(
    () => conRespaldo(cache, 'estudiantes', async () => { throw errorReal; }),
    (e) => {
      assert.equal(e.codigo, 'sin_permiso');
      return true;
    },
  );
});

test('con permitirCache en falso, un fallo de red sí se propaga', async () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  await conRespaldo(cache, 'estudiantes', async () => [{ id: 1 }]);

  const fallo = new ErrorApi('sin_conexion', 'No hay conexión');
  fallo.esFalloDeRed = true;

  await assert.rejects(
    () => conRespaldo(cache, 'estudiantes', async () => { throw fallo; }, { permitirCache: false }),
    (e) => e.codigo === 'sin_conexion',
  );
});

test('cada lectura exitosa refresca lo guardado', async () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');

  await conRespaldo(cache, 'estudiantes', async () => [{ id: 1 }]);
  cache.avanzarTiempo(60 * 1000);
  await conRespaldo(cache, 'estudiantes', async () => [{ id: 2 }]);

  assert.deepEqual(cache.datos('estudiantes'), [{ id: 2 }], 'guarda lo más reciente');
  assert.equal(cache.antiguedadTexto('estudiantes'), 'hace unos segundos');
});

/* ------------------------------------------------------------------ *
 * ALMACENAMIENTO
 * ------------------------------------------------------------------ */

test('el almacén de memoria se comporta como localStorage', () => {
  const almacen = crearAlmacenMemoria();
  assert.equal(almacen.getItem('x'), null);
  almacen.setItem('x', 5);
  assert.equal(almacen.getItem('x'), '5', 'todo se guarda como texto');
  almacen.removeItem('x');
  assert.equal(almacen.getItem('x'), null);
});

test('si localStorage no está disponible se usa memoria (modo privado del navegador)', () => {
  const almacen = almacenPorDefecto();
  assert.ok(almacen, 'siempre hay un almacén utilizable');
  assert.equal(typeof almacen.getItem, 'function');
  assert.equal(typeof almacen.setItem, 'function');
});

test('la clave de prueba de la caché no se confunde con una colección', () => {
  const cache = cacheConReloj('2026-10-02T14:00:00Z');
  cache.guardar('estudiantes', []);
  assert.deepEqual(cache.colecciones(), ['estudiantes']);
});

test('las colecciones conocidas tienen nombre', () => {
  assert.equal(COLECCIONES.ESTUDIANTES, 'estudiantes');
  assert.equal(COLECCIONES.ASISTENCIA_ULTIMA, 'asistencia-ultima');
  assert.ok(Object.keys(COLECCIONES).length >= 7);
});
