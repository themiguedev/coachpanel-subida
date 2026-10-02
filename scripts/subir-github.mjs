/**
 * subir-github.mjs — Sube el proyecto a un repositorio de GitHub usando su API.
 *
 * ¿Por qué por la API y no con `git push`? Porque en este entorno git no puede
 * negociar TLS (schannel falla con SEC_E_NO_CREDENTIALS), mientras que fetch de
 * Node sí funciona. La API hace lo mismo: crea un blob por archivo, arma el
 * árbol, crea el commit y mueve la rama.
 *
 * Uso:
 *   $env:GH_TOKEN = "tu-token"
 *   node scripts/subir-github.mjs [usuario/repositorio] [rama]
 *
 * No guarda el token en ningún lado: solo lo lee de la variable de entorno.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const BASE = resolve(AQUI, '..');

const TOKEN = process.env.GH_TOKEN;
const REPO = process.argv[2] ?? 'themiguedev/coachpanel-subida';
const RAMA = process.argv[3] ?? 'main';

/** Carpetas y archivos que NUNCA se suben. */
const EXCLUIDOS = [
  '.git', 'datos', 'respaldos', 'node_modules', '.vscode', '.idea', '.dsh',
];

/** Extensiones que no aportan al repositorio. */
const EXTENSIONES_EXCLUIDAS = ['.db', '.sqlite', '.sqlite3', '.tmp', '.log'];

const CABECERAS = {
  Authorization: `Bearer ${TOKEN}`,
  'User-Agent': 'coachpanel',
  Accept: 'application/vnd.github+json',
};

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(`https://api.github.com${ruta}`, {
    ...opciones,
    headers: { ...CABECERAS, ...(opciones.headers ?? {}) },
  });
  const texto = await respuesta.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = texto;
  }
  if (!respuesta.ok) {
    const detalle = typeof datos === 'object' ? (datos.message ?? JSON.stringify(datos)) : datos;
    throw new Error(`${opciones.method ?? 'GET'} ${ruta} → ${respuesta.status}: ${detalle}`);
  }
  return datos;
}

/** Recorre el proyecto y devuelve los archivos que se van a subir. */
async function listarArchivos(carpeta = BASE) {
  const salida = [];
  const entradas = await readdir(carpeta, { withFileTypes: true });

  for (const entrada of entradas) {
    const rutaCompleta = join(carpeta, entrada.name);
    const nombreRelativo = relative(BASE, rutaCompleta).split(sep).join('/');

    if (EXCLUIDOS.includes(entrada.name)) continue;
    if (EXTENSIONES_EXCLUIDAS.some((ext) => entrada.name.endsWith(ext))) continue;
    if (entrada.name === '.DS_Store' || entrada.name === 'Thumbs.db') continue;

    if (entrada.isDirectory()) {
      salida.push(...await listarArchivos(rutaCompleta));
    } else {
      salida.push(nombreRelativo);
    }
  }

  return salida;
}

