/**
 * asistencia.js — Reglas y cálculos de la asistencia a las clases vespertinas.
 *
 * Lógica pura (sin DOM ni red) para poder probarla con `node --test`.
 *
 * Idea central del modelo: la asistencia NO se materializa para todos los
 * estudiantes. Solo se guardan las filas que el coach realmente marcó.
 * La lista de una sesión se calcula como:
 *
 *     estudiantes activos  ∪  estudiantes con registro en esa sesión
 *
 * Así, dar de baja o de alta a un estudiante no corrompe el historial
 * de las sesiones que ya pasaron.
 */

import { claveMes, fechaADate, formatearPorcentaje } from './formato.js';

export const ESTADOS_ASISTENCIA = ['presente', 'ausente', 'tarde', 'justificado'];

export const ETIQUETAS_ASISTENCIA = {
  presente: 'Presente',
  ausente: 'Ausente',
  tarde: 'Tarde',
  justificado: 'Justificado',
};

/** Abreviatura para los botones compactos del teléfono. */
export const ABREVIATURAS_ASISTENCIA = {
  presente: 'P',
  ausente: 'A',
  tarde: 'T',
  justificado: 'J',
};

/**
 * ¿Cuenta como "asistió" para el porcentaje?
 * Llegar tarde o tener un justificado cuenta como asistencia;
 * la ausencia es lo único que resta.
 */
export const ESTADOS_QUE_CUENTAN = ['presente', 'tarde', 'justificado'];

export class ErrorAsistencia extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorAsistencia';
    this.codigo = codigo;
  }
}

/* ------------------------------------------------------------------ *
 * LISTA DE UNA SESIÓN
 * ------------------------------------------------------------------ */

/**
 * Construye la lista de estudiantes que hay que mostrar al tomar asistencia.
 *
 * @param {object} opciones
 * @param {Array} opciones.estudiantes   Catálogo completo ({id, nombre, activo}).
 * @param {Array} opciones.registros     Filas ya guardadas de esa sesión.
 * @param {boolean} opciones.incluirInactivos  Mostrar los dados de baja
 *        (por defecto solo si ya tienen registro en esa sesión).
 * @returns {Array<{estudianteId, nombre, activo, estado, observacion, guardado}>}
 */
