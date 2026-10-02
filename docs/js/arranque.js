/**
 * arranque.js — Arranque de la aplicación y puerta de acceso.
 *
 * Flujo:
 *   1. Verifica que config.js esté completo. Si no, muestra qué falta.
 *   2. Comprueba la conexión con Supabase y que los SQL ya se ejecutaron.
 *   3. Pide el token de acceso si este dispositivo todavía no lo validó.
 *   4. Arranca la interfaz.
 *
 * Si algo falla, se muestra un mensaje entendible con el paso siguiente.
 * Nunca una pantalla en blanco.
 */

import { CONFIG, estaConfigurado, configuracionFaltante } from './config.js';
import { crearApiDesdeConfig } from './api.js';
import { crearStore, temaInicial, aplicarTema, accesoGuardado, guardarAcceso, olvidarAcceso } from './store.js';
import { comprobarConexion } from './postgrest.js';
import { crear, limpiar, avisoOk, banda, icono, logotipo } from './ui.js';
import { montarApp } from './main.js';
import {
  ETIQUETAS_MODO, DESCRIPCION_MODO, ICONO_MODO, evaluarEntrada,
  modoGuardado, guardarModo, olvidarModo, esModoValido,
} from './roles.js';

/** Extrae el token de la dirección: #/acceso?t=XXXX o ?t=XXXX */
export function tokenDeDireccion(hash = '') {
  const texto = String(hash ?? '');
  const parametros = texto.includes('?') ? texto.slice(texto.indexOf('?') + 1) : '';
  if (!parametros) return null;
  try {
    const parametrosUrl = new URLSearchParams(parametros);
    const token = (parametrosUrl.get('t') ?? parametrosUrl.get('token') ?? '').trim();
    // Un parámetro vacío o de puros espacios no cuenta como token.
    return token === '' ? null : token;
  } catch {
    return null;
  }
}

/** Caja centrada que usan las pantallas previas a la app. */
function cajaCentrada(...contenido) {
  return crear('div', { clase: 'acceso' }, [
    crear('div', { clase: 'acceso__caja tarjeta tarjeta--studs' }, [
      crear('div', { clase: 'acceso__logo', html: logotipo(84) }),
      ...contenido,
    ]),
  ]);
}

/** Pantalla que explica que falta configurar config.js. */
function mostrarFaltaConfiguracion(raiz, faltantes) {
  limpiar(raiz);
  raiz.append(cajaCentrada(
    crear('h1', { texto: 'Falta configurar la conexión' }),
    crear('p', {
      clase: 'vacio__texto',
      estilo: 'margin:0 auto var(--e-4)',
      texto: 'CoachPanel necesita los datos de tu proyecto de Supabase para funcionar. Todavía no están puestos.',
    }),
    banda({
      tipo: 'config',
      texto: `Faltan estos valores en docs/js/config.js: ${faltantes.join(', ')}`,
      iconoNombre: 'alerta',
    }),
    crear('div', { clase: 'vacio__texto', estilo: 'text-align:left;margin-top:var(--e-4)' }, [
      crear('p', { texto: 'Sigue estos pasos:' }),
      crear('ol', {}, [
        crear('li', { texto: 'Abre la carpeta supabase/ y ejecuta los 4 archivos .sql en el SQL Editor de Supabase.' }),
        crear('li', { texto: 'En Supabase: Settings → API. Copia "Project URL" y la clave "anon public".' }),
        crear('li', { texto: 'Pégalos en docs/js/config.js, junto con tu TOKEN_ACCESO.' }),
      ]),
      crear('p', { texto: 'La explicación paso a paso está en GUIA-DESPLIEGUE.md.' }),
    ]),
  ));
}

