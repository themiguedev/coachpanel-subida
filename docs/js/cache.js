/**
 * cache.js — Caché local y modo "sin conexión".
 *
 * Guarda en el navegador la última respuesta buena de cada colección.
 * Si una consulta falla por falta de internet (o porque el proyecto de
 * Supabase quedó pausado), la app muestra lo último que vio en vez de
 * quedarse en blanco delante de los muchachos.
 *
 * Esta caché es SOLO para leer. Nunca se encolan cambios: si no hay
 * conexión, no se guarda a medias; se avisa y se reintenta.
 */

const PREFIJO = 'coachpanel.cache.';
const VERSION = 1;
export const MAX_ANTIGUEDAD_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

/** Almacenamiento en memoria: lo usan las pruebas y el modo privado del navegador. */
export function crearAlmacenMemoria(inicial = new Map()) {
  return {
    getItem(clave) {
      return inicial.has(clave) ? inicial.get(clave) : null;
    },
    setItem(clave, valor) {
      inicial.set(clave, String(valor));
    },
    removeItem(clave) {
      inicial.delete(clave);
    },
    claves() {
      return [...inicial.keys()];
    },
    get mapa() {
      return inicial;
    },
  };
}

/**
 * Elige el mejor almacenamiento disponible.
 * `localStorage` puede fallar en modo privado o estar deshabilitado:
 * en ese caso se cae a memoria y la app sigue funcionando (sin persistir).
 */
export function almacenPorDefecto() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const prueba = `${PREFIJO}prueba`;
      localStorage.setItem(prueba, '1');
      localStorage.removeItem(prueba);
      return localStorage;
    }
  } catch {
    // localStorage bloqueado (modo privado, cuota, políticas) → memoria
  }
  return crearAlmacenMemoria();
}

export class Cache {
  /**
   * @param {object} opciones
   * @param {object} [opciones.almacen] Almacenamiento tipo localStorage.
   * @param {Date|Function} [opciones.reloj] Para poder simular el paso del tiempo en pruebas.
   */
  constructor({ almacen = null, reloj = null } = {}) {
    this.almacen = almacen ?? almacenPorDefecto();
    this._reloj = reloj ?? (() => new Date());
  }

  _ahora() {
    const valor = typeof this._reloj === 'function' ? this._reloj() : this._reloj;
    return valor instanceof Date ? valor : new Date(valor);
  }

  _clave(coleccion) {
    return `${PREFIJO}${coleccion}`;
  }

  /** Guarda una lectura exitosa. */
  guardar(coleccion, datos, { etiqueta = null } = {}) {
    const entrada = {
      version: VERSION,
      coleccion,
      etiqueta,
      guardadoEn: this._ahora().toISOString(),
      datos,
    };
    try {
      this.almacen.setItem(this._clave(coleccion), JSON.stringify(entrada));
      return true;
    } catch {
      // Cuota llena: se descarta la entrada más vieja y se reintenta una vez.
      this.limpiarAntiguos({ forzar: true });
      try {
        this.almacen.setItem(this._clave(coleccion), JSON.stringify(entrada));
        return true;
      } catch {
        return false;
      }
    }
  }

  /** Lee una entrada guardada. Devuelve null si no hay o está corrupta. */
  leer(coleccion) {
    try {
      const crudo = this.almacen.getItem(this._clave(coleccion));
      if (!crudo) return null;
      const entrada = JSON.parse(crudo);
      if (!entrada || entrada.version !== VERSION || !('datos' in entrada)) return null;
      return entrada;
    } catch {
      return null;
    }
  }

  /** Datos guardados, o `porDefecto` si no hay nada. */
  datos(coleccion, porDefecto = null) {
    const entrada = this.leer(coleccion);
    return entrada ? entrada.datos : porDefecto;
  }

  existe(coleccion) {
    return this.leer(coleccion) !== null;
  }

  /** ¿Lo guardado tiene más de `maxAntiguedadMs`? */
  esAntiguo(coleccion, maxAntiguedadMs = MAX_ANTIGUEDAD_MS) {
    const entrada = this.leer(coleccion);
    if (!entrada) return true;
    const guardado = new Date(entrada.guardadoEn).getTime();
    if (!Number.isFinite(guardado)) return true;
    return this._ahora().getTime() - guardado > maxAntiguedadMs;
  }

