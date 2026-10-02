/**
 * Pruebas de formato.js — fechas, tiempos de pista, puntajes y textos.
 * Se ejecutan con:  node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsearDuracion,
  formatearDuracion,
  formatearDuracionCorta,
  duracionEnPalabras,
  parsearPuntaje,
  formatearPuntaje,
  formatearPorcentaje,
  esFechaValida,
  exigirFecha,
  hoyISO,
  fechaADate,
  fechaLarga,
  fechaCorta,
  claveMes,
  nombreMes,
  ultimosMeses,
  rangoSemana,
  hora12,
  normalizarNombre,
  embellecerNombre,
  acortar,
  escaparHtml,
  plural,
  ErrorFormato,
  MAX_DURACION_MS,
} from '../docs/js/formato.js';

/* ------------------------------------------------------------------ *
 * TIEMPO EN PISTA
 * ------------------------------------------------------------------ */

test('parsearDuracion entiende minutos:segundos con decimales', () => {
  assert.equal(parsearDuracion('1:23.45'), 83450);
  assert.equal(parsearDuracion('0:05'), 5000);
  assert.equal(parsearDuracion('2:00'), 120000);
  assert.equal(parsearDuracion('1:23,45'), 83450, 'acepta coma como separador decimal');
  assert.equal(parsearDuracion('1:23.450'), 83450);
  assert.equal(parsearDuracion('1:23.4'), 83400, 'un decimal = décimas de segundo');
});

test('parsearDuracion entiende segundos sueltos', () => {
  assert.equal(parsearDuracion('83.45'), 83450);
  assert.equal(parsearDuracion('83'), 83000);
  assert.equal(parsearDuracion('83s'), 83000);
  assert.equal(parsearDuracion('83,45 s'), 83450);
  assert.equal(parsearDuracion('0'), 0);
});

test('parsearDuracion: vacío significa "sin tiempo" (solo puntaje)', () => {
  assert.equal(parsearDuracion(''), null);
  assert.equal(parsearDuracion('   '), null);
  assert.equal(parsearDuracion(null), null);
  assert.equal(parsearDuracion(undefined), null);
  assert.equal(parsearDuracion('-'), null);
});

test('parsearDuracion acepta números (segundos)', () => {
  assert.equal(parsearDuracion(83.45), 83450);
  assert.equal(parsearDuracion(0), 0);
});

test('parsearDuracion rechaza basura con un mensaje entendible', () => {
  for (const basura of ['abc', '1:2:3', '1:99', 'x1:23', '1:23.4567', '12:60']) {
    assert.throws(
      () => parsearDuracion(basura),
      (error) => {
        assert.ok(error instanceof ErrorFormato, `${basura} debería lanzar ErrorFormato`);
        assert.equal(error.codigo, 'tiempo_invalido');
        assert.ok(error.message.includes('1:23.45'), 'el mensaje debe mostrar el formato esperado');
        return true;
      },
      `debería rechazar "${basura}"`,
    );
  }
});

test('parsearDuracion: un guion suelto no produce un tiempo negativo', () => {
  assert.equal(parsearDuracion('-'), null);
  assert.equal(parsearDuracion('--'), null);
  // Si alguien deja el guion pegado al número, se ignora el guion:
  // '-5' se lee como 5 segundos en vez de fallar o dar un tiempo negativo.
  assert.equal(parsearDuracion('-5'), 5000);
  assert.equal(parsearDuracion('5-'), 5000);
  assert.ok(parsearDuracion('-5') >= 0, 'nunca un tiempo negativo');
});

test('parsearDuracion acepta el límite máximo y rechaza pasarse', () => {
  assert.equal(parsearDuracion('59:59.999'), MAX_DURACION_MS);
  assert.equal(parsearDuracion('59:59.998'), MAX_DURACION_MS - 1);
  assert.throws(
    () => parsearDuracion('60:00.000'),
    (error) => {
      assert.equal(error.codigo, 'tiempo_muy_grande');
      return true;
    },
  );
});

test('formatearDuracion produce mm:ss.mmm y maneja la ausencia de dato', () => {
  assert.equal(formatearDuracion(83450), '1:23.450');
  assert.equal(formatearDuracion(0), '0:00.000');
  assert.equal(formatearDuracion(3599999), '59:59.999');
  assert.equal(formatearDuracion(null), '—');
  assert.equal(formatearDuracion(undefined), '—');
  assert.equal(formatearDuracion(''), '—');
});

