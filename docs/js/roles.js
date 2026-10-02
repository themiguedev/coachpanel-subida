/**
 * roles.js — Las dos modalidades del sistema.
 *
 * CoachPanel tiene dos formas de entrar:
 *
 *   · COACH  → el profesor. Pide contraseña. Ve todo y puede editar.
 *   · CLUB   → alumnos y representantes. Sin contraseña. Solo consulta:
 *              asistencia, equipos, tiempos y puntajes del club completo.
 *
 * IMPORTANTE, para no engañarse: el modo solo-consulta es una barrera del
 * programa, no seguridad de verdad. El sitio es público, así que alguien con
 * conocimientos podría llamar a la base de datos directamente con la clave
 * publicable y escribir. Lo que SÍ es real e infranqueable es el bloqueo de
 * borrado que vive en PostgreSQL (ver supabase/02_rls.sql). Para endurecerlo
 * de verdad, ver seguridad.mejorar.md.
 *
 * Este archivo es lógica pura (sin DOM) para poder probarlo con `node --test`.
 */

export const MODOS = ['coach', 'club'];

export const ETIQUETAS_MODO = {
  coach: 'Coach / Profesor',
  club: 'Alumno o representante',
};

export const DESCRIPCION_MODO = {
  coach: 'Panel completo: tomar asistencia, armar equipos, registrar prácticas y la WRO.',
  club: 'Consulta la asistencia, los equipos, los tiempos y puntajes del club.',
};

export const ICONO_MODO = {
  coach: 'usuario',
  club: 'estudiantes',
};

/**
 * Secciones que ve cada modalidad.
 * El orden es el que aparece en el menú.
 */
export const RUTAS_POR_MODO = {
  coach: ['panel', 'asistencia', 'estudiantes', 'equipos', 'practicas', 'wro'],
  club: ['alumnos', 'equipos', 'practicas', 'wro'],
};

/** ¿Este modo puede modificar datos? Solo el coach. */
export function puedeEditar(modo) {
  return esModoValido(modo) && modo === 'coach';
}

/** ¿Este modo puede ver esta sección? */
export function puedeVer(modo, ruta) {
  const modoValido = esModoValido(modo) ? modo : 'club';
  return RUTAS_POR_MODO[modoValido].includes(String(ruta ?? ''));
}

/** Rutas visibles para un modo. */
export function rutasDe(modo) {
  return RUTAS_POR_MODO[esModoValido(modo) ? modo : 'club'];
}

/** Mensaje único cuando alguien intenta editar sin permiso. */
export const MENSAJE_SOLO_CONSULTA =
  'Estás en el modo de consulta (alumno o representante), así que no se pueden guardar cambios. '
  + 'Pídele al coach que lo registre, o entra con la contraseña del coach.';

/** ¿El modo es válido? */
export function esModoValido(modo) {
  return MODOS.includes(String(modo ?? '').trim());
}

/* ------------------------------------------------------------------ *
 * CONTRASEÑA DEL COACH
 * ------------------------------------------------------------------ */

/** La contraseña sigue siendo la de ejemplo? */
export function esContrasenaDeEjemplo(contrasena) {
  const texto = String(contrasena ?? '').trim();
  return texto === '' || texto === 'CAMBIA-ESTA-CLAVE' || texto === 'cambiar-clave';
}

/** ¿Está configurada la contraseña del coach? */
export function hayContrasenaCoach(config = {}) {
  return !esContrasenaDeEjemplo(config.CONTRASENA_COACH);
}

/**
 * Comprueba la contraseña del coach.
 * Compara recortando espacios a los dos lados para que no falle por un
 * espacio de más al pegar.
 */
export function contrasenaCorrecta(escrita, config = {}) {
  const esperada = String(config.CONTRASENA_COACH ?? '').trim();
  const recibida = String(escrita ?? '').trim();
  if (esperada === '' || esContrasenaDeEjemplo(esperada)) return false;
  return esperada === recibida;
}

/**
 * Decide si se puede entrar según el modo elegido.
 * Devuelve una forma uniforme para que la pantalla de acceso no tenga que
 * ramificar con condiciones.
 *
 * @returns {{ permitido: boolean, codigo: string, mensaje: string, modo: string|null }}
 */
export function evaluarEntrada({ modo, contrasena = '', config = {} } = {}) {
  const elegido = String(modo ?? '').trim();

  if (!esModoValido(elegido)) {
    return {
      permitido: false,
      codigo: 'modo_invalido',
      mensaje: 'Elige si entras como coach o como alumno/representante.',
      modo: null,
    };
  }

  if (elegido === 'club') {
    return { permitido: true, codigo: 'ok', mensaje: '', modo: 'club' };
  }

  // Modo coach: exige contraseña configurada y correcta.
  if (!hayContrasenaCoach(config)) {
    return {
      permitido: false,
      codigo: 'sin_contrasena_configurada',
      mensaje: 'El modo coach todavía no tiene contraseña. Ponle una en docs/js/config.js '
        + '(CONTRASENA_COACH) y vuelve a intentarlo.',
      modo: null,
    };
  }

  if (String(contrasena ?? '').trim() === '') {
    return {
      permitido: false,
      codigo: 'contrasena_vacia',
      mensaje: 'Escribe la contraseña del coach.',
      modo: null,
    };
  }

  if (!contrasenaCorrecta(contrasena, config)) {
    return {
      permitido: false,
      codigo: 'contrasena_incorrecta',
      mensaje: 'Esa no es la contraseña del coach. Revísala e inténtalo otra vez.',
      modo: null,
    };
  }

  return { permitido: true, codigo: 'ok', mensaje: '', modo: 'coach' };
}

/* ------------------------------------------------------------------ *
 * MEMORIA DEL MODO ELEGIDO
 * ------------------------------------------------------------------ */

const CLAVE_MODO = 'coachpanel.modo';

/** Almacenamiento seguro: si localStorage falla, se usa memoria. */
function almacen() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    // modo privado: se cae a memoria
  }
  return null;
}

/** Modo recordado en este dispositivo, o null si no hay ninguno. */
export function modoGuardado() {
  try {
    const crudo = almacen()?.getItem(CLAVE_MODO);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    if (!datos?.ok || !esModoValido(datos.modo)) return null;
    return datos.modo;
  } catch {
    return null;
  }
}

/** Recuerda el modo elegido para no volver a preguntar en este dispositivo. */
export function guardarModo(modo, extra = {}) {
  if (!esModoValido(modo)) return false;
  try {
    almacen()?.setItem(CLAVE_MODO, JSON.stringify({
      ok: true,
      modo,
      desde: new Date().toISOString(),
      ...extra,
    }));
    return true;
  } catch {
    return false;
  }
}

/** Olvida el modo: la próxima visita vuelve a preguntar. */
export function olvidarModo() {
  try {
    almacen()?.removeItem(CLAVE_MODO);
    return true;
  } catch {
    return false;
  }
}
