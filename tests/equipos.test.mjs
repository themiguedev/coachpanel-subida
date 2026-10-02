/**
 * Pruebas de equipos.js — la regla de máximo 3 integrantes y sus alrededores.
 * Se ejecutan con:  node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_INTEGRANTES,
  ESTADOS_WRO,
  ETIQUETAS_WRO,
  normalizarIntegrantes,
  normalizarEquipo,
  validarEquipo,
  estudiantesDisponibles,
  puedeAgregarIntegrante,
  idsIntegrantes,
  contarIntegrantes,
  mapaPertenencia,
  integrantesConNombre,
  integrantesEnTexto,
} from '../docs/js/equipos.js';

const ESTUDIANTES = [
  { id: 1, nombre: 'Ana Pérez', activo: true },
  { id: 2, nombre: 'Luis Gómez', activo: true },
  { id: 3, nombre: 'María Rojas', activo: true },
  { id: 4, nombre: 'Pedro Díaz', activo: true },
  { id: 5, nombre: 'Sofía León', activo: false },
];

/* ------------------------------------------------------------------ *
 * LA REGLA PRINCIPAL: MÁXIMO 3 INTEGRANTES
 * ------------------------------------------------------------------ */

test('un equipo con 3 integrantes es válido', () => {
  const resultado = validarEquipo(
    { nombre: 'Los Rayos' },
    [{ estudianteId: 1 }, { estudianteId: 2 }, { estudianteId: 3 }],
    { estudiantes: ESTUDIANTES },
  );
  assert.equal(resultado.valido, true, resultado.errores.join(' | '));
  assert.equal(resultado.integrantes.length, 3);
});

test('un equipo con 4 integrantes se rechaza con un mensaje claro', () => {
  const resultado = validarEquipo(
    { nombre: 'Los Rayos' },
    [1, 2, 3, 4].map((estudianteId) => ({ estudianteId })),
    { estudiantes: ESTUDIANTES },
  );

  assert.equal(resultado.valido, false);
  assert.ok(
    resultado.errores.some((e) => e.includes('más de 3 integrantes')),
    `se esperaba el mensaje del límite, llegó: ${resultado.errores.join(' | ')}`,
  );
  assert.ok(
    resultado.errores.some((e) => e.includes('(pusiste 4)')),
    'el mensaje debe decir cuántos se intentaron poner',
  );
});

test('puedeAgregarIntegrante bloquea justo al llegar a 3', () => {
  assert.deepEqual(puedeAgregarIntegrante([1, 2]), { puede: true, motivo: '' });
  const bloqueo = puedeAgregarIntegrante([1, 2, 3]);
  assert.equal(bloqueo.puede, false);
  assert.ok(bloqueo.motivo.includes('3 integrantes'));
  assert.equal(MAX_INTEGRANTES, 3, 'la constante del club debe ser 3');
});

test('los integrantes repetidos no cuentan dos veces (no se puede burlar el límite)', () => {
  const resultado = validarEquipo(
    { nombre: 'Los Rayos' },
    [{ estudianteId: 1 }, { estudianteId: 1 }, { estudianteId: 1 }, { estudianteId: 1 }],
    { estudiantes: ESTUDIANTES },
  );
  assert.equal(resultado.valido, true);
  assert.equal(resultado.integrantes.length, 1, 'cuatro veces el mismo estudiante = un integrante');
});

/* ------------------------------------------------------------------ *
 * UN ESTUDIANTE, UN EQUIPO
 * ------------------------------------------------------------------ */

test('un estudiante que ya está en otro equipo se rechaza explicando cuál', () => {
  const equipos = [{ id: 10, nombre: 'Los Rayos' }, { id: 20, nombre: 'Las Chispas' }];
  const pertenenciaActual = mapaPertenencia([
    { id: 20, nombre: 'Las Chispas', equipo_integrantes: [{ estudiante_id: 2 }] },
  ]);

  const resultado = validarEquipo(
    { nombre: 'Los Rayos' },
    [{ estudianteId: 2 }],
    { estudiantes: ESTUDIANTES, equipos, pertenenciaActual, equipoId: 10 },
  );

  assert.equal(resultado.valido, false);
  assert.ok(
    resultado.errores.some((e) => e.includes('Luis Gómez') && e.includes('Las Chispas')),
    `debe nombrar al estudiante y al equipo, llegó: ${resultado.errores.join(' | ')}`,
  );
});