test('formatearDuracionCorta sirve para las tablas', () => {
  assert.equal(formatearDuracionCorta(83450), '1:23.45');
  assert.equal(formatearDuracionCorta(null), '—');
});

test('duracionEnPalabras describe el tiempo en texto', () => {
  assert.equal(duracionEnPalabras(83450), '1 min 23 s');
  assert.equal(duracionEnPalabras(45000), '45 s');
  assert.equal(duracionEnPalabras(null), '—');
});

test('ida y vuelta: parsear y formatear son coherentes', () => {
  const casos = [0, 1, 999, 1000, 61234, 120000, 3599999];
  casos.forEach((ms) => {
    assert.equal(parsearDuracion(formatearDuracion(ms)), ms, `falló con ${ms} ms`);
  });
});

/* ------------------------------------------------------------------ *
 * PUNTAJES
 * ------------------------------------------------------------------ */

test('parsearPuntaje convierte y valida', () => {
  assert.equal(parsearPuntaje('0'), 0, '0 es un puntaje válido, no un dato faltante');
  assert.equal(parsearPuntaje('250'), 250);
  assert.equal(parsearPuntaje(' 42 '), 42);
  assert.equal(parsearPuntaje(1250), 1250);
  assert.equal(parsearPuntaje('12,7'), 13, 'redondea al entero más cercano');
});

test('parsearPuntaje entiende el separador de miles venezolano', () => {
  assert.equal(parsearPuntaje('1.250'), 1250);
  assert.equal(parsearPuntaje('1,250'), 1250);
  assert.equal(parsearPuntaje('125.000'), 125000);
  // Ida y vuelta con lo que muestra la propia app:
  assert.equal(parsearPuntaje(formatearPuntaje(1250)), 1250);
  assert.equal(parsearPuntaje(formatearPuntaje(987654)), 987654);
  // Un valor por encima del máximo del reglamento se rechaza con claridad:
  assert.throws(() => parsearPuntaje('1.250.000'), (e) => e.codigo === 'puntaje_invalido');
});

test('parsearPuntaje rechaza lo que no sirve', () => {
  assert.throws(() => parsearPuntaje(''), (e) => e.codigo === 'puntaje_vacio');
  assert.throws(() => parsearPuntaje(null), (e) => e.codigo === 'puntaje_vacio');
  assert.throws(() => parsearPuntaje('abc'), (e) => e.codigo === 'puntaje_invalido');
  assert.throws(() => parsearPuntaje('-1'), (e) => e.codigo === 'puntaje_invalido');
  assert.throws(() => parsearPuntaje('9999999'), (e) => e.codigo === 'puntaje_invalido');
});

test('formatearPuntaje usa separador de miles', () => {
  assert.equal(formatearPuntaje(1250), '1.250');
  assert.equal(formatearPuntaje(0), '0');
  assert.equal(formatearPuntaje(999), '999');
  assert.equal(formatearPuntaje(null), '—');
});

test('formatearPorcentaje distingue "sin datos" de "0 %"', () => {
  assert.equal(formatearPorcentaje(87.4), '87 %');
  assert.equal(formatearPorcentaje(0), '0 %');
  assert.equal(formatearPorcentaje(null), '—');
  assert.equal(formatearPorcentaje(undefined), '—');
});

/* ------------------------------------------------------------------ *
 * FECHAS
 * ------------------------------------------------------------------ */

test('esFechaValida acepta fechas reales y rechaza las imposibles', () => {
  assert.ok(esFechaValida('2026-10-02'));
  assert.ok(esFechaValida('2024-02-29'), '2024 es bisiesto');
  assert.ok(!esFechaValida('2025-02-29'), '2025 no es bisiesto');
  assert.ok(!esFechaValida('2026-13-01'));
  assert.ok(!esFechaValida('2026-00-10'));
  assert.ok(!esFechaValida('2026-04-31'));
  assert.ok(!esFechaValida('02/10/2026'));
  assert.ok(!esFechaValida('2026-1-2'));
  assert.ok(!esFechaValida(''));
  assert.ok(!esFechaValida(null));
});

test('exigirFecha lanza un error claro', () => {
  assert.equal(exigirFecha('2026-10-02'), '2026-10-02');
  assert.throws(
    () => exigirFecha('02/10/2026', 'fecha de la clase'),
    (error) => {
      assert.equal(error.codigo, 'fecha_invalida');
      assert.ok(error.message.includes('fecha de la clase'));
      return true;
    },
  );
});

