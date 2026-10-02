/**
 * Pruebas de estadisticas.js — mejores tiempos, mejores puntajes y rankings.
 * Se ejecutan con:  node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tieneTiempo,
  ordenarPracticas,
  resumirPracticas,
  mediana,
  mejorPorTiempo,
  mejorPorPuntaje,
  agruparPorEquipo,
  agruparPorReto,
  rankingEquipos,
  rankingPorReto,
  evolucionEquipo,
  siguienteIntento,
  compararTiempos,
  resumenParaMostrar,
} from '../docs/js/estadisticas.js';

const PRACTICAS = [
  // Equipo 1 — Los Rayos
  { id: 1, fecha: '2026-09-11', equipo_id: 1, intento: 1, reto_id: 1, duracion_ms: 120000, puntaje: 100 },
  { id: 2, fecha: '2026-09-18', equipo_id: 1, intento: 2, reto_id: 1, duracion_ms: 95000, puntaje: 150 },
  { id: 3, fecha: '2026-09-25', equipo_id: 1, intento: 3, reto_id: 1, duracion_ms: 83000, puntaje: 200 },
  // Equipo 1 — práctica sin tiempo (solo puntaje)
  { id: 4, fecha: '2026-10-02', equipo_id: 1, intento: 1, reto_id: 2, duracion_ms: null, puntaje: 75 },
  // Equipo 2 — Las Chispas
  { id: 5, fecha: '2026-09-11', equipo_id: 2, intento: 1, reto_id: 1, duracion_ms: 60000, puntaje: 50 },
  { id: 6, fecha: '2026-09-18', equipo_id: 2, intento: 2, reto_id: 1, duracion_ms: 45000, puntaje: 0 },
];

const EQUIPOS = [
  { id: 1, nombre: 'Los Rayos' },
  { id: 2, nombre: 'Las Chispas' },
];

const RETOS = [
  { id: 1, nombre: 'Pista WRO RoboMission' },
  { id: 2, nombre: 'Laberinto de paredes' },
];

/* ------------------------------------------------------------------ *
 * TIEMPOS
 * ------------------------------------------------------------------ */

test('tieneTiempo distingue una práctica sin tiempo de una con 0 ms', () => {
  assert.equal(tieneTiempo({ duracion_ms: 0 }), true, '0 ms es un tiempo válido');
  assert.equal(tieneTiempo({ duracion_ms: 1000 }), true);
  assert.equal(tieneTiempo({ duracion_ms: null }), false);
  assert.equal(tieneTiempo({ duracion_ms: undefined }), false);
  assert.equal(tieneTiempo({}), false);
  assert.equal(tieneTiempo({ duracionMs: 500 }), true, 'acepta la forma en camelCase');
});

test('el mejor tiempo es el MENOR (en la pista, menos es mejor)', () => {
  const resumen = resumirPracticas(PRACTICAS.slice(0, 3));
  assert.equal(resumen.mejorDuracionMs, 83000, 'el más rápido es 1:23.000');
  assert.equal(resumen.peorDuracionMs, 120000);
});

test('el mejor puntaje es el MAYOR', () => {
  const resumen = resumirPracticas(PRACTICAS.slice(0, 3));
  assert.equal(resumen.mejorPuntaje, 200);
  assert.equal(resumen.peorPuntaje, 100);
});

test('una práctica sin tiempo no entra en las estadísticas de tiempo pero sí en las de puntaje', () => {
  const resumen = resumirPracticas(PRACTICAS);
  // 5 de las 6 prácticas tienen tiempo
  assert.equal(resumen.cantidad, 6);
  assert.equal(resumen.conTiempo, 5);
  // El mejor tiempo sale solo de las que tienen tiempo
  assert.equal(resumen.mejorDuracionMs, 45000);
  // En cambio el mejor puntaje considera TODAS, incluida la de solo puntaje
  assert.equal(resumen.mejorPuntaje, 200);
});

test('resumirPracticas con lista vacía devuelve todo en null y sin reventar', () => {
  const resumen = resumirPracticas([]);
  assert.equal(resumen.cantidad, 0);
  assert.equal(resumen.mejorDuracionMs, null);
  assert.equal(resumen.mejorPuntaje, null);
  assert.equal(resumen.promedioDuracionMs, null);
  assert.equal(resumen.medianaPuntaje, null);
  assert.equal(resumen.ultimaFecha, null);
});

test('mediana: impar toma el centro, par promedia los dos centrales', () => {
  assert.equal(mediana([10]), 10);
  assert.equal(mediana([10, 20, 30]), 20);
  assert.equal(mediana([10, 20, 30, 40]), 25);
  assert.equal(mediana([]), null);
});

