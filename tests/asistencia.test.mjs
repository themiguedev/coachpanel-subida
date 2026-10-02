/**
 * Pruebas de asistencia.js — la lista de la sesión, el marcado y los cálculos.
 * Se ejecutan con:  node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ESTADOS_ASISTENCIA,
  ETIQUETAS_ASISTENCIA,
  construirListaSesion,
  marcarEstado,
  marcarTodos,
  limpiarMarcas,
  alternarEstado,
  prepararRegistros,
  validarGuardado,
  contarEstados,
  calcularPorcentaje,
  desdeVistaAsistencia,
  agruparPorMes,
  calcularRacha,
  resumenSesion,
  serieSemanal,
} from '../docs/js/asistencia.js';

const ESTUDIANTES = [
  { id: 1, nombre: 'Ana Pérez', activo: true },
  { id: 2, nombre: 'Luis Gómez', activo: true },
  { id: 3, nombre: 'María Rojas', activo: true },
  { id: 4, nombre: 'Pedro Díaz', activo: true },
  { id: 5, nombre: 'Sofía León', activo: false },
];

/* ------------------------------------------------------------------ *
 * LISTA DE LA SESIÓN
 * ------------------------------------------------------------------ */

test('la lista de la sesión trae a los estudiantes activos', () => {
  const lista = construirListaSesion({ estudiantes: ESTUDIANTES });
  assert.deepEqual(
    lista.map((f) => f.nombre),
    ['Ana Pérez', 'Luis Gómez', 'María Rojas', 'Pedro Díaz'],
    'los dados de baja no aparecen en una sesión nueva',
  );
  lista.forEach((fila) => {
    assert.equal(fila.estado, null, 'nadie viene marcado por defecto');
    assert.equal(fila.guardado, false);
  });
});

test('un estudiante dado de baja DESPUÉS sigue apareciendo en las sesiones que ya tenía', () => {
  // Sofía (id 5) está de baja hoy, pero tiene registro en la sesión 1.
  const lista = construirListaSesion({
    estudiantes: ESTUDIANTES,
    registros: [{ estudiante_id: 5, estado: 'presente', sesion_id: 1 }],
  });

  const sofia = lista.find((f) => f.estudianteId === 5);
  assert.ok(sofia, 'debe conservar su lugar en el historial');
  assert.equal(sofia.estado, 'presente');
  assert.equal(sofia.activo, false);
  assert.equal(sofia.guardado, true);
});

test('los registros ya guardados se reflejan en la lista', () => {
  const lista = construirListaSesion({
    estudiantes: ESTUDIANTES,
    registros: [
      { estudiante_id: 1, estado: 'presente', observacion: 'llegó temprano' },
      { estudiante_id: 2, estado: 'ausente' },
    ],
  });

  const ana = lista.find((f) => f.estudianteId === 1);
  const luis = lista.find((f) => f.estudianteId === 2);

  assert.equal(ana.estado, 'presente');
  assert.equal(ana.observacion, 'llegó temprano');
  assert.equal(ana.guardado, true);
  assert.equal(luis.estado, 'ausente');
  assert.equal(lista.find((f) => f.estudianteId === 3).estado, null);
});

test('un estudiante borrado del catálogo pero con registro no rompe la lista', () => {
  const lista = construirListaSesion({
    estudiantes: ESTUDIANTES,
    registros: [{ estudiante_id: 99, estado: 'tarde' }],
  });
  const desconocido = lista.find((f) => f.estudianteId === 99);
  assert.ok(desconocido, 'debe aparecer para no perder el registro');
  assert.equal(desconocido.estado, 'tarde');
  assert.ok(desconocido.nombre.includes('99'));
});

test('la lista sale ordenada alfabéticamente en español', () => {
  const lista = construirListaSesion({
    estudiantes: [
      { id: 1, nombre: 'Zulema', activo: true },
      { id: 2, nombre: 'Ángel', activo: true },
      { id: 3, nombre: 'Beatriz', activo: true },
    ],
  });
  assert.deepEqual(lista.map((f) => f.nombre), ['Ángel', 'Beatriz', 'Zulema']);
});

/* ------------------------------------------------------------------ *
 * MARCADO
 * ------------------------------------------------------------------ */

test('marcarEstado cambia un estudiante sin tocar los demás', () => {
  const lista = construirListaSesion({ estudiantes: ESTUDIANTES });
  const nueva = marcarEstado(lista, 2, 'tarde');

  assert.equal(nueva.find((f) => f.estudianteId === 2).estado, 'tarde');
  assert.equal(nueva.find((f) => f.estudianteId === 1).estado, null);
  assert.equal(lista.find((f) => f.estudianteId === 2).estado, null, 'no muta la lista original');
});

test('marcarEstado rechaza un estado inventado', () => {
  const lista = construirListaSesion({ estudiantes: ESTUDIANTES });
  assert.throws(() => marcarEstado(lista, 1, 'faltó'), (e) => e.codigo === 'estado_invalido');
});

