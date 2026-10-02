/**
 * equipos.js — Reglas de negocio de los equipos.
 *
 * Lógica pura (sin DOM ni red) para poder probarla con `node --test`
 * y para poder reutilizarla tanto en la interfaz como en los scripts.
 *
 * Reglas del club:
 *   · Un equipo tiene como MÁXIMO 3 integrantes.
 *   · Un estudiante pertenece a UN SOLO equipo a la vez.
 *   · Un equipo puede tener como máximo un capitán.
 *   · Un integrante debe estar activo en el club.
 *
 * Estas mismas reglas están reforzadas en la base de datos con triggers
 * (ver supabase/01_esquema.sql), de modo que se cumplen aunque alguien
 * escriba directamente por la API.
 */

import { ErrorFormato, normalizarNombre, embellecerNombre } from './formato.js';

export const MAX_INTEGRANTES = 3;
export const ROLES = ['capitan', 'integrante'];

export const ESTADOS_WRO = ['no_participa', 'inscrito', 'participo', 'no_participo'];

export const ETIQUETAS_WRO = {
  no_participa: 'No participa',
  inscrito: 'Inscrito',
  participo: 'Participó',
  no_participo: 'No pudo participar',
};

export const ETIQUETAS_ROL = {
  capitan: 'Capitán',
  integrante: 'Integrante',
};

