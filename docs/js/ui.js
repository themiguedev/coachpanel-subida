/**
 * ui.js — Utilidades de interfaz: creación de elementos, iconos, modal,
 * avisos (toasts), esqueletos y estados vacíos.
 *
 * Sin dependencias. Todo el HTML se construye con `crear()` en vez de
 * concatenar cadenas, para no abrir la puerta a inyección de HTML con los
 * nombres que escribe el coach.
 */

/* ------------------------------------------------------------------ *
 * CREACIÓN DE ELEMENTOS
 * ------------------------------------------------------------------ */

/**
 * Crea un elemento del DOM.
 *
 *   crear('div', { clase: 'tarjeta' }, [ 'Hola' ])
 *
 * Claves especiales: clase/className, texto, html, datos, estilo, y
 * cualquier atributo normal (id, type, aria-*, on…). Los valores null o
 * undefined se ignoran, así se puede escribir `activo && ...` tranquilo.
 */
export function crear(etiqueta, atributos = {}, hijos = []) {
  const elemento = document.createElement(etiqueta);

  Object.entries(atributos ?? {}).forEach(([clave, valor]) => {
    if (valor === null || valor === undefined || valor === false) return;

    if (clave === 'clase' || clave === 'claseName' || clave === 'className') {
      elemento.className = Array.isArray(valor) ? valor.filter(Boolean).join(' ') : String(valor);
      return;
    }
    if (clave === 'texto' || clave === 'textContent') {
      elemento.textContent = String(valor);
      return;
    }
    if (clave === 'html') {
      elemento.innerHTML = String(valor);
      return;
    }
    if (clave === 'datos' || clave === 'dataset') {
      Object.entries(valor).forEach(([dato, contenido]) => {
        if (contenido !== null && contenido !== undefined) {
          elemento.dataset[dato] = String(contenido);
        }
      });
      return;
    }
    if (clave === 'estilo') {
      if (typeof valor === 'string') elemento.setAttribute('style', valor);
      else Object.assign(elemento.style, valor);
      return;
    }
    if (clave.startsWith('on') && typeof valor === 'function') {
      elemento.addEventListener(clave.slice(2).toLowerCase(), valor);
      return;
    }
    if (valor === true) {
      elemento.setAttribute(clave, '');
      return;
    }
    elemento.setAttribute(clave, String(valor));
  });

  agregarHijos(elemento, hijos);
  return elemento;
}

/** Añade hijos (nodos, texto o arreglos anidados) a un elemento. */
export function agregarHijos(padre, hijos) {
  const lista = Array.isArray(hijos) ? hijos : [hijos];
  lista.flat(4).forEach((hijo) => {
    if (hijo === null || hijo === undefined || hijo === false) return;
    padre.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  });
  return padre;
}

/** Vacía un elemento. */
export function limpiar(elemento) {
  while (elemento.firstChild) elemento.removeChild(elemento.firstChild);
  return elemento;
}

/** Reemplaza el contenido de un elemento. */
export function reemplazar(elemento, ...contenido) {
  limpiar(elemento);
  agregarHijos(elemento, contenido);
  return elemento;
}

/** Atajo: fragmento de documento. */
export function fragmento(hijos = []) {
  const fragmentoDoc = document.createDocumentFragment();
  agregarHijos(fragmentoDoc, hijos);
  return fragmentoDoc;
}

/* ------------------------------------------------------------------ *
 * ICONOS (SVG en línea, sin librerías)
 * ------------------------------------------------------------------ */

const TRAYECTOS = {
  panel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  asistencia: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  estudiantes: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  equipos: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  practicas: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/>',
  wro: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  editar: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  bajar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  imprimir: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  luna: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  alerta: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  ok: '<path d="M20 6L9 17l-5-5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M12 20h.01"/>',
  usuario: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  cerrar: '<path d="M18 6L6 18M6 6l12 12"/>',
  reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  trofeo: '<path d="M6 9a6 6 0 0 0 12 0V3H6z"/><path d="M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3"/><path d="M9 21h6M12 15v6"/>',
};