/** Pantalla de error de conexión, con el paso siguiente concreto. */
function mostrarErrorConexion(raiz, resultado, alReintentar) {
  limpiar(raiz);
  raiz.append(cajaCentrada(
    crear('h1', { texto: 'No pude conectar con la base de datos' }),
    crear('p', { clase: 'vacio__texto', estilo: 'margin:0 auto var(--e-4)', texto: resultado.mensaje }),
    resultado.codigo === 'sin_tablas'
      ? crear('div', { clase: 'vacio__texto', estilo: 'text-align:left' }, [
        crear('p', { texto: 'Los archivos SQL están en la carpeta supabase/, y hay que ejecutarlos en este orden:' }),
        crear('ol', {}, [
          crear('li', { texto: '01_esquema.sql' }),
          crear('li', { texto: '02_rls.sql' }),
          crear('li', { texto: '03_datos_iniciales.sql' }),
          crear('li', { texto: '04_vistas.sql' }),
        ]),
      ])
      : null,
    resultado.codigo === 'sin_conexion'
      ? crear('p', {
        clase: 'vacio__texto',
        estilo: 'margin:var(--e-3) auto 0',
        texto: 'Si el proyecto lleva más de una semana sin usarse, Supabase lo pausa. '
          + 'Entra a supabase.com/dashboard, elige tu proyecto y pulsa "Restore project".',
      })
      : null,
    crear('div', { clase: 'acciones', estilo: 'justify-content:center;margin-top:var(--e-4)' }, [
      crear('button', {
        clase: 'boton boton--primario',
        type: 'button',
        texto: 'Reintentar',
        onclick: alReintentar,
      }),
    ]),
  ));
}

/**
 * PORTAL DE ACCESO.
 *
 * Dos pasos, en este orden:
 *
 *   1. TOKEN del link — la llave que comparte el coach. Protege el club entero.
 *   2. MODALIDAD — coach (pide contraseña, puede editar) o
 *      alumno/representante (sin contraseña, solo consulta).
 *
 * Si el link ya trae el token (?t=…), el paso 1 se resuelve solo y el usuario
 * cae directamente en la elección de modalidad.
 */