test('editar el propio equipo no se considera un conflicto', () => {
  const pertenenciaActual = mapaPertenencia([
    { id: 10, nombre: 'Los Rayos', equipo_integrantes: [{ estudiante_id: 1 }, { estudiante_id: 2 }] },
  ]);

  const resultado = validarEquipo(
    { nombre: 'Los Rayos' },
    [{ estudianteId: 1 }, { estudianteId: 2 }],
    { estudiantes: ESTUDIANTES, equipos: [{ id: 10, nombre: 'Los Rayos' }], pertenenciaActual, equipoId: 10 },
  );

  assert.equal(resultado.valido, true, resultado.errores.join(' | '));
});

test('un estudiante dado de baja no se puede integrar', () => {
  const resultado = validarEquipo(
    { nombre: 'Los Rayos' },
    [{ estudianteId: 5 }],
    { estudiantes: ESTUDIANTES },
  );
  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.some((e) => e.includes('Sofía León') && e.includes('baja')));
});

test('un estudiante inexistente se reporta', () => {
  const resultado = validarEquipo(
    { nombre: 'Los Rayos' },
    [{ estudianteId: 999 }],
    { estudiantes: ESTUDIANTES },
  );
  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.some((e) => e.includes('999')));
});

/* ------------------------------------------------------------------ *
 * CAPITÁN Y DATOS DEL EQUIPO
 * ------------------------------------------------------------------ */

test('el primer integrante queda como capitán automáticamente', () => {
  const integrantes = normalizarIntegrantes([{ estudianteId: 3 }, { estudianteId: 1 }]);
  assert.equal(integrantes[0].rol, 'capitan');
  assert.equal(integrantes[1].rol, 'integrante');
});

test('no se permiten dos capitanes', () => {
  const resultado = validarEquipo(
    { nombre: 'Los Rayos' },
    [{ estudianteId: 1, rol: 'capitan' }, { estudianteId: 2, rol: 'capitan' }],
    { estudiantes: ESTUDIANTES },
  );
  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.some((e) => e.includes('un capitán')));
});

test('el nombre del equipo se valida', () => {
  assert.equal(validarEquipo({ nombre: 'A' }, [], { estudiantes: ESTUDIANTES }).valido, false);
  assert.equal(validarEquipo({ nombre: '  ' }, [], { estudiantes: ESTUDIANTES }).valido, false);
  assert.equal(
    validarEquipo({ nombre: 'x'.repeat(61) }, [], { estudiantes: ESTUDIANTES }).valido,
    false,
  );
  assert.equal(validarEquipo({ nombre: 'Los Rayos' }, [], { estudiantes: ESTUDIANTES }).valido, true);
});

test('un equipo sin integrantes es válido (se puede crear primero y llenar después)', () => {
  const resultado = validarEquipo({ nombre: 'Los Rayos' }, [], { estudiantes: ESTUDIANTES });
  assert.equal(resultado.valido, true);
  assert.equal(resultado.integrantes.length, 0);
});

test('normalizarEquipo limpia el nombre y deja el estado WRO por defecto', () => {
  const normalizado = normalizarEquipo({ nombre: '  los   rayos  ' });
  assert.equal(normalizado.nombre, 'Los Rayos');
  assert.equal(normalizado.nombre_busqueda, 'los rayos');
  assert.equal(normalizado.wro_estado, 'no_participa');
  assert.equal(normalizado.activo, true);
});

