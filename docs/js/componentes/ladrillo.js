/**
 * componentes/ladrillo.js — Componentes visuales reutilizables.
 *
 * La identidad del proyecto viene de aquí: los "studs" de las piezas LEGO,
 * las insignias de estado y las tarjetas de indicadores.
 */

import { crear, icono, logotipo } from '../ui.js';
import {
  formatearDuracionCorta, formatearPuntaje, formatearPorcentaje, plural,
} from '../formato.js';

/* ------------------------------------------------------------------ *
 * ENCABEZADO Y NAVEGACIÓN
 * ------------------------------------------------------------------ */

export const RUTAS_NAV = [
  { ruta: 'panel', etiqueta: 'Panel', icono: 'panel', soloCoach: true },
  { ruta: 'asistencia', etiqueta: 'Asistencia', icono: 'asistencia', soloCoach: true },
  { ruta: 'estudiantes', etiqueta: 'Estudiantes', icono: 'estudiantes', soloCoach: true },
  { ruta: 'alumnos', etiqueta: 'El club', icono: 'estudiantes', soloClub: true },
  { ruta: 'equipos', etiqueta: 'Equipos', icono: 'equipos' },
  { ruta: 'practicas', etiqueta: 'Prácticas', icono: 'practicas' },
  { ruta: 'wro', etiqueta: 'WRO', icono: 'wro' },
];

/**
 * Navegación lateral (escritorio) o superior con desplazamiento (móvil).
 *
 * Los enlaces se filtran según la modalidad: el coach ve todo; los alumnos y
 * representantes solo las secciones de consulta. La regla se respeta también
 * si alguien escribe la ruta a mano (ver main.js).
 *
 * @param {string} rutaActiva
 * @param {object} opciones {
 *   nombreClub, tema, modo, alCambiarTema, alRespaldar, alCambiarModo, creditos
 * }
 */