function mostrarPuertaAcceso(raiz, {
  api, tokenSugerido = null, alEntrar, config = CONFIG,
}) {
  limpiar(raiz);

  /* ================= Paso 1: token ================= */

  const campoToken = crear('input', {
    type: 'password',
    id: 'token-acceso',
    name: 'token',
    autocomplete: 'current-password',
    placeholder: 'Token de acceso',
    'aria-describedby': 'ayuda-token',
    value: tokenSugerido ?? '',
  });

  const errorToken = crear('p', { clase: 'acceso__error', id: 'error-token', role: 'alert' });

  const textoBotonToken = crear('span', { texto: 'Continuar' });
  const botonToken = crear('button', {
    clase: 'boton boton--primario boton--bloque',
    type: 'submit',
  }, [
    crear('span', { html: icono('ok', { tamano: 18, clase: 'boton__icono' }) }),
    textoBotonToken,
  ]);

  let verificandoToken = false;

  async function verificarToken(evento) {
    evento?.preventDefault();
    if (verificandoToken) return;
    verificandoToken = true;

    errorToken.textContent = '';
    campoToken.setAttribute('aria-invalid', 'false');
    botonToken.disabled = true;
    textoBotonToken.textContent = 'Verificando…';

    const resultado = await api.validarToken(campoToken.value);

    verificandoToken = false;
    botonToken.disabled = false;
    textoBotonToken.textContent = 'Continuar';

    if (resultado.ok) {
      guardarAcceso(true);
      mostrarElegirModalidad();
      return;
    }

    campoToken.setAttribute('aria-invalid', 'true');
    errorToken.textContent = resultado.mensaje;
    campoToken.focus();
    campoToken.select?.();
  }

  const formularioToken = crear('form', { clase: 'acceso__formulario', onsubmit: verificarToken }, [
    crear('div', { clase: 'campo' }, [
      crear('label', { for: 'token-acceso', texto: 'Token del club' }),
      campoToken,
      crear('span', {
        clase: 'campo__ayuda',
        id: 'ayuda-token',
        texto: 'Es la clave que te compartió el coach. Sirve también el link que termina en ?t=…',
      }),
    ]),
    botonToken,
    errorToken,
  ]);

  /* ================= Paso 2: modalidad ================= */

  const errorModalidad = crear('p', { clase: 'acceso__error', role: 'alert' });

  // Se construye una sola vez; solo se alterna con `hidden`.
  const campoContrasena = crear('input', {
    type: 'password',
    id: 'contrasena-coach',
    name: 'contrasena',
    autocomplete: 'current-password',
    placeholder: 'Contraseña del coach',
    'aria-describedby': 'ayuda-contrasena',
  });

  const bloqueContrasena = crear('div', { clase: 'campo', id: 'bloque-contrasena' }, [
    crear('label', { for: 'contrasena-coach', texto: 'Contraseña del coach' }),
    campoContrasena,
    crear('span', {
      clase: 'campo__ayuda',
      id: 'ayuda-contrasena',
      texto: 'La contraseña la define el coach en docs/js/config.js.',
    }),
  ]);
  bloqueContrasena.hidden = true;

  let modoElegido = null;

  /** Botón grande de modalidad. */
  function opcionModo(modo) {
    const boton = crear('button', {
      clase: 'opcion-modo',
      type: 'button',
      'aria-pressed': 'false',
      datos: { modo },
      onclick: () => elegirModo(modo),
    }, [
      crear('span', { clase: 'opcion-modo__icono', html: icono(ICONO_MODO[modo], { tamano: 26 }) }),
      crear('span', { clase: 'opcion-modo__texto' }, [
        crear('span', { clase: 'opcion-modo__titulo', texto: ETIQUETAS_MODO[modo] }),
        crear('span', { clase: 'opcion-modo__descripcion', texto: DESCRIPCION_MODO[modo] }),
      ]),
    ]);
    return boton;
  }

  function elegirModo(modo) {
    modoElegido = modo;
    errorModalidad.textContent = '';

    contenedorOpciones.querySelectorAll('.opcion-modo').forEach((boton) => {
      boton.setAttribute('aria-pressed', boton.dataset.modo === modo ? 'true' : 'false');
    });

    const esCoach = modo === 'coach';
    bloqueContrasena.hidden = !esCoach;
    botonModo.disabled = false;
    textoBotonModo.textContent = esCoach ? 'Entrar como coach' : 'Ver el club';

    // Si eligió coach, el cursor va directo a la contraseña.
    if (esCoach) campoContrasena.focus();
  }

  const contenedorOpciones = crear('div', {
    clase: 'opciones-modo',
    role: 'group',
    'aria-label': '¿Cómo quieres entrar?',
  }, [opcionModo('coach'), opcionModo('club')]);

  const textoBotonModo = crear('span', { texto: 'Elige cómo entrar' });
  const botonModo = crear('button', {
    clase: 'boton boton--primario boton--bloque',
    type: 'submit',
    disabled: true,
  }, [
    crear('span', { html: icono('ok', { tamano: 18, clase: 'boton__icono' }) }),
    textoBotonModo,
  ]);

  function confirmarModalidad(evento) {
    evento?.preventDefault();
    errorModalidad.textContent = '';

    const evaluacion = evaluarEntrada({
      modo: modoElegido,
      contrasena: campoContrasena.value,
      config,
    });

    if (!evaluacion.permitido) {
      errorModalidad.textContent = evaluacion.mensaje;
      if (modoElegido === 'coach') {
        campoContrasena.setAttribute('aria-invalid', 'true');
        campoContrasena.focus();
        campoContrasena.select?.();
      }
      return;
    }

    guardarModo(evaluacion.modo);

    avisoOk(
      evaluacion.modo === 'coach'
        ? '¡Bienvenido, coach! Puedes editar todo.'
        : 'Bienvenido. Aquí puedes consultar la asistencia, los equipos y los puntajes.',
    );
    alEntrar(evaluacion.modo);
  }

  const formularioModalidad = crear('form', {
    clase: 'acceso__formulario',
    id: 'form-modalidad',
    onsubmit: confirmarModalidad,
  }, [
    contenedorOpciones,
    bloqueContrasena,
    botonModo,
    errorModalidad,
  ]);

  // El botón se habilita en cuanto se elige una modalidad (ver `elegirModo`).

  /* ================= Pintado de cada paso ================= */

  function mostrarToken() {
    limpiar(raiz);
    raiz.append(cajaCentrada(
      crear('h1', { texto: config.NOMBRE_CLUB || 'Club de Robótica LEGO' }),
      crear('p', {
        clase: 'vacio__texto',
        estilo: 'margin:0 auto',
        texto: 'Asistencia, prácticas de pista y participación en la WRO Venezuela. '
          + 'Para entrar necesitas el token que te compartió el coach.',
      }),
      formularioToken,
    ));
    campoToken.focus();
  }

  function mostrarElegirModalidad() {
    limpiar(raiz);
    raiz.append(cajaCentrada(
      crear('h1', { texto: '¿Cómo quieres entrar?' }),
      crear('p', {
        clase: 'vacio__texto',
        estilo: 'margin:0 auto var(--e-4)',
        texto: 'Entra como coach si vas a registrar la clase (pide contraseña). '
          + 'Entra como alumno o representante si solo quieres consultar; no hace falta contraseña.',
      }),
      formularioModalidad,
    ));
  }

  if (tokenSugerido) {
    // Viene con el token en el link: se valida solo y pasa directo al paso 2.
    verificarToken();
  } else {
    mostrarToken();
  }
}

