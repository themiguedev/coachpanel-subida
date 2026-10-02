/**
 * estadisticas.js — Cálculos de las prácticas de robótica.
 *
 * Lógica pura (sin DOM ni red) para poder probarla con `node --test`.
 *
 * Reglas de negocio:
 *   · "Mejor tiempo" es el MENOR `duracion_ms` (en la pista, menos es mejor).
 *   · "Mejor puntaje" es el MAYOR `puntaje`.
 *   · Una práctica sin tiempo (solo puntaje) NO participa en las
 *     estadísticas de tiempo, pero sí en las de puntaje.
 *   · La mediana se usa para representar "lo típico" mejor que el promedio,
 *     porque un intento fallido (0 puntos) distorsiona el promedio.
 */

import { formatearDuracion, formatearDuracionCorta, formatearPuntaje, formatearPorcentaje } from './formato.js';

/**
 * @typedef {object} Practica
 * @property {number} id
 * @property {string} fecha            'YYYY-MM-DD'
 * @property {number} equipo_id
 * @property {number} intento
 * @property {number|null} reto_id
 * @property {number|null} duracion_ms
 * @property {number} puntaje
 * @property {string|null} observaciones
 */

/** ¿La práctica tiene tiempo registrado? */
export function tieneTiempo(practica) {
  const valor = practica?.duracion_ms ?? practica?.duracionMs;
  return valor !== null && valor !== undefined && Number.isFinite(Number(valor));
}

/** Ordena prácticas: la más reciente primero; a igualdad de fecha, mayor intento primero. */
export function ordenarPracticas(practicas = []) {
  return [...practicas].sort((a, b) => {
    const fecha = String(b.fecha ?? '').localeCompare(String(a.fecha ?? ''));
    if (fecha !== 0) return fecha;
    return Number(b.intento ?? 0) - Number(a.intento ?? 0);
  });
}

/* ------------------------------------------------------------------ *
 * GRÁFICO DE BARRAS EN SVG (sin librerías)
 * ------------------------------------------------------------------ */

/**
 * Genera un gráfico de barras de porcentajes en SVG.
 *
 * Se usa SVG y no canvas porque se ve nítido al imprimir y al hacer zoom, y
 * porque se puede construir con nodos del DOM (nada de innerHTML).
 *
 * @param {Array} puntos [{ etiqueta, porcentaje, cantidad }]
 * @param {object} opciones { ancho, alto, titulo, descripcion }
 */
