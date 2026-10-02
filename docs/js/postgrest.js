/**
 * postgrest.js — Cliente HTTP mínimo para la API REST de Supabase.
 *
 * ¿Por qué existe? Porque `supabase-js` se instala con npm, y en este
 * proyecto no se puede (el registro npm no es alcanzable desde la máquina
 * donde se construyó). Además así la app queda con CERO dependencias:
 * nada que descargar, nada que actualizar, nada que se rompa.
 *
 * Es `fetch` puro contra la API de PostgREST que Supabase expone. Cubre todo
 * lo que necesita CoachPanel: selección con relaciones anidadas, filtros,
 * orden, paginación, conteos, insertar, actualizar y upsert.
 *
 * Todo es inyectable (baseUrl, apiKey, fetch) para poder probarlo sin red.
 */

/** Error de API con mensaje ya traducido para el usuario. */
export class ErrorApi extends Error {
  constructor(codigo, mensaje, detalles = {}) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

/** Traduce los errores crudos de PostgREST/Postgres a algo que se entienda. */
export function traducirError(estado, cuerpo) {
  const crudo = (() => {
    if (typeof cuerpo === 'string') return cuerpo;
    if (cuerpo && typeof cuerpo === 'object') {
      return cuerpo.message ?? cuerpo.msg ?? cuerpo.hint ?? JSON.stringify(cuerpo);
    }
    return '';
  })();

  const texto = String(crudo ?? '');

  switch (estado) {
    case 401:
      return new ErrorApi(
        'sin_acceso',
        'No tienes acceso a estos datos. Pide el link al coach e inténtalo otra vez.',
        { estado, crudo: texto },
      );
    case 403: {
      // Postgres bloquea el DELETE a propósito: el historial es sagrado.
      // Se explica dónde sí se puede borrar en vez de dar un error técnico.
      if (/permission denied/i.test(texto)) {
        return new ErrorApi(
          'sin_permiso',
          'La base de datos rechazó el cambio. Si querías borrar algo, recuerda que desde la web no se puede: hazlo en el panel de Supabase.',
          { estado, crudo: texto },
        );
      }
      return new ErrorApi(
        'sin_acceso',
        'No tienes acceso a estos datos. Pide el link al coach e inténtalo otra vez.',
        { estado, crudo: texto },
      );
    }
    case 404:
      return new ErrorApi('no_encontrado', 'No encontré eso que buscabas.', { estado, crudo: texto });
    case 409:
      return new ErrorApi('duplicado', 'Ese registro ya existe. Revisa si lo habías guardado antes.', { estado, crudo: texto });
    case 416:
      return new ErrorApi('rango_invalido', 'La lista pidió una página que no existe.', { estado, crudo: texto });
    default:
      break;
  }

  if (estado === 400 || estado === 422) {
    if (/duplicate key|ya existe|unique constraint/i.test(texto)) {
      if (/equipos/i.test(texto)) {
        return new ErrorApi('nombre_duplicado', 'Ya existe un equipo con ese nombre.', { estado, crudo: texto });
      }
      if (/estudiantes|nombre_busqueda/i.test(texto)) {
        return new ErrorApi('nombre_duplicado', 'Ya existe un estudiante con ese nombre.', { estado, crudo: texto });
      }
      return new ErrorApi('duplicado', 'Ese dato ya está registrado.', { estado, crudo: texto });
    }
    if (/más de 3 integrantes|mas de 3 integrantes/i.test(texto)) {
      return new ErrorApi('limite_integrantes', 'Un equipo no puede tener más de 3 integrantes.', { estado, crudo: texto });
    }
    if (/sesión está cerrada|sesion esta cerrada/i.test(texto)) {
      return new ErrorApi('sesion_cerrada', 'La sesión está cerrada. Reábrela antes de cambiar la asistencia.', { estado, crudo: texto });
    }
    if (/row-level security|permission denied/i.test(texto)) {
      return new ErrorApi(
        'sin_permiso',
        'La base de datos rechazó el cambio. Si querías borrar algo, recuerda que desde la web no se puede: hazlo en el panel de Supabase.',
        { estado, crudo: texto },
      );
    }
    if (/check constraint|violates check/i.test(texto)) {
      return new ErrorApi('dato_invalido', 'Alguno de los datos no cumple las reglas. Revisa los campos.', { estado, crudo: texto });
    }
    if (/null value in column/i.test(texto)) {
      return new ErrorApi('campo_faltante', 'Falta un dato obligatorio. Revisa el formulario.', { estado, crudo: texto });
    }
  }

  if (estado >= 500) {
    return new ErrorApi(
      'servidor',
      'El servidor de datos tuvo un problema. Si esto sigue pasando, entra al panel de Supabase: puede que el proyecto esté pausado.',
      { estado, crudo: texto },
    );
  }

  return new ErrorApi('desconocido', texto || `La API respondió con un error (${estado}).`, { estado, crudo: texto });
}

/**
 * ¿El error es de red (no de la base de datos)?
 *
 * Importa distinguirlo: un fallo de red hace que la app muestre los datos
 * guardados en vez de un error rojo. En el navegador el error típico es
 * "Failed to fetch"; en Node (scripts) llega como "fetch failed" con la causa
 * en `error.cause` (ENOTFOUND, ECONNREFUSED…).
 */
function esFalloDeRed(error) {
  if (!error) return false;
  if (error instanceof ErrorApi) return false;

  const codigos = new Set([
    'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'CERT_HAS_EXPIRED',
  ]);

  const causas = [error, error.cause, error.cause?.cause].filter(Boolean);
  if (causas.some((causa) => codigos.has(String(causa.code ?? '')))) return true;

  const mensaje = String(error.message ?? error);
  return (
    error.name === 'AbortError'
    || /failed to fetch|fetch failed|networkerror|network request failed|load failed|econnrefused|enotfound|etimedout|getaddrinfo|socket hang up/i.test(mensaje)
  );
}

/** Consulta fluida encadenable. */
export class Consulta {
  constructor(cliente, tabla) {
    this.cliente = cliente;
    this.tabla = tabla;
    this._select = null;
    this._filtros = [];
    this._orden = [];
    this._limite = null;
    this._rango = null;
    this._unico = false;
    this._contar = null;
  }

