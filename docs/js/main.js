/**
 * main.js — Cascarón de la aplicación y enrutador por hash.
 *
 * Rutas:
 *   #/panel         Resumen general
 *   #/asistencia    Tomar asistencia e historial
 *   #/estudiantes   Catálogo de niños y niñas
 *   #/equipos       Equipos e integrantes
 *   #/practicas     Prácticas de pista
 *   #/wro           Participación en la WRO Venezuela
 *
 * Se usa hash (#) a propósito: funciona igual en un servidor local que en
 * GitHub Pages, donde no se puede configurar reescritura de rutas.
 */

import { crear, limpiar, banda, abrirModal, confirmar, avisoOk, avisoError, avisoAtencion, descargar, aCsv } from './ui.js';
import { navegacion, cabeceraVista } from './componentes/ladrillo.js';
import { alternarTema } from './store.js';

import { renderPanel } from './vistas/panel.js';
import { renderAsistencia } from './vistas/asistencia.js';
import { renderEstudiantes } from './vistas/estudiantes.js';
import { renderEquipos } from './vistas/equipos.js';
import { renderPracticas } from './vistas/practicas.js';
import { renderWro } from './vistas/wro.js';
import { renderAlumnos } from './vistas/alumnos.js';
import { puedeEditar, puedeVer, rutasDe, MENSAJE_SOLO_CONSULTA, ETIQUETAS_MODO } from './roles.js';

export const VISTAS = {
  panel: { titulo: 'Panel', render: renderPanel, soloCoach: true },
  asistencia: { titulo: 'Asistencia', render: renderAsistencia, soloCoach: true },
  estudiantes: { titulo: 'Estudiantes', render: renderEstudiantes, soloCoach: true },
  alumnos: { titulo: 'El club', render: renderAlumnos, soloClub: true },
  equipos: { titulo: 'Equipos', render: renderEquipos },
  practicas: { titulo: 'Prácticas', render: renderPracticas },
  wro: { titulo: 'WRO Venezuela', render: renderWro },
};

export const RUTA_INICIAL = 'panel';

