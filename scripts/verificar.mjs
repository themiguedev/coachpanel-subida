/**
 * verificar.mjs — Autodiagnóstico de CoachPanel contra tu proyecto de Supabase.
 *
 * Comprueba, en orden:
 *   1. Que docs/js/config.js esté completo y bien formado.
 *   2. Que la conexión con Supabase funcione.
 *   3. Que las 4 tandas de SQL se hayan ejecutado (tablas y vistas).
 *   4. Que el RLS esté protegiendo las tablas.
 *   5. Que el token guardado en app_ajustes coincida con el de config.js.
 *   6. Que la tabla de integrantes impida de verdad un 4.º integrante.
 *   7. Que el borrado esté prohibido donde debe estarlo.
 *
 * Las pruebas que necesitan escribir crean datos de prueba y los eliminan
 * al terminar (salvo equipo_integrantes, que sí se puede borrar). No toca
 * tus datos reales.
 *
 *   node scripts/verificar.mjs
 */

import { ClientePostgrest } from '../docs/js/postgrest.js';
import { cargarConfigValida, RUTA_CONFIG } from './config-nodo.mjs';

let correctas = 0;
let errores = 0;
let avisos = 0;

const COLOR = process.stdout.isTTY;
const verde = (t) => (COLOR ? `\x1b[32m${t}\x1b[0m` : t);
const rojo = (t) => (COLOR ? `\x1b[31m${t}\x1b[0m` : t);
const amarillo = (t) => (COLOR ? `\x1b[33m${t}\x1b[0m` : t);
const gris = (t) => (COLOR ? `\x1b[90m${t}\x1b[0m` : t);

function bien(titulo, detalle = '') {
  correctas += 1;
  console.log(`  ${verde('✔')} ${titulo}${detalle ? gris(` — ${detalle}`) : ''}`);
}

function mal(titulo, detalle = '', sugerencia = '') {
  errores += 1;
  console.log(`  ${rojo('✖')} ${titulo}${detalle ? `\n      ${detalle}` : ''}`);
  if (sugerencia) console.log(`      ${gris(`→ ${sugerencia}`)}`);
}

function aviso(titulo, detalle = '') {
  avisos += 1;
  console.log(`  ${amarillo('!')} ${titulo}${detalle ? `\n      ${detalle}` : ''}`);
}

function titulo(texto) {
  console.log(`\n${texto}`);
}

/* ------------------------------------------------------------------ */