export function construirListaSesion({
  estudiantes = [],
  registros = [],
  incluirInactivos = false,
} = {}) {
  const porEstudiante = new Map();
  registros.forEach((r) => {
    const id = Number(r.estudiante_id ?? r.estudianteId);
    if (Number.isFinite(id)) porEstudiante.set(id, r);
  });

  const catalogo = new Map();
  estudiantes.forEach((e) => catalogo.set(Number(e.id), e));

  // 1. Estudiantes con registro en esta sesión (aunque hoy estén de baja).
  porEstudiante.forEach((registro, id) => {
    if (!catalogo.has(id)) {
      catalogo.set(id, {
        id,
        nombre: registro.estudiantes?.nombre ?? `Estudiante ${id}`,
        activo: false,
      });
    }
  });

  const lista = [];
  catalogo.forEach((estudiante, id) => {
    const registro = porEstudiante.get(id);
    const activo = estudiante.activo !== false;

    if (activo || registro || incluirInactivos) {
      lista.push({
        estudianteId: id,
        nombre: estudiante.nombre,
        activo,
        estado: registro?.estado ?? null,
        observacion: registro?.observacion ?? '',
        guardado: Boolean(registro),
      });
    }
  });

  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/* ------------------------------------------------------------------ *
 * MARCADO
 * ------------------------------------------------------------------ */

/** Asigna un estado a un estudiante dentro de la lista, sin mutar la original. */
export function marcarEstado(lista, estudianteId, estado) {
  if (estado !== null && !ESTADOS_ASISTENCIA.includes(estado)) {
    throw new ErrorAsistencia('estado_invalido', `El estado "${estado}" no es válido.`);
  }
  const id = Number(estudianteId);
  return lista.map((fila) => (
    fila.estudianteId === id ? { ...fila, estado } : fila
  ));
}

/** Marca a todos con el mismo estado (p. ej. "todos presentes"). */
export function marcarTodos(lista, estado) {
  if (!ESTADOS_ASISTENCIA.includes(estado)) {
    throw new ErrorAsistencia('estado_invalido', `El estado "${estado}" no es válido.`);
  }
  return lista.map((fila) => ({ ...fila, estado }));
}

/** Borra todas las marcas (los que tengan observación la conservan). */
export function limpiarMarcas(lista) {
  return lista.map((fila) => ({ ...fila, estado: null }));
}

/** Alterna: si ya tenía ese estado, se desmarca (útil para corregir a mano). */
export function alternarEstado(lista, estudianteId, estado) {
  const id = Number(estudianteId);
  const actual = lista.find((f) => f.estudianteId === id);
  return marcarEstado(lista, id, actual?.estado === estado ? null : estado);
}

/* ------------------------------------------------------------------ *
 * GUARDADO
 * ------------------------------------------------------------------ */

/**
 * Convierte la lista marcada en las filas que se enviarán a Supabase.
 * Solo incluye lo que tiene estado: nada de guardar filas vacías.
 */
export function prepararRegistros(lista, { sesionId, registradoPor = null } = {}) {
  const id = sesionId === null || sesionId === undefined ? null : Number(sesionId);
  if (id === null || !Number.isFinite(id)) {
    throw new ErrorAsistencia('sesion_invalida', 'Falta la sesión a la que pertenece la asistencia.');
  }

  return lista
    .filter((fila) => fila.estado !== null && fila.estado !== undefined)
    .map((fila) => ({
      sesion_id: id,
      estudiante_id: fila.estudianteId,
      estado: fila.estado,
      observacion: fila.observacion?.trim() ? fila.observacion.trim() : null,
      registrado_por: registradoPor,
    }));
}

/** Validaciones antes de guardar. Devuelve la lista de problemas. */
export function validarGuardado(lista, { sesion } = {}) {
  const errores = [];

  if (sesion && sesion.estado === 'cerrada') {
    errores.push('La sesión está cerrada. Reábrela antes de cambiar la asistencia.');
  }

  const marcados = lista.filter((f) => f.estado !== null && f.estado !== undefined);
  if (marcados.length === 0) {
    errores.push('No marcaste a nadie todavía.');
  }

  const invalidos = marcados.filter((f) => !ESTADOS_ASISTENCIA.includes(f.estado));
  if (invalidos.length > 0) {
    errores.push(`Hay ${invalidos.length} estudiante(s) con un estado que no reconozco.`);
  }

  const sinId = marcados.filter((f) => !Number.isFinite(Number(f.estudianteId)));
  if (sinId.length > 0) {
    errores.push('Hay estudiantes sin identificador válido. Recarga la página.');
  }

  return errores;
}

/* ------------------------------------------------------------------ *
 * CÁLCULOS
 * ------------------------------------------------------------------ */

/**
 * Extrae el estado de una fila.
 * Ojo: `{ estado: null }` es distinto de `{ estado: undefined }`. El primero
 * significa "sin marcar todavía"; el segundo, que el campo ni viene.
 */
function leerEstado(fila) {
  if (fila !== null && typeof fila === 'object' && !Array.isArray(fila)) {
    return 'estado' in fila ? fila.estado : undefined;
  }
  return fila;
}

/**
 * Conteo por estado de una lista de la sesión.
 *
 * En la lista de trabajo, `estado: null` significa "todavía sin marcar"
 * (es justo lo que muestra la interfaz), y `estado` ausente significa
 * que la fila ni siquiera trae el campo.
 */
export function contarEstados(registros = []) {
  const conteo = { presente: 0, ausente: 0, tarde: 0, justificado: 0, total: 0, sin_marcar: 0 };

  registros.forEach((r) => {
    const estado = leerEstado(r);
    if (estado === null || estado === undefined) {
      conteo.sin_marcar += 1;
      return;
    }
    if (ESTADOS_ASISTENCIA.includes(estado)) {
      conteo[estado] += 1;
      conteo.total += 1;
    }
  });

  return conteo;
}

/**
 * Porcentaje de asistencia.
 *
 * Regla importante: si no hay registros devuelve **null**, no 0.
 * "Sin datos" y "0 % de asistencia" son cosas distintas y la interfaz
 * debe mostrarlas distinto ('—' contra '0 %').
 *
 * @param {Array} registros Filas con {estado}.
 * @param {object} opciones { contarTardes: true, contarJustificados: true }
 */
export function calcularPorcentaje(registros = [], opciones = {}) {
  const { contarTardes = true, contarJustificados = true } = opciones;

  const evaluables = registros.filter((r) => ESTADOS_ASISTENCIA.includes(leerEstado(r)));
  if (evaluables.length === 0) return null;

  const efectivos = evaluables.filter((fila) => {
    const estado = leerEstado(fila);
    if (estado === 'presente') return true;
    if (estado === 'tarde') return contarTardes;
    if (estado === 'justificado') return contarJustificados;
    return false;
  });

  return Math.round((efectivos.length * 100) / evaluables.length);
}

/**
 * Filas de una vista `vista_asistencia_estudiante` transformadas a
 * la forma que usa la interfaz, recalculando el porcentaje para que
 * respete las opciones de conteo.
 */
export function desdeVistaAsistencia(filas = [], opciones = {}) {
  return filas.map((fila) => ({
    estudianteId: Number(fila.estudiante_id ?? fila.id),
    nombre: fila.nombre,
    activo: fila.activo !== false,
    registros: Number(fila.registros ?? 0),
    presentes: Number(fila.presentes ?? 0),
    tardes: Number(fila.tardes ?? 0),
    justificados: Number(fila.justificados ?? 0),
    ausencias: Number(fila.ausencias ?? 0),
    porcentaje: Number(fila.registros ?? 0) === 0
      ? null
      : calcularPorcentaje(
        [
          ...Array.from({ length: Number(fila.presentes ?? 0) }, () => ({ estado: 'presente' })),
          ...Array.from({ length: Number(fila.tardes ?? 0) }, () => ({ estado: 'tarde' })),
          ...Array.from({ length: Number(fila.justificados ?? 0) }, () => ({ estado: 'justificado' })),
          ...Array.from({ length: Number(fila.ausencias ?? 0) }, () => ({ estado: 'ausente' })),
        ],
        opciones,
      ),
    porcentajeTexto: (() => {
      if (Number(fila.registros ?? 0) === 0) return '—';
      const valor = Number(fila.porcentaje);
      return Number.isFinite(valor) ? formatearPorcentaje(valor) : '—';
    })(),
  }));
}

/**
 * Agrupa la asistencia por mes.
 * @returns {Map<string, {clave, registros, presentes, ausencias, porcentaje}>}
 */
export function agruparPorMes(registros = [], opciones = {}) {
  const mapa = new Map();

  registros.forEach((registro) => {
    const fecha = registro.sesiones?.fecha ?? registro.fecha;
    const clave = claveMes(fecha);
    if (!clave) return;
    if (!mapa.has(clave)) {
      mapa.set(clave, { clave, registros: [], presentes: 0, ausencias: 0, porcentaje: null });
    }
    mapa.get(clave).registros.push(registro);
  });

  mapa.forEach((grupo) => {
    const conteo = contarEstados(grupo.registros);
    grupo.presentes = conteo.presente + conteo.tarde + conteo.justificado;
    grupo.ausencias = conteo.ausente;
    grupo.total = conteo.total;
    grupo.porcentaje = calcularPorcentaje(grupo.registros, opciones);
  });

  return new Map([...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0])));
}

