/**
 * config-nodo.mjs — Carga la configuración de la app desde Node.
 *
 * Reutiliza el MISMO archivo `docs/js/config.js` que usa el navegador, para
 * que no haya dos sitios donde configurar. Así, si la app funciona en el
 * navegador, los scripts también, y al revés.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
export const BASE = resolve(AQUI, '..');
export const RUTA_CONFIG = resolve(BASE, 'docs', 'js', 'config.js');

/** Carga el objeto CONFIG desde docs/js/config.js. */
export async function cargarConfig() {
  let modulo;
  try {
    modulo = await import(pathToFileURL(RUTA_CONFIG).href);
  } catch (error) {
    throw new Error(
      `No se pudo leer docs/js/config.js: ${error.message}\n`
      + 'Revisa que el archivo exista (puedes copiar config.ejemplo.js).',
    );
  }

  const config = modulo.CONFIG ?? modulo.default;
  if (!config) {
    throw new Error('docs/js/config.js no exporta una constante CONFIG.');
  }
  return config;
}

/**
 * Carga y valida la configuración.
 * Devuelve un error entendible si falta algo, en vez de fallar más adelante
 * con un mensaje raro.
 */
export async function cargarConfigValida() {
  const config = await cargarConfig();
  const faltantes = [];

  if (!config.SUPABASE_URL || String(config.SUPABASE_URL).includes('TU-PROYECTO')) {
    faltantes.push('SUPABASE_URL');
  } else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(String(config.SUPABASE_URL).replace(/\/+$/, ''))) {
    faltantes.push('SUPABASE_URL (debe verse como https://tuproyecto.supabase.co)');
  }

  if (!config.SUPABASE_ANON_KEY || String(config.SUPABASE_ANON_KEY).includes('TU-CLAVE')) {
    faltantes.push('SUPABASE_ANON_KEY');
  } else if (String(config.SUPABASE_ANON_KEY).length < 30) {
    faltantes.push('SUPABASE_ANON_KEY (parece incompleta)');
  }

  if (!config.TOKEN_ACCESO || config.TOKEN_ACCESO === 'CAMBIA-ESTE-TOKEN') {
    faltantes.push('TOKEN_ACCESO');
  } else if (String(config.TOKEN_ACCESO).length < 6) {
    faltantes.push('TOKEN_ACCESO (usa al menos 6 caracteres)');
  }

  if (faltantes.length > 0) {
    throw new Error(
      'Falta configurar docs/js/config.js:\n'
      + faltantes.map((nombre) => `  · ${nombre}`).join('\n')
      + '\n\nSigue los pasos de GUIA-DESPLIEGUE.md.',
    );
  }

  return config;
}

/** Lee un archivo de texto del proyecto. */
export async function leerArchivoProyecto(...partes) {
  return readFile(resolve(BASE, ...partes), 'utf8');
}

export { pathToFileURL };
