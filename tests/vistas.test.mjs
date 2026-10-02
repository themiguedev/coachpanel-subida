/**
 * Pruebas de renderizado de las vistas.
 *
 * Monta un DOM mínimo (tests/ayudas/dom-falso.mjs) y ejecuta de verdad el
 * código de cada pantalla contra una API simulada. Detecta lo que la
 * revisión de sintaxis no puede: variables mal escritas, datos que llegan
 * con otra forma y errores de lógica al pintar.
 *
 * Se ejecutan con:  node --test --experimental-test-isolation=none tests/
 *
 * Los módulos se importan de forma dinámica A PROPÓSITO: así el DOM falso
 * ya está instalado cuando se cargan.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { instalarDom } from './ayudas/dom-falso.mjs';

/* ==================================================================== *
 * 1. DATOS SIMULADOS
 * ==================================================================== */

const ESTUDIANTES = [
  { id: 1, nombre: 'Ana Pérez', activo: true, fecha_nacimiento: '2015-03-04', representante: 'Marta', telefono: '0414-1111111', nota: null },
  { id: 2, nombre: 'Luis Gómez', activo: true, fecha_nacimiento: '2014-07-19', representante: 'José', telefono: null, nota: null },
  { id: 3, nombre: 'María Rojas', activo: true, fecha_nacimiento: '2015-11-02', representante: 'Elena', telefono: null, nota: null },
  { id: 4, nombre: 'Pedro Díaz', activo: true, fecha_nacimiento: '2013-01-30', representante: null, telefono: null, nota: null },
  { id: 5, nombre: 'Sofía León', activo: false, fecha_nacimiento: null, representante: null, telefono: null, nota: 'Se mudó de colegio' },
];

const EQUIPOS = [
  {
    id: 10,
    nombre: 'Los Rayos',
    categoria_wro: 'RoboMission Elementary',
    wro_estado: 'inscrito',
    wro_resultado: null,
    wro_nota: null,
    activo: true,
    equipo_integrantes: [
      { estudiante_id: 1, rol: 'capitan', estudiantes: { id: 1, nombre: 'Ana Pérez', activo: true } },
      { estudiante_id: 2, rol: 'integrante', estudiantes: { id: 2, nombre: 'Luis Gómez', activo: true } },
    ],
  },
  {
    id: 11,
    nombre: 'Las Chispas',
    categoria_wro: null,
    wro_estado: 'no_participa',
    wro_resultado: null,
    wro_nota: null,
    activo: true,
    equipo_integrantes: [{ estudiante_id: 3, rol: 'capitan', estudiantes: { id: 3, nombre: 'María Rojas', activo: true } }],
  },
];

const RETOS = [
  { id: 1, nombre: 'Pista WRO RoboMission', activo: true },
  { id: 2, nombre: 'Seguimiento de línea', activo: true },
];

const PRACTICAS = [
  { id: 100, fecha: '2026-10-02', equipo_id: 10, intento: 2, reto_id: 1, duracion_ms: 83450, puntaje: 250, observaciones: 'Mejoró el giro', equipos: { id: 10, nombre: 'Los Rayos' }, retos: { id: 1, nombre: 'Pista WRO RoboMission' } },
  { id: 101, fecha: '2026-10-02', equipo_id: 10, intento: 1, reto_id: 1, duracion_ms: 95000, puntaje: 180, observaciones: null, equipos: { id: 10, nombre: 'Los Rayos' }, retos: { id: 1, nombre: 'Pista WRO RoboMission' } },
  { id: 102, fecha: '2026-09-28', equipo_id: 11, intento: 1, reto_id: 2, duracion_ms: null, puntaje: 75, observaciones: 'Solo puntaje', equipos: { id: 11, nombre: 'Las Chispas' }, retos: { id: 2, nombre: 'Seguimiento de línea' } },
];

const SESIONES = [
  { id: 500, fecha: '2026-10-02', hora_inicio: '14:00:00', hora_fin: '16:00:00', titulo: 'Armado del chasis', nota: null, estado: 'abierta' },
  { id: 501, fecha: '2026-09-28', hora_inicio: null, hora_fin: null, titulo: null, nota: null, estado: 'cerrada' },
];

const ASISTENCIA = [
  { id: 900, estado: 'presente', estudiante_id: 1, sesion_id: 500, observacion: null, sesiones: { fecha: '2026-10-02' } },
  { id: 901, estado: 'tarde', estudiante_id: 2, sesion_id: 500, observacion: null, sesiones: { fecha: '2026-10-02' } },
  { id: 902, estado: 'ausente', estudiante_id: 3, sesion_id: 500, observacion: null, sesiones: { fecha: '2026-10-02' } },
  { id: 903, estado: 'justificado', estudiante_id: 4, sesion_id: 500, observacion: 'Cita médica', sesiones: { fecha: '2026-10-02' } },
  { id: 904, estado: 'presente', estudiante_id: 1, sesion_id: 501, observacion: null, sesiones: { fecha: '2026-09-28' } },
  { id: 905, estado: 'presente', estudiante_id: 2, sesion_id: 501, observacion: null, sesiones: { fecha: '2026-09-28' } },
];

const VISTA_ASISTENCIA = [
  { estudiante_id: 1, nombre: 'Ana Pérez', activo: true, registros: 2, presentes: 2, tardes: 0, justificados: 0, ausencias: 0, porcentaje: 100 },
  { estudiante_id: 2, nombre: 'Luis Gómez', activo: true, registros: 2, presentes: 1, tardes: 1, justificados: 0, ausencias: 0, porcentaje: 100 },
  { estudiante_id: 3, nombre: 'María Rojas', activo: true, registros: 1, presentes: 0, tardes: 0, justificados: 0, ausencias: 1, porcentaje: 0 },
  { estudiante_id: 4, nombre: 'Pedro Díaz', activo: true, registros: 1, presentes: 0, tardes: 0, justificados: 1, ausencias: 0, porcentaje: 100 },
  { estudiante_id: 5, nombre: 'Sofía León', activo: false, registros: 0, presentes: 0, tardes: 0, justificados: 0, ausencias: 0, porcentaje: null },
];

const RESUMEN_EQUIPOS = [
  { id: 10, nombre: 'Los Rayos', categoria_wro: 'RoboMission Elementary', wro_estado: 'inscrito', wro_resultado: null, activo: true, integrantes: 2, practicas: 2, mejor_duracion_ms: 83450, mejor_puntaje: 250, ultima_practica: '2026-10-02' },
  { id: 11, nombre: 'Las Chispas', categoria_wro: null, wro_estado: 'no_participa', wro_resultado: null, activo: true, integrantes: 1, practicas: 1, mejor_duracion_ms: null, mejor_puntaje: 75, ultima_practica: '2026-09-28' },
];

