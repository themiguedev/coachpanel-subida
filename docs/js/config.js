/**
 * config.js — Configuración REAL de CoachPanel.
 *
 * ⚠️  EDITA ESTE ARCHIVO y coloca tus tres valores de Supabase.
 *     Mientras los dejes en el ejemplo, la app abrirá una pantalla que
 *     te avisa que falta configurar (no se rompe, solo avisa).
 *
 * Este archivo SÍ se sube al repositorio: es la decisión del proyecto
 * (token fijo en el código). Ver seguridad.mejorar.md para saber qué
 * implica y cómo endurecerlo más adelante.
 *
 * Lee GUIA-DESPLIEGUE.md si es tu primera vez: tiene los pasos numerados.
 */

export const CONFIG = {
  /**
   * URL del proyecto (sin `/rest/v1/` y sin barra final).
   * OJO: en Supabase, Settings → API muestra varias direcciones. La buena es la
   * que se ve como 'https://xxxxx.supabase.co' — no la de la API REST.
   */
  SUPABASE_URL: 'https://ctoiqqzrxgqxmdhsgyby.supabase.co',

  /**
   * Clave PUBLICABLE (empieza por 'sb_publishable_'; en el panel antiguo es la
   * fila 'anon public' que empieza por 'eyJ').
   *
   * NUNCA pongas aquí la clave secreta ('sb_secret_' o 'service_role'): se
   * saltaría todas las reglas de seguridad y esta página es pública.
   */
  SUPABASE_ANON_KEY: 'sb_publishable_J5rLMmQQ_BQvb-PLLFMIaw__hki3oxo',

  /**
   * CONTROLES DE ACCESO — los dos modos del sistema.
   *
   * MODO COACH (el profesor): pide contraseña y puede editar todo.
   * Elige una contraseña propia aquí abajo. Que no sea obvia.
   *
   * MODO ALUMNO / REPRESENTANTE: sin contraseña. Solo consulta la asistencia,
   * los equipos, los tiempos y puntajes del club.
   *
   * Igual que el token, esta contraseña queda visible en el código de la
   * página publicada: es un filtro para el acceso casual, no seguridad real.
   * Ver seguridad.mejorar.md si algún día quieres cerrarlo de verdad.
   */
  CONTRASENA_COACH: 'admin-panel',

  /**
   * Token del link compartido. Debe ser IDÉNTICO al de la tabla app_ajustes
   * (clave 'token_acceso').
   *
   * Comparte el link así:  https://tuusuario.github.io/coachpanel-subida/#/acceso?t=admin-panel
   */
  TOKEN_ACCESO: 'admin-panel',

  /** Nombre del club (encabezado de la app). */
  NOMBRE_CLUB: 'Club de Robótica LEGO',

  /** Zona horaria para "hoy" y las fechas de clase. */
  ZONA_HORARIA: 'America/Caracas',

  /** Tu nombre, opcional (pie de página). */
  CREDITOS: '',
};

/** ¿Ya se configuró de verdad, o siguen los valores de ejemplo? */
export function estaConfigurado(config = CONFIG) {
  return Boolean(
    config.SUPABASE_URL
    && config.SUPABASE_ANON_KEY
    && !String(config.SUPABASE_URL).includes('TU-PROYECTO')
    && !String(config.SUPABASE_ANON_KEY).includes('TU-CLAVE'),
  );
}

/** Devuelve la lista de valores que faltan por configurar. */
export function configuracionFaltante(config = CONFIG) {
  const faltan = [];
  if (!config.SUPABASE_URL || String(config.SUPABASE_URL).includes('TU-PROYECTO')) {
    faltan.push('SUPABASE_URL');
  }
  if (!config.SUPABASE_ANON_KEY || String(config.SUPABASE_ANON_KEY).includes('TU-CLAVE')) {
    faltan.push('SUPABASE_ANON_KEY');
  }
  if (!config.TOKEN_ACCESO || config.TOKEN_ACCESO === 'CAMBIA-ESTE-TOKEN') {
    faltan.push('TOKEN_ACCESO');
  }
  return faltan;
}

export default CONFIG;