  /** Hace cuánto se guardó, en texto: 'hace 5 minutos'. */
  antiguedadTexto(coleccion) {
    const entrada = this.leer(coleccion);
    if (!entrada) return null;
    const guardado = new Date(entrada.guardadoEn).getTime();
    if (!Number.isFinite(guardado)) return null;

    const segundos = Math.max(0, Math.round((this._ahora().getTime() - guardado) / 1000));
    if (segundos < 60) return 'hace unos segundos';
    const minutos = Math.round(segundos / 60);
    if (minutos < 60) return `hace ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    const dias = Math.round(horas / 24);
    return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  }

  olvidar(coleccion) {
    try {
      this.almacen.removeItem(this._clave(coleccion));
      return true;
    } catch {
      return false;
    }
  }

  /** Borra toda la caché de la app. */
  limpiar() {
    let borradas = 0;
    this.colecciones().forEach((coleccion) => {
      if (this.olvidar(coleccion)) borradas += 1;
    });
    return borradas;
  }

  /** Nombres de las colecciones guardadas. */
  colecciones() {
    const claves = typeof this.almacen.claves === 'function'
      ? this.almacen.claves()
      : Object.keys(this.almacen);
    return claves
      .filter((clave) => String(clave).startsWith(PREFIJO) && clave !== `${PREFIJO}prueba`)
      .map((clave) => String(clave).slice(PREFIJO.length));
  }

  /** Descarta entradas más viejas que `maxAntiguedadMs`. */
  limpiarAntiguos({ maxAntiguedadMs = MAX_ANTIGUEDAD_MS, forzar = false } = {}) {
    let borradas = 0;
    this.colecciones().forEach((coleccion) => {
      if (forzar || this.esAntiguo(coleccion, maxAntiguedadMs)) {
        if (this.olvidar(coleccion)) borradas += 1;
      }
    });
    return borradas;
  }

  /** Tamaño aproximado de lo guardado, en texto legible. */
  tamanoTexto() {
    let bytes = 0;
    this.colecciones().forEach((coleccion) => {
      const crudo = this.almacen.getItem(this._clave(coleccion));
      if (crudo) bytes += crudo.length;
    });
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Ejecuta una consulta con respaldo en caché.
 *
 * - Éxito           → guarda el resultado y lo devuelve.
 * - Fallo de red    → devuelve lo último guardado + marca `deCache: true`.
 * - Otro error      → se propaga (es un error real, hay que mostrarlo).
 *
 * @param {Cache} cache
 * @param {string} coleccion        Nombre lógico: 'estudiantes', 'resumen'…
 * @param {Function} consulta       async () => datos
 * @param {object} [opciones]
 * @param {*} [opciones.porDefecto] Qué devolver si falla y no hay caché.
 * @param {boolean} [opciones.permitirCache=true]
 */
export async function conRespaldo(cache, coleccion, consulta, opciones = {}) {
  const { porDefecto = [], permitirCache = true } = opciones;

  try {
    const datos = await consulta();
    const guardado = cache.guardar(coleccion, datos);
    return {
      datos,
      deCache: false,
      guardadoEn: guardado ? cache.leer(coleccion)?.guardadoEn ?? null : null,
      antiguedad: guardado ? 'ahora' : null,
    };
  } catch (error) {
    if (error?.esFalloDeRed && permitirCache) {
      const entrada = cache.leer(coleccion);
      if (entrada) {
        return {
          datos: entrada.datos,
          deCache: true,
          guardadoEn: entrada.guardadoEn,
          antiguedad: cache.antiguedadTexto(coleccion),
          error,
        };
      }
      return {
        datos: porDefecto,
        deCache: true,
        guardadoEn: null,
        antiguedad: null,
        error,
      };
    }
    throw error;
  }
}

export const COLECCIONES = {
  ESTUDIANTES: 'estudiantes',
  EQUIPOS: 'equipos',
  SESIONES: 'sesiones',
  RETOS: 'retos',
  PRACTICAS: 'practicas',
  RESUMEN: 'resumen',
  ASISTENCIA_ULTIMA: 'asistencia-ultima',
  RANKING: 'ranking',
};