test('marcarTodos y limpiarMarcas funcionan como los botones de la interfaz', () => {
  let lista = construirListaSesion({ estudiantes: ESTUDIANTES });
  lista = marcarTodos(lista, 'presente');
  assert.ok(lista.every((f) => f.estado === 'presente'));

  lista = limpiarMarcas(lista);
  assert.ok(lista.every((f) => f.estado === null));

  assert.throws(() => marcarTodos(lista, 'desaparecido'));
});

test('alternarEstado desmarca si se toca el mismo botón dos veces', () => {
  let lista = construirListaSesion({ estudiantes: ESTUDIANTES });
  lista = alternarEstado(lista, 1, 'presente');
  assert.equal(lista.find((f) => f.estudianteId === 1).estado, 'presente');

  lista = alternarEstado(lista, 1, 'presente');
  assert.equal(lista.find((f) => f.estudianteId === 1).estado, null, 'el segundo toque desmarca');

  lista = alternarEstado(lista, 1, 'tarde');
  assert.equal(lista.find((f) => f.estudianteId === 1).estado, 'tarde', 'cambiar de estado funciona');
});

/* ------------------------------------------------------------------ *
 * GUARDADO
 * ------------------------------------------------------------------ */

test('prepararRegistros solo envía lo que tiene estado', () => {
  let lista = construirListaSesion({ estudiantes: ESTUDIANTES });
  lista = marcarEstado(lista, 1, 'presente');
  lista = marcarEstado(lista, 3, 'ausente');

  const registros = prepararRegistros(lista, { sesionId: 7, registradoPor: 'Coach' });

  assert.equal(registros.length, 2, 'los que quedaron sin marcar no se envían');
  assert.deepEqual(registros[0], {
    sesion_id: 7,
    estudiante_id: 1,
    estado: 'presente',
    observacion: null,
    registrado_por: 'Coach',
  });
});

test('prepararRegistros exige la sesión', () => {
  const lista = marcarTodos(construirListaSesion({ estudiantes: ESTUDIANTES }), 'presente');
  assert.throws(() => prepararRegistros(lista, {}), (e) => e.codigo === 'sesion_invalida');
});

test('la observación en blanco se guarda como nula, no como cadena vacía', () => {
  let lista = construirListaSesion({ estudiantes: ESTUDIANTES });
  lista = marcarEstado(lista, 1, 'justificado');
  lista = lista.map((f) => (f.estudianteId === 1 ? { ...f, observacion: '   ' } : f));

  const [registro] = prepararRegistros(lista, { sesionId: 1 });
  assert.equal(registro.observacion, null);
});

test('validarGuardado detecta una sesión cerrada', () => {
  const lista = marcarTodos(construirListaSesion({ estudiantes: ESTUDIANTES }), 'presente');
  const errores = validarGuardado(lista, { sesion: { estado: 'cerrada' } });
  assert.ok(errores.some((e) => e.includes('cerrada')));
});

test('validarGuardado avisa si no se marcó a nadie', () => {
  const lista = construirListaSesion({ estudiantes: ESTUDIANTES });
  const errores = validarGuardado(lista, {});
  assert.ok(errores.some((e) => e.includes('No marcaste a nadie')));
});

/* ------------------------------------------------------------------ *
 * CÁLCULOS
 * ------------------------------------------------------------------ */

test('contarEstados cuenta cada estado y los sin marcar por separado', () => {
  const conteo = contarEstados([
    { estado: 'presente' }, { estado: 'presente' }, { estado: 'tarde' },
    { estado: 'ausente' }, { estado: 'justificado' }, { estado: null },
  ]);
  assert.equal(conteo.presente, 2);
  assert.equal(conteo.tarde, 1);
  assert.equal(conteo.ausente, 1);
  assert.equal(conteo.justificado, 1);
  assert.equal(conteo.total, 5);
  assert.equal(conteo.sin_marcar, 1);
});

test('contarEstados funciona con la lista real de la sesión (estado null = sin marcar)', () => {
  const lista = construirListaSesion({ estudiantes: ESTUDIANTES });
  const conteo = contarEstados(lista);
  assert.equal(conteo.total, 0, 'nadie está marcado en una sesión nueva');
  assert.equal(conteo.sin_marcar, 4, 'los 4 activos están sin marcar');
});

test('el porcentaje de asistencia cuenta presente, tarde y justificado', () => {
  // 3 de 4 asistieron (presente + tarde + justificado), 1 ausente = 75 %
  const registros = [
    { estado: 'presente' }, { estado: 'tarde' },
    { estado: 'justificado' }, { estado: 'ausente' },
  ];
  assert.equal(calcularPorcentaje(registros), 75);
});

test('SIN DATOS el porcentaje es null, no 0 (son cosas distintas)', () => {
  assert.equal(calcularPorcentaje([]), null, 'no debe dividir por cero');
  assert.equal(calcularPorcentaje([{ estado: null }]), null);
  assert.equal(calcularPorcentaje([{ estado: 'cualquiera' }]), null);
  // Y 0 % de verdad sí es 0:
  assert.equal(calcularPorcentaje([{ estado: 'ausente' }]), 0);
});