test('la mediana resiste mejor que el promedio un intento fallido', () => {
  // 3 buenos intentos y uno de 0 puntos
  const practicas = [
    { duracion_ms: 50000, puntaje: 200 },
    { duracion_ms: 51000, puntaje: 210 },
    { duracion_ms: 52000, puntaje: 205 },
    { duracion_ms: 90000, puntaje: 0 },
  ];
  const resumen = resumirPracticas(practicas);
  assert.equal(resumen.medianaPuntaje, 203);
  assert.equal(resumen.promedioPuntaje, 154, 'el promedio sí se hunde por el 0');
  assert.equal(resumen.totalIntentosFallidos, 1);
});

test('mejorPorTiempo y mejorPorPuntaje devuelven la práctica completa', () => {
  const mejor = mejorPorTiempo(PRACTICAS);
  assert.equal(mejor.id, 6);
  assert.equal(mejor.duracion_ms, 45000);

  const mejorPuntos = mejorPorPuntaje(PRACTICAS);
  assert.equal(mejorPuntos.id, 3);

  assert.equal(mejorPorTiempo([{ duracion_ms: null }]), null);
  assert.equal(mejorPorPuntaje([]), null);
});

test('compararTiempos explica la mejora en palabras', () => {
  assert.deepEqual(compararTiempos(80000, 100000), {
    texto: '20.0 s más rápido', mejora: true, empate: false, diferenciaMs: 20000,
  });
  assert.equal(compararTiempos(100000, 80000).mejora, false);
  assert.equal(compararTiempos(100000, 80000).texto, '20.0 s más lento');
  assert.equal(compararTiempos(50000, 50000).texto, 'Igual que la anterior');
  assert.equal(compararTiempos(null, 50000), null);
});

/* ------------------------------------------------------------------ *
 * ORDEN Y AGRUPACIÓN
 * ------------------------------------------------------------------ */

test('ordenarPracticas pone lo más reciente primero', () => {
  const ordenadas = ordenarPracticas(PRACTICAS);
  assert.equal(ordenadas[0].fecha, '2026-10-02');
  assert.equal(ordenadas[ordenadas.length - 1].fecha, '2026-09-11');
});

test('agruparPorEquipo y agruparPorReto separan correctamente', () => {
  const porEquipo = agruparPorEquipo(PRACTICAS);
  assert.equal(porEquipo.get(1).length, 4);
  assert.equal(porEquipo.get(2).length, 2);

  const porReto = agruparPorReto(PRACTICAS);
  assert.equal(porReto.get(1).length, 5);
  assert.equal(porReto.get(2).length, 1);
  // Las prácticas sin reto caen bajo la clave 'sin-reto'
  assert.equal(agruparPorReto([{ duracion_ms: 1000, puntaje: 1 }]).get('sin-reto').length, 1);
});

/* ------------------------------------------------------------------ *
 * RANKINGS
 * ------------------------------------------------------------------ */

test('rankingEquipos ordena por mejor puntaje', () => {
  const ranking = rankingEquipos(PRACTICAS, EQUIPOS);

  assert.equal(ranking.length, 2);
  assert.equal(ranking[0].equipo, 'Los Rayos');
  assert.equal(ranking[0].mejorPuntaje, 200);
  assert.equal(ranking[1].equipo, 'Las Chispas');
  assert.equal(ranking[1].mejorPuntaje, 50);
});

test('rankingEquipos resuelve el empate por mejor tiempo', () => {
  const practicas = [
    { fecha: '2026-10-01', equipo_id: 1, duracion_ms: 90000, puntaje: 100 },
    { fecha: '2026-10-01', equipo_id: 2, duracion_ms: 60000, puntaje: 100 },
  ];
  const ranking = rankingEquipos(practicas, EQUIPOS);
  assert.equal(ranking[0].equipo, 'Las Chispas', 'con el mismo puntaje gana el más rápido');
});

test('rankingEquipos incluye la fecha y el intento de cada mejor marca', () => {
  const ranking = rankingEquipos(PRACTICAS, EQUIPOS);
  const rayos = ranking.find((r) => r.equipoId === 1);
  assert.equal(rayos.mejorTiempoFecha, '2026-09-25');
  assert.equal(rayos.mejorTiempoIntento, 3);
  assert.equal(rayos.mejorPuntajeFecha, '2026-09-25');
});

test('rankingEquipos nombra al equipo aunque no esté en el catálogo', () => {
  const [fila] = rankingEquipos([{ fecha: '2026-10-01', equipo_id: 77, duracion_ms: 1000, puntaje: 10 }], []);
  assert.equal(fila.equipo, 'Equipo 77');
});