export function graficoBarrasSvg(puntos = [], opciones = {}) {
  const { ancho = 640, alto = 200, titulo = '', descripcion = '' } = opciones;
  const margen = { arriba: 24, derecha: 8, abajo: 34, izquierda: 34 };
  const areaAncho = ancho - margen.izquierda - margen.derecha;
  const areaAlto = alto - margen.arriba - margen.abajo;

  const xmlns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(xmlns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.setAttribute('class', 'grafico');
  svg.setAttribute('role', 'img');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  if (titulo) {
    const tituloNodo = document.createElementNS(xmlns, 'title');
    tituloNodo.textContent = titulo;
    svg.append(tituloNodo);
  }
  if (descripcion) {
    const descripcionNodo = document.createElementNS(xmlns, 'desc');
    descripcionNodo.textContent = descripcion;
    svg.append(descripcionNodo);
  }

  if (puntos.length === 0) return svg;

  const anchoBarra = Math.max(8, Math.min(56, (areaAncho / puntos.length) * 0.62));
  const paso = areaAncho / puntos.length;

  // Líneas guía: 0 %, 50 % y 100 %.
  [0, 50, 100].forEach((valor) => {
    const y = margen.arriba + areaAlto - (areaAlto * valor) / 100;
    const linea = document.createElementNS(xmlns, 'line');
    linea.setAttribute('x1', String(margen.izquierda));
    linea.setAttribute('x2', String(ancho - margen.derecha));
    linea.setAttribute('y1', String(y));
    linea.setAttribute('y2', String(y));
    linea.setAttribute('class', 'grafico__eje');
    linea.setAttribute('stroke-dasharray', valor === 0 ? '0' : '3 4');
    svg.append(linea);

    const etiqueta = document.createElementNS(xmlns, 'text');
    etiqueta.setAttribute('x', String(margen.izquierda - 6));
    etiqueta.setAttribute('y', String(y + 4));
    etiqueta.setAttribute('text-anchor', 'end');
    etiqueta.setAttribute('class', 'grafico__etiqueta');
    etiqueta.textContent = `${valor}%`;
    svg.append(etiqueta);
  });

  puntos.forEach((punto, indice) => {
    const centro = margen.izquierda + paso * indice + paso / 2;
    const sinDatos = punto.porcentaje === null || punto.porcentaje === undefined;
    const valor = sinDatos ? 0 : Math.max(0, Math.min(100, Number(punto.porcentaje)));
    const alturaBarra = sinDatos ? 3 : Math.max(3, (areaAlto * valor) / 100);
    const y = margen.arriba + areaAlto - alturaBarra;

    const barra = document.createElementNS(xmlns, 'rect');
    barra.setAttribute('x', String(centro - anchoBarra / 2));
    barra.setAttribute('y', String(y));
    barra.setAttribute('width', String(anchoBarra));
    barra.setAttribute('height', String(alturaBarra));
    barra.setAttribute('rx', '4');
    barra.setAttribute('class', sinDatos ? 'grafico__barra grafico__barra--vacia' : 'grafico__barra');
    const tituloBarra = document.createElementNS(xmlns, 'title');
    tituloBarra.textContent = sinDatos
      ? `${punto.etiqueta}: sin clase registrada`
      : `${punto.etiqueta}: ${Math.round(valor)}% de asistencia (${punto.cantidad ?? 0} registros)`;
    barra.append(tituloBarra);
    svg.append(barra);

    if (!sinDatos) {
      const valorTexto = document.createElementNS(xmlns, 'text');
      valorTexto.setAttribute('x', String(centro));
      valorTexto.setAttribute('y', String(y - 5));
      valorTexto.setAttribute('class', 'grafico__valor');
      valorTexto.textContent = `${Math.round(valor)}%`;
      svg.append(valorTexto);
    }

    const etiquetaX = document.createElementNS(xmlns, 'text');
    etiquetaX.setAttribute('x', String(centro));
    etiquetaX.setAttribute('y', String(alto - 12));
    etiquetaX.setAttribute('class', 'grafico__etiqueta');
    etiquetaX.textContent = punto.etiqueta;
    svg.append(etiquetaX);
  });

  return svg;
}

/**
 * Estadísticas de una lista de prácticas.
 * @param {Array} practicas
 * @returns {object} null si la lista viene vacía.
 */
export function resumirPracticas(practicas = []) {
  if (!Array.isArray(practicas) || practicas.length === 0) {
    return {
      cantidad: 0,
      conTiempo: 0,
      mejorDuracionMs: null,
      peorDuracionMs: null,
      promedioDuracionMs: null,
      medianaDuracionMs: null,
      mejorPuntaje: null,
      peorPuntaje: null,
      promedioPuntaje: null,
      medianaPuntaje: null,
      ultimaFecha: null,
      totalIntentosFallidos: 0,
    };
  }

  const tiempos = practicas.filter(tieneTiempo).map((p) => Number(p.duracion_ms ?? p.duracionMs));
  const puntajes = practicas
    .map((p) => Number(p.puntaje))
    .filter((n) => Number.isFinite(n));

  const ordenadosTiempos = [...tiempos].sort((a, b) => a - b);
  const ordenadosPuntajes = [...puntajes].sort((a, b) => a - b);
  const fechas = practicas.map((p) => p.fecha).filter(Boolean).sort();

  return {
    cantidad: practicas.length,
    conTiempo: tiempos.length,
    mejorDuracionMs: ordenadosTiempos.length ? ordenadosTiempos[0] : null,
    peorDuracionMs: ordenadosTiempos.length ? ordenadosTiempos[ordenadosTiempos.length - 1] : null,
    promedioDuracionMs: tiempos.length
      ? Math.round(tiempos.reduce((s, n) => s + n, 0) / tiempos.length)
      : null,
    medianaDuracionMs: mediana(ordenadosTiempos),
    mejorPuntaje: ordenadosPuntajes.length ? ordenadosPuntajes[ordenadosPuntajes.length - 1] : null,
    peorPuntaje: ordenadosPuntajes.length ? ordenadosPuntajes[0] : null,
    promedioPuntaje: puntajes.length
      ? Math.round(puntajes.reduce((s, n) => s + n, 0) / puntajes.length)
      : null,
    medianaPuntaje: mediana(ordenadosPuntajes),
    ultimaFecha: fechas.length ? fechas[fechas.length - 1] : null,
    // Un "intento fallido" es una práctica con 0 puntos: es información útil,
    // no un error, y el coach suele querer verla.
    totalIntentosFallidos: puntajes.filter((n) => n === 0).length,
  };
}

/**
 * Mediana de una lista YA ordenada de números.
 * Devuelve null si la lista está vacía.
 */
export function mediana(ordenados = []) {
  if (!Array.isArray(ordenados) || ordenados.length === 0) return null;
  const medio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 1) return ordenados[medio];
  return Math.round((ordenados[medio - 1] + ordenados[medio]) / 2);
}