/** Lee la ruta actual del hash. Devuelve { ruta, parametros }. */
export function leerRuta(hash = '', modo = 'coach') {
  const limpio = String(hash ?? '').replace(/^#\/?/, '');
  const [rutaCruda, consulta = ''] = limpio.split('?');
  const cruda = rutaCruda.replace(/\/+$/, '').trim();

  const parametros = {};
  if (consulta) {
    consulta.split('&').forEach((par) => {
      const [clave, valor = ''] = par.split('=');
      if (clave) parametros[decodeURIComponent(clave)] = decodeURIComponent(valor);
    });
  }

  // Ruta inicial según la modalidad: el coach cae en el Panel, los alumnos y
  // representantes en la vista del club.
  const inicio = modo === 'coach' ? RUTA_INICIAL : 'alumnos';

  // Una ruta que existe pero que esta modalidad no puede ver cae al inicio.
  const permitida = cruda
    && VISTAS[cruda]
    && (modo === 'coach' ? VISTAS[cruda].soloClub !== true : VISTAS[cruda].soloCoach !== true);

  return { ruta: permitida ? cruda : inicio, parametros };
}

/** Cambia de vista. */
export function navegar(ruta) {
  const destino = `#/${ruta}`;
  if (window.location.hash === destino) return;
  window.location.hash = destino;
}

/**
 * Monta la aplicación completa.
 * @param {object} opciones {
 *   raiz, store, api, cliente, CONFIG, alOlvidarAcceso, alCambiarModo
 * }
 */
export function montarApp({
  raiz, store, api, cliente, CONFIG, alOlvidarAcceso = null, alCambiarModo = null,
}) {
  let limpiarVistaActual = null;
  let rutaActual = null;

  /** Modalidad activa: 'coach' edita; 'club' solo consulta. */
  const modo = () => store.obtener('modo') ?? 'coach';
  const esCoach = () => puedeEditar(modo());

  /** Bloquea una acción de escritura en modo consulta y explica por qué. */
  function permitirEdicion() {
    if (esCoach()) return true;
    avisoAtencion(MENSAJE_SOLO_CONSULTA, { duracion: 7000 });
    return false;
  }

  // ------------------------------------------------------------------
  // Contexto que recibe cada vista
  // ------------------------------------------------------------------
  const contexto = {
    api,
    cliente,
    store,
    CONFIG,
    navegar,
    /** Encabezado estándar de una vista. */
    cabecera: cabeceraVista,
    /** Modalidad activa y sus permisos, para que las vistas se adapten. */
    modo,
    esCoach,
    permitirEdicion,
    /** Acceso rápido a los catálogos que casi todas las vistas necesitan. */
    async cargarCatalogos({ estudiantes = true, equipos = true, retos = false } = {}) {
      const tareas = [];
      if (estudiantes) tareas.push(api.listarEstudiantes({ incluirInactivos: true }).then((r) => {
        store.establecer({ estudiantes: r.datos });
        return r;
      }));
      if (equipos) tareas.push(api.listarEquipos({ incluirInactivos: true }).then((r) => {
        store.establecer({ equipos: r.datos });
        return r;
      }));
      if (retos) tareas.push(api.listarRetos().then((r) => {
        store.establecer({ retos: r.datos });
        return r;
      }));

      const resultados = await Promise.all(tareas);
      return {
        estudiantes: store.obtener('estudiantes'),
        equipos: store.obtener('equipos'),
        retos: store.obtener('retos'),
        deCache: resultados.some((r) => r?.deCache),
        antiguedad: resultados.map((r) => r?.antiguedad).find(Boolean) ?? null,
      };
    },
    /** Modal de uso general desde las vistas. */
    modal: abrirModal,
    confirmar,
    avisoOk,
    avisoError,
    avisoAtencion,
    descargar,
    aCsv,
    /** Descarga un respaldo completo de la base. */
    async respaldar() {
      avisoAtencion('Preparando el respaldo… esto puede tardar unos segundos.', { duracion: 3000 });
      try {
        const datos = await api.exportarTodo();
        const marca = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        descargar(`coachpanel-respaldo-${marca}.json`, datos);
        avisoOk('Respaldo descargado. Guárdalo en un lugar seguro.', { duracion: 7000 });
      } catch (error) {
        avisoError(`No se pudo generar el respaldo: ${error.message}`);
      }
    },
  };

  // ------------------------------------------------------------------
  // Estructura: navegación + contenido
  // ------------------------------------------------------------------
  const contenedorNav = crear('div', { clase: 'app__nav' });
  const contenedorVistas = crear('main', { clase: 'contenido', id: 'contenido', tabindex: '-1' });
  const app = crear('div', { clase: 'app' });

  limpiar(raiz);
  app.append(contenedorNav, contenedorVistas);
  raiz.append(app);

  function pintarNav() {
    limpiar(contenedorNav);
    contenedorNav.append(navegacion(rutaActual ?? RUTA_INICIAL, {
      nombreClub: store.obtener('nombreClub'),
      tema: store.obtener('tema'),
      modo: modo(),
      creditos: CONFIG.CREDITOS || '',
      alCambiarTema: criarCambiarTema(),
      alRespaldar: esCoach() ? () => contexto.respadar() : null,
      alCambiarModo: alCambiarModo ? criarCambiarModo() : null,
    }));
  }

  /** Vuelve al portal de acceso para elegir otra modalidad. */
  function criarCambiarModo() {
    return async () => {
      const seguro = await confirmar({
        titulo: '¿Cambiar de modalidad?',
        mensaje: esCoach()
          ? 'Saldrás del modo coach y volverás al portal para elegir cómo entrar.'
          : 'Volverás al portal para elegir cómo entrar.',
        textoConfirmar: 'Cambiar',
      });
      if (!seguro) return;
      alOlvidarAcceso?.();
      alCambiarModo();
    };
  }

  function criarCambiarTema() {
    return () => {
      const nuevo = alternarTema(store.obtener('tema'));
      store.establecer({ tema: nuevo });
      pintarNav();
    };
  }

  /** Muestra el aviso de "sin conexión" cuando corresponde. */
  function bandaSinConexion(antiguedad) {
    if (!antiguedad) return null;
    return banda({
      tipo: 'sin-conexion',
      iconoNombre: 'wifi',
      texto: `Sin conexión con la base de datos: te muestro la última información guardada (${antiguedad}). `
        + 'Los cambios que intentes guardar ahora no se podrán enviar.',
    });
  }

  // ------------------------------------------------------------------
  // Enrutado
  // ------------------------------------------------------------------
  async function mostrarVista() {
    const { ruta, parametros } = leerRuta(window.location.hash, modo());
    const cambio = ruta !== rutaActual;
    rutaActual = ruta;
    store.establecer({ rutaActiva: ruta }, { silencioso: true });
    pintarNav();

    if (typeof limpiarVistaActual === 'function') {
      try {
        limpiarVistaActual();
      } catch (error) {
        console.error('Error al desmontar la vista anterior:', error);
      }
      limpiarVistaActual = null;
    }

    limpiar(contenedorVistas);

    const definicion = VISTAS[ruta];
    const envoltorio = crear('div', { clase: 'vista' });
    contenedorVistas.append(envoltorio);

    // Red de seguridad: si alguien escribe a mano una ruta de coach estando en
    // modo consulta, se le manda a su inicio en vez de mostrarle la sección.
    if (!puedeVer(modo(), ruta)) {
      envoltorio.append(crear('div', { clase: 'tarjeta tarjeta--studs' }, [
        crear('h1', { texto: 'Esa sección es solo para el coach' }),
        crear('p', {
          texto: `Estás entrando como ${ETIQUETAS_MODO[modo()] ?? 'consulta'}. `
            + 'Desde aquí puedes consultar los equipos, las prácticas y la WRO.',
        }),
        crear('div', { clase: 'acciones' }, [
          crear('button', {
            clase: 'boton boton--primario',
            type: 'button',
            texto: 'Ir a El club',
            onclick: () => navegar('alumnos'),
          }),
        ]),
      ]));
      if (cambio) contenedorNav.scrollIntoView?.({ block: 'nearest' });
      return;
    }

    try {
      const resultado = await definicion.render(envoltorio, { ...contexto, parametros });

      if (resultado && typeof resultado === 'object') {
        if (typeof resultado.destruir === 'function') limpiarVistaActual = resultado.destruir;
        if (resultado.antiguedad) {
          envoltorio.prepend(bandaSinConexion(resultado.antiguedad));
        }
      }
    } catch (error) {
      console.error(`Error al pintar la vista "${ruta}":`, error);
      limpiar(envoltorio);
      envoltorio.append(
        crear('div', { clase: 'tarjeta tarjeta--studs' }, [
          crear('h1', { texto: 'No se pudo abrir esta sección' }),
          crear('p', { texto: error?.message ?? 'Ocurrió un error inesperado.' }),
          crear('div', { clase: 'acciones' }, [
            crear('button', {
              clase: 'boton boton--primario',
              type: 'button',
              texto: 'Volver al panel',
              onclick: () => navegar('panel'),
            }),
            crear('button', {
              clase: 'boton boton--fantasma',
              type: 'button',
              texto: 'Reintentar',
              onclick: () => mostrarVista(),
            }),
          ]),
        ]),
      );
    }

    if (cambio) {
      contenedorVistas.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  window.addEventListener('hashchange', mostrarVista);

  // Ruta inicial según la modalidad: el coach al Panel, el club a El club.
  const inicio = esCoach() ? RUTA_INICIAL : 'alumnos';

  if (!window.location.hash) {
    window.location.hash = `#/${inicio}`;
  } else {
    mostrarVista();
  }

  return {
    actualizar: mostrarVista,
    navegar,
    destruir() {
      window.removeEventListener('hashchange', mostrarVista);
      if (typeof limpiarVistaActual === 'function') limpiarVistaActual();
    },
  };
}

/** Punto de entrada: `arranque.js` llama a `montarApp` cuando ya hay acceso. */