test('rankingPorReto contesta "cómo va cada equipo en cada pista"', () => {
  const ranking = rankingPorReto(PRACTICAS, RETOS, EQUIPOS);
  const pista1 = ranking.filter((r) => r.retoId === 1);

  assert.equal(pista1.length, 2, 'un renglón por equipo en esa pista');
  assert.equal(pista1[0].equipo, 'Las Chispas', 'en la pista 1 el más rápido va primero');
  assert.equal(pista1[0].mejorDuracionMs, 45000);
  assert.equal(pista1[1].equipo, 'Los Rayos');
  assert.equal(pista1[1].mejorDuracionMs, 83000);
});

test('rankingPorReto etiqueta las prácticas sin reto', () => {
  const ranking = rankingPorReto(
    [{ fecha: '2026-10-01', equipo_id: 1, reto_id: null, duracion_ms: 1000, puntaje: 5 }],
    RETOS,
    EQUIPOS,
  );
  assert.equal(ranking[0].reto, 'Sin reto');
});

/* ------------------------------------------------------------------ *
 * EVOLUCIÓN Y SIGUIENTE INTENTO
 * ------------------------------------------------------------------ */

test('evolucionEquipo marca los récords en orden cronológico', () => {
  const evolucion = evolucionEquipo(PRACTICAS.filter((p) => p.equipo_id === 1));

  assert.equal(evolucion.length, 4);
  assert.equal(evolucion[0].fecha, '2026-09-11', 'empieza por la más antigua');

  assert.equal(evolucion[0].recordTiempo, true, 'el primero siempre es récord');
  assert.equal(evolucion[0].recordPuntaje, true);

  assert.equal(evolucion[1].recordTiempo, true, '95 s mejora los 120 s');
  assert.equal(evolucion[1].recordPuntaje, true, '150 supera 100');

  assert.equal(evolucion[2].recordTiempo, true, '83 s vuelve a mejorar');
  assert.equal(evolucion[2].recordPuntaje, true, '200 vuelve a subir');

  // La práctica 4 no tiene tiempo y su puntaje (75) es menor que el récord (200)
  assert.equal(evolucion[3].duracionMs, null);
  assert.equal(evolucion[3].recordTiempo, false, 'sin tiempo no puede ser récord de tiempo');
  assert.equal(evolucion[3].recordPuntaje, false, '75 no supera 200');
});

test('evolucionEquipo no marca récord cuando empeora', () => {
  const evolucion = evolucionEquipo([
    { fecha: '2026-10-01', equipo_id: 1, intento: 1, duracion_ms: 50000, puntaje: 100 },
    { fecha: '2026-10-02', equipo_id: 1, intento: 1, duracion_ms: 70000, puntaje: 40 },
  ]);
  assert.equal(evolucion[1].recordTiempo, false);
  assert.equal(evolucion[1].recordPuntaje, false);
});

test('siguienteIntento numera los intentos del mismo día', () => {
  const practicas = [
    { fecha: '2026-10-02', equipo_id: 1, intento: 1 },
    { fecha: '2026-10-02', equipo_id: 1, intento: 2 },
    { fecha: '2026-10-01', equipo_id: 1, intento: 5 },
    { fecha: '2026-10-02', equipo_id: 2, intento: 3 },
  ];
  assert.equal(siguienteIntento(practicas, 1, '2026-10-02'), 3, 'el equipo 1 ya hizo 2 intentos hoy');
  assert.equal(siguienteIntento(practicas, 1, '2026-10-03'), 1, 'empieza de nuevo el otro día');
  assert.equal(siguienteIntento(practicas, 2, '2026-10-02'), 4, 'el equipo 2 va por el 4.º');
  assert.equal(siguienteIntento([], 1, '2026-10-02'), 1);
});

/* ------------------------------------------------------------------ *
 * FORMATO PARA MOSTRAR
 * ------------------------------------------------------------------ */

test('resumenParaMostrar deja los números listos para la pantalla', () => {
  const mostrar = resumenParaMostrar(resumirPracticas(PRACTICAS));
  assert.equal(mostrar.mejorTiempo, '0:45.00');
  assert.equal(mostrar.mejorPuntaje, '200');
  assert.equal(mostrar.cantidad, '6');
  assert.equal(mostrar.porcentajeFallidos, '17 %', '1 de 6 prácticas fue de 0 puntos');
});

test('resumenParaMostrar usa "—" cuando no hay datos', () => {
  const mostrar = resumenParaMostrar(resumirPracticas([]));
  assert.equal(mostrar.mejorTiempo, '—');
  assert.equal(mostrar.mejorPuntaje, '—');
  assert.equal(mostrar.porcentajeFallidos, '—');
});
