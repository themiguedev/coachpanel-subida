/**
 * servir.mjs — Servidor local de archivos estáticos (solo para probar).
 *
 * Sirve la carpeta `docs/` en http://127.0.0.1:8765 usando solo Node.
 * Sirve para revisar la app en tu computadora antes de subirla a GitHub,
 * sin instalar nada.
 *
 *   node scripts/servir.mjs
 *   node scripts/servir.mjs --puerto 3000
 *
 * Nota: abrir `docs/index.html` con doble clic NO funciona bien, porque los
 * módulos de JavaScript necesitan http:// y no file://. Usa este servidor.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const RAIZ = resolve(AQUI, '..');
const DOCS = join(RAIZ, 'docs');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function leerArgumento(nombre, porDefecto) {
  const indice = process.argv.indexOf(`--${nombre}`);
  if (indice === -1) return porDefecto;
  return process.argv[indice + 1] ?? porDefecto;
}

const PUERTO_INICIAL = Number(leerArgumento('puerto', 8765));

async function responderArchivo(ruta, respuesta) {
  // Nunca salir de la carpeta docs/: protege contra rutas tipo ../../
  const resuelto = resolve(ruta);
  if (resuelto !== DOCS && !resuelto.startsWith(DOCS + sep)) {
    respuesta.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('Ruta no permitida');
    return;
  }

  let info;
  try {
    info = await stat(resuelto);
  } catch {
    respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('No encontrado');
    return;
  }

  let destino = resuelto;
  if (info.isDirectory()) destino = join(resuelto, 'index.html');

  try {
    const contenido = await readFile(destino);
    respuesta.writeHead(200, {
      'Content-Type': TIPOS[extname(destino).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    respuesta.end(contenido);
  } catch {
    respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('No encontrado');
  }
}

const servidor = createServer((peticion, respuesta) => {
  const url = new URL(peticion.url, 'http://localhost');
  let camino = decodeURIComponent(url.pathname);

  if (camino === '/' || camino === '') camino = '/index.html';

  // Las rutas del enrutador por hash (#/...) no llegan aquí; si llega algo
  // que no es un archivo (por ejemplo /equipos), se sirve el index.
  responderArchivo(join(DOCS, camino), respuesta).catch(() => {
    respuesta.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('Error interno');
  });
});

function intentar(esIntento, puerto) {
  servidor.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && esIntento < 10) {
      intentar(esIntento + 1, puerto + 1);
    } else {
      console.error(`No se pudo abrir el servidor en el puerto ${puerto}: ${error.message}`);
      process.exit(1);
    }
  });

  servidor.listen(puerto, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${puerto}/`;
    console.log('');
    console.log('  CoachPanel está corriendo en:');
    console.log(`    ${url}`);
    console.log('');
    console.log('  Abre esa dirección en el navegador.');
    console.log('  Para detenerlo: Ctrl + C');
    console.log('');
  });
}

intentar(0, PUERTO_INICIAL);