  /** Columnas a traer. Acepta la sintaxis de recursos anidados de PostgREST. */
  seleccionar(columnas = '*') {
    this._select = columnas;
    return this;
  }

  /** Cuenta exacta de filas (cabecera Prefer: count=exact). */
  contar(tipo = 'exact') {
    this._contar = tipo;
    return this;
  }

  /**
   * Filtros: `{ activo: true, id: { gt: 10 }, nombre: { ilike: '%ana%' } }`.
   * Un valor simple se traduce a `eq`.
   */
  filtrar(filtros = {}) {
    Object.entries(filtros).forEach(([columna, valor]) => {
      if (valor === undefined) return;

      if (valor !== null && typeof valor === 'object' && !Array.isArray(valor)) {
        Object.entries(valor).forEach(([operador, contenido]) => {
          this._filtros.push([columna, operador, contenido]);
        });
      } else {
        this._filtros.push([columna, 'eq', valor]);
      }
    });
    return this;
  }

  /**
   * Orden por una o varias columnas.
   *   .ordenar('nombre')
   *   .ordenar([['fecha', 'desc'], ['intento', 'desc']])
   */
  ordenar(columna, { ascendente = true, nulosPrimero = false } = {}) {
    if (Array.isArray(columna)) {
      columna.forEach(([col, dir]) => {
        this._orden.push({
          columna: col,
          ascendente: String(dir ?? 'asc').toLowerCase() !== 'desc',
          nulosPrimero: false,
        });
      });
      return this;
    }

    this._orden.push({ columna, ascendente, nulosPrimero });
    return this;
  }