/**
 * Racha actual de asistencias consecutivas (de la más reciente hacia atrás).
 * Sirve para el reconocimiento en el panel ("Ana lleva 6 clases seguidas").
 */
export function calcularRacha(registros = []) {
  const ordenados = [...registros]
    .filter((r) => ESTADOS_ASISTENCIA.includes(r.estado))
    .sort((a, b) => {
      const fa = a.sesiones?.fecha ?? a.fecha ?? '';
      const fb = b.sesiones?.fecha ?? b.fecha ?? '';
      return fb.localeCompare(fa);           // más reciente primero
    });

  let racha = 0;
  for (const registro of ordenados) {
    if (ESTADOS_QUE_CUENTAN.includes(registro.estado)) racha += 1;
    else break;
  }
  return racha;
}

/** Porcentaje de una sola sesión, para las tarjetas del panel. */
export function resumenSesion(registros = []) {
  const conteo = contarEstados(registros);
  return {
    ...conteo,
    porcentaje: calcularPorcentaje(registros),
  };
}

/**
 * Serie de asistencia por semana para el gráfico de barras del panel.
 * Devuelve una entrada por semana, con porcentaje null si no hubo clase.
 */
export function serieSemanal(registros = [], cantidadSemanas = 8, base = new Date()) {
  const semanas = [];
  for (let i = cantidadSemanas - 1; i >= 0; i -= 1) {
    const referencia = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i * 7);
    const diaSemana = referencia.getDay();
    const offsetLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    const lunes = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate() + offsetLunes);
    const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
    semanas.push({
      desde: lunes,
      hasta: domingo,
      etiqueta: `${lunes.getDate()}/${lunes.getMonth() + 1}`,
      registros: [],
    });
  }

  registros.forEach((registro) => {
    const fecha = fechaADate(registro.sesiones?.fecha ?? registro.fecha);
    if (!fecha) return;
    const semana = semanas.find((s) => fecha >= s.desde && fecha <= s.hasta);
    if (semana) semana.registros.push(registro);
  });

  return semanas.map((semana) => ({
    etiqueta: semana.etiqueta,
    cantidad: semana.registros.length,
    porcentaje: calcularPorcentaje(semana.registros),
  }));
}