async function principal() {
  if (!TOKEN) {
    throw new Error('Falta la variable de entorno GH_TOKEN.');
  }

  console.log(`\n  Repositorio: ${REPO}\n  Rama:        ${RAMA}\n`);

  const repositorio = await api(`/repos/${REPO}`);
  console.log(`  ✔ Conectado a ${repositorio.full_name} (${repositorio.private ? 'privado' : 'público'})`);

  const archivos = (await listarArchivos()).sort();

  // ---- 0. ¿El repositorio está vacío? ----
  // Un repositorio sin commits RECHAZA la API de objetos ("409 Git Repository
  // is empty"). Para arrancarlo se sube el primer archivo con la API de
  // contenidos, que sí sabe crear la rama inicial. Después ya se puede usar la
  // vía rápida por árboles, que sube todo en tres llamadas.
  let yaTieneCommit = true;
  try {
    await api(`/repos/${REPO}/git/ref/heads/${RAMA}`);
  } catch {
    yaTieneCommit = false;
  }

  if (!yaTieneCommit) {
    const primerArchivo = archivos.find((a) => a === 'README.md') ?? archivos[0];
    const contenido = await readFile(join(BASE, primerArchivo));
    console.log(`  · Repositorio vacío: se inicializa con "${primerArchivo}"`);

    await api(`/repos/${REPO}/contents/${encodeURI(primerArchivo)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Inicio del proyecto',
        content: contenido.toString('base64'),
        branch: RAMA,
      }),
    });
    console.log('  ✔ Rama inicial creada');
  }

  console.log(`  ✔ ${archivos.length} archivos para subir\n`);

  // ---- 1. Un blob por archivo ----
  const entradasArbol = [];
  for (const archivo of archivos) {
    const contenido = await readFile(join(BASE, archivo));
    // eslint-disable-next-line no-await-in-loop
    const blob = await api(`/repos/${REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: contenido.toString('base64'),
        encoding: 'base64',
      }),
    });
    entradasArbol.push({ path: archivo, mode: '100644', type: 'blob', sha: blob.sha });
    process.stdout.write(`\r  Subiendo… ${entradasArbol.length}/${archivos.length}`);
  }
  console.log('\n  ✔ Archivos cargados');

  // ---- 2. Árbol ----
  const arbol = await api(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree: entradasArbol }),
  });
  console.log(`  ✔ Árbol creado (${arbol.sha.slice(0, 7)})`);

  // ---- 3. Commit ----
  // Si la rama ya existía, el commit lleva padre; si no, es el primero.
  let padre = null;
  try {
    const actual = await api(`/repos/${REPO}/git/ref/heads/${RAMA}`);
    padre = actual.object.sha;
  } catch {
    padre = null;
  }

  const cuerpoCommit = {
    message: 'CoachPanel: asistencia y prácticas de robótica LEGO con la WRO Venezuela\n\n'
      + 'Sistema web para un club de robótica educativa:\n\n'
      + '- Panel del coach: asistencia con cuatro estados, historial con porcentajes,\n'
      + '  estudiantes, equipos de hasta 3 integrantes y prácticas de pista con\n'
      + '  tiempo (mm:ss.ms) y puntaje.\n'
      + '- Portal de acceso con dos modalidades: coach (con contraseña, edita todo)\n'
      + '  y alumno o representante (sin contraseña, solo consulta). La barrera de\n'
      + '  solo-lectura vive en la capa de datos, no solo en los botones.\n'
      + '- Vista «El club» para las familias: asistencia, equipos, mejores tiempos\n'
      + '  y puntajes por pista, con descarga en CSV.\n'
      + '- Base de datos en Supabase con RLS y borrado prohibido para proteger el\n'
      + '  historial. 177 pruebas automáticas y verificador de instalación.\n\n'
      + 'Sin dependencias: cero paquetes de npm, sin build. Solo archivos estáticos.',
    tree: arbol.sha,
  };
  if (padre) cuerpoCommit.parents = [padre];

  const commit = await api(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify(cuerpoCommit),
  });
  console.log(`  ✔ Commit creado (${commit.sha.slice(0, 7)})`);

  // ---- 4. Mover la rama ----
  if (padre) {
    await api(`/repos/${REPO}/git/refs/heads/${RAMA}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
    console.log(`  ✔ Rama ${RAMA} actualizada`);
  } else {
    await api(`/repos/${REPO}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${RAMA}`, sha: commit.sha }),
    });
    console.log(`  ✔ Rama ${RAMA} creada`);
  }

  console.log(`\n  Listo: https://github.com/${REPO}/tree/${RAMA}`);
  console.log(`  Commit: https://github.com/${REPO}/commit/${commit.sha}\n`);

  return { commit: commit.sha, archivos: archivos.length };
}

principal().catch((error) => {
  console.error(`\n  ✖ ${error.message}\n`);
  process.exitCode = 1;
});
