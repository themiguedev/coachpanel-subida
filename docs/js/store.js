/**
 * store.js — Estado compartido de la aplicación.
 *
 * Guarda lo poco que necesita estar "vivo" entre vistas: el catálogo de
 * estudiantes y equipos (para no volver a pedirlo en cada pantalla), el tema
 * y el cliente de datos. Las vistas se suscriben para redibujarse cuando algo
 * cambia.
 *
 * Deliberadamente simple: no es una librería de estado, es un objeto con
 * eventos. Con este tamaño de app, alcanza y sobra.
 */

export function crearStore(inicial = {}) {
  const estado = {
    // Datos de trabajo
    estudiantes: [],
    equipos: [],
    retos: [],
    sesionActual: null,

    // Interfaz
    tema: 'oscuro',
    rutaActiva: 'panel',
    sinConexion: false,
    antiguedad: null,
    nombreClub: 'Club de Robótica LEGO',

    /**
     * Modalidad activa: 'coach' (edita todo) o 'club' (alumno/representante,
     * solo consulta). Se decide en el portal de acceso y no cambia en toda
     * la sesión.
     */
    modo: 'coach',

    ...inicial,
  };

  const suscriptores = new Map();

  /** Lee un valor del estado. */
  function obtener(clave) {
    return estado[clave];
  }

  /** Lee varios valores a la vez. */
  function obtenerVarios(claves = []) {
    const salida = {};
    claves.forEach((clave) => { salida[clave] = estado[clave]; });
    return salida;
  }

  /** Escribe uno o varios valores y avisa a quien escuche. */
  function establecer(cambios, opciones = {}) {
    const anteriores = {};
    const modificadas = [];

    Object.entries(cambios ?? {}).forEach(([clave, valor]) => {
      if (estado[clave] === valor) return;
      anteriores[clave] = estado[clave];
      estado[clave] = valor;
      modificadas.push(clave);
    });

    if (modificadas.length === 0) return false;

    if (!opciones.silencioso) {
      modificadas.forEach((clave) => notificar(clave, estado[clave], anteriores[clave]));
      notificar('*', estado, anteriores);
    }
    return true;
  }

  /** Se suscribe a los cambios de una clave (o '*' para todos). */
  function suscribir(clave, manejador) {
    if (!suscriptores.has(clave)) suscriptores.set(clave, new Set());
    suscriptores.get(clave).add(manejador);
    return () => suscriptores.get(clave)?.delete(manejador);
  }

  function notificar(clave, valor, anterior) {
    suscriptores.get(clave)?.forEach((manejador) => {
      try {
        manejador(valor, anterior);
      } catch (error) {
        console.error(`Error en un suscriptor de "${clave}":`, error);
      }
    });
  }

  return {
    estado,
    obtener,
    obtenerVarios,
    establecer,
    suscribir,
    /** Copia plana del estado, útil para depurar. */
    instantanea: () => ({ ...estado }),
  };
}

/* ------------------------------------------------------------------ *
 * TEMA VISUAL
 * ------------------------------------------------------------------ */

const CLAVE_TEMA = 'coachpanel.tema';

/** Tema guardado por el usuario, o el que prefiere el sistema. */
export function temaInicial() {
  try {
    const guardado = localStorage.getItem(CLAVE_TEMA);
    if (guardado === 'claro' || guardado === 'oscuro') return guardado;
  } catch {
    // modo privado: se usa la preferencia del sistema
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'claro';
  }
  return 'oscuro';
}

export function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // si no se puede guardar, el tema igual se aplica en esta sesión
  }
  return tema;
}

export function alternarTema(temaActual) {
  return aplicarTema(temaActual === 'oscuro' ? 'claro' : 'oscuro');
}

/* ------------------------------------------------------------------ *
 * ACCESO
 * ------------------------------------------------------------------ */

const CLAVE_ACCESO = 'coachpanel.acceso';

/** ¿Ya se validó el token en este dispositivo? */
export function accesoGuardado() {
  try {
    const crudo = localStorage.getItem(CLAVE_ACCESO);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    return datos?.ok ? datos : null;
  } catch {
    return null;
  }
}

export function guardarAcceso(exitoso, extra = {}) {
  try {
    localStorage.setItem(CLAVE_ACCESO, JSON.stringify({
      ok: Boolean(exitoso),
      desde: new Date().toISOString(),
      ...extra,
    }));
  } catch {
    // sin persistencia: se pedirá el token otra vez en la próxima visita
  }
}

export function olvidarAcceso() {
  try {
    localStorage.removeItem(CLAVE_ACCESO);
  } catch {
    // nada que hacer
  }
}