  limitar(cantidad) {
    this._limite = cantidad;
    return this;
  }

  rango(desde, hasta) {
    this._rango = [desde, hasta];
    return this;
  }

  /**
   * Devuelve un objeto en lugar de un arreglo; ejecuta la consulta de una vez.
   * Lanza si no hay filas.
   */
  unico() {
    this._unico = true;
    if (this._select === null) this._select = '*';
    return this._pedir('GET');
  }

  /** Como `unico()`, pero devuelve null en lugar de fallar si no hay filas. */
  quizasUnico() {
    this._unico = 'quizas';
    if (this._select === null) this._select = '*';
    return this._pedir('GET');
  }

  _url() {
    const parametros = [];
    if (this._select) parametros.push(`select=${encodeURIComponent(this._select)}`);

    this._filtros.forEach(([columna, operador, valor]) => {
      let texto;
      if (valor === null) texto = 'is.null';
      else if (valor === true || valor === false) texto = `is.${valor}`;
      else if (Array.isArray(valor)) texto = `in.(${valor.map((v) => this._valor(v)).join(',')})`;
      else if (operador === 'in') texto = `in.(${this._valor(valor)})`;
      else texto = `${operador}.${this._valor(valor)}`;
      parametros.push(`${encodeURIComponent(columna)}=${encodeURIComponent(texto)}`);
    });

    if (this._orden.length > 0) {
      // PostgREST acepta varias columnas separadas por coma: fecha.desc,intento.desc
      const orden = this._orden
        .map(({ columna, ascendente, nulosPrimero }) => (
          `${columna}.${ascendente ? 'asc' : 'desc'}${nulosPrimero ? '.nullsfirst' : '.nullslast'}`
        ))
        .join(',');
      parametros.push(`order=${encodeURIComponent(orden)}`);
    }

    if (this._limite !== null) parametros.push(`limit=${Number(this._limite)}`);

    const base = `${this.cliente.baseUrl}/rest/v1/${encodeURIComponent(this.tabla)}`;
    return parametros.length ? `${base}?${parametros.join('&')}` : base;
  }

