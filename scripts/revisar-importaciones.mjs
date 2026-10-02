/**
 * revisar-importaciones.mjs — Verificador de importaciones entre módulos.
 *
 * Los módulos ES resuelven las importaciones AL CARGAR el archivo: si una
 * vista importa un nombre que no existe, el navegador no carga NADA y la app
 * queda en blanco con un error críptico en la consola.
 *
 * Este script recorre docs/js, compara cada `import { ... } from './x.js'`
 * contra lo que `x.js` exporta de verdad y avisa si algo no cuadra.
 *
 *   node scripts/revisar-importaciones.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const BASE = resolve(AQUI, '..');
const CARPETA_JS = join(BASE, 'docs', 'js');

/** Lista todos los archivos .js dentro de docs/js. */
async function listarArchivos(carpeta) {
  const entradas = await readdir(carpeta, { withFileTypes: true });
  const salida = [];
  for (const entrada of entradas) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      salida.push(...await listarArchivos(ruta));
    } else if (entrada.name.endsWith('.js')) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** Nombres que un archivo exporta. */
function exportaciones(codigo) {
  const nombres = new Set();

  // export function nombre / export async function nombre / export class nombre
  for (const coincidencia of codigo.matchAll(
    /^\s*export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/gm,
  )) {
    nombres.add(coincidencia[1]);
  }

  // export const nombre / export let nombre / export var nombre
  for (const coincidencia of codigo.matchAll(/^\s*export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) {
    nombres.add(coincidencia[1]);
  }

  // export { a, b as c }
  for (const coincidencia of codigo.matchAll(/^\s*export\s*\{([^}]+)\}/gm)) {
    coincidencia[1].split(',').forEach((parte) => {
      const limpio = parte.trim();
      if (!limpio) return;
      const alias = limpio.split(/\s+as\s+/);
      nombres.add((alias[1] ?? alias[0]).trim());
    });
  }

  // export * from './x.js'  -> no se puede resolver estáticamente; se marca aparte
  const exportaTodo = /^\s*export\s+\*\s+from/gm.test(codigo);

  return { nombres, exportaTodo };
}

/** Importaciones del archivo: [{ origen, nombres: [] }] */
function importaciones(codigo) {
  const salida = [];

  for (const coincidencia of codigo.matchAll(
    /^\s*import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"]/gm,
  )) {
    const crudo = coincidencia[1].trim();
    const origen = coincidencia[2];

    const nombres = [];
    const entreLlaves = /\{([^}]*)\}/.exec(crudo);
    if (entreLlaves) {
      entreLlaves[1].split(',').forEach((parte) => {
        const limpio = parte.trim();
        if (!limpio) return;
        const sinAlias = limpio.split(/\s+as\s+/)[0].trim();
        if (sinAlias) nombres.push(sinAlias);
      });
    }

    salida.push({ origen, nombres });
  }

  return salida;
}

async function principal() {
  const archivos = await listarArchivos(CARPETA_JS);
  const cache = new Map();

  for (const archivo of archivos) {
    const codigo = await readFile(archivo, 'utf8');
    cache.set(resolve(archivo), exportaciones(codigo));
  }

  const problemas = [];

  for (const archivo of archivos) {
    const codigo = await readFile(archivo, 'utf8');
    const relativas = importaciones(codigo);

    for (const { origen, nombres } of relativas) {
      if (!origen.startsWith('.')) continue;   // paquetes externos: no hay

      const destino = resolve(dirname(archivo), origen);
      if (!cache.has(destino)) {
        problemas.push(`${rel(archivo)}: importa "${origen}" pero ese archivo no existe`);
        continue;
      }

      const { nombres: disponibles, exportaTodo } = cache.get(destino);
      if (exportaTodo) continue;

      for (const nombre of nombres) {
        if (!disponibles.has(nombre)) {
          problemas.push(
            `${rel(archivo)}: importa "${nombre}" de "${origen}", pero ese archivo no lo exporta`,
          );
        }
      }
    }
  }

  if (problemas.length === 0) {
    console.log(`✔ ${archivos.length} archivos revisados. Todas las importaciones existen.`);
    return 0;
  }

  console.log(`✖ Se encontraron ${problemas.length} problema(s):\n`);
  problemas.forEach((problema) => console.log(`  · ${problema}`));
  return 1;
}

function rel(ruta) {
  return ruta.slice(BASE.length + 1).replace(/\\/g, '/');
}

principal()
  .then((codigo) => { process.exitCode = codigo; })
  .catch((error) => {
    console.error('Error al revisar las importaciones:', error);
    process.exitCode = 1;
  });