async function principal() {
  console.log('\n════════════════════════════════════════════');
  console.log('  CoachPanel — verificación de la instalación');
  console.log('════════════════════════════════════════════');

  // ---------- 1. Configuración ----------
  titulo('1. Configuración (docs/js/config.js)');
  let config;
  try {
    config = await cargarConfigValida();
    bien('La configuración está completa');
  } catch (error) {
    mal('La configuración tiene problemas', error.message);
    console.log(gris(`\n  Archivo revisado: ${RUTA_CONFIG}`));
    return finalizar();
  }

  // ---------- 2. Conexión ----------
  titulo('2. Conexión con Supabase');
  const cliente = new ClientePostgrest({
    baseUrl: config.SUPABASE_URL.replace(/\/+$/, ''),
    apiKey: config.SUPABASE_ANON_KEY,
    reintentos: 1,
  });

  try {
    const respuesta = await cliente.peticion(
      `${cliente.baseUrl}/rest/v1/app_ajustes?select=clave&limit=1`,
      {
        cabeceras: {
          apikey: cliente.apiKey,
          Authorization: `Bearer ${cliente.apiKey}`,
        },
      },
    );

    if (respuesta.ok) {
      bien('La conexión funciona', cliente.baseUrl);
    } else if (respuesta.estado === 404) {
      mal(
        'Conectó, pero las tablas no existen (falta ejecutar el SQL)',
        'La API respondió 404.',
        'Abre el SQL Editor de Supabase y ejecuta, en orden, los archivos de la carpeta supabase/.',
      );
      return finalizar();
    } else if (respuesta.estado === 401 || respuesta.estado === 403) {
      mal(
        'La clave anon no es válida',
        `La API respondió ${respuesta.estado}.`,
        'Copia de nuevo "anon public" en Settings → API de Supabase y pégalo en SUPABASE_ANON_KEY.',
      );
      return finalizar();
    } else {
      mal('Respuesta inesperada de Supabase', `Estado ${respuesta.estado}`);
      return finalizar();
    }
  } catch (error) {
    if (error.esFalloDeRed) {
      mal(
        'No hay conexión con Supabase',
        'Si el proyecto lleva más de una semana sin usarse, Supabase lo pausó.',
        'Entra a supabase.com/dashboard, elige tu proyecto y pulsa "Restore project".',
      );
    } else {
      mal('Error al conectar', error.message);
    }
    return finalizar();
  }

  // ---------- 3. Tablas y vistas ----------
  titulo('3. Tablas y vistas del esquema');

  const tablas = [
    'estudiantes', 'equipos', 'equipo_integrantes', 'sesiones',
    'asistencia', 'retos', 'practicas', 'app_ajustes', 'log_acceso',
  ];
  const vistas = ['vista_equipos_resumen', 'vista_ranking_practicas', 'vista_asistencia_estudiante'];

  for (const tabla of tablas) {
    try {
      await cliente.desde(tabla).seleccionar('*').limitar(1).ejecutar();
      bien(`Tabla "${tabla}"`);
    } catch (error) {
      if (error.codigo === 'no_encontrado' || /does not exist|no existe/i.test(error.message ?? '')) {
        mal(`Falta la tabla "${tabla}"`, '', 'Ejecuta supabase/01_esquema.sql en el SQL Editor.');
      } else {
        mal(`La tabla "${tabla}" no respondió`, error.message);
      }
    }
  }

  for (const vista of vistas) {
    try {
      await cliente.desde(vista).seleccionar('*').limitar(1).ejecutar();
      bien(`Vista "${vista}"`);
    } catch (error) {
      mal(
        `Falta la vista "${vista}"`,
        error.message,
        'Ejecuta supabase/04_vistas.sql en el SQL Editor.',
      );
    }
  }

  // ---------- 4. El token coincide ----------
  titulo('4. Token de acceso');
  try {
    const filas = await cliente.desde('app_ajustes').seleccionar('clave,valor').ejecutar();
    const ajustes = new Map(filas.map((f) => [f.clave, f.valor]));
    const tokenGuardado = ajustes.get('token_acceso');

    if (!tokenGuardado) {
      mal(
        'No hay token guardado en la base',
        'La tabla app_ajustes no tiene la fila "token_acceso".',
        'Ejecuta supabase/03_datos_iniciales.sql o agrega la fila a mano.',
      );
    } else if (tokenGuardado === 'CAMBIA-ESTE-TOKEN') {
      mal(
        'El token sigue siendo el de ejemplo',
        'Cualquiera que lea el código de la página podría entrar.',
        'Cambia app_ajustes.token_acceso y TOKEN_ACCESO en docs/js/config.js por el mismo valor nuevo.',
      );
    } else if (tokenGuardado === config.TOKEN_ACCESO) {
      bien('El token de config.js coincide con el de la base de datos');
    } else {
      mal(
        'El token de config.js NO coincide con el de la base de datos',
        'Con este token la app no dejará entrar.',
        'Pon el mismo valor en docs/js/config.js (TOKEN_ACCESO) y en app_ajustes.token_acceso.',
      );
    }

    if (ajustes.get('nombre_club')) {
      bien(`Nombre del club: ${ajustes.get('nombre_club')}`);
    } else {
      aviso('No hay "nombre_club" configurado', 'Es opcional; se usa en el encabezado.');
    }

    const retos = await cliente.desde('retos').seleccionar('id,nombre').ejecutar();
    if (retos.length > 0) {
      bien(`Catálogo de retos`, `${retos.length} retos cargados`);
    } else {
      aviso(
        'No hay retos cargados',
        'Puedes crearlos desde la app, en la sección Prácticas, o ejecutar 03_datos_iniciales.sql.',
      );
    }
  } catch (error) {
    mal('No se pudo leer app_ajustes', error.message);
  }

  // ---------- 5. RLS activo ----------
  titulo('5. Seguridad (RLS)');
  const sinRls = [];
  for (const tabla of tablas) {
    try {
      await cliente.desde(tabla).seleccionar('*').limitar(1).ejecutar();
    } catch (error) {
      if (error.codigo === 'sin_acceso' || error.codigo === 'sin_permiso') {
        sinRls.push(tabla);
      }
    }
  }
  if (sinRls.length === 0) {
    bien('Las tablas son legibles con la clave anon (RLS con políticas de lectura)');
  } else {
    mal(
      `Estas tablas bloquean la lectura: ${sinRls.join(', ')}`,
      'Puede que falten las políticas de lectura.',
      'Ejecuta supabase/02_rls.sql.',
    );
  }

  // ---------- 6. Pruebas de escritura ----------
  titulo('6. Reglas del club (pruebas de escritura con datos temporales)');
  const creados = { equipos: [], estudiantes: [], sesiones: [], practicas: [] };

  try {
    // El borrado debe estar PROHIBIDO en estudiantes y practicas.
    for (const tabla of ['estudiantes', 'practicas']) {
      try {
        await cliente.desde(tabla).filtrar({ id: -1 }).borrar();
        mal(
          `La tabla "${tabla}" permite borrar desde la web`,
          'El historial podría perderse por accidente o por alguien con el link.',
          'Ejecuta supabase/02_rls.sql: allí se retira el permiso de borrado.',
        );
      } catch (error) {
        if (error.codigo === 'sin_permiso' || error.codigo === 'sin_acceso') {
          bien(`Borrar está prohibido en "${tabla}" (correcto)`);
        } else {
          aviso(`No se pudo comprobar el borrado en "${tabla}"`, error.message);
        }
      }
    }

    // Equipo de prueba
    const marca = `QA-${Date.now()}`;
    const [equipo] = await cliente.desde('equipos').insertar({
      nombre: `Equipo de prueba ${marca}`,
      wro_estado: 'no_participa',
      activo: true,
    });
    creados.equipos.push(equipo.id);
    bien('Se puede crear un equipo');

    // Cuatro estudiantes de prueba
    const idsEstudiantes = [];
    for (let i = 1; i <= 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const [estudiante] = await cliente.desde('estudiantes').insertar({
        nombre: `Estudiante de prueba ${marca} ${i}`,
        activo: true,
      });
      idsEstudiantes.push(estudiante.id);
      creados.estudiantes.push(estudiante.id);
    }
    bien('Se pueden crear estudiantes');

    // Tres integrantes: debe funcionar
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await cliente.desde('equipo_integrantes').insertar({
        equipo_id: equipo.id,
        estudiante_id: idsEstudiantes[i],
        rol: i === 0 ? 'capitan' : 'integrante',
      });
    }
    bien('Un equipo acepta 3 integrantes');

    // El cuarto: debe fallar
    try {
      await cliente.desde('equipo_integrantes').insertar({
        equipo_id: equipo.id,
        estudiante_id: idsEstudiantes[3],
        rol: 'integrante',
      });
      mal(
        'El equipo aceptó un 4.º integrante',
        'La regla de máximo 3 integrantes NO se está aplicando en la base de datos.',
        'Ejecuta supabase/01_esquema.sql: allí está el disparador trg_limite_integrantes.',
      );
    } catch (error) {
      if (error.codigo === 'limite_integrantes' || /3 integrantes/i.test(error.message ?? '')) {
        bien('Un 4.º integrante se rechaza (correcto)');
      } else {
        aviso('El 4.º integrante falló, pero con otro mensaje', error.message);
      }
    }

    // Un estudiante no puede estar en dos equipos
    const [equipo2] = await cliente.desde('equipos').insertar({
      nombre: `Equipo de prueba 2 ${marca}`,
      activo: true,
    });
    creados.equipos.push(equipo2.id);
    try {
      await cliente.desde('equipo_integrantes').insertar({
        equipo_id: equipo2.id,
        estudiante_id: idsEstudiantes[0],
        rol: 'integrante',
      });
      mal(
        'Un estudiante pudo estar en dos equipos a la vez',
        'Los reportes de asistencia y puntaje podrían quedar ambiguos.',
        'Ejecuta supabase/01_esquema.sql.',
      );
    } catch (error) {
      if (error.codigo === 'duplicado' || /duplicate|unique/i.test(error.message ?? '')) {
        bien('Un estudiante no puede estar en dos equipos (correcto)');
      } else {
        aviso('La segunda pertenencia falló con otro mensaje', error.message);
      }
    }

    // Sesión, asistencia y práctica.
    // La fecha es muy vieja a propósito (para no mezclarse con clases reales) y
    // distinta en cada ejecución: la sesión tiene fecha única, así que una
    // fecha fija haría fallar la segunda corrida por duplicado.
    const fecha = new Date().toISOString().slice(0, 10);
    const diaDePrueba = String((Date.now() % 28) + 1).padStart(2, '0');
    const [sesion] = await cliente.desde('sesiones').insertar({
      fecha: `1990-03-${diaDePrueba}`,
      titulo: `Sesión de prueba ${marca}`,
      estado: 'abierta',
    });
    creados.sesiones.push(sesion.id);
    bien('Se puede crear una sesión de clase', `fecha de prueba 1990-03-${diaDePrueba}`);

    await cliente.desde('asistencia').upsert(
      [{ sesion_id: sesion.id, estudiante_id: idsEstudiantes[0], estado: 'presente' }],
      { sobre: 'sesion_id,estudiante_id' },
    );
    bien('Se puede guardar asistencia en lote (upsert)');

    const [practica] = await cliente.desde('practicas').insertar({
      fecha,
      equipo_id: equipo.id,
      intento: 1,
      duracion_ms: 83450,
      puntaje: 250,
      observaciones: 'Registro de prueba del verificador',
    });
    creados.practicas.push(practica.id);
    bien('Se puede registrar una práctica con tiempo y puntaje');

    // Vistas
    try {
      await cliente.desde('vista_equipos_resumen').seleccionar('*').limitar(1).ejecutar();
      bien('Las vistas de resumen responden');
    } catch (error) {
      aviso('Las vistas de resumen no responden', error.message);
    }
  } catch (error) {
    mal('Falló una prueba de escritura', error.message);
  } finally {
    // ---------- Limpieza ----------
    titulo('7. Limpieza de los datos de prueba');
    let limpiados = 0;
    let noLimpiados = 0;

    // El orden importa por las claves foráneas: primero lo que depende.
    const aBorrar = [
      ['asistencia', creados.sesiones.map((id) => ({ columna: 'sesion_id', valor: id }))],
      ['practicas', creados.practicas.map((id) => ({ columna: 'id', valor: id }))],
      ['sesiones', creados.sesiones.map((id) => ({ columna: 'id', valor: id }))],
      ['equipo_integrantes', creados.equipos.map((id) => ({ columna: 'equipo_id', valor: id }))],
      ['equipos', creados.equipos.map((id) => ({ columna: 'id', valor: id }))],
      ['estudiantes', creados.estudiantes.map((id) => ({ columna: 'id', valor: id }))],
    ];

    for (const [tabla, filtros] of aBorrar) {
      for (const { columna, valor } of filtros) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await cliente.desde(tabla).filtrar({ [columna]: valor }).borrar();
          limpiados += 1;
        } catch {
          noLimpiados += 1;
        }
      }
    }

    if (noLimpiados === 0) {
      bien('Los datos de prueba se eliminaron', `${limpiados} registros`);
    } else if (limpiados > 0) {
      aviso(
        'Quedaron algunos datos de prueba',
        'La base prohíbe borrar en estudiantes, sesiones y prácticas: es lo correcto.',
      );
      console.log(gris('      Bórralos desde el panel de Supabase (Table Editor) buscando "de prueba".'));
    }
  }

  return finalizar();
}

/* ------------------------------------------------------------------ */

function finalizar() {
  console.log(`\n${'─'.repeat(44)}`);
  if (errores === 0) {
    console.log(`  ${verde('Todo correcto')} — ${correctas} comprobaciones pasaron${avisos ? `, ${avisos} aviso(s)` : ''}.`);
    console.log('\n  Ya puedes abrir la app (docs/index.html servido por HTTP)\n');
    return 0;
  }

  console.log(`  ${rojo(`${errores} problema(s)`)} — ${correctas} comprobaciones pasaron, ${avisos} aviso(s).`);
  console.log('\n  Revisa los mensajes de arriba: cada uno dice qué hacer.');
  console.log('  La guía completa está en GUIA-DESPLIEGUE.md\n');
  return 1;
}

principal()
  .then((codigo) => { process.exitCode = codigo; })
  .catch((error) => {
    console.error(`\n${rojo('Error inesperado en la verificación:')}\n${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
