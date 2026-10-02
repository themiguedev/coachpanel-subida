/**
 * respaldar.mjs — Descarga toda la base de CoachPanel a archivos locales.
 *
 * IMPORTANTE: el plan gratuito de Supabase NO incluye respaldos automáticos.
 * Este script es tu red de seguridad: córrelo de vez en cuando y guarda los
 * archivos en un lugar aparte (una carpeta en Drive, un pendrive…).
 *
 * Escribe en la carpeta `respaldos/`:
 *   · respaldo-<fecha>.json  → todo, listo para volver a importar
 *   · *.csv                  → uno por tabla, se abren con Excel
 *
 *   node scripts/respaldar.mjs
 *   node scripts/respaldar.mjs --carpeta "D:\Mis respaldos"
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import { ClientePostgrest } from '../docs/js/postgrest.js';
import { cargarConfigValida, BASE } from './config-nodo.mjs';

const TABLAS = [
  'estudiantes',
  'equipos',
  'equipo_integrantes',
  'sesiones',
  'asistencia',
  'retos',
  'practicas',
  'app_ajustes',
];

const VISTAS = [
  'vista_equipos_resumen',
  'vista_ranking_practicas',
  'vista_asistencia_estudiante',
];

/** Convierte filas a CSV (separador ';' para que Excel en español lo abra bien). */
function aCsv(filas) {
  if (!Array.isArray(filas) || filas.length === 0) return '';

  const columnas = [...new Set(filas.flatMap((fila) => Object.keys(fila ?? {})))];

  const escapar = (valor) => {
    if (valor === null || valor === undefined) return '';
    if (typeof valor === 'object') return escapar(JSON.stringify(valor));
    const texto = String(valor);
    return /[",;\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  const lineas = [columnas.join(';')];
  filas.forEach((fila) => {
    lineas.push(columnas.map((columna) => escapar(fila?.[columna])).join(';'));
  });

  // BOM para que Excel respete los acentos.
  return `\uFEFF${lineas.join('\r\n')}`;
}

/** Lee una tabla completa, paginando porque PostgREST corta en 1000 filas. */
async function leerTodo(cliente, tabla) {
  const PAGINA = 1000;
  const filas = [];

  for (let pagina = 0; pagina < 50; pagina += 1) {
    // eslint-disable-next-line no-await-in-loop
    const lote = await cliente
      .desde(tabla)
      .seleccionar('*')
      .rango(pagina * PAGINA, (pagina + 1) * PAGINA - 1)
      .ejecutar();

    if (!Array.isArray(lote) || lote.length === 0) break;
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }

  return filas;
}

function leerArgumento(nombre, porDefecto) {
  const indice = process.argv.indexOf(`--${nombre}`);
  if (indice === -1) return porDefecto;
  return process.argv[indice + 1] ?? porDefecto;
}

async function principal() {
  const config = await cargarConfigValida();

  const cliente = new ClientePostgrest({
    baseUrl: config.SUPABASE_URL.replace(/\/+$/, ''),
    apiKey: config.SUPABASE_ANON_KEY,
    reintentos: 2,
  });

  const marca = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const carpetaSalida = resolve(leerArgumento('carpeta', join(BASE, 'respaldos')));
  await mkdir(carpetaSalida, { recursive: true });

  console.log('\n════════════════════════════════════════════');
  console.log('  CoachPanel — respaldo de datos');
  console.log('════════════════════════════════════════════');
  console.log(`\n  Destino: ${carpetaSalida}\n`);

  const respaldo = {
    generado_en: new Date().toISOString(),
    version: 1,
    origen: cliente.baseUrl,
    tablas: {},
    vistas: {},
  };

  let totalFilas = 0;
  const archivosCsv = [];

  for (const tabla of TABLAS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const filas = await leerTodo(cliente, tabla);
      respaldo.tablas[tabla] = filas;
      totalFilas += filas.length;

      if (filas.length > 0) {
        const nombreCsv = `respaldo-${marca}-${tabla}.csv`;
        // eslint-disable-next-line no-await-in-loop
        await writeFile(join(carpetaSalida, nombreCsv), aCsv(filas), 'utf8');
        archivosCsv.push(nombreCsv);
      }

      console.log(`  ✔ ${tabla.padEnd(20)} ${String(filas.length).padStart(6)} filas`);
    } catch (error) {
      console.log(`  ✖ ${tabla.padEnd(20)} ${error.message}`);
    }
  }

  console.log('');

  for (const vista of VISTAS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const filas = await leerTodo(cliente, vista);
      respaldo.vistas[vista] = filas;
      console.log(`  ✔ ${vista.padEnd(20)} ${String(filas.length).padStart(6)} filas (resumen)`);
    } catch {
      console.log(`  · ${vista.padEnd(20)} (no disponible; es solo un resumen)`);
    }
  }

  // El JSON con todo: sirve para volver a importar la base completa.
  const nombreJson = `respaldo-${marca}.json`;
  const rutaJson = join(carpetaSalida, nombreJson);
  await writeFile(rutaJson, JSON.stringify(respaldo, null, 2), 'utf8');

  console.log(`\n${'─'.repeat(44)}`);
  console.log(`  Respaldo completo: ${totalFilas} filas en total`);
  console.log(`  Archivo principal: ${nombreJson}`);
  if (archivosCsv.length) {
    console.log(`  Hojas de cálculo:  ${archivosCsv.length} archivos .csv (se abren con Excel)`);
  }
  console.log(`\n  Carpeta: ${carpetaSalida}`);

  if (totalFilas === 0) {
    console.log('\n  Aviso: la base está vacía. ¿Ya ejecutaste los SQL y registraste datos?');
  } else {
    console.log('\n  Guarda estos archivos en un lugar aparte: el plan gratuito de');
    console.log('  Supabase no hace respaldos automáticos.');
  }
  console.log('');

  return 0;
}

principal()
  .then((codigo) => { process.exitCode = codigo; })
  .catch((error) => {
    console.error(`\n  Error al respaldar: ${error.message}\n`);
    if (error.esFalloDeRed) {
      console.error('  No hubo conexión con Supabase. Revisa tu internet o si el proyecto está pausado.\n');
    }
    process.exitCode = 1;
  });