/**
 * Arranca todo.
 *
 * @param {HTMLElement} raiz
 * @param {object} [opciones]
 * @param {object} [opciones.config]  Configuración a usar (por defecto, la de
 *   `config.js`). Existe para poder probar la pantalla de "falta configurar"
 *   sin depender de si el proyecto ya tiene sus claves puestas.
 * @param {Function} [opciones.comprobarConexion]  Comprobación de conexión
 *   inyectable, para probar el arranque sin tocar la red.
 * @param {object} [opciones.api]  Capa de datos ya construida. Si no se pasa,
 *   se crea a partir de la configuración. Inyectarla permite probar el portal
 *   de acceso sin llamar a Supabase.
 */
export async function arrancar(raiz, opciones = {}) {
  const config = opciones.config ?? CONFIG;
  const verificarConexion = opciones.comprobarConexion ?? comprobarConexion;

  const tema = temaInicial();
  aplicarTema(tema);

  // ---- Paso 1: ¿está configurado? ----
  if (!estaConfigurado(config)) {
    mostrarFaltaConfiguracion(raiz, configuracionFaltante(config));
    return;
  }

  let cliente;
  let api;

  if (opciones.api) {
    // Se usa la capa de datos que nos pasaron (pruebas).
    api = opciones.api;
    cliente = opciones.cliente ?? api.cliente ?? {};
  } else {
    try {
      ({ cliente, api } = crearApiDesdeConfig(config));
    } catch (error) {
      mostrarFaltaConfiguracion(raiz, [error.message]);
      return;
    }
  }

  // ---- Paso 2: conexión y esquema ----
  const conexion = opciones.api ? { ok: true } : await verificarConexion(cliente);
  if (!conexion.ok) {
    mostrarErrorConexion(raiz, conexion, () => arrancar(raiz, opciones));
    return;
  }

  const store = crearStore({
    tema,
    nombreClub: config.NOMBRE_CLUB || 'Club de Robótica LEGO',
  });

  // ---- Paso 3: token del club ----
  const tokenEnLink = tokenDeDireccion(window.location.hash);
  const yaTeniaToken = Boolean(accesoGuardado()?.ok) && !tokenEnLink;

  function iniciarInterfaz(modo) {
    const modoFinal = esModoValido(modo) ? modo : 'club';

    // La barrera de escritura se pone aquí, en la capa de datos: en modo
    // consulta (alumno o representante) no hay forma de guardar nada.
    api.establecerSoloLectura?.(modoFinal !== 'coach');

    if (tokenEnLink) {
      // Se limpia el token de la barra de direcciones: no debe quedar a la
      // vista ni en el historial del navegador.
      try {
        window.history.replaceState(null, '', `${window.location.pathname}#/panel`);
      } catch {
        window.location.hash = '#/panel';
      }
    }

    store.establecer({ modo: modoFinal });

    montarApp({
      raiz,
      store,
      api,
      cliente,
      CONFIG: config,
      alOlvidarAcceso: () => {
        olvidarAcceso();
        olvidarModo();
      },
    });
  }

  // ---- Paso 4: modalidad ----
  // Si ya eligió antes en este dispositivo y el token del club sigue válido,
  // no se le vuelve a preguntar.
  if (yaTeniaToken) {
    const modoRecordado = modoGuardado();
    if (modoRecordado) {
      iniciarInterfaz(modoRecordado);
      return;
    }
  }

  mostrarPuertaAcceso(raiz, {
    api,
    tokenSugerido: tokenEnLink,
    alEntrar: iniciarInterfaz,
    config,
  });
}

export { olvidarAcceso, accesoGuardado };
export { olvidarModo, modoGuardado };
