/**
 * config.ejemplo.js — Plantilla de configuración.
 *
 * Copia este archivo como `config.js` (en la misma carpeta) y rellena
 * los tres valores. Si ya existe `config.js`, este archivo es solo de
 * referencia y no se usa.
 */

export const CONFIG = {
  /** 1) Project URL — Supabase → Settings → API → Project URL
   *     Ejemplo: 'https://abcdefghijklm.supabase.co'  (SIN barra al final) */
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',

  /** 2) anon public key — Supabase → Settings → API → Project API keys → anon public
   *     Es una clave larga que empieza por 'eyJ...' */
  SUPABASE_ANON_KEY: 'TU-CLAVE-ANON-PUBLICA',

  /** 3) Token de acceso secreto: inventa el tuyo (por ejemplo 12 letras y números).
   *     El MISMO valor debe estar en la tabla app_ajustes, fila 'token_acceso'.
   *     Comparte el link así:  https://tuusuario.github.io/coachpanel-subida/#/acceso?t=TU-TOKEN
   *
   *     Recuerda: este token es un filtro para el acceso casual, no seguridad real,
   *     porque el sitio es público y el valor queda visible en el código. */
  TOKEN_ACCESO: 'CAMBIA-ESTE-TOKEN',

  /** 4) Contraseña del MODO COACH (el profesor).
   *     El modo alumno/representante NO pide contraseña: solo consulta.
   *     Que no sea obvia. También queda visible en el código publicado. */
  CONTRASENA_COACH: 'CAMBIA-ESTA-CLAVE',

  /** Nombre del club: aparece en el encabezado. */
  NOMBRE_CLUB: 'Club de Robótica LEGO',

  /** Zona horaria para calcular "hoy" y las fechas de clase. */
  ZONA_HORARIA: 'America/Caracas',

  /** Marca de la app en el pie de página (puedes poner tu nombre). */
  CREDITOS: '',
};

export default CONFIG;