test('el porcentaje se puede calcular sin contar tardes ni justificados', () => {
  const registros = [
    { estado: 'presente' }, { estado: 'tarde' }, { estado: 'ausente' }, { estado: 'ausente' },
  ];
  assert.equal(calcularPorcentaje(registros), 50);
  assert.equal(calcularPorcentaje(registros, { contarTardes: false }), 25);
});

test('desdeVistaAsistencia convierte las filas de la vista de Supabase', () => {
  const filas = [{
    estudiante_id: 1,
    nombre: 'Ana Pérez',
    activo: true,
    registros: 4,
    presentes: 2,
    tardes: 1,
    justificados: 0,
    ausencias: 1,
    porcentaje: 75,
  }];

  const [fila] = desdeVistaAsistencia(filas);
  assert.equal(fila.estudianteId, 1);
  assert.equal(fila.porcentaje, 75);
  assert.equal(fila.porcentajeTexto, '75 %');
});

test('desdeVistaAsistencia muestra "—" cuando no hay registros', () => {
  const [fila] = desdeVistaAsistencia([{
    estudiante_id: 2, nombre: 'Nuevo', registros: 0,
    presentes: 0, tardes: 0, justificados: 0, ausencias: 0,
  }]);
  assert.equal(fila.porcentaje, null);
  assert.equal(fila.porcentajeTexto, '—');
});

test('agruparPorMes agrupa por el mes de la sesión', () => {
  const registros = [
    { estado: 'presente', sesiones: { fecha: '2026-10-02' } },
    { estado: 'ausente', sesiones: { fecha: '2026-10-09' } },
    { estado: 'presente', sesiones: { fecha: '2026-09-25' } },
  ];
  const porMes = agruparPorMes(registros);

  assert.deepEqual([...porMes.keys()], ['2026-10', '2026-09'], 'más reciente primero');
  assert.equal(porMes.get('2026-10').presentes, 1);
  assert.equal(porMes.get('2026-10').ausencias, 1);
  assert.equal(porMes.get('2026-10').porcentaje, 50);
  assert.equal(porMes.get('2026-09').porcentaje, 100);
});

test('calcularRacha cuenta las asistencias seguidas más recientes', () => {
  const registros = [
    { estado: 'presente', sesiones: { fecha: '2026-10-02' } },
    { estado: 'tarde', sesiones: { fecha: '2026-09-25' } },
    { estado: 'justificado', sesiones: { fecha: '2026-09-18' } },
    { estado: 'ausente', sesiones: { fecha: '2026-09-11' } },   // aquí se corta
    { estado: 'presente', sesiones: { fecha: '2026-09-04' } },
  ];
  assert.equal(calcularRacha(registros), 3);
});

test('la racha es 0 si la última clase faltó', () => {
  const registros = [
    { estado: 'ausente', sesiones: { fecha: '2026-10-02' } },
    { estado: 'presente', sesiones: { fecha: '2026-09-25' } },
  ];
  assert.equal(calcularRacha(registros), 0);
  assert.equal(calcularRacha([]), 0);
});

test('resumenSesion entrega los totales de una clase', () => {
  const resumen = resumenSesion([
    { estado: 'presente' }, { estado: 'presente' },
    { estado: 'ausente' }, { estado: 'tarde' },
  ]);
  assert.equal(resumen.total, 4);
  assert.equal(resumen.presente, 2);
  assert.equal(resumen.tarde, 1);
  assert.equal(resumen.ausente, 1);
  assert.equal(resumen.porcentaje, 75);
});

test('serieSemanal devuelve una barra por semana y null cuando no hubo clase', () => {
  const base = new Date(2026, 9, 2); // viernes 2 de octubre de 2026
  const registros = [
    { estado: 'presente', sesiones: { fecha: '2026-10-02' } },
    { estado: 'ausente', sesiones: { fecha: '2026-10-02' } },
    { estado: 'presente', sesiones: { fecha: '2026-09-25' } },
  ];

  const serie = serieSemanal(registros, 3, base);

  assert.equal(serie.length, 3);
  assert.equal(serie[2].cantidad, 2, 'la semana actual tiene los dos registros');
  assert.equal(serie[2].porcentaje, 50);
  assert.equal(serie[1].cantidad, 1);
  assert.equal(serie[1].porcentaje, 100);
  assert.equal(serie[0].cantidad, 0);
  assert.equal(serie[0].porcentaje, null, 'semana sin clase: sin dato, no 0 %');
});

test('los cuatro estados y sus etiquetas existen', () => {
  assert.deepEqual(ESTADOS_ASISTENCIA, ['presente', 'ausente', 'tarde', 'justificado']);
  ESTADOS_ASISTENCIA.forEach((estado) => {
    assert.ok(ETIQUETAS_ASISTENCIA[estado], `falta la etiqueta de ${estado}`);
  });
});