/** Devuelve el SVG de un icono como cadena (para usar con { html: icono(...) }). */
export function icono(nombre, { tamano = 20, clase = 'icono' } = {}) {
  const trayecto = TRAYECTOS[nombre] ?? TRAYECTOS.info;
  return `<svg class="${clase}" width="${tamano}" height="${tamano}" viewBox="0 0 24 24" fill="none" `
    + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
    + `aria-hidden="true" focusable="false">${trayecto}</svg>`;
}

/** El isotipo de la app: una pieza LEGO con un engrane dentro. */
export function logotipo(tamano = 42) {
  return `<svg class="nav__logo" width="${tamano}" height="${tamano}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="gradLadrillo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#22d3ee"/>
        <stop offset="100%" stop-color="#a78bfa"/>
      </linearGradient>
    </defs>
    <rect x="4" y="14" width="40" height="26" rx="6" fill="url(#gradLadrillo)"/>
    <rect x="4" y="14" width="40" height="26" rx="6" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
    <circle cx="14" cy="11" r="4.5" fill="url(#gradLadrillo)"/>
    <circle cx="24" cy="11" r="4.5" fill="url(#gradLadrillo)"/>
    <circle cx="34" cy="11" r="4.5" fill="url(#gradLadrillo)"/>
    <circle cx="24" cy="27" r="6" fill="none" stroke="#0b1220" stroke-width="2.5"/>
    <circle cx="24" cy="27" r="2.2" fill="#0b1220"/>
    <path d="M24 19v2.5M24 32.5V35M16 27h2.5M29.5 27H32" stroke="#0b1220" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

/* ------------------------------------------------------------------ *
 * AVISOS (TOASTS)
 * ------------------------------------------------------------------ */

let capaAvisos = null;

function obtenerCapaAvisos() {
  if (capaAvisos && document.body.contains(capaAvisos)) return capaAvisos;
  capaAvisos = document.getElementById('avisos') ?? crear('div', {
    id: 'avisos', clase: 'avisos', role: 'status', 'aria-live': 'polite',
  });
  if (!document.body.contains(capaAvisos)) document.body.append(capaAvisos);
  return capaAvisos;
}

const TITULOS_AVISO = {
  ok: 'Listo',
  error: 'Ups',
  aviso: 'Atención',
  info: 'Información',
};

/**
 * Muestra un aviso flotante.
 *
 * @param {string} mensaje
 * @param {object} opciones { tipo: 'ok'|'error'|'aviso'|'info', titulo, duracion, accion }
 *   `accion` es { texto, alHacer } para ofrecer "Deshacer".
 */
export function aviso(mensaje, opciones = {}) {
  const {
    tipo = 'info', titulo = null, duracion = 5000, accion = null,
  } = opciones;

  const capa = obtenerCapaAvisos();
  const elemento = crear('div', { clase: `aviso aviso--${tipo}`, role: 'alert' }, [
    crear('div', { clase: 'aviso__texto' }, [
      crear('strong', { clase: 'aviso__titulo', texto: titulo ?? TITULOS_AVISO[tipo] ?? 'Aviso' }),
      crear('span', { texto: mensaje }),
    ]),
    accion
      ? crear('button', {
        clase: 'boton boton--sm boton--fantasma',
        type: 'button',
        texto: accion.texto,
        onclick: () => {
          accion.alHacer?.();
          elemento.remove();
        },
      })
      : null,
    crear('button', {
      clase: 'boton-cerrar',
      type: 'button',
      'aria-label': 'Cerrar aviso',
      texto: '×',
      onclick: () => elemento.remove(),
    }),
  ]);

  capa.append(elemento);

  if (duracion > 0) {
    setTimeout(() => {
      elemento.style.transition = 'opacity 200ms';
      elemento.style.opacity = '0';
      setTimeout(() => elemento.remove(), 220);
    }, duracion);
  }

  return elemento;
}

export const avisoOk = (mensaje, opciones = {}) => aviso(mensaje, { ...opciones, tipo: 'ok' });
export const avisoError = (mensaje, opciones = {}) => aviso(mensaje, { ...opciones, tipo: 'error', duracion: 9000 });
export const avisoAtencion = (mensaje, opciones = {}) => aviso(mensaje, { ...opciones, tipo: 'aviso' });
export const avisoInfo = (mensaje, opciones = {}) => aviso(mensaje, { ...opciones, tipo: 'info' });

/** Muestra el error de una operación con el mensaje ya traducido del backend. */
export function avisoDeError(error, contexto = '') {
  const mensaje = error?.message ?? 'Ocurrió un error inesperado.';
  return avisoError(contexto ? `${contexto} ${mensaje}` : mensaje);
}

/* ------------------------------------------------------------------ *
 * MODAL
 * ------------------------------------------------------------------ */

const FOCO_ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Abre un modal accesible (con trampa de foco y cierre con Escape).
 *
 * @param {object} opciones
 * @param {string} opciones.titulo
 * @param {Node|Array} opciones.contenido
 * @param {Array} [opciones.pie]        Botones del pie.
 * @param {boolean} [opciones.ancho]    Modal más ancho.
 * @param {Element} [opciones.retorno]  Elemento que recupera el foco al cerrar.
 * @returns {{ cerrar: Function, elemento: HTMLElement, cuerpo: HTMLElement }}
 */
export function abrirModal({
  titulo, contenido, pie = null, ancho = false, retorno = null, alCerrar = null,
} = {}) {
  const anteriorActivo = retorno ?? document.activeElement;
  const idTitulo = `titulo-modal-${Math.random().toString(36).slice(2, 8)}`;

  const cuerpo = crear('div', { clase: 'modal__cuerpo' }, contenido);

  const caja = crear('div', {
    clase: ['modal', ancho ? 'modal--ancho' : null],
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': idTitulo,
  }, [
    crear('div', { clase: 'modal__cabecera' }, [
      crear('h2', { id: idTitulo, texto: titulo ?? '' }),
      crear('button', {
        clase: 'boton-cerrar',
        type: 'button',
        'aria-label': 'Cerrar',
        texto: '×',
        onclick: () => cerrar(),
      }),
    ]),
    cuerpo,
    pie ? crear('div', { clase: 'modal__pie' }, pie) : null,
  ]);

  const velo = crear('div', { clase: 'modal-velo' }, [caja]);

  function alTeclear(evento) {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      cerrar();
      return;
    }
    if (evento.key !== 'Tab') return;

    // Trampa de foco: el tabulador no debe salir del modal.
    const enfocables = [...caja.querySelectorAll(FOCO_ENFOCABLES)].filter((el) => el.offsetParent !== null);
    if (enfocables.length === 0) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];

    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  let cerrado = false;
  function cerrar() {
    if (cerrado) return;
    cerrado = true;
    document.removeEventListener('keydown', alTeclear, true);
    velo.remove();
    if (!document.querySelector('.modal-velo')) document.body.style.overflow = '';
    alCerrar?.();
    if (anteriorActivo && typeof anteriorActivo.focus === 'function') {
      anteriorActivo.focus();
    }
  }

  velo.addEventListener('mousedown', (evento) => {
    if (evento.target === velo) cerrar();
  });

  document.addEventListener('keydown', alTeclear, true);
  document.body.append(velo);
  document.body.style.overflow = 'hidden';

  const primerCampo = cuerpo.querySelector(FOCO_ENFOCABLES);
  (primerCampo ?? caja).focus?.();

  return { cerrar, elemento: caja, cuerpo };
}

/** Modal de confirmación. Devuelve una promesa que resuelve a true o false. */
export function confirmar({
  titulo = '¿Seguro?',
  mensaje = '',
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligro = false,
} = {}) {
  return new Promise((resolver) => {
    let decidido = false;

    const modal = abrirModal({
      titulo,
      contenido: crear('p', { texto: mensaje, estilo: 'margin:0' }),
      pie: [
        crear('button', {
          clase: 'boton boton--fantasma',
          type: 'button',
          texto: textoCancelar,
          onclick: () => terminar(false),
        }),
        crear('button', {
          clase: ['boton', peligro ? 'boton--peligro' : 'boton--primario'],
          type: 'button',
          texto: textoConfirmar,
          onclick: () => terminar(true),
        }),
      ],
      alCerrar: () => { if (!decidido) resolver(false); },
    });

    function terminar(valor) {
      decidido = true;
      modal.cerrar();
      resolver(valor);
    }
  });
}

/* ------------------------------------------------------------------ *
 * ESTADOS DE CARGA Y VACÍOS
 * ------------------------------------------------------------------ */

/** Esqueleto de carga para tarjetas de indicadores. */
export function esqueletoKpis(cantidad = 4) {
  return crear('div', { clase: 'rejilla rejilla--kpi', 'aria-busy': 'true' }, Array.from(
    { length: cantidad },
    () => crear('div', { clase: 'esqueleto esqueleto--kpi' }),
  ));
}

/** Esqueleto de carga para listas o tablas. */
export function esqueletoFilas(cantidad = 6) {
  return crear('div', { 'aria-busy': 'true', 'aria-label': 'Cargando' }, Array.from(
    { length: cantidad },
    () => crear('div', { clase: 'esqueleto esqueleto--fila' }),
  ));
}

/** Estado vacío con llamada a la acción. */
export function estadoVacio({ titulo, texto, accion = null, iconoNombre = 'equipos' } = {}) {
  return crear('div', { clase: 'vacio' }, [
    crear('div', { html: icono(iconoNombre, { tamano: 40 }), estilo: 'color: var(--texto-apagado)' }),
    crear('div', { clase: 'vacio__titulo', texto: titulo }),
    texto ? crear('p', { clase: 'vacio__texto', texto: texto }) : null,
    accion ?? null,
  ]);
}

/** Banda de aviso (sin conexión, falta configurar, etc.). */
export function banda({ texto, tipo = 'info', iconoNombre = 'alerta', extra = null } = {}) {
  return crear('div', { clase: `banda banda--${tipo}`, role: 'status' }, [
    crear('span', { html: icono(iconoNombre, { tamano: 18 }) }),
    crear('span', { texto, estilo: 'flex:1 1 auto' }),
    extra,
  ]);
}

/* ------------------------------------------------------------------ *
 * AYUDAS DIVERSAS
 * ------------------------------------------------------------------ */

/** Programa una función para que no se ejecute en cada tecla. */
export function retrasar(fn, ms = 250) {
  let temporizador = null;
  return (...argumentos) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...argumentos), ms);
  };
}

/** Descarga un archivo generado en el navegador. */
export function descargar(nombreArchivo, contenido, tipoMime = 'application/json') {
  const datos = typeof contenido === 'string' ? contenido : JSON.stringify(contenido, null, 2);
  const blob = new Blob([datos], { type: `${tipoMime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const enlace = crear('a', { href: url, download: nombreArchivo });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convierte una lista de objetos a CSV (para respaldo y reportes). */
export function aCsv(filas, columnas = null) {
  if (!Array.isArray(filas) || filas.length === 0) return '';
  const claves = columnas ?? [...new Set(filas.flatMap((f) => Object.keys(f ?? {})))];

  const escapar = (valor) => {
    if (valor === null || valor === undefined) return '';
    const texto = String(valor);
    return /[",;\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  const lineas = [claves.join(';')];
  filas.forEach((fila) => {
    lineas.push(claves.map((clave) => escapar(fila?.[clave])).join(';'));
  });
  // BOM para que Excel abra bien los acentos.
  return `\uFEFF${lineas.join('\r\n')}`;
}

/** Lee un archivo elegido por el usuario como texto. */
export function leerArchivo(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result ?? ''));
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
    lector.readAsText(archivo);
  });
}

export { icono as svg };