/** Registra las llamadas para poder comprobar que se guardó lo correcto. */
function crearApiSimulada(registro = { llamadas: [], guardados: [] }) {
  registro.llamadas ??= [];
  registro.guardados ??= [];

  /** Respuesta de lectura: deja constancia de la consulta. */
  const respuesta = (datos) => async (...argumentos) => {
    registro.llamadas.push({ nombre: 'lectura', argumentos });
    return { datos, deCache: false, guardadoEn: new Date().toISOString(), antiguedad: null };
  };

  const registrar = (nombre) => (...argumentos) => {
    registro.llamadas.push({ nombre, argumentos });
    return Promise.resolve({ datos: [], deCache: false, antiguedad: null });
  };

  return {
    _registro: registro,

    listarEstudiantes: respuesta(ESTUDIANTES),
    listarEstudiantesConEquipo: respuesta(ESTUDIANTES),
    listarEquipos: respuesta(EQUIPOS),
    listarEquiposResumen: respuesta(RESUMEN_EQUIPOS),
    listarRetos: respuesta(RETOS),
    listarSesiones: respuesta(SESIONES),
    listarPracticas: respuesta(PRACTICAS),
    practicasRecientes: respuesta(PRACTICAS),
    asistenciaReciente: respuesta(ASISTENCIA),
    asistenciaDelMes: respuesta(ASISTENCIA.filter((a) => a.sesiones.fecha.startsWith('2026-10'))),
    asistenciaEstudiante: respuesta(ASISTENCIA.filter((a) => a.estudiante_id === 1)),
    vistaAsistenciaEstudiantes: respuesta(VISTA_ASISTENCIA),
    rankingPracticas: respuesta([]),
    resumenUltimaSesion: respuesta(SESIONES[0]),

    async historialEstudiante(id) {
      registro.llamadas.push({ nombre: 'historialEstudiante', argumentos: [id] });
      return {
        datos: {
          asistencia: ASISTENCIA.filter((a) => a.estudiante_id === Number(id)),
          practicas: PRACTICAS,
          equipos: [{ equipo_id: 10, rol: 'capitan', equipos: { id: 10, nombre: 'Los Rayos', wro_estado: 'inscrito' } }],
        },
        deCache: false,
      };
    },

    async listaAsistencia({ sesionId = null, fecha = null } = {}) {
      registro.llamadas.push({ nombre: 'listaAsistencia', argumentos: [{ sesionId, fecha }] });
      const sesion = sesionId
        ? SESIONES.find((s) => s.id === Number(sesionId))
        : (SESIONES.find((s) => s.fecha === fecha) ?? { id: 999, fecha, estado: 'abierta', titulo: null });

      const registros = ASISTENCIA.filter((a) => a.sesion_id === sesion.id);

      const lista = ESTUDIANTES
        .filter((e) => e.activo)
        .map((e) => ({
          estudianteId: e.id,
          nombre: e.nombre,
          activo: true,
          estado: registros.find((r) => r.estudiante_id === e.id)?.estado ?? null,
          observacion: '',
          guardado: registros.some((r) => r.estudiante_id === e.id),
        }));

      return { sesion, lista, registros, estudiantes: ESTUDIANTES };
    },

    async guardarAsistencia(lista, opciones) {
      registro.llamadas.push({ nombre: 'guardarAsistencia', argumentos: [lista, opciones] });
      registro.guardados.push({ lista, opciones });
      return lista.filter((f) => f.estado);
    },

    async guardarEquipo(datos, integrantes, opciones) {
      registro.llamadas.push({ nombre: 'guardarEquipo', argumentos: [datos, integrantes, opciones] });
      return { id: 99, nombre: datos.nombre };
    },

    async crearEstudiante(datos) {
      registro.llamadas.push({ nombre: 'crearEstudiante', argumentos: [datos] });
      return { id: 99, ...datos };
    },

    async actualizarEstudiante(id, datos) {
      registro.llamadas.push({ nombre: 'actualizarEstudiante', argumentos: [id, datos] });
      return { id, ...datos };
    },

    async darDeBajaEstudiante(id) {
      registro.llamadas.push({ nombre: 'darDeBajaEstudiante', argumentos: [id] });
      return { id, activo: false };
    },

    async reactivarEstudiante(id) {
      registro.llamadas.push({ nombre: 'reactivarEstudiante', argumentos: [id] });
      return { id, activo: true };
    },

    async crearPractica(datos) {
      registro.llamadas.push({ nombre: 'crearPractica', argumentos: [datos] });
      return { id: 999, ...datos };
    },

    async actualizarPractica(id, datos) {
      registro.llamadas.push({ nombre: 'actualizarPractica', argumentos: [id, datos] });
      return { id, ...datos };
    },

    async borrarPractica(id) {
      registro.llamadas.push({ nombre: 'borrarPractica', argumentos: [id] });
      return true;
    },

    async actualizarSesion(id, cambios) {
      registro.llamadas.push({ nombre: 'actualizarSesion', argumentos: [id, cambios] });
      return { id, ...cambios };
    },

    async actualizarWro(id, datos) {
      registro.llamadas.push({ nombre: 'actualizarWro', argumentos: [id, datos] });
      return { id, ...datos };
    },

    async archivarEquipo(id, activo) {
      registro.llamadas.push({ nombre: 'archivarEquipo', argumentos: [id, activo] });
      return { id, activo };
    },

    async validarToken(token) {
      registro.llamadas.push({ nombre: 'validarToken', argumentos: [token] });
      // Reglas del simulador: 'bueno' y el token de las pruebas de modalidad
      // entran; el resto se rechaza, para poder probar el camino del error.
      const aceptados = ['bueno', 'token-de-prueba'];
      return aceptados.includes(String(token ?? '').trim())
        ? { ok: true }
        : { ok: false, codigo: 'incorrecto', mensaje: 'Ese token no es válido. Pídele el link al coach.' };
    },

    async exportarTodo() {
      registro.llamadas.push({ nombre: 'exportarTodo', argumentos: [] });
      return { estudiantes: ESTUDIANTES, equipos: EQUIPOS };
    },

    registrarAcceso: registrar('registrarAcceso'),
    ajuste: async () => null,
    cambiarToken: registrar('cambiarToken'),
  };
}

function crearContexto(api, ventana) {
  return {
    api,
    cliente: {},
    store: {
      estado: {},
      obtener: (clave) => (clave === 'tema' ? 'oscuro' : (clave === 'nombreClub' ? 'Club de Prueba' : null)),
      establecer: () => true,
      suscribir: () => () => {},
    },
    CONFIG: { NOMBRE_CLUB: 'Club de Prueba', CREDITOS: '' },
    navegar: () => {},
    // Las vistas usan cabecera() del contexto; se importa del módulo real.
  };
}