test('normalizarEquipo rechaza un estado WRO inventado y lo deja en el valor seguro', () => {
  const normalizado = normalizarEquipo({ nombre: 'Los Rayos', wroEstado: 'campeonisimo' });
  assert.equal(normalizado.wro_estado, 'no_participa');
  assert.equal(ESTADOS_WRO.length, 4);
  assert.ok(ETIQUETAS_WRO.inscrito);
});

test('los estados WRO tienen etiqueta para mostrar', () => {
  ESTADOS_WRO.forEach((estado) => {
    assert.ok(ETIQUETAS_WRO[estado], `falta la etiqueta del estado ${estado}`);
  });
});

/* ------------------------------------------------------------------ *
 * AYUDAS PARA LA INTERFAZ
 * ------------------------------------------------------------------ */

test('estudiantesDisponibles marca y explica cada bloqueo', () => {
  const equipos = [
    { id: 10, nombre: 'Los Rayos' },
    { id: 20, nombre: 'Las Chispas' },
  ];
  const integrantes = [{ estudianteId: 1 }];
  const pertenenciaActual = new Map([[2, 20]]);

  const disponibles = estudiantesDisponibles(ESTUDIANTES, integrantes, {
    equipos, pertenenciaActual, equipoId: 10,
  });

  const porId = new Map(disponibles.map((d) => [Number(d.estudiante.id), d]));

  assert.equal(porId.get(1).disponible, true, 'el que ya está en este equipo aparece seleccionable');
  assert.ok(porId.get(1).yaEnEquipo);

  assert.equal(porId.get(2).disponible, false);
  assert.ok(porId.get(2).motivo.includes('Las Chispas'), 'explica que está en otro equipo');

  assert.equal(porId.get(3).disponible, true, 'un estudiante libre se puede agregar');

  assert.equal(porId.get(5).disponible, false);
  assert.ok(porId.get(5).motivo.includes('baja'), 'explica que está dado de baja');
});

test('mapaPertenencia arma el índice estudiante -> equipo', () => {
  const mapa = mapaPertenencia([
    { id: 10, equipo_integrantes: [{ estudiante_id: 1 }, { estudiante_id: 2 }] },
    { id: 20, integrantes: [{ estudianteId: 3 }] },
  ]);
  assert.equal(mapa.get(1), 10);
  assert.equal(mapa.get(2), 10);
  assert.equal(mapa.get(3), 20);
  assert.equal(mapa.get(4), undefined);
});

test('idsIntegrantes y contarIntegrantes toleran las dos formas de respuesta', () => {
  assert.deepEqual(idsIntegrantes({ equipo_integrantes: [{ estudiante_id: 7 }] }), [7]);
  assert.deepEqual(idsIntegrantes({ integrantes: [{ estudianteId: 8 }] }), [8]);
  assert.deepEqual(idsIntegrantes({}), []);
  assert.equal(contarIntegrantes({ equipo_integrantes: [{}, {}] }), 2);
  assert.equal(contarIntegrantes({}), 0);
});

test('integrantesConNombre resuelve nombres y pone al capitán primero', () => {
  const equipo = {
    id: 10,
    equipo_integrantes: [
      { estudiante_id: 2, rol: 'integrante' },
      { estudiante_id: 1, rol: 'capitan' },
    ],
  };
  const integrantes = integrantesConNombre(equipo, ESTUDIANTES);
  assert.equal(integrantes[0].nombre, 'Ana Pérez');
  assert.equal(integrantes[0].rol, 'capitan');
  assert.equal(integrantes[1].nombre, 'Luis Gómez');
});

test('integrantesEnTexto arma una frase legible', () => {
  assert.equal(integrantesEnTexto([]), 'Sin integrantes');
  assert.equal(integrantesEnTexto([{ nombre: 'Ana' }]), 'Ana');
  assert.equal(integrantesEnTexto([{ nombre: 'Ana' }, { nombre: 'Luis' }]), 'Ana y Luis');
  assert.equal(
    integrantesEnTexto([{ nombre: 'Ana' }, { nombre: 'Luis' }, { nombre: 'María' }]),
    'Ana, Luis y 1 más',
  );
});