  _valor(valor) {
    if (valor === null || valor === undefined) return 'null';
    if (typeof valor === 'boolean') return String(valor);
    // Las comas y paréntesis delimitan listas en PostgREST: si van dentro de
    // un valor (un nombre con coma), hay que entrecomillarlo.
    const texto = String(valor);
    return /[",()]/.test(texto) ? `"${texto.replace(/"/g, '\\"')}"` : texto;
  }

  _cabeceras(extra = {}) {
    const cabeceras = {
      apikey: this.cliente.apiKey,
      Authorization: `Bearer ${this.cliente.token ?? this.cliente.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (this._contar) cabeceras.Prefer = `count=${this._contar}`;
    if (this._rango) cabeceras.Range = `${this._rango[0]}-${this._rango[1]}`;
    // `extra` va al final para poder pisar Prefer (upsert lo necesita).
    return { ...cabeceras, ...extra };
  }

  async _pedir(metodo, cuerpo, extra = {}) {
    const respuesta = await this.cliente.peticion(this._url(), {
      metodo,
      cabeceras: this._cabeceras(extra),
      cuerpo,
    });

    if (!respuesta.ok) {
      throw traducirError(respuesta.estado, respuesta.datos);
    }

    let filas = respuesta.datos;
    if (filas === null || filas === undefined || filas === '') filas = [];

    if (this._unico) {
      if (!Array.isArray(filas) || filas.length === 0) {
        if (this._unico === 'quizas') return null;
        throw new ErrorApi('no_encontrado', 'No encontré ese registro.');
      }
      return filas[0];
    }

    if (this._contar) {
      // PostgREST devuelve el total exacto en la cabecera Content-Range,
      // que ya viene leída en `respuesta.conteo`.
      this.cliente.ultimoConteo = respuesta.conteo;
      return { filas, conteo: respuesta.conteo };
    }

    return filas;
  }

  async ejecutar() {
    if (this._select === null) this._select = '*';
    return this._pedir('GET');
  }

  /* ---- Escrituras ---- */

  async insertar(filas, { devolver = true } = {}) {
    const cuerpo = Array.isArray(filas) ? filas : [filas];
    if (cuerpo.length === 0) return [];
    const prefer = devolver ? 'return=representation' : 'return=minimal';
    return this._escribir('POST', cuerpo, prefer);
  }

  async actualizar(cambios) {
    if (this._filtros.length === 0) {
      // Red de seguridad: sin filtros, un update tocaría TODA la tabla.
      throw new ErrorApi(
        'sin_filtro',
        'Por seguridad no se puede actualizar sin indicar a qué registro.',
      );
    }
    return this._escribir('PATCH', cambios, 'return=representation');
  }

  async borrar() {
    if (this._filtros.length === 0) {
      throw new ErrorApi('sin_filtro', 'Por seguridad no se puede borrar sin indicar a qué registro.');
    }
    return this._escribir('DELETE', null, 'return=minimal');
  }

  /** Inserta o actualiza según las claves únicas (útil para guardar asistencia en lote). */
  async upsert(filas, { sobre = null, devolver = false } = {}) {
    const cuerpo = Array.isArray(filas) ? filas : [filas];
    if (cuerpo.length === 0) return [];

    const url = this._url();
    const cabeceras = this._cabeceras({
      Prefer: `resolution=merge-duplicates,${devolver ? 'return=representation' : 'return=minimal'}`,
    });
    if (sobre) cabeceras['on-conflict'] = sobre;

    const respuesta = await this.cliente.peticion(url, { metodo: 'POST', cabeceras, cuerpo });
    if (!respuesta.ok) throw traducirError(respuesta.estado, respuesta.datos);
    return respuesta.datos ?? [];
  }

  async _escribir(metodo, cuerpo, prefer) {
    const url = this._url();
    const cabeceras = this._cabeceras(prefer ? { Prefer: prefer } : {});
    const respuesta = await this.cliente.peticion(url, { metodo, cabeceras, cuerpo });
    if (!respuesta.ok) throw traducirError(respuesta.estado, respuesta.datos);
    return respuesta.datos ?? [];
  }
}

/** Cliente principal. */
export class ClientePostgrest {
  /**
   * @param {object} opciones
   * @param {string} opciones.baseUrl      https://xxxx.supabase.co
   * @param {string} opciones.apiKey       clave 'anon public'
   * @param {Function} [opciones.fetch]    fetch inyectable (para pruebas)
   * @param {number}  [opciones.reintentos=2]
   * @param {Function} [opciones.espera]   (ms) => Promise, inyectable
   */
  constructor({ baseUrl, apiKey, fetch: fetchInyectado = null, reintentos = 2, espera = null } = {}) {
    if (!baseUrl || !apiKey) {
      throw new ErrorApi(
        'sin_configurar',
        'Falta configurar la conexión con Supabase. Revisa docs/js/config.js.',
      );
    }
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.token = null;
    this.reintentos = reintentos;
    this.ultimoConteo = null;
    this._fetch = fetchInyectado
      ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this._espera = espera ?? ((ms) => new Promise((resolver) => setTimeout(resolver, ms)));

    if (!this._fetch) {
      throw new ErrorApi('sin_fetch', 'Este navegador no soporta fetch. Actualízalo para usar la app.');
    }
  }

  desde(tabla) {
    return new Consulta(this, tabla);
  }

  /** Permite usar un JWT de Supabase Auth en lugar de la clave anon. */
  conToken(token) {
    this.token = token;
    return this;
  }

  /**
   * Una petición HTTP con reintentos en fallos de red.
   * Devuelve siempre un objeto uniforme para que la capa de caché
   * pueda decidir si el fallo fue de red (y mostrar datos guardados).
   */
  async peticion(url, { metodo = 'GET', cabeceras = {}, cuerpo = null } = {}) {
    let ultimoError = null;

    for (let intento = 0; intento <= this.reintentos; intento += 1) {
      try {
        const opciones = { method: metodo, headers: cabeceras };
        if (cuerpo !== null && metodo !== 'GET' && metodo !== 'DELETE') {
          opciones.body = JSON.stringify(cuerpo);
        }

        const respuesta = await this._fetch(url, opciones);
        const texto = await respuesta.text();

        let datos = null;
        if (texto) {
          try {
            datos = JSON.parse(texto);
          } catch {
            datos = texto;
          }
        }

        const conteo = leerConteo(respuesta.headers);

        if (!respuesta.ok && respuesta.status >= 500 && intento < this.reintentos) {
          ultimoError = traducirError(respuesta.status, datos);
          await this._espera(300 * 2 ** intento);
          continue;
        }

        return { ok: respuesta.ok, estado: respuesta.status, datos, conteo };
      } catch (error) {
        ultimoError = error;
        if (intento < this.reintentos) {
          await this._espera(300 * 2 ** intento);
          continue;
        }
        if (esFalloDeRed(error)) {
          // Marca explícita para que la interfaz muestre "sin conexión"
          // en vez de un error rojo de servidor.
          const fallo = new ErrorApi(
            'sin_conexion',
            'No hay conexión con la base de datos. Te muestro la última información guardada en este dispositivo.',
            { causa: String(error.message ?? error) },
          );
          fallo.esFalloDeRed = true;
          throw fallo;
        }
        throw error;
      }
    }

    throw ultimoError ?? new ErrorApi('desconocido', 'No se pudo completar la operación.');
  }

  /** Llamada a una función RPC de Postgres. */
  async rpc(nombre, parametros = {}) {
    const url = `${this.baseUrl}/rest/v1/rpc/${encodeURIComponent(nombre)}`;
    const respuesta = await this.peticion(url, {
      metodo: 'POST',
      cabeceras: {
        apikey: this.apiKey,
        Authorization: `Bearer ${this.token ?? this.apiKey}`,
        'Content-Type': 'application/json',
      },
      cuerpo: parametros,
    });
    if (!respuesta.ok) throw traducirError(respuesta.estado, respuesta.datos);
    return respuesta.datos;
  }
}

function leerConteo(headers) {
  if (!headers || typeof headers.get !== 'function') return null;
  const crudo = headers.get('content-range') ?? headers.get('Content-Range');
  if (!crudo) return null;
  const total = String(crudo).split('/')[1];
  if (!total || total === '*') return null;
  const numero = Number(total);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Comprueba que la conexión esté bien configurada antes de arrancar la app.
 * Devuelve un resultado en vez de lanzar, para poder mostrar un mensaje amable.
 */
export async function comprobarConexion(cliente) {
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

    if (respuesta.ok) return { ok: true };

    if (respuesta.estado === 404) {
      return {
        ok: false,
        codigo: 'sin_tablas',
        mensaje: 'La base de datos está vacía: falta ejecutar los archivos SQL de la carpeta supabase/.',
      };
    }
    if (respuesta.estado === 401 || respuesta.estado === 403) {
      return {
        ok: false,
        codigo: 'clave_invalida',
        mensaje: 'La clave de Supabase no es válida. Revisa SUPABASE_ANON_KEY en docs/js/config.js.',
      };
    }
    return {
      ok: false,
      codigo: 'respuesta_rara',
      mensaje: `La base de datos respondió ${respuesta.estado}. Revisa la configuración de Supabase.`,
    };
  } catch (error) {
    if (error.esFalloDeRed) {
      return {
        ok: false,
        codigo: 'sin_conexion',
        mensaje: 'No hay conexión a internet (o Supabase está pausado). Puedes ver los datos guardados, pero no guardar cambios.',
        esFalloDeRed: true,
      };
    }
    return { ok: false, codigo: 'error', mensaje: error.message ?? 'Error desconocido al conectar.' };
  }
}