test('fechaADate no se corre un día por la zona horaria', () => {
  const d = fechaADate('2026-10-02');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9, 'octubre es el mes 9 (base 0)');
  assert.equal(d.getDate(), 2, 'nunca debe quedar en día 1');
  assert.equal(fechaADate('no es fecha'), null);
});

test('hoyISO devuelve el día local en formato ISO', () => {
  const resultado = hoyISO(new Date(2026, 9, 2, 23, 30));
  assert.equal(resultado, '2026-10-02', 'a las 11:30 pm sigue siendo el mismo día local');
  assert.match(hoyISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('fechaLarga, fechaMedia y fechaCorta en español', () => {
  assert.equal(fechaLarga('2026-10-02'), 'viernes 2 de octubre de 2026');
  assert.equal(fechaCorta('2026-10-02'), '02/10/2026');
  assert.equal(fechaLarga('nada'), '—');
});

test('claveMes y nombreMes agrupan por mes', () => {
  assert.equal(claveMes('2026-10-02'), '2026-10');
  assert.equal(claveMes('malo'), null);
  assert.equal(nombreMes('2026-10'), 'octubre de 2026');
  assert.equal(nombreMes('2026-01'), 'enero de 2026');
  assert.equal(nombreMes('2026-12'), 'diciembre de 2026');
});

test('ultimosMeses devuelve meses consecutivos terminando en el actual', () => {
  const meses = ultimosMeses(3, new Date(2026, 0, 15));
  assert.deepEqual(meses, ['2025-11', '2025-12', '2026-01']);
  assert.equal(ultimosMeses(12, new Date(2026, 9, 2)).length, 12);
});

test('rangoSemana va de lunes a domingo', () => {
  // 2026-10-02 es viernes
  assert.deepEqual(rangoSemana('2026-10-02'), { desde: '2026-09-28', hasta: '2026-10-04' });
  // 2026-10-04 es domingo: debe pertenecer a la semana que empezó el lunes 28
  assert.deepEqual(rangoSemana('2026-10-04'), { desde: '2026-09-28', hasta: '2026-10-04' });
  // 2026-09-28 es lunes
  assert.deepEqual(rangoSemana('2026-09-28'), { desde: '2026-09-28', hasta: '2026-10-04' });
  assert.equal(rangoSemana('malo'), null);
});

test('hora12 pasa a formato de 12 horas', () => {
  assert.equal(hora12('14:30'), '2:30 pm');
  assert.equal(hora12('09:05'), '9:05 am');
  assert.equal(hora12('00:00'), '12:00 am');
  assert.equal(hora12('12:00'), '12:00 pm');
  assert.equal(hora12('17:45:00'), '5:45 pm');
  assert.equal(hora12(''), '—');
});

/* ------------------------------------------------------------------ *
 * TEXTOS
 * ------------------------------------------------------------------ */

test('normalizarNombre sirve para detectar duplicados', () => {
  assert.equal(normalizarNombre('  Ana   María  '), 'ana maría');
  assert.equal(normalizarNombre('ANA MARIA'), 'ana maria');
  assert.equal(normalizarNombre(null), '');
  // Dos formas de escribir lo mismo colapsan al mismo valor:
  assert.equal(normalizarNombre('José  Pérez'), normalizarNombre('josé pérez'));
});

test('embellecerNombre deja el nombre presentable', () => {
  assert.equal(embellecerNombre('  ana   maría  pérez '), 'Ana María Pérez');
  assert.equal(embellecerNombre('luis de la cruz'), 'Luis de la Cruz', 'respeta las partículas');
  assert.equal(embellecerNombre(''), '');
});

test('acortar y escaparHtml protegen la interfaz', () => {
  assert.equal(acortar('Hola mundo', 20), 'Hola mundo');
  assert.equal(acortar('a'.repeat(50), 10).length, 10);
  assert.equal(escaparHtml('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
  assert.equal(escaparHtml('Ana & Luis "los" robots'), 'Ana &amp; Luis &quot;los&quot; robots');
});

test('plural concuerda en singular y plural', () => {
  assert.equal(plural(1, 'estudiante'), '1 estudiante');
  assert.equal(plural(0, 'estudiante'), '0 estudiantes');
  assert.equal(plural(3, 'equipo'), '3 equipos');
});