export class ErrorEquipo extends Error {
  constructor(codigo, mensaje, detalles = {}) {
    super(mensaje);
    this.name = 'ErrorEquipo';
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

/* ------------------------------------------------------------------ *
 * NORMALIZACIÓN
 * ------------------------------------------------------------------ */

/** Deja el listado de integrantes en formato canónico y sin repetidos. */
export function normalizarIntegrantes(integrantes = []) {
  const vistos = new Set();
  const salida = [];

  integrantes.forEach((crudo, indice) => {
    const estudianteId = Number(crudo?.estudianteId ?? crudo?.estudiante_id ?? crudo?.id);
    if (!Number.isFinite(estudianteId) || estudianteId <= 0) return;
    if (vistos.has(estudianteId)) return;
    vistos.add(estudianteId);
    salida.push({
      estudianteId,
      // El primero es capitán por defecto; el coach puede cambiarlo en la interfaz.
      rol: crudo?.rol === 'capitan' ? 'capitan' : 'integrante',
      indice,
    });
  });

  // Si nadie es capitán, el primero asume el rol (más útil que no tener ninguno).
  if (salida.length > 0 && !salida.some((i) => i.rol === 'capitan')) {
    salida[0] = { ...salida[0], rol: 'capitan' };
  }

  return salida.map(({ estudianteId, rol }) => ({ estudianteId, rol }));
}

/** Prepara los datos de un equipo antes de guardarlo. */
export function normalizarEquipo(equipo = {}) {
  const nombre = embellecerNombre(equipo.nombre);
  return {
    nombre,
    nombre_busqueda: normalizarNombre(nombre),
    categoria_wro: (equipo.categoriaWro ?? equipo.categoria_wro ?? '').trim() || null,
    wro_estado: ESTADOS_WRO.includes(equipo.wroEstado ?? equipo.wro_estado)
      ? (equipo.wroEstado ?? equipo.wro_estado)
      : 'no_participa',
    wro_resultado: (equipo.wroResultado ?? equipo.wro_resultado ?? '').trim() || null,
    wro_nota: (equipo.wroNota ?? equipo.wro_nota ?? '').trim() || null,
    activo: equipo.activo === undefined ? true : Boolean(equipo.activo),
  };
}

/* ------------------------------------------------------------------ *
 * VALIDACIÓN
 * ------------------------------------------------------------------ */

/**
 * Valida un equipo completo.
 *
 * @param {object} equipo          Datos del equipo (nombre, estado WRO…).
 * @param {Array}  integrantes     Integrantes propuestos.
 * @param {object} contexto        {
 *   idsEquiposExistentes: number[],     // para saber qué ids son reales
 *   estudiantes: Array,                 // catálogo con {id, nombre, activo}
 *   equipoId: number|null,              // id del equipo que se está editando
 *   pertenenciaActual: Map<number, number>,  // estudianteId -> equipoId actual
 * }
 *
 * @returns {{ valido: boolean, errores: string[], integrantes: Array }}
 */
export function validarEquipo(equipo, integrantes = [], contexto = {}) {
  const errores = [];
  const guardados = normalizarIntegrantes(integrantes);

  const nombre = embellecerNombre(equipo?.nombre);
  if (nombre.length < 2) {
    errores.push('El nombre del equipo debe tener al menos 2 caracteres.');
  }
  if (nombre.length > 60) {
    errores.push('El nombre del equipo no puede pasar de 60 caracteres.');
  }

  const estadoWro = equipo?.wroEstado ?? equipo?.wro_estado ?? 'no_participa';
  if (!ESTADOS_WRO.includes(estadoWro)) {
    errores.push('El estado de participación en la WRO no es válido.');
  }

  if (guardados.length > MAX_INTEGRANTES) {
    errores.push(
      `Un equipo no puede tener más de ${MAX_INTEGRANTES} integrantes `
      + `(pusiste ${guardados.length}).`,
    );
  }

  const catalogo = new Map(
    (contexto.estudiantes ?? []).map((e) => [Number(e.id), e]),
  );
  const pertenencia = contexto.pertenenciaActual instanceof Map
    ? contexto.pertenenciaActual
    : new Map(Object.entries(contexto.pertenenciaActual ?? {}).map(([k, v]) => [Number(k), Number(v)]));

  const equipoId = contexto.equipoId === null || contexto.equipoId === undefined
    ? null
    : Number(contexto.equipoId);

  const capitanes = guardados.filter((i) => i.rol === 'capitan').length;
  if (capitanes > 1) {
    errores.push('Solo puede haber un capitán por equipo.');
  }

  guardados.forEach((integrante) => {
    const estudiante = catalogo.get(integrante.estudianteId);

    if (!estudiante) {
      errores.push(`El estudiante con id ${integrante.estudianteId} no existe.`);
      return;
    }

    if (estudiante.activo === false) {
      errores.push(`${estudiante.nombre} está dado de baja del club: actívalo antes de integrarlo.`);
    }

    const equipoActual = pertenencia.get(integrante.estudianteId);
    if (equipoActual && equipoActual !== equipoId) {
      const otro = (contexto.equipos ?? []).find((e) => Number(e.id) === equipoActual);
      errores.push(
        `${estudiante.nombre} ya pertenece al equipo "${otro?.nombre ?? equipoActual}". `
        + 'Quítalo de ahí antes de asignarlo a este equipo.',
      );
    }
  });

  return {
    valido: errores.length === 0,
    errores,
    integrantes: guardados,
  };
}

/* ------------------------------------------------------------------ *
 * CONSULTAS DE APOYO PARA LA INTERFAZ
 * ------------------------------------------------------------------ */

/**
 * Estudiantes que se pueden agregar a un equipo, con el motivo por el que
 * cada uno está bloqueado. Alimenta el selector del editor de equipos:
 * los bloqueados se muestran deshabilitados y explicando por qué.
 */
export function estudiantesDisponibles(estudiantes, integrantes, contexto = {}) {
  const enEsteEquipo = new Set(
    (integrantes ?? []).map((i) => Number(i.estudianteId ?? i.estudiante_id ?? i.id)),
  );
  const pertenencia = contexto.pertenenciaActual instanceof Map
    ? contexto.pertenenciaActual
    : new Map();
  const equipos = contexto.equipos ?? [];
  const equipoId = contexto.equipoId ? Number(contexto.equipoId) : null;

  return (estudiantes ?? []).map((estudiante) => {
    const id = Number(estudiante.id);

    if (enEsteEquipo.has(id)) {
      return { estudiante, disponible: true, motivo: 'Ya está en este equipo', yaEnEquipo: true };
    }
    if (estudiante.activo === false) {
      return { estudiante, disponible: false, motivo: 'Dado de baja del club' };
    }
    const equipoActual = pertenencia.get(id);
    if (equipoActual && equipoActual !== equipoId) {
      const otro = equipos.find((e) => Number(e.id) === equipoActual);
      return {
        estudiante,
        disponible: false,
        motivo: `Ya está en "${otro?.nombre ?? `equipo ${equipoActual}`}"`,
      };
    }
    return { estudiante, disponible: true, motivo: '' };
  });
}

/** ¿Se puede agregar un integrante más? Devuelve el motivo si no. */
export function puedeAgregarIntegrante(integrantes) {
  const cantidad = (integrantes ?? []).length;
  if (cantidad >= MAX_INTEGRANTES) {
    return {
      puede: false,
      motivo: `El equipo ya tiene los ${MAX_INTEGRANTES} integrantes permitidos. `
        + 'Quita a uno para poder agregar a otro.',
    };
  }
  return { puede: true, motivo: '' };
}

/** Cuenta los integrantes de un equipo dentro de un listado anidado. */
export function contarIntegrantes(equipo) {
  const lista = equipo?.equipo_integrantes ?? equipo?.integrantes ?? [];
  return Array.isArray(lista) ? lista.length : 0;
}

/** Extrae los ids de integrantes de un equipo (venga como venga del backend). */
export function idsIntegrantes(equipo) {
  const lista = equipo?.equipo_integrantes ?? equipo?.integrantes ?? [];
  if (!Array.isArray(lista)) return [];
  return lista
    .map((i) => Number(i.estudiante_id ?? i.estudianteId ?? i.estudiantes?.id ?? i.estudiante?.id))
    .filter((n) => Number.isFinite(n));
}

/**
 * Mapa estudianteId -> equipoId a partir del listado de equipos.
 * Es la entrada que necesitan `validarEquipo` y `estudiantesDisponibles`.
 */
export function mapaPertenencia(equipos = []) {
  const mapa = new Map();
  equipos.forEach((equipo) => {
    idsIntegrantes(equipo).forEach((estudianteId) => {
      mapa.set(estudianteId, Number(equipo.id));
    });
  });
  return mapa;
}

/** Integrantes de un equipo con el nombre del estudiante resuelto. */
export function integrantesConNombre(equipo, estudiantes = []) {
  const catalogo = new Map(estudiantes.map((e) => [Number(e.id), e]));
  const lista = equipo?.equipo_integrantes ?? equipo?.integrantes ?? [];
  if (!Array.isArray(lista)) return [];

  return lista
    .map((i) => {
      const id = Number(i.estudiante_id ?? i.estudianteId ?? i.estudiantes?.id);
      const estudiante = catalogo.get(id) ?? i.estudiantes ?? i.estudiante ?? null;
      return {
        estudianteId: id,
        nombre: estudiante?.nombre ?? `Estudiante ${id}`,
        rol: i.rol ?? 'integrante',
        activo: estudiante?.activo ?? true,
      };
    })
    .filter((i) => Number.isFinite(i.estudianteId))
    .sort((a, b) => {
      if (a.rol === b.rol) return a.nombre.localeCompare(b.nombre, 'es');
      return a.rol === 'capitan' ? -1 : 1;
    });
}

/** Formatea los integrantes como texto: 'Ana Pérez, Luis Gómez y 1 más' */
export function integrantesEnTexto(integrantes, maximo = 2) {
  const nombres = integrantes.map((i) => i.nombre);
  if (nombres.length === 0) return 'Sin integrantes';
  if (nombres.length <= maximo) {
    if (nombres.length === 1) return nombres[0];
    return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  }
  const restantes = nombres.length - maximo;
  return `${nombres.slice(0, maximo).join(', ')} y ${restantes} más`;
}

export { ErrorFormato };