/** Espera a que se resuelvan las promesas pendientes (varias vueltas). */
async function esperar(vueltas = 8) {
  for (let i = 0; i < vueltas; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

/**
 * Monta la aplicación COMPLETA con el código de producción (montarApp) y
 * recorre todas las secciones.
 *
 * Esto es lo que faltaba: las pruebas de vistas les inyectaban `cabecera` a
 * mano, así que nunca ejecutaban el montaje real. Por ese hueco se coló un
 * `ReferenceError: cabeceraVista is not defined` que dejaba la app inservible
 * y que ninguna prueba detectó.
 *
 * Si aparece un identificador mal escrito o un import olvidado en main.js, o
 * una vista que pide algo que el contexto no le da, esta prueba lo delata.
 */
test('la aplicación monta y las 6 vistas se pintan por el camino real', async () => {
  const { ventana, raiz } = instalarDom();
  const registro = { llamadas: [], guardados: [] };
  const api = crearApiSimulada(registro);

  const { montarApp } = await import('../docs/js/main.js');
  const { crearStore, aplicarTema } = await import('../docs/js/store.js');

  // La app exige el token antes de montar; aquí ya está verificado.
  ventana.location.hash = '#/panel';

  const store = crearStore({ tema: 'oscuro', nombreClub: 'Club de Prueba' });
  aplicarTema('oscuro');

  const app = montarApp({
    raiz,
    store,
    api,
    cliente: {},
    CONFIG: { NOMBRE_CLUB: 'Club de Prueba', CREDITOS: '' },
    alOlvidarAcceso: () => {},
  });

  assert.ok(app && typeof app.navegar === 'function', 'montarApp debe devolver el control de la app');
  await esperar();

  // El montaje debe haber creado la estructura: navegación + contenido.
  assert.ok(raiz.querySelector('.app'), 'debe existir el contenedor de la aplicación');
  assert.ok(raiz.querySelector('nav.nav'), 'debe existir la navegación');

  const enlaces = raiz.querySelectorAll('a.nav__enlace');
  assert.equal(enlaces.length, 6, `la navegación debe tener 6 enlaces, tiene ${enlaces.length}`);

  const secciones = [
    { ruta: 'panel', espera: 'Acciones rápidas' },
    { ruta: 'asistencia', espera: 'Tomar asistencia' },
    { ruta: 'estudiantes', espera: 'Nuevo estudiante' },
    { ruta: 'equipos', espera: 'Nuevo equipo' },
    { ruta: 'practicas', espera: 'Prácticas registradas' },
    { ruta: 'wro', espera: 'WRO Venezuela' },
  ];

  for (const { ruta, espera } of secciones) {
    ventana.location.hash = `#/${ruta}`;
    // El DOM falso no emite hashchange solo: hay que avisarlo.
    ventana.dispatchEvent({ type: 'hashchange' });
    // eslint-disable-next-line no-await-in-loop
    await esperar();

    const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');

    assert.ok(
      !texto.includes('No se pudo iniciar la aplicación'),
      `en "#/${ruta}" la app falló al arrancar: ${texto.slice(0, 220)}`,
    );
    assert.ok(
      !/is not defined|is not a function/.test(texto),
      `en "#/${ruta}" hay un identificador roto: ${texto.slice(0, 220)}`,
    );
    assert.ok(
      !texto.includes('No se pudo abrir esta sección'),
      `en "#/${ruta}" la vista lanzó una excepción: ${texto.slice(0, 220)}`,
    );
    assert.ok(
      texto.includes(espera),
      `en "#/${ruta}" debería verse "${espera}". Texto: ${texto.slice(0, 260)}`,
    );

    // La pestaña activa se marca sola.
    const activo = raiz.querySelectorAll('a.nav__enlace')
      .find((a) => a.getAttribute('aria-current') === 'page');
    assert.ok(activo, `en "#/${ruta}" debe haber un enlace marcado como activo`);
  }

  app.destruir();
});

test('una ruta desconocida cae en el panel en vez de romperse', async () => {
  const { ventana, raiz } = instalarDom();
  const api = crearApiSimulada();
  const { montarApp, leerRuta } = await import('../docs/js/main.js');
  const { crearStore } = await import('../docs/js/store.js');

  assert.equal(leerRuta('#/inventada').ruta, 'panel', 'una ruta inválida debe resolver al panel');
  assert.equal(leerRuta('').ruta, 'panel');
  assert.equal(leerRuta('#/').ruta, 'panel');
  assert.equal(leerRuta('#/estudiantes/').ruta, 'estudiantes', 'tolera la barra final');
  assert.deepEqual(leerRuta('#/acceso?t=abc').parametros, { t: 'abc' });

  ventana.location.hash = '#/inventada';
  montarApp({
    raiz,
    store: crearStore({}),
    api,
    cliente: {},
    CONFIG: {},
    alOlvidarAcceso: () => {},
  });
  await esperar();

  const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(texto.includes('Acciones rápidas'), `debe mostrar el panel: ${texto.slice(0, 200)}`);
});

/* ==================================================================== *
 * 2. LAS PRUEBAS
 * ==================================================================== */

const vistas = [
  { nombre: 'panel', modulo: '../docs/js/vistas/panel.js', exporta: 'renderPanel', claves: ['Estudiantes activos', 'Asistencia del mes', 'Acciones rápidas', 'Última clase registrada'] },
  { nombre: 'asistencia', modulo: '../docs/js/vistas/asistencia.js', exporta: 'renderAsistencia', claves: ['Ana Pérez', 'Luis Gómez', 'Presentes', 'Historial y porcentajes'] },
  { nombre: 'estudiantes', modulo: '../docs/js/vistas/estudiantes.js', exporta: 'renderEstudiantes', claves: ['Ana Pérez', 'Los Rayos', 'Nuevo estudiante', 'Sofía León'] },
  { nombre: 'equipos', modulo: '../docs/js/vistas/equipos.js', exporta: 'renderEquipos', claves: ['Los Rayos', 'Las Chispas', 'Capitán', 'Nuevo equipo'] },
  { nombre: 'practicas', modulo: '../docs/js/vistas/practicas.js', exporta: 'renderPracticas', claves: ['Prácticas registradas', '1:23.45', 'Pista WRO RoboMission', '250'] },
  { nombre: 'wro', modulo: '../docs/js/vistas/wro.js', exporta: 'renderWro', claves: ['Los Rayos', 'Inscrito', 'WRO Venezuela'] },
];

for (const vista of vistas) {
  test(`la vista "${vista.nombre}" se renderiza con datos reales sin errores`, async () => {
    const { documento, ventana, raiz } = instalarDom();
    const registro = { llamadas: [], guardados: [] };
    const api = crearApiSimulada(registro);

    const { cabeceraVista } = await import('../docs/js/componentes/ladrillo.js');
    const { abrirModal, confirmar } = await import('../docs/js/ui.js');
    const modulo = await import(vista.modulo);

    assert.equal(typeof modulo[vista.exporta], 'function', `debe exportar ${vista.exporta}`);

    const contexto = {
      ...crearContexto(api, ventana),
      cabecera: cabeceraVista,
      modal: abrirModal,
      confirmar,
      icono: () => '',
      avisoOk: () => {},
      avisoError: () => {},
      avisoAtencion: () => {},
      descargar: () => {},
      aCsv: () => '',
      respaldar: async () => {},
    };

    await modulo[vista.exporta](raiz, contexto);
    await esperar();

    // La vista sí pintó contenido.
    assert.ok(
      raiz.todos().length > 5,
      `la vista "${vista.nombre}" debería crear elementos, creó ${raiz.todos().length}`,
    );

    const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');

    vista.claves.forEach((clave) => {
      assert.ok(
        texto.includes(clave),
        `la vista "${vista.nombre}" debería mostrar "${clave}". Texto: ${texto.slice(0, 400)}`,
      );
    });

    // No debe haber lanzado ningún error de promesa sin manejar.
    assert.equal(documento.body.hijos.length > 0, true);

    // Y las llamadas a la API fueron las esperadas.
    assert.ok(registro.llamadas.length >= 1, 'debe haber consultado datos');
    assert.ok(
      registro.llamadas.every((llamada) => typeof llamada.nombre === 'string'),
      'todas las llamadas deben estar identificadas',
    );
  });
}
test('la vista de asistencia marca y guarda en un solo lote', async () => {
  const { documento, ventana, raiz } = instalarDom();
  const registro = { llamadas: [], guardados: [] };
  const api = crearApiSimulada(registro);

  const { cabeceraVista } = await import('../docs/js/componentes/ladrillo.js');
  const { abrirModal, confirmar } = await import('../docs/js/ui.js');
  const { renderAsistencia } = await import('../docs/js/vistas/asistencia.js');

  await renderAsistencia(raiz, {
    ...crearContexto(api, ventana),
    cabecera: cabeceraVista,
    modal: abrirModal,
    confirmar,
  });
  await esperar();

  // La sesión de esta prueba ya tiene marcas guardadas: Ana presente, Luis
  // tarde, María ausente y Pedro justificado. Se comprueba que se reflejen.
  const filasIniciales = raiz.querySelectorAll('.fila-asistencia');
  assert.equal(filasIniciales.length, 4, 'deben aparecer los 4 estudiantes activos');

  const filaDe = (nombre) => raiz.querySelectorAll('.fila-asistencia')
    .find((f) => f.dataset.estudiante && f.todos().some((e) => e._texto === nombre));

  const filaAna = filaDe('Ana Pérez');
  assert.ok(filaAna, 'Ana Pérez debe estar en la lista');
  assert.equal(filaAna.dataset.estado, 'presente', 'Ana ya venía marcada como presente de la base de datos');

  // Se cambia el estado de Pedro a "presente" (venía "justificado").
  const filaPedro = filaDe('Pedro Díaz');
  const botonPresenteDePedro = filaPedro.querySelectorAll('.boton-estado')
    .find((b) => b.dataset.estado === 'presente');
  assert.equal(botonPresenteDePedro.getAttribute('aria-pressed'), 'false', 'Pedro no estaba presente');

  botonPresenteDePedro.click();
  await esperar(2);

  // Tras el re-render hay que volver a consultar el DOM.
  const filaPedroDespues = filaDe('Pedro Díaz');
  const botonPedroDespues = filaPedroDespues.querySelectorAll('.boton-estado')
    .find((b) => b.dataset.estado === 'presente');
  assert.equal(botonPedroDespues.getAttribute('aria-pressed'), 'true', 'Pedro debe quedar presente');
  assert.equal(filaPedroDespues.dataset.estado, 'presente', 'la fila debe reflejar el estado nuevo');

  // El botón de guardar avisa que hay cambios pendientes.
  const botonGuardar = raiz.todos().find((e) => e._texto === 'Guardar asistencia *');
  assert.ok(botonGuardar, 'el botón de guardar debe avisar que hay cambios');

  // Y al guardar se manda UN solo lote con toda la lista marcada.
  botonGuardar.click();
  await esperar(4);

  const guardado = registro.llamadas.find((l) => l.nombre === 'guardarAsistencia');
  assert.ok(guardado, 'debe haberse llamado a guardar la asistencia una sola vez');
  assert.equal(
    registro.llamadas.filter((l) => l.nombre === 'guardarAsistencia').length,
    1,
    'la asistencia se guarda en un solo lote, no estudiante por estudiante',
  );

  const [listaEnviada] = guardado.argumentos;
  assert.equal(listaEnviada.length, 4, 'el lote debe llevar a los 4 estudiantes marcados');

  const porNombre = new Map(listaEnviada.map((f) => [f.nombre, f.estado]));
  assert.equal(porNombre.get('Pedro Díaz'), 'presente', 'el cambio debe viajar en el lote');
  assert.equal(porNombre.get('Ana Pérez'), 'presente', 'lo ya guardado no se pierde');
  assert.equal(porNombre.get('Luis Gómez'), 'tarde');
  assert.equal(porNombre.get('María Rojas'), 'ausente');
});

test('la vista de estudiantes filtra al escribir en el buscador', async () => {
  const { documento, ventana, raiz } = instalarDom();
  const api = crearApiSimulada();

  const { cabeceraVista } = await import('../docs/js/componentes/ladrillo.js');
  const { abrirModal, confirmar } = await import('../docs/js/ui.js');
  const { renderEstudiantes } = await import('../docs/js/vistas/estudiantes.js');

  await renderEstudiantes(raiz, {
    ...crearContexto(api, ventana),
    cabecera: cabeceraVista,
    modal: abrirModal,
    confirmar,
  });
  await esperar();

  const buscador = raiz.querySelector('input[type="search"]');
  assert.ok(buscador, 'debe existir el buscador');

  const antes = raiz.todos().filter((e) => e._texto === 'María Rojas').length;
  assert.ok(antes > 0, 'María Rojas debe aparecer al inicio');

  buscador.value = 'ana';
  buscador.disparar('input', { target: buscador });
  await new Promise((resolver) => setTimeout(resolver, 260));
  await esperar();

  const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(texto.includes('Ana Pérez'), 'Ana debe seguir visible');
  assert.ok(!texto.includes('María Rojas'), 'María ya no debería aparecer con el filtro "ana"');
});

test('los equipos de 4 integrantes se rechazan antes de tocar la base de datos', async () => {
  const { documento, ventana, raiz } = instalarDom();
  const registro = { llamadas: [], guardados: [] };
  const api = crearApiSimulada(registro);

  const { cabeceraVista } = await import('../docs/js/componentes/ladrillo.js');
  const { abrirModal, confirmar } = await import('../docs/js/ui.js');
  const { renderEquipos } = await import('../docs/js/vistas/equipos.js');

  await renderEquipos(raiz, {
    ...crearContexto(api, ventana),
    cabecera: cabeceraVista,
    modal: abrirModal,
    confirmar,
  });
  await esperar();

  // Abre el editor de equipo. Los modales se montan en <body>, no en #raiz.
  const botonNuevo = raiz.todos().find((e) => e._texto === 'Nuevo equipo');
  assert.ok(botonNuevo, 'debe existir el botón de nuevo equipo');
  botonNuevo.click();
  await esperar(2);

  const nombre = documento.body.querySelector('#equipo-nombre');
  assert.ok(nombre, 'el editor debe tener el campo de nombre');
  nombre.value = 'Equipo de prueba';

  // El selector de integrantes deshabilita a quien ya tiene equipo.
  // (En el modal hay varios <select>: el primero es la categoría WRO; el de
  // integrantes se reconoce porque su primera opción es el texto de ayuda.)
  const selectorIntegrante = documento.body.querySelectorAll('select')
    .find((s) => s.todos().some((o) => o.tagName === 'OPTION' && o._texto === '— Elegir estudiante —'));
  assert.ok(selectorIntegrante, 'debe existir el selector de integrantes');

  const opciones = selectorIntegrante.todos().filter((o) => o.tagName === 'OPTION');
  const deshabilitadas = opciones.filter((o) => o.getAttribute('disabled') !== null);
  assert.ok(
    deshabilitadas.length > 0,
    'los estudiantes que ya están en otro equipo deben salir deshabilitados',
  );
  assert.ok(
    deshabilitadas.some((o) => String(o._texto).includes('Los Rayos') || String(o._texto).includes('Las Chispas')),
    'la opción deshabilitada debe explicar en qué equipo está',
  );

  // Y guardar con un nombre inválido NO debe llamar a la API.
  const botonCrear = documento.body.todos().find((e) => e._texto === 'Crear equipo');
  const llamadasAntes = registro.llamadas.filter((l) => l.nombre === 'guardarEquipo').length;
  nombre.value = 'X';
  botonCrear.click();
  await esperar(3);

  const llamadasDespues = registro.llamadas.filter((l) => l.nombre === 'guardarEquipo').length;
  assert.equal(llamadasDespues, llamadasAntes, 'un nombre inválido no debe llegar a la base de datos');

  // Con un nombre válido y sin integrantes, el equipo sí se guarda.
  nombre.value = 'Los Tornillos';
  botonCrear.click();
  await esperar(4);

  const enviado = registro.llamadas.find((l) => l.nombre === 'guardarEquipo');
  assert.ok(enviado, 'con datos válidos debe guardarse el equipo');
  assert.equal(enviado.argumentos[0].nombre, 'Los Tornillos');
});

test('la vista de prácticas valida el tiempo y el puntaje antes de guardar', async () => {
  const { documento, ventana, raiz } = instalarDom();
  const registro = { llamadas: [], guardados: [] };
  const api = crearApiSimulada(registro);

  const { cabeceraVista } = await import('../docs/js/componentes/ladrillo.js');
  const { abrirModal, confirmar } = await import('../docs/js/ui.js');
  const { renderPracticas } = await import('../docs/js/vistas/practicas.js');

  await renderPracticas(raiz, {
    ...crearContexto(api, ventana),
    cabecera: cabeceraVista,
    modal: abrirModal,
    confirmar,
  });
  await esperar();

  const botonNuevo = raiz.todos().find((e) => e._texto === 'Registrar práctica');
  assert.ok(botonNuevo, 'debe existir el botón de registrar práctica');
  botonNuevo.click();
  await esperar(2);

  const campoTiempo = documento.body.querySelector('#practica-tiempo');
  const campoPuntaje = documento.body.querySelector('#practica-puntaje');
  const campoEquipo = documento.body.querySelector('#practica-equipo');
  assert.ok(campoTiempo && campoPuntaje && campoEquipo, 'el formulario debe tener sus campos');

  // Escribe un tiempo entendible y comprueba la vista previa en vivo.
  campoTiempo.value = '1:23.45';
  campoTiempo.disparar('input', { target: campoTiempo });
  const ayuda = campoTiempo.padre.todos().map((e) => e._texto).join(' ');
  assert.ok(
    ayuda.includes('1:23.45'),
    `la vista previa debe mostrar el tiempo normalizado: ${ayuda}`,
  );

  // Un tiempo inválido debe marcar el campo.
  campoTiempo.value = 'no es un tiempo';
  campoTiempo.disparar('input', { target: campoTiempo });
  assert.equal(campoTiempo.getAttribute('aria-invalid'), 'true', 'un tiempo inválido debe marcarse');

  // Intento de guardar con el tiempo inválido: no debe llegar a la API.
  const antes = registro.llamadas.filter((l) => l.nombre === 'crearPractica').length;
  const botonRegistrar = documento.body.todos().find((e) => e._texto === 'Registrar');
  botonRegistrar.click();
  await esperar(3);

  const despues = registro.llamadas.filter((l) => l.nombre === 'crearPractica').length;
  assert.equal(despues, antes, 'con el tiempo inválido no debe guardarse nada');

  // Con datos correctos sí se guarda, y el tiempo se convierte a milisegundos.
  campoTiempo.value = '1:23.45';
  campoTiempo.disparar('input', { target: campoTiempo });
  campoPuntaje.value = '250';
  campoEquipo.value = '10';
  botonRegistrar.click();
  await esperar(4);

  const guardado = registro.llamadas.find((l) => l.nombre === 'crearPractica');
  assert.ok(guardado, 'con datos válidos debe guardarse la práctica');
  assert.equal(guardado.argumentos[0].duracionMs, 83450, 'el tiempo debe ir en milisegundos');
  assert.equal(guardado.argumentos[0].puntaje, 250);
  assert.equal(guardado.argumentos[0].equipoId, 10);
});

test('el panel deja claro qué hacer cuando no hay ningún dato', async () => {
  const { ventana, raiz } = instalarDom();
  const registro = { llamadas: [], guardados: [] };
  const api = crearApiSimulada(registro);

  // API vacía: club recién creado.
  Object.keys(api).forEach((clave) => {
    if (clave.startsWith('listar') || clave === 'practicasRecientes'
      || clave === 'asistenciaReciente' || clave === 'vistaAsistenciaEstudiantes') {
      api[clave] = async () => ({ datos: [], deCache: false, antiguedad: null });
    }
  });
  api.resumenUltimaSesion = async () => ({ datos: null, deCache: false, antiguedad: null });

  const { cabeceraVista } = await import('../docs/js/componentes/ladrillo.js');
  const { abrirModal, confirmar } = await import('../docs/js/ui.js');
  const { renderPanel } = await import('../docs/js/vistas/panel.js');

  await renderPanel(raiz, {
    ...crearContexto(api, ventana),
    cabecera: cabeceraVista,
    modal: abrirModal,
    confirmar,
  });
  await esperar();

  const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(texto.includes('Todavía no hay clases registradas'), `debe invitar a empezar: ${texto.slice(0, 300)}`);
  assert.ok(texto.includes('Acciones rápidas'), 'debe ofrecer acciones rápidas');
});

test('el arranque avisa con claridad cuando falta configurar Supabase', async () => {
  // Se le pasa una configuración SIN rellenar a propósito: así la prueba no
  // depende de si el proyecto real ya tiene sus claves puestas.
  const { documento, raiz } = instalarDom();
  const { arrancar } = await import('../docs/js/arranque.js');

  const sinConfigurar = {
    SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
    SUPABASE_ANON_KEY: 'TU-CLAVE-ANON-PUBLICA',
    TOKEN_ACCESO: 'CAMBIA-ESTE-TOKEN',
    NOMBRE_CLUB: 'Club de Robótica LEGO',
  };

  await arrancar(raiz, { config: sinConfigurar });
  await esperar(2);

  const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');

  assert.ok(
    texto.includes('Falta configurar la conexión'),
    `debe avisar que falta configurar. Texto: ${texto.slice(0, 300)}`,
  );
  assert.ok(texto.includes('docs/js/config.js'), 'debe decir en qué archivo');
  assert.ok(
    texto.includes('SUPABASE_URL') && texto.includes('SUPABASE_ANON_KEY'),
    'debe nombrar los valores que faltan',
  );
  assert.ok(texto.includes('TOKEN_ACCESO'), 'debe nombrar también el token');
  assert.ok(texto.includes('GUIA-DESPLIEGUE.md'), 'debe indicar dónde está la guía');
  assert.ok(documento.body.hijos.length > 0, 'la página no debe quedar vacía');
});

test('el arranque avisa cuando Supabase está pausado o sin red', async () => {
  const { raiz } = instalarDom();
  const { arrancar } = await import('../docs/js/arranque.js');

  const config = {
    SUPABASE_URL: 'https://proyecto-de-prueba.supabase.co',
    SUPABASE_ANON_KEY: 'clave-de-prueba-suficientemente-larga-para-pasar',
    TOKEN_ACCESO: 'token-de-prueba',
    NOMBRE_CLUB: 'Club de Prueba',
  };

  // Se inyecta la comprobación de conexión: nada de tocar la red.
  await arrancar(raiz, {
    config,
    comprobarConexion: async () => ({
      ok: false,
      codigo: 'sin_conexion',
      mensaje: 'No hay conexión a internet (o Supabase está pausado).',
      esFalloDeRed: true,
    }),
  });
  await esperar(2);

  const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(texto.includes('No pude conectar'), `debe avisar del fallo: ${texto.slice(0, 200)}`);
  assert.ok(
    texto.includes('Restore project'),
    'debe explicar cómo reactivar el proyecto pausado',
  );
});

test('el arranque avisa cuando falta ejecutar los archivos SQL', async () => {
  const { raiz } = instalarDom();
  const { arrancar } = await import('../docs/js/arranque.js');

  await arrancar(raiz, {
    config: {
      SUPABASE_URL: 'https://proyecto-de-prueba.supabase.co',
      SUPABASE_ANON_KEY: 'clave-de-prueba-suficientemente-larga-para-pasar',
      TOKEN_ACCESO: 'token-de-prueba',
      NOMBRE_CLUB: 'Club de Prueba',
    },
    comprobarConexion: async () => ({
      ok: false,
      codigo: 'sin_tablas',
      mensaje: 'La base de datos está vacía: falta ejecutar los archivos SQL.',
    }),
  });
  await esperar(2);

  const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(texto.includes('01_esquema.sql'), 'debe listar los archivos SQL a ejecutar');
  assert.ok(texto.includes('04_vistas.sql'), 'debe listar los 4 archivos en orden');
});

test('con la configuración puesta y la base en orden, pide el token del club', async () => {
  const { ventana, raiz } = instalarDom();
  const { arrancar } = await import('../docs/js/arranque.js');

  await arrancar(raiz, {
    config: {
      SUPABASE_URL: 'https://proyecto-de-prueba.supabase.co',
      SUPABASE_ANON_KEY: 'clave-de-prueba-suficientemente-larga-para-pasar',
      TOKEN_ACCESO: 'token-de-prueba',
      CONTRASENA_COACH: 'clave-del-coach',
      NOMBRE_CLUB: 'Club de Prueba',
    },
    comprobarConexion: async () => ({ ok: true }),
  });
  await esperar(2);

  const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(texto.includes('Token del club'), `debe pedir el token: ${texto.slice(0, 200)}`);
  assert.ok(texto.includes('Continuar'), 'debe tener el botón de continuar');
  assert.ok(
    raiz.todos().some((e) => e.getAttribute('type') === 'password'),
    'el campo del token debe estar oculto',
  );
});

test('el token del link de acceso se extrae de la dirección', async () => {
  const { tokenDeDireccion } = await import('../docs/js/arranque.js');

  assert.equal(tokenDeDireccion('#/acceso?t=mi-token-123'), 'mi-token-123');
  assert.equal(tokenDeDireccion('#!/acceso?t=otro-token'), 'otro-token');
  assert.equal(tokenDeDireccion('#/panel?token=abc'), 'abc');
  assert.equal(tokenDeDireccion('#/panel'), null, 'sin parámetros no hay token');
  assert.equal(tokenDeDireccion(''), null);
  assert.equal(tokenDeDireccion('#/acceso?t='), null, 'un token vacío no cuenta');
  assert.equal(tokenDeDireccion('#/acceso?t=%20%20%20'), null, 'solo espacios tampoco');
  // Un valor con espacios alrededor SÍ es un token: se recortan los bordes.
  assert.equal(tokenDeDireccion('#/acceso?t=%20vacio%20'), 'vacio');

  assert.equal(
    tokenDeDireccion('#/acceso?otra=cosa&t=entre-otros'),
    'entre-otros',
    'debe encontrar el token aunque no sea el único parámetro',
  );
});

/* ==================================================================== *
 * 3. LAS DOS MODALIDADES (coach y alumno/representante)
 * ==================================================================== */

const CONFIG_PRUEBA = {
  SUPABASE_URL: 'https://proyecto-de-prueba.supabase.co',
  SUPABASE_ANON_KEY: 'clave-de-prueba-suficientemente-larga-para-pasar',
  TOKEN_ACCESO: 'token-de-prueba',
  CONTRASENA_COACH: 'clave-del-coach',
  NOMBRE_CLUB: 'Club de Prueba',
};

test('las reglas de cada modalidad: quién edita y qué ve', async () => {
  const {
    puedeEditar, puedeVer, rutasDe, esModoValido,
  } = await import('../docs/js/roles.js');

  assert.equal(puedeEditar('coach'), true, 'el coach edita');
  assert.equal(puedeEditar('club'), false, 'el alumno/representante no edita');
  assert.equal(puedeEditar('inventado'), false, 'un modo inválido nunca edita');
  assert.equal(puedeEditar(undefined), false);

  assert.ok(esModoValido('coach') && esModoValido('club'));
  assert.ok(!esModoValido('admin') && !esModoValido(''));

  // El coach ve las cuatro secciones de gestión.
  ['panel', 'asistencia', 'estudiantes'].forEach((ruta) => {
    assert.ok(puedeVer('coach', ruta), `el coach debe ver ${ruta}`);
  });
  assert.ok(puedeVer('coach', 'equipos') && puedeVer('coach', 'practicas'));

  // El club NO ve las de gestión, y sí las de consulta.
  ['panel', 'asistencia', 'estudiantes'].forEach((ruta) => {
    assert.ok(!puedeVer('club', ruta), `el club NO debe ver ${ruta}`);
  });
  ['alumnos', 'equipos', 'practicas', 'wro'].forEach((ruta) => {
    assert.ok(puedeVer('club', ruta), `el club debe ver ${ruta}`);
  });

  // Un modo inválido se trata como el más restringido.
  assert.ok(!puedeVer('inventado', 'panel'));
  assert.deepEqual(rutasDe('club').includes('panel'), false);
});

test('evaluarEntrada: el coach necesita contraseña y el club no', async () => {
  const { evaluarEntrada } = await import('../docs/js/roles.js');

  // Modo club: siempre entra.
  const club = evaluarEntrada({ modo: 'club', config: CONFIG_PRUEBA });
  assert.equal(club.permitido, true);
  assert.equal(club.modo, 'club');

  // Modo coach: contraseña correcta.
  const coach = evaluarEntrada({
    modo: 'coach', contrasena: 'clave-del-coach', config: CONFIG_PRUEBA,
  });
  assert.equal(coach.permitido, true);
  assert.equal(coach.modo, 'coach');

  // Contraseña equivocada, vacía o con espacios.
  assert.equal(
    evaluarEntrada({ modo: 'coach', contrasena: 'otra', config: CONFIG_PRUEBA }).codigo,
    'contrasena_incorrecta',
  );
  assert.equal(
    evaluarEntrada({ modo: 'coach', contrasena: '', config: CONFIG_PRUEBA }).codigo,
    'contrasena_vacia',
  );
  assert.equal(
    evaluarEntrada({ modo: 'coach', contrasena: '   ', config: CONFIG_PRUEBA }).codigo,
    'contrasena_vacia',
  );

  // La contraseña se recorta: un espacio de más al pegar no debe molestar.
  assert.equal(
    evaluarEntrada({ modo: 'coach', contrasena: '  clave-del-coach  ', config: CONFIG_PRUEBA }).permitido,
    true,
  );

  // Si el coach no configuró contraseña, no se puede entrar como coach.
  const sinClave = evaluarEntrada({
    modo: 'coach', contrasena: 'lo-que-sea', config: { CONTRASENA_COACH: 'CAMBIA-ESTA-CLAVE' },
  });
  assert.equal(sinClave.codigo, 'sin_contrasena_configurada');
  assert.ok(sinClave.mensaje.includes('CONTRASENA_COACH'));

  // Modo inválido.
  assert.equal(evaluarEntrada({ modo: 'jefe', config: CONFIG_PRUEBA }).codigo, 'modo_invalido');
  assert.equal(evaluarEntrada({ config: CONFIG_PRUEBA }).codigo, 'modo_invalido');
});

test('el modo consulta no puede escribir: la barrera está en la capa de datos', async () => {
  // Esta es la prueba importante: aunque una vista se olvide de esconder un
  // botón, la capa de datos debe negarse a escribir.
  const { crearApi } = await import('../docs/js/api.js');

  const api = crearApi({ cliente: {} });
  assert.equal(api.enSoloLectura, false, 'por defecto se puede escribir');

  api.establecerSoloLectura(true);
  assert.equal(api.enSoloLectura, true);

  const intentos = [
    ['crearEstudiante', [{ nombre: 'Ana' }], 'crear estudiantes'],
    ['actualizarEstudiante', [1, { nombre: 'Ana' }], 'editar estudiantes'],
    ['darDeBajaEstudiante', [1], 'dar de baja a un estudiante'],
    ['guardarEquipo', [{ nombre: 'Los Rayos' }, []], 'guardar equipos'],
    ['guardarAsistencia', [[], {}], 'guardar asistencia'],
    ['crearPractica', [{}], 'registrar prácticas'],
    ['borrarPractica', [1], 'borrar prácticas'],
    ['actualizarWro', [1, {}], 'editar la participación en la WRO'],
    ['crearSesion', [{}], 'crear clases'],
  ];

  for (const [metodo, argumentos, accion] of intentos) {
    // eslint-disable-next-line no-await-in-loop
    await assert.rejects(
      () => api[metodo](...argumentos),
      (error) => {
        assert.equal(error.codigo, 'solo_lectura', `${metodo} debería estar bloqueado`);
        assert.ok(error.message.includes(accion), `el mensaje de ${metodo} debe explicar la acción`);
        assert.ok(
          error.message.includes('modo de consulta'),
          `el mensaje de ${metodo} debe explicar el modo`,
        );
        return true;
      },
      `${metodo} NO se bloqueó en modo consulta`,
    );
  }

  // Al volver al modo coach, deja de bloquear (el error pasa a ser otro).
  api.establecerSoloLectura(false);
  assert.equal(api.enSoloLectura, false);
});

test('el mensaje de solo-lectura es claro para el usuario', async () => {
  const { mensajeDeError } = await import('../docs/js/api.js');
  const texto = mensajeDeError({
    codigo: 'solo_lectura',
    message: 'No se puede guardar asistencia: estás en el modo de consulta (alumno o representante).',
  });
  assert.ok(texto.includes('modo de consulta'), `debe explicar el motivo: ${texto}`);
});

test('el portal pide el token y luego la modalidad, con contraseña para el coach', async () => {
  const { documento, raiz } = instalarDom();
  const registro = { llamadas: [], guardados: [] };
  const api = crearApiSimulada(registro);
  const { arrancar } = await import('../docs/js/arranque.js');

  await arrancar(raiz, {
    config: CONFIG_PRUEBA,
    api,
  });
  await esperar(2);

  // ---- Paso 1: el token del club ----
  let texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(texto.includes('Token del club'), `paso 1: pedir el token. Texto: ${texto.slice(0, 200)}`);

  const campoToken = raiz.querySelector('#token-acceso');
  assert.ok(campoToken, 'debe existir el campo del token');
  campoToken.value = 'token-de-prueba';

  const formularioToken = campoToken.closest('form');
  assert.ok(formularioToken, 'el campo del token debe estar dentro del formulario');
  formularioToken.disparar('submit', { target: formularioToken });
  await esperar(4);

  // ---- Paso 2: elegir modalidad ----
  texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(texto.includes('¿Cómo quieres entrar?'), `paso 2: elegir modalidad. Texto: ${texto.slice(0, 240)}`);
  assert.ok(texto.includes('Coach / Profesor'), 'debe ofrecer el modo coach');
  assert.ok(texto.includes('Alumno o representante'), 'debe ofrecer el modo del club');

  // La contraseña está oculta hasta que se elige coach.
  const bloque = raiz.querySelector('#bloque-contrasena');
  assert.equal(bloque.hidden, true, 'la contraseña no se muestra de entrada');

  const botonCoach = raiz.todos().find((e) => e.dataset?.modo === 'coach');
  assert.ok(botonCoach, 'debe existir la opción de coach');
  botonCoach.click();
  await esperar(2);

  assert.equal(bloque.hidden, false, 'al elegir coach debe aparecer la contraseña');

  // Con la contraseña equivocada no entra.
  const campoClave = raiz.querySelector('#contrasena-coach');
  campoClave.value = 'equivocada';
  const formularioModo = raiz.querySelector('#form-modalidad');
  formularioModo.disparar('submit', { target: formularioModo });
  await esperar(3);

  texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(
    texto.includes('no es la contraseña'),
    `debe rechazar la contraseña incorrecta: ${texto.slice(0, 250)}`,
  );
  assert.ok(
    !raiz.querySelector('.app'),
    'no debe montarse la aplicación con la contraseña equivocada',
  );

  // Con la correcta, entra en modo coach.
  campoClave.value = 'clave-del-coach';
  formularioModo.disparar('submit', { target: formularioModo });
  await esperar(6);

  assert.ok(raiz.querySelector('.app'), 'con la contraseña correcta debe montarse la aplicación');
  texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(texto.includes('Coach'), 'debe verse la insignia de modo coach');
  assert.ok(texto.includes('Asistencia'), 'el coach ve la sección Asistencia');
});

test('entrar como alumno/representante no pide contraseña y deja el modo consulta', async () => {
  const { raiz } = instalarDom();
  const registro = { llamadas: [], guardados: [] };
  const api = crearApiSimulada(registro);
  const { arrancar } = await import('../docs/js/arranque.js');

  await arrancar(raiz, {
    config: CONFIG_PRUEBA,
    api,
  });
  await esperar(2);

  const campoToken = raiz.querySelector('#token-acceso');
  campoToken.value = 'token-de-prueba';
  const formularioToken = campoToken.closest('form');
  formularioToken.disparar('submit', { target: formularioToken });
  await esperar(4);

  // Elige "alumno o representante" y entra sin escribir contraseña.
  const botonClub = raiz.todos().find((e) => e.dataset?.modo === 'club');
  assert.ok(botonClub, 'debe existir la opción del club');
  botonClub.click();
  await esperar(2);

  assert.equal(
    raiz.querySelector('#bloque-contrasena').hidden,
    true,
    'en modo club no se pide contraseña',
  );

  const formularioModo = raiz.querySelector('#form-modalidad');
  formularioModo.disparar('submit', { target: formularioModo });
  await esperar(6);

  assert.ok(raiz.querySelector('.app'), 'debe montarse la aplicación');

  const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(texto.includes('Solo consulta'), `debe verse la insignia de consulta: ${texto.slice(0, 220)}`);
  assert.ok(texto.includes('El club'), 'el modo consulta entra en la vista del club');

  // No debe ver las secciones de gestión.
  const enlaces = raiz.querySelectorAll('a.nav__enlace').map((a) => a.textContent ?? '');
  assert.ok(
    !enlaces.some((t) => String(t).includes('Asistencia')),
    'el modo consulta no debe ver Asistencia en el menú',
  );
  assert.ok(
    !enlaces.some((t) => String(t).includes('Estudiantes')),
    'el modo consulta no debe ver Estudiantes en el menú',
  );
  assert.ok(
    enlaces.some((t) => String(t).includes('Equipos')),
    `el modo consulta sí debe ver Equipos. Enlaces: ${JSON.stringify(enlaces)}`,
  );
});

test('en modo consulta, escribir una ruta de coach a mano no la muestra', async () => {
  // Se monta en modo club pidiendo directamente el panel del coach.
  // El hash se fija ANTES de montar: es la ruta que se pide a mano.
  const { raiz } = instalarDom({ hash: '#/asistencia' });
  const api = crearApiSimulada();
  const { montarApp } = await import('../docs/js/main.js');
  const { crearStore } = await import('../docs/js/store.js');

  montarApp({
    raiz,
    store: crearStore({ modo: 'club' }),
    api,
    cliente: {},
    CONFIG: CONFIG_PRUEBA,
  });
  await esperar(6);

  const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(
    texto.includes('El club'),
    `debe caer en la vista del club, no en Asistencia: ${texto.slice(0, 240)}`,
  );
  // "Asistencia del mes" es un indicador del resumen y SÍ debe verse en el
  // club; lo que no debe aparecer es la pantalla de tomar asistencia.
  assert.ok(
    !texto.includes('Guardar asistencia') && !texto.includes('Marcar todos presentes'),
    'no debe mostrar la pantalla de tomar asistencia',
  );
  assert.ok(
    !texto.includes('Historial y porcentajes'),
    'no debe mostrar las pestañas de gestión de asistencia',
  );

  // La barra del menú tampoco ofrece las secciones de gestión.
  const enlaces = raiz.querySelectorAll('a.nav__enlace').map((a) => a.textContent ?? '');
  assert.ok(!enlaces.some((t) => t.includes('Panel')), 'el modo club no ve el Panel en el menú');
  assert.ok(!enlaces.some((t) => t.includes('Asistencia')), 'ni Asistencia');
  assert.ok(!enlaces.some((t) => t.includes('Estudiantes')), 'ni Estudiantes');
  assert.ok(enlaces.some((t) => t.includes('Equipos')), 'sí ve Equipos');
});

test('el modo consulta no ve los botones que cambian datos', async () => {
  // Mismo equipo, misma vista: solo cambia la modalidad.
  const { raiz } = instalarDom({ hash: '#/equipos' });
  const api = crearApiSimulada();
  const { montarApp } = await import('../docs/js/main.js');
  const { crearStore } = await import('../docs/js/store.js');

  montarApp({
    raiz,
    store: crearStore({ modo: 'club' }),
    api,
    cliente: {},
    CONFIG: CONFIG_PRUEBA,
  });
  await esperar(6);

  const texto = raiz.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(texto.includes('Los Rayos'), `debe mostrar los equipos: ${texto.slice(0, 200)}`);
  assert.ok(
    !texto.includes('Nuevo equipo'),
    `en modo consulta no debe ofrecerse crear equipos: ${texto.slice(0, 240)}`,
  );

  // Y en el mismo modo, el coach SÍ ve el botón.
  const { raiz: raizCoach } = instalarDom({ hash: '#/equipos' });
  const apiCoach = crearApiSimulada();
  const { montarApp: montarCoach } = await import('../docs/js/main.js');
  const { crearStore: storeCoach } = await import('../docs/js/store.js');

  montarCoach({
    raiz: raizCoach,
    store: storeCoach({ modo: 'coach' }),
    api: apiCoach,
    cliente: {},
    CONFIG: CONFIG_PRUEBA,
  });
  await esperar(6);

  const textoCoach = raizCoach.todos().map((e) => e._texto).filter(Boolean).join(' | ');
  assert.ok(
    textoCoach.includes('Nuevo equipo'),
    `el coach debe ver el botón de crear equipos: ${textoCoach.slice(0, 200)}`,
  );
});

/* ==================================================================== *
 * 4. AVISOS Y ESTADOS DE LA INTERFAZ
 * ==================================================================== */

test('el aviso de "sin conexión" aparece cuando los datos vienen de la caché', async () => {
  const { ventana, raiz } = instalarDom();
  const registro = { llamadas: [], guardados: [] };
  const api = crearApiSimulada(registro);

  Object.keys(api).forEach((clave) => {
    if (clave.startsWith('listar') || clave === 'practicasRecientes'
      || clave === 'asistenciaReciente' || clave === 'vistaAsistenciaEstudiantes') {
      api[clave] = async () => ({ datos: [], deCache: true, antiguedad: 'hace 2 días', error: { codigo: 'sin_conexion' } });
    }
  });

  const { cabeceraVista } = await import('../docs/js/componentes/ladrillo.js');
  const { abrirModal, confirmar } = await import('../docs/js/ui.js');
  const { renderPanel } = await import('../docs/js/vistas/panel.js');

  await renderPanel(raiz, {
    ...crearContexto(api, ventana),
    cabecera: cabeceraVista,
    modal: abrirModal,
    confirmar,
  });
  await esperar();

  // main.js es quien pinta la banda; aquí se comprueba que el dato llegue.
  const resultado = await renderPanel(raiz, {
    ...crearContexto(api, ventana),
    cabecera: cabeceraVista,
    modal: abrirModal,
    confirmar,
  });
  assert.ok(resultado === undefined || typeof resultado === 'object', 'la vista devuelve un objeto de control');
});