/** La mejor práctica por tiempo (el recorrido más rápido). */
export function mejorPorTiempo(practicas = []) {
  const conTiempo = practicas.filter(tieneTiempo);
  if (conTiempo.length === 0) return null;
  return conTiempo.reduce((mejor, p) => (
    Number(p.duracion_ms ?? p.duracionMs) < Number(mejor.duracion_ms ?? mejor.duracionMs) ? p : mejor
  ));
}

/** La mejor práctica por puntaje. */
export function mejorPorPuntaje(practicas = []) {
  if (!Array.isArray(practicas) || practicas.length === 0) return null;
  return practicas.reduce((mejor, p) => (Number(p.puntaje) > Number(mejor.puntaje) ? p : mejor));
}

/** Agrupa prácticas por equipo. Devuelve un Map equipoId -> prácticas. */
export function agruparPorEquipo(practicas = []) {
  const mapa = new Map();
  practicas.forEach((p) => {
    const id = Number(p.equipo_id ?? p.equipoId);
    if (!Number.isFinite(id)) return;
    if (!mapa.has(id)) mapa.set(id, []);
    mapa.get(id).push(p);
  });
  return mapa;
}

/** Agrupa prácticas por reto. Devuelve un Map retoId -> prácticas (null = sin reto). */
export function agruparPorReto(practicas = []) {
  const mapa = new Map();
  practicas.forEach((p) => {
    const id = p.reto_id ?? p.retoId ?? null;
    const clave = id === null || id === undefined ? 'sin-reto' : Number(id);
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push(p);
  });
  return mapa;
}

/**
 * Tabla de posiciones por equipo: el mejor tiempo y el mejor puntaje de cada uno,
 * ordenada por mejor puntaje (y a igualdad, por mejor tiempo).
 *
 * @param {Array} practicas
 * @param {Array} equipos    [{id, nombre}]
 */
export function rankingEquipos(practicas = [], equipos = []) {
  const porEquipo = agruparPorEquipo(practicas);
  const nombres = new Map(equipos.map((e) => [Number(e.id), e.nombre]));

  const filas = [];
  porEquipo.forEach((lista, equipoId) => {
    const resumen = resumirPracticas(lista);
    const mejorTiempo = mejorPorTiempo(lista);
    const mejorPuntaje = mejorPorPuntaje(lista);
    filas.push({
      equipoId,
      equipo: nombres.get(equipoId) ?? `Equipo ${equipoId}`,
      ...resumen,
      mejorTiempoFecha: mejorTiempo?.fecha ?? null,
      mejorTiempoIntento: mejorTiempo?.intento ?? null,
      mejorPuntajeFecha: mejorPuntaje?.fecha ?? null,
      mejorPuntajeIntento: mejorPuntaje?.intento ?? null,
    });
  });

  return filas.sort((a, b) => {
    const puntaje = (b.mejorPuntaje ?? -1) - (a.mejorPuntaje ?? -1);
    if (puntaje !== 0) return puntaje;
    const tiempo = (a.mejorDuracionMs ?? Number.MAX_SAFE_INTEGER)
      - (b.mejorDuracionMs ?? Number.MAX_SAFE_INTEGER);
    if (tiempo !== 0) return tiempo;
    return a.equipo.localeCompare(b.equipo, 'es');
  });
}

/**
 * Ranking por reto: contesta "¿cómo va cada equipo en la pista X?".
 *
 * @param {Array} practicas
 * @param {Array} retos     [{id, nombre}]
 * @param {Array} equipos   [{id, nombre}]
 */