export function navegacion(rutaActiva, opciones = {}) {
  const {
    nombreClub = 'Club de Robótica LEGO', tema = 'oscuro', modo = 'coach',
    alCambiarTema = null, alRespaldar = null, alCambiarModo = null, creditos = '',
  } = opciones;

  const esCoach = modo === 'coach';
  const visibles = RUTAS_NAV.filter((ruta) => (ruta.soloCoach ? esCoach : true)
    && (ruta.soloClub ? !esCoach : true));

  const enlaces = visibles.map((ruta) => crear('li', {}, [
    crear('a', {
      clase: 'nav__enlace',
      href: `#/${ruta.ruta}`,
      'aria-current': rutaActiva === ruta.ruta ? 'page' : null,
    }, [
      crear('span', { html: icono(ruta.icono, { tamano: 20, clase: 'nav__icono' }) }),
      crear('span', { texto: ruta.etiqueta }),
    ]),
  ]));

  return crear('nav', { clase: 'nav', 'aria-label': 'Secciones principales' }, [
    crear('a', {
      clase: 'nav__marca',
      href: esCoach ? '#/panel' : '#/alumnos',
      'aria-label': 'Ir al inicio',
    }, [
      crear('span', { html: logotipo(42) }),
      crear('span', {}, [
        crear('span', { clase: 'nav__nombre', texto: 'CoachPanel' }),
        crear('span', { clase: 'nav__sub', texto: nombreClub }),
      ]),
    ]),
    crear('div', { clase: 'nav__modo' }, [
      insigniaModo(modo),
    ]),
    crear('ul', { clase: 'nav__lista' }, enlaces),
    crear('div', { clase: 'nav__pie' }, [
      alCambiarTema
        ? crear('button', {
          clase: 'boton boton--fantasma boton--sm',
          type: 'button',
          onclick: alCambiarTema,
        }, [
          crear('span', { html: icono(tema === 'oscuro' ? 'sol' : 'luna', { tamano: 16, clase: 'boton__icono' }) }),
          crear('span', { texto: tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro' }),
        ])
        : null,
      alRespaldar
        ? crear('button', {
          clase: 'boton boton--fantasma boton--sm',
          type: 'button',
          onclick: alRespaldar,
        }, [
          crear('span', { html: icono('bajar', { tamano: 16, clase: 'boton__icono' }) }),
          crear('span', { texto: 'Descargar respaldo' }),
        ])
        : null,
      alCambiarModo
        ? crear('button', {
          clase: 'boton boton--fantasma boton--sm',
          type: 'button',
          onclick: alCambiarModo,
        }, [
          crear('span', { html: icono('usuario', { tamano: 16, clase: 'boton__icono' }) }),
          crear('span', { texto: 'Cambiar de modalidad' }),
        ])
        : null,
      creditos ? crear('span', { texto: creditos }) : null,
    ]),
  ]);
}

/** Insignia que deja claro con qué modalidad se está dentro. */
export function insigniaModo(modo) {
  const esCoach = modo === 'coach';
  return crear('span', {
    clase: `insignia ${esCoach ? 'insignia--cian' : 'insignia--ambar'}`,
    title: esCoach
      ? 'Modo coach: puedes editar todo'
      : 'Modo consulta: alumno o representante, solo lectura',
  }, [
    crear('span', { html: icono(esCoach ? 'usuario' : 'estudiantes', { tamano: 12 }) }),
    crear('span', { texto: esCoach ? 'Coach' : 'Solo consulta' }),
  ]);
}

/** Encabezado de una vista, con título, descripción y acciones. */
export function cabeceraVista({ titulo, descripcion = '', acciones = [] } = {}) {
  return crear('header', { clase: 'cabecera-vista' }, [
    crear('div', {}, [
      crear('h1', { texto: titulo }),
      descripcion ? crear('p', { texto: descripcion }) : null,
    ]),
    acciones.length ? crear('div', { clase: 'acciones' }, acciones) : null,
  ]);
}

/** Tarjeta contenedora con el borde de studs opcional. */
export function tarjeta({ titulo = '', contenido, acciones = [], studs = true, extraClase = null } = {}) {
  const elementos = [];
  if (titulo || acciones.length) {
    elementos.push(crear('div', { clase: 'tarjeta__titulo' }, [
      titulo ? crear('h2', { texto: titulo }) : crear('span'),
      acciones.length ? crear('div', { clase: 'acciones' }, acciones) : null,
    ]));
  }
  elementos.push(contenido);
  return crear('section', { clase: ['tarjeta', studs ? 'tarjeta--studs' : null, extraClase] }, elementos);
}

/* ------------------------------------------------------------------ *
 * TARJETAS DE INDICADORES
 * ------------------------------------------------------------------ */

/**
 * Tarjeta de indicador (KPI).
 * @param {object} opciones { etiqueta, valor, detalle, color, iconoNombre }
 */
export function kpi({ etiqueta, valor, detalle = '', color = 'var(--primario)', iconoNombre = 'info' } = {}) {
  return crear('article', { clase: 'kpi', estilo: { '--kpi-color': color } }, [
    crear('div', { clase: 'kpi__etiqueta' }, [
      crear('span', { html: icono(iconoNombre, { tamano: 14 }) }),
      crear('span', { texto: etiqueta }),
    ]),
    crear('div', { clase: 'kpi__valor', texto: valor }),
    detalle ? crear('div', { clase: 'kpi__detalle', texto: detalle }) : null,
  ]);
}

/** Indicador pequeño de estadística (etiqueta + valor numérico). */
export function metrica(etiqueta, valor) {
  return crear('div', {}, [
    crear('span', { clase: 'metrica__etiqueta', texto: etiqueta }),
    crear('span', { clase: 'metrica__valor', texto: valor }),
  ]);
}

/* ------------------------------------------------------------------ *
 * INSIGNIAS
 * ------------------------------------------------------------------ */

const ETIQUETAS_ESTADO = {
  presente: 'Presente',
  ausente: 'Ausente',
  tarde: 'Tarde',
  justificado: 'Justificado',
  no_participa: 'No participa',
  inscrito: 'Inscrito',
  participo: 'Participó',
  no_participo: 'No pudo participar',
};

/** Insignia de color según el estado (asistencia o WRO). */
export function insignia(estado, texto = null) {
  return crear('span', {
    clase: `insignia insignia--${estado ?? 'neutro'}`,
    texto: texto ?? ETIQUETAS_ESTADO[estado] ?? estado ?? '—',
  });
}

/** Punto de color identificador de un equipo (siempre el mismo para el mismo id). */
const COLORES_EQUIPO = [
  '#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#fb923c',
  '#60a5fa', '#f472b6', '#4ade80', '#facc15', '#fb7185',
];

export function colorEquipo(equipoId) {
  const id = Number(equipoId);
  if (!Number.isFinite(id)) return COLORES_EQUIPO[0];
  return COLORES_EQUIPO[Math.abs(id) % COLORES_EQUIPO.length];
}

export function puntoEquipo(equipoId) {
  return crear('span', {
    clase: 'punto-equipo',
    estilo: { background: colorEquipo(equipoId) },
    'aria-hidden': 'true',
  });
}

/** Nombre de equipo con su punto de color. */
export function nombreEquipo(equipo) {
  return crear('span', { clase: 'tabla__ahora', estilo: 'display:inline-flex;align-items:center;gap:.5rem' }, [
    puntoEquipo(equipo?.id ?? equipo?.equipoId ?? equipo?.equipo_id),
    crear('span', { texto: equipo?.nombre ?? equipo?.equipo ?? '—' }),
  ]);
}

/** Los studs de un equipo: uno lleno por integrante, vacíos hasta 3. */
export function studsIntegrantes(cantidad, maximo = 3) {
  return crear('div', {
    clase: 'studs',
    role: 'img',
    'aria-label': `${cantidad} de ${maximo} integrantes`,
  }, Array.from({ length: maximo }, (_, indice) => crear('span', {
    clase: ['stud', indice < cantidad ? 'stud--lleno' : null],
    texto: indice < cantidad ? '●' : '',
  })));
}

/* ------------------------------------------------------------------ *
 * TABLAS
 * ------------------------------------------------------------------ */

/**
 * Tabla de datos accesible.
 *
 * @param {object} opciones
 * @param {Array} opciones.columnas [{ clave, etiqueta, alinear, celda(fila), ancho }]
 * @param {Array} opciones.filas    Datos.
 * @param {string} opciones.titulo  Se usa como <caption> (lectores de pantalla).
 * @param {Node}   opciones.vacio   Qué mostrar si no hay filas.
 */
export function tabla({
  columnas = [], filas = [], titulo = '', vacio = null, alClicFila = null,
} = {}) {
  if (!filas.length) {
    return vacio ?? crear('div', { clase: 'vacio' }, [crear('p', { texto: 'No hay datos para mostrar.' })]);
  }

  const encabezados = columnas.map((columna) => crear('th', {
    scope: 'col',
    clase: columna.alinear === 'derecha' ? 'tabla__derecha' : (columna.alinear === 'centro' ? 'tabla__centro' : null),
    texto: columna.etiqueta,
  }));

  const cuerpo = filas.map((fila, indice) => crear('tr', {
    onclick: alClicFila ? () => alClicFila(fila, indice) : null,
    estilo: alClicFila ? 'cursor:pointer' : null,
  }, columnas.map((columna) => {
    const contenido = columna.celda ? columna.celda(fila, indice) : fila[columna.clave];
    return crear('td', {
      clase: [
        columna.alinear === 'derecha' ? 'tabla__derecha' : null,
        columna.alinear === 'centro' ? 'tabla__centro' : null,
        columna.numeros || columna.alinear === 'derecha' ? 'numero' : null,
      ],
      datos: columna.clave ? { columna: columna.clave } : null,
    }, contenido ?? '—');
  })));

  return crear('div', { clase: 'tabla-envoltura' }, [
    crear('table', { clase: 'tabla' }, [
      titulo ? crear('caption', { texto: titulo }) : null,
      crear('thead', {}, [crear('tr', {}, encabezados)]),
      crear('tbody', {}, cuerpo),
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * TARJETA DE EQUIPO
 * ------------------------------------------------------------------ */

/**
 * Tarjeta de un equipo con sus integrantes y mejores marcas.
 * @param {object} equipo  Con { id, nombre, equipo_integrantes, ... }
 * @param {object} opciones { integrantes: [{nombre, rol}], resumen, alEditar, alVerWro }
 */
export function tarjetaEquipo(equipo, opciones = {}) {
  const { integrantes = [], resumen = null, alEditar = null, alVerPracticas = null } = opciones;

  const listaIntegrantes = integrantes.length
    ? integrantes.map((integrante) => crear('div', { clase: 'equipo__integrante' }, [
      crear('span', { html: icono(integrante.rol === 'capitan' ? 'trofeo' : 'usuario', { tamano: 14 }) }),
      crear('span', { texto: integrante.nombre }),
      integrante.rol === 'capitan' ? insignia('cian', 'Capitán') : null,
      integrante.activo === false ? insignia('no_participa', 'De baja') : null,
    ]))
    : [crear('span', { clase: 'equipo__integrante', texto: 'Sin integrantes todavía' })];

  return crear('article', { clase: 'tarjeta tarjeta--studs equipo' }, [
    crear('div', { clase: 'equipo__cabecera' }, [
      crear('div', {}, [
        crear('h3', { clase: 'equipo__nombre' }, [
          puntoEquipo(equipo.id),
          crear('span', { texto: equipo.nombre, estilo: 'margin-left:.5rem' }),
        ]),
        equipo.categoria_wro
          ? crear('span', { clase: 'campo__ayuda', texto: equipo.categoria_wro })
          : null,
      ]),
      insignia(equipo.wro_estado ?? 'no_participa'),
    ]),
    studsIntegrantes(integrantes.length),
    crear('div', { clase: 'equipo__integrantes' }, listaIntegrantes),
    resumen
      ? crear('div', { clase: 'equipo__metricas' }, [
        metrica('Mejor tiempo', formatearDuracionCorta(resumen.mejor_duracion_ms)),
        metrica('Mejor puntaje', formatearPuntaje(resumen.mejor_puntaje)),
        metrica('Prácticas', formatearPuntaje(resumen.practicas ?? 0)),
      ])
      : null,
    (alEditar || alVerPracticas)
      ? crear('div', { clase: 'acciones' }, [
        alEditar
          ? crear('button', {
            clase: 'boton boton--sm boton--fantasma',
            type: 'button',
            onclick: () => alEditar(equipo),
          }, [
            crear('span', { html: icono('editar', { tamano: 14, clase: 'boton__icono' }) }),
            crear('span', { texto: 'Editar equipo' }),
          ])
          : null,
        alVerPracticas
          ? crear('button', {
            clase: 'boton boton--sm boton--fantasma',
            type: 'button',
            onclick: () => alVerPracticas(equipo),
          }, [
            crear('span', { html: icono('practicas', { tamano: 14, clase: 'boton__icono' }) }),
            crear('span', { texto: 'Ver prácticas' }),
          ])
          : null,
      ])
      : null,
  ]);
}

/* ------------------------------------------------------------------ *
 * FILA DE ASISTENCIA
 * ------------------------------------------------------------------ */

const ESTADOS_ASISTENCIA = ['presente', 'ausente', 'tarde', 'justificado'];
const LETRAS_ESTADO = { presente: 'P', ausente: 'A', tarde: 'T', justificado: 'J' };

/**
 * Fila para tomar asistencia: nombre + cuatro botones de estado.
 * Los botones son de 44 px de alto en móvil (objetivo táctil cómodo).
 */
export function filaAsistencia(estudiante, estado, alMarcar) {
  const botones = ESTADOS_ASISTENCIA.map((valor) => crear('button', {
    clase: 'boton-estado',
    type: 'button',
    datos: { estado: valor },
    'aria-pressed': estado === valor ? 'true' : 'false',
    'aria-label': `${ETIQUETAS_ESTADO[valor]} para ${estudiante.nombre}`,
    title: ETIQUETAS_ESTADO[valor],
    onclick: () => alMarcar(estudiante.estudianteId, valor),
  }, [
    crear('span', { clase: 'boton-estado__letra', texto: LETRAS_ESTADO[valor] }),
    crear('span', { estilo: 'display:none', texto: ETIQUETAS_ESTADO[valor], clase: 'boton-estado__texto' }),
  ]));

  // En pantallas grandes se muestra la palabra; en móvil, la letra.
  const media = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(min-width: 620px)')
    : null;
  const sincronizar = () => {
    const ancho = media?.matches ?? false;
    botones.forEach((boton) => {
      const letra = boton.querySelector('.boton-estado__letra');
      const texto = boton.querySelector('.boton-estado__texto');
      if (letra) letra.style.display = ancho ? 'none' : 'inline';
      if (texto) texto.style.display = ancho ? 'inline' : 'none';
    });
  };
  sincronizar();
  media?.addEventListener?.('change', sincronizar);

  return crear('div', {
    clase: 'fila-asistencia',
    datos: { estudiante: estudiante.estudianteId, estado: estado ?? '' },
  }, [
    crear('div', { clase: 'fila-asistencia__nombre' }, [
      crear('span', { html: icono('usuario', { tamano: 16 }), estilo: 'color:var(--texto-apagado)' }),
      crear('span', { texto: estudiante.nombre, title: estudiante.nombre }),
      estudiante.activo === false ? insignia('no_participa', 'De baja') : null,
    ]),
    crear('div', { clase: 'grupo-estados', role: 'group', 'aria-label': `Asistencia de ${estudiante.nombre}` }, botones),
  ]);
}

/* ------------------------------------------------------------------ *
 * BARRA DE RESUMEN DE ASISTENCIA
 * ------------------------------------------------------------------ */

/** Contadores de la sesión (presentes, ausentes, tarde, justificados, sin marcar). */
export function contadoresAsistencia(conteo) {
  const partes = [
    { etiqueta: 'Presentes', valor: conteo.presente, color: 'var(--presente)' },
    { etiqueta: 'Ausentes', valor: conteo.ausente, color: 'var(--ausente)' },
    { etiqueta: 'Tarde', valor: conteo.tarde, color: 'var(--tarde)' },
    { etiqueta: 'Justificados', valor: conteo.justificado, color: 'var(--justificado)' },
    { etiqueta: 'Sin marcar', valor: conteo.sin_marcar, color: 'var(--texto-apagado)' },
  ];

  return crear('div', { clase: 'contadores' }, partes.map((parte) => crear('div', { clase: 'contador' }, [
    crear('strong', { texto: String(parte.valor), estilo: { color: parte.color } }),
    crear('span', { texto: parte.etiqueta }),
  ])));
}

/** Texto de porcentaje con color según qué tan bien va. */
export function porcentajeAsistencia(valor) {
  if (valor === null || valor === undefined) {
    return crear('span', { clase: 'numero', texto: '—', title: 'Todavía no hay clases registradas' });
  }
  const numero = Number(valor);
  const color = numero >= 85 ? 'var(--verde)' : (numero >= 70 ? 'var(--ambar)' : 'var(--rojo)');
  return crear('span', { clase: 'numero', estilo: { color, fontWeight: '700' }, texto: formatearPorcentaje(numero) });
}

/** Conteo con plural correcto. */
export function conteoTexto(cantidad, singular, pluralTexto) {
  return plural(Number(cantidad ?? 0), singular, pluralTexto);
}

/** Fila de texto seguro (nunca interpreta HTML del contenido). */
export function texto(valor, porDefecto = '—') {
  const contenido = valor === null || valor === undefined || valor === '' ? porDefecto : String(valor);
  return crear('span', { texto: contenido });
}