export function rankingPorReto(practicas = [], retos = [], equipos = []) {
  const nombresRetos = new Map(retos.map((r) => [Number(r.id), r.nombre]));
  const nombresEquipos = new Map(equipos.map((e) => [Number(e.id), e.nombre]));
  const grupos = new Map();

  practicas.forEach((p) => {
    const retoId = p.reto_id === null || p.reto_id === undefined ? null : Number(p.reto_id);
    const equipoId = Number(p.equipo_id ?? p.equipoId);
    const clave = `${retoId ?? 'sin'}|${equipoId}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        retoId,
        reto: retoId === null ? 'Sin reto' : (nombresRetos.get(retoId) ?? `Reto ${retoId}`),
        equipoId,
        equipo: nombresEquipos.get(equipoId) ?? `Equipo ${equipoId}`,
        practicas: [],
      });
    }
    grupos.get(clave).practicas.push(p);
  });

  return [...grupos.values()]
    .map((grupo) => ({ ...grupo, ...resumirPracticas(grupo.practicas) }))
    .sort((a, b) => {
      if (a.reto !== b.reto) return a.reto.localeCompare(b.reto, 'es');
      const tiempo = (a.mejorDuracionMs ?? Number.MAX_SAFE_INTEGER)
        - (b.mejorDuracionMs ?? Number.MAX_SAFE_INTEGER);
      if (tiempo !== 0) return tiempo;
      return (b.mejorPuntaje ?? -1) - (a.mejorPuntaje ?? -1);
    });
}

/**
 * Evolución de un equipo: sus prácticas en orden cronológico, para ver
 * si está mejorando. Marca cada punto como récord o no.
 */
export function evolucionEquipo(practicas = []) {
  const cronologico = [...practicas].sort((a, b) => {
    const fecha = String(a.fecha ?? '').localeCompare(String(b.fecha ?? ''));
    if (fecha !== 0) return fecha;
    return Number(a.intento ?? 0) - Number(b.intento ?? 0);
  });

  let mejorTiempo = null;
  let mejorPuntaje = null;

  return cronologico.map((p) => {
    const tiempo = tieneTiempo(p) ? Number(p.duracion_ms ?? p.duracionMs) : null;
    const puntaje = Number(p.puntaje);

    const recordTiempo = tiempo !== null && (mejorTiempo === null || tiempo < mejorTiempo);
    const recordPuntaje = Number.isFinite(puntaje) && (mejorPuntaje === null || puntaje > mejorPuntaje);

    if (recordTiempo) mejorTiempo = tiempo;
    if (recordPuntaje) mejorPuntaje = puntaje;

    return {
      id: p.id,
      fecha: p.fecha,
      intento: p.intento,
      duracionMs: tiempo,
      puntaje,
      recordTiempo,
      recordPuntaje,
    };
  });
}

/** Sugiere el número de intento para la próxima práctica de un equipo. */
export function siguienteIntento(practicas = [], equipoId, fecha) {
  const delDia = practicas.filter((p) => (
    Number(p.equipo_id ?? p.equipoId) === Number(equipoId)
    && (!fecha || p.fecha === fecha)
  ));
  if (delDia.length === 0) return 1;
  return Math.max(...delDia.map((p) => Number(p.intento ?? 1))) + 1;
}

/**
 * Compara dos marcas y devuelve un texto tipo "3.2 s más rápido".
 * Se usa para mostrar la mejora respecto a la práctica anterior.
 */
export function compararTiempos(actualMs, anteriorMs) {
  if (actualMs === null || anteriorMs === null) return null;
  const diferencia = Number(anteriorMs) - Number(actualMs);
  if (diferencia === 0) return { texto: 'Igual que la anterior', mejora: false, empate: true };
  const segundos = Math.abs(diferencia / 1000);
  const texto = `${segundos.toFixed(1)} s ${diferencia > 0 ? 'más rápido' : 'más lento'}`;
  return { texto, mejora: diferencia > 0, empate: false, diferenciaMs: diferencia };
}

/* ------------------------------------------------------------------ *
 * FORMATO PARA LA INTERFAZ
 * ------------------------------------------------------------------ */

/** Convierte un resumen de estadísticas a textos listos para mostrar. */
export function resumenParaMostrar(resumen) {
  return {
    cantidad: formatearPuntaje(resumen.cantidad),
    mejorTiempo: formatearDuracionCorta(resumen.mejorDuracionMs),
    mejorTiempoLargo: formatearDuracion(resumen.mejorDuracionMs),
    promedioTiempo: formatearDuracionCorta(resumen.promedioDuracionMs),
    medianaTiempo: formatearDuracionCorta(resumen.medianaDuracionMs),
    mejorPuntaje: formatearPuntaje(resumen.mejorPuntaje),
    promedioPuntaje: formatearPuntaje(resumen.promedioPuntaje),
    medianaPuntaje: formatearPuntaje(resumen.medianaPuntaje),
    porcentajeFallidos: resumen.cantidad
      ? formatearPorcentaje((resumen.totalIntentosFallidos * 100) / resumen.cantidad)
      : '—',
  };
}
