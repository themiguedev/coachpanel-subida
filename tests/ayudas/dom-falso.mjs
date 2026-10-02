/**
 * dom-falso.mjs — DOM mínimo para probar el renderizado de las vistas sin navegador.
 *
 * Implementa solo lo que usa CoachPanel: crear elementos, atributos, clases,
 * hijos, eventos, búsquedas por selector y texto. No interpreta CSS ni calcula
 * maquetación; sirve para detectar errores de lógica (variables sin definir,
 * propiedades mal escritas, datos que llegan con otra forma).
 *
 * Es una herramienta de pruebas. No se usa en el navegador.
 */

/* ------------------------------------------------------------------ *
 * SELECTOR SIMPLE
 * ------------------------------------------------------------------ */

/**
 * Convierte '.clase', '#id', 'etiqueta', 'etiqueta[attr="v"]' o combinaciones
 * como 'input[type="search"]' en una prueba booleana.
 */
function coincide(elemento, selector) {
  const texto = String(selector).trim();
  if (texto === '') return false;

  // Selectores separados por coma: basta con que uno coincida.
  if (texto.includes(',')) {
    return texto.split(',').some((parte) => coincide(elemento, parte));
  }

  // Descendencia directa con espacio ('div .hijo' tiene que ser el hijo directo
  // en este DOM simplificado; sirve para los selectores que usa la app).
  if (/\s/.test(texto)) {
    const partes = texto.split(/\s+/).filter(Boolean);
    const ultima = partes[partes.length - 1];
    return coincide(elemento, ultima);
  }

  let resto = texto;
  let valido = true;

  // 1. Etiqueta al inicio
  const etiqueta = /^[a-zA-Z][a-zA-Z0-9]*/.exec(resto);
  if (etiqueta) {
    valido = valido && elemento.tagName.toLowerCase() === etiqueta[0].toLowerCase();
    resto = resto.slice(etiqueta[0].length);
  }

  // 2. Resto: #id, .clase, [atributo] y [atributo="valor"]
  while (resto.length > 0) {
    if (resto.startsWith('#')) {
      const coincidencia = /^#([\w-]+)/.exec(resto);
      if (!coincidencia) { valido = false; break; }
      valido = valido && elemento.id === coincidencia[1];
      resto = resto.slice(coincidencia[0].length);
      continue;
    }

    if (resto.startsWith('.')) {
      const coincidencia = /^\.([\w-]+)/.exec(resto);
      if (!coincidencia) { valido = false; break; }
      valido = valido && elemento.classList.contains(coincidencia[1]);
      resto = resto.slice(coincidencia[0].length);
      continue;
    }

    if (resto.startsWith('[')) {
      const coincidencia = /^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/.exec(resto);
      if (!coincidencia) { valido = false; break; }
      const tiene = elemento.getAttribute(coincidencia[1]);
      if (tiene === null) {
        valido = false;
      } else if (coincidencia[2] !== undefined) {
        valido = valido && String(tiene) === coincidencia[2];
      }
      resto = resto.slice(coincidencia[0].length);
      continue;
    }

    // Algo que no se entiende: no coincide.
    valido = false;
    break;
  }

  return valido;
}

/* ------------------------------------------------------------------ *
 * ELEMENTO
 * ------------------------------------------------------------------ */

let contadorIds = 0;

export class ElementoFalso {
  constructor(etiqueta) {
    this.tagName = String(etiqueta ?? 'div').toUpperCase();
    this.nodeName = this.tagName;
    this.nodeType = 1;
    this.ownerDocument = null;
    this.hijos = [];
    this.padre = null;
    this.atributos = new Map();
    this.listeners = new Map();
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this._clases = new Set();
    this._texto = '';
    this.offsetParent = {};   // no nulo: así los modales creen que es visible

    // `dataset` refleja los atributos data-* en los dos sentidos, como en el
    // navegador: escribir en dataset.x crea el atributo data-x, y al revés.
    // Esto importa porque la interfaz busca filas con
    // `.fila-asistencia[data-estudiante="4"]`.
    const propio = this;
    this.dataset = new Proxy({}, {
      get(objetivo, clave) {
        if (typeof clave !== 'string') return objetivo[clave];
        return propio.atributos.has(`data-${clave}`) ? propio.atributos.get(`data-${clave}`) : undefined;
      },
      set(objetivo, clave, valor) {
        if (typeof clave !== 'string') return true;
        propio.atributos.set(`data-${clave}`, String(valor));
        return true;
      },
      has(objetivo, clave) {
        return typeof clave === 'string' && propio.atributos.has(`data-${clave}`);
      },
      deleteProperty(objetivo, clave) {
        propio.atributos.delete(`data-${clave}`);
        return true;
      },
      ownKeys() {
        return [...propio.atributos.keys()]
          .filter((nombre) => nombre.startsWith('data-'))
          .map((nombre) => nombre.slice(5));
      },
      getOwnPropertyDescriptor(objetivo, clave) {
        if (typeof clave === 'string' && propio.atributos.has(`data-${clave}`)) {
          return { value: propio.atributos.get(`data-${clave}`), enumerable: true, configurable: true };
        }
        return undefined;
      },
    });
  }

  /* ---- clases ---- */
  get classList() {
    const propio = this;
    return {
      add: (...nombres) => nombres.forEach((n) => propio._clases.add(n)),
      remove: (...nombres) => nombres.forEach((n) => propio._clases.delete(n)),
      contains: (nombre) => propio._clases.has(nombre),
      toggle: (nombre) => (propio._clases.has(nombre) ? propio._clases.delete(nombre) : propio._clases.add(nombre)),
    };
  }

  get className() {
    return [...this._clases].join(' ');
  }

  set className(valor) {
    this._clases = new Set(String(valor ?? '').split(/\s+/).filter(Boolean));
  }

  /* ---- atributos ---- */
  setAttribute(nombre, valor) {
    // Los atributos booleanos se guardan como cadena vacía, igual que en el
    // navegador: así `getAttribute('disabled') !== null` funciona como en la
    // vida real.
    const booleanos = ['disabled', 'checked', 'selected', 'hidden', 'required', 'readonly', 'multiple'];
    const guardado = valor === true && booleanos.includes(String(nombre))
      ? ''
      : String(valor);

    this.atributos.set(String(nombre), guardado);
    if (nombre === 'id') this.id = guardado;
    if (nombre === 'class') this.className = valor;
    if (nombre === 'hidden') this.hidden = valor === true || valor === '';
    if (nombre === 'disabled') this.disabled = valor === true || valor === '';
    if (nombre === 'checked') this.checked = valor === true || valor === '';
    if (nombre === 'value') this.value = guardado;
    if (String(nombre).startsWith('data-')) this.dataset[String(nombre).slice(5)] = guardado;
  }

  getAttribute(nombre) {
    if (nombre === 'class') return this.className;
    if (nombre === 'value') return this.value;
    return this.atributos.has(nombre) ? this.atributos.get(nombre) : null;
  }

  /** Devuelve todos los atributos como objeto (para inspeccionar en pruebas). */
  get atributosComoObjeto() {
    return Object.fromEntries(this.atributos);
  }

  removeAttribute(nombre) {
    this.atributos.delete(String(nombre));
    if (nombre === 'id') delete this.id;
    if (nombre === 'hidden') this.hidden = false;
    if (nombre === 'disabled') this.disabled = false;
  }

  hasAttribute(nombre) {
    return this.atributos.has(String(nombre));
  }

  /* ---- hijos ---- */
  append(...nodos) {
    nodos.forEach((nodo) => {
      if (nodo === null || nodo === undefined) return;
      if (nodo instanceof FragmentoFalso) {
        this.append(...nodo.hijos);
        return;
      }
      const elemento = nodo instanceof ElementoFalso ? nodo : new TextoFalso(String(nodo));
      // Evita ciclos: un elemento no puede ser su propio descendiente, porque
      // entonces el recorrido del árbol no terminaría nunca.
      if (elemento === this || (elemento instanceof ElementoFalso && elemento.contains(this))) return;
      elemento.padre = this;
      this.hijos.push(elemento);
    });
  }

  appendChild(nodo) {
    this.append(nodo);
    return nodo;
  }

  prepend(...nodos) {
    const nuevos = [];
    nodos.forEach((nodo) => {
      if (nodo === null || nodo === undefined) return;
      const elemento = nodo instanceof ElementoFalso ? nodo : new TextoFalso(String(nodo));
      elemento.padre = this;
      nuevos.push(elemento);
    });
    this.hijos = [...nuevos, ...this.hijos];
  }

  replaceChildren(...nodos) {
    this.hijos = [];
    this.append(...nodos);
  }

  remove() {
    if (!this.padre) return;
    this.padre.hijos = this.padre.hijos.filter((hijo) => hijo !== this);
    this.padre = null;
  }

  get firstChild() {
    return this.hijos[0] ?? null;
  }

  removeChild(nodo) {
    this.hijos = this.hijos.filter((hijo) => hijo !== nodo);
    nodo.padre = null;
    return nodo;
  }

  /* ---- texto ---- */
  get textContent() {
    if (this._texto) return this._texto;
    return this.hijos.map((hijo) => hijo.textContent ?? '').join('');
  }

  set textContent(valor) {
    this._texto = String(valor ?? '');
    this.hijos = [];
  }

  get innerHTML() {
    return this._html ?? this.textContent;
  }

  set innerHTML(valor) {
    // El proyecto evita innerHTML con datos del usuario. Aquí se guarda el
    // texto para poder inspeccionarlo en las pruebas.
    this._html = String(valor ?? '');
    this.hijos = [];
  }

  /* ---- eventos ---- */
  addEventListener(tipo, manejador) {
    if (!this.listeners.has(tipo)) this.listeners.set(tipo, new Set());
    this.listeners.get(tipo).add(manejador);
  }

  removeEventListener(tipo, manejador) {
    this.listeners.get(tipo)?.delete(manejador);
  }

  /**
   * Dispara un evento en este elemento (para las pruebas), propagándolo hacia
   * arriba como hace el navegador: así funcionan los manejadores puestos en
   * elementos padres.
   */
  disparar(tipo, evento = {}) {
    let detenido = false;
    const completo = {
      type: tipo,
      target: this,
      preventDefault() {},
      stopPropagation() { detenido = true; },
      ...evento,
    };

    let actual = this;
    while (actual && !detenido) {
      completo.currentTarget = actual;
      actual.listeners?.get(tipo)?.forEach((manejador) => manejador(completo));
      actual = actual.padre ?? null;
    }

    return completo;
  }

  /** Hace clic (dispara 'click'). */
  click() {
    this.disparar('click');
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  blur() {}

  select() {}

  /* ---- búsquedas ---- */
  /** Todos los descendientes que cumplen el selector. */
  querySelectorAll(selector) {
    const salida = [];
    const recorrer = (nodo) => {
      nodo.hijos.forEach((hijo) => {
        if (hijo.nodeType !== 1) return;
        if (coincide(hijo, selector)) salida.push(hijo);
        recorrer(hijo);
      });
    };
    recorrer(this);
    return salida;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  get children() {
    return this.hijos.filter((hijo) => hijo.nodeType === 1);
  }

  get parentElement() {
    return this.padre;
  }

  get nextSibling() {
    if (!this.padre) return null;
    const indice = this.padre.hijos.indexOf(this);
    return this.padre.hijos[indice + 1] ?? null;
  }

  matches(selector) {
    return coincide(this, selector);
  }

  /**
   * Sube por los padres hasta encontrar uno que coincida.
   * Es una función estándar del navegador y el código de la app la usa.
   */
  closest(selector) {
    let actual = this;
    while (actual) {
      if (actual.nodeType === 1 && coincide(actual, selector)) return actual;
      actual = actual.padre;
    }
    return null;
  }

  /** ¿Este elemento contiene a otro? (lo usa la capa de avisos de ui.js) */
  contains(nodo) {
    if (!nodo) return false;
    if (nodo === this) return true;
    let actual = nodo.padre;
    while (actual) {
      if (actual === this) return true;
      actual = actual.padre;
    }
    return false;
  }

  /** Recorre el árbol y devuelve todos los elementos (útil en pruebas). */
  todos() {
    const salida = [this];
    const visitados = new Set([this]);
    const recorrer = (nodo) => {
      nodo.hijos.forEach((hijo) => {
        if (hijo.nodeType !== 1 || visitados.has(hijo)) return;
        visitados.add(hijo);
        salida.push(hijo);
        recorrer(hijo);
      });
    };
    recorrer(this);
    return salida;
  }

  /** Todo el texto visible del subárbol. */
  textoCompleto() {
    return this.todos().map((elemento) => elemento._texto).filter(Boolean).join(' | ');
  }
}

export class TextoFalso {
  constructor(texto) {
    this.nodeType = 3;
    this.nodeName = '#text';
    this._texto = String(texto);
    this.padre = null;
    this.hijos = [];
    this.ownerDocument = null;
    // Los nodos de texto ignoran las propiedades de estilo/atributo, pero el
    // código que recorre el árbol puede preguntar por ellas.
    this.dataset = {};
    this.style = {};
    this.atributos = new Map();
  }

  get textContent() {
    return this._texto;
  }

  set textContent(valor) {
    this._texto = String(valor ?? '');
  }

  getAttribute() {
    return null;
  }

  setAttribute() {}

  removeAttribute() {}

  getAttributeNames() {
    return [];
  }

  addEventListener() {}

  removeEventListener() {}
}

export class FragmentoFalso extends ElementoFalso {
  constructor() {
    super('#fragment');
    this.nodeType = 11;
  }
}

/* ------------------------------------------------------------------ *
 * DOCUMENTO
 * ------------------------------------------------------------------ */

export function crearDocumento() {
  const documento = {
    nodeType: 9,
    activeElement: null,
    documentElement: null,
    body: null,
    _listeners: new Map(),

    createElement(etiqueta) {
      const elemento = new ElementoFalso(etiqueta);
      elemento.ownerDocument = documento;
      return elemento;
    },

    createElementNS(_ns, etiqueta) {
      const elemento = new ElementoFalso(etiqueta);
      elemento.ownerDocument = documento;
      elemento.namespaceURI = _ns;
      return elemento;
    },

    createTextNode(texto) {
      const nodo = new TextoFalso(texto);
      nodo.ownerDocument = documento;
      return nodo;
    },

    createDocumentFragment() {
      const fragmento = new FragmentoFalso();
      fragmento.ownerDocument = documento;
      return fragmento;
    },

    getElementById(id) {
      return documento.body?.querySelector(`#${id}`) ?? null;
    },

    querySelector(selector) {
      return documento.body?.querySelector(selector) ?? null;
    },

    querySelectorAll(selector) {
      return documento.body?.querySelectorAll(selector) ?? [];
    },

    addEventListener(tipo, manejador) {
      if (!documento._listeners.has(tipo)) documento._listeners.set(tipo, new Set());
      documento._listeners.get(tipo).add(manejador);
    },

    removeEventListener(tipo, manejador) {
      documento._listeners.get(tipo)?.delete(manejador);
    },

    disparar(tipo, evento = {}) {
      documento._listeners.get(tipo)?.forEach((manejador) => manejador({ type: tipo, ...evento }));
    },
  };

  documento.documentElement = documento.createElement('html');
  documento.body = documento.createElement('body');
  documento.body.ownerDocument = documento;

  return documento;
}

/* ------------------------------------------------------------------ *
 * VENTANA Y ALMACENAMIENTO
 * ------------------------------------------------------------------ */

export function crearVentana(documento, opciones = {}) {
  const almacen = new Map();
  const { hash = '#/panel' } = opciones;

  const ventana = {
    document: documento,
    _listeners: new Map(),
    matchMedia: () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }),
    history: {
      replaceState(_estado, _titulo, url) {
        // Solo se actualiza la parte del hash, como en el navegador.
        const indice = String(url).indexOf('#');
        if (indice !== -1) ventana.location.hash = String(url).slice(indice);
      },
    },
    localStorage: {
      getItem: (clave) => (almacen.has(clave) ? almacen.get(clave) : null),
      setItem: (clave, valor) => almacen.set(clave, String(valor)),
      removeItem: (clave) => almacen.delete(clave),
      clear: () => almacen.clear(),
      get length() { return almacen.size; },
      key: (indice) => [...almacen.keys()][indice] ?? null,
      _mapa: almacen,
    },
    scrollTo() {},
    print() {},
    addEventListener(tipo, manejador) {
      if (!ventana._listeners.has(tipo)) ventana._listeners.set(tipo, new Set());
      ventana._listeners.get(tipo).add(manejador);
    },
    removeEventListener(tipo, manejador) {
      ventana._listeners.get(tipo)?.delete(manejador);
    },
    dispatchEvent(evento) {
      ventana._listeners.get(evento.type)?.forEach((manejador) => manejador(evento));
      return true;
    },
    CustomEvent: class CustomEventFalso {
      constructor(tipo, opcionesEvento = {}) {
        this.type = tipo;
        this.detail = opcionesEvento.detail;
      }
    },
  };

  /**
   * `location` como captador: escribir `.hash` mantiene `href` coherente,
   * igual que en el navegador. Esto importa porque la app lee las dos cosas.
   */
  let hashActual = hash;
  const location = {
    pathname: '/',
    origin: 'http://127.0.0.1:8765',
    get hash() { return hashActual; },
    set hash(valor) { hashActual = String(valor); },
    get href() { return `http://127.0.0.1:8765/${hashActual}`; },
    toString() { return this.href; },
  };
  Object.defineProperty(ventana, 'location', { value: location, writable: false });

  ventana.window = ventana;
  ventana.self = ventana;
  ventana.globalThis = ventana;
  return ventana;
}

/**
 * Define un global aunque Node lo exponga solo como lector (navigator, por
 * ejemplo, es un captador en las versiones nuevas).
 */
function definirGlobal(nombre, valor) {
  try {
    Object.defineProperty(globalThis, nombre, {
      value: valor, writable: true, configurable: true, enumerable: true,
    });
  } catch {
    // Si no se puede redefinir, la prueba sigue con lo que ya había.
  }
}

/**
 * Instala el DOM falso en los globales del proceso.
 * Devuelve las piezas para poder inspeccionarlas después.
 *
 * @param {object} [opciones]
 * @param {string} [opciones.hash='#/panel']  Ruta inicial de la ventana.
 * @param {number} [opciones.ancho=1280]      Ancho de ventana simulado.
 */
export function instalarDom({ hash = '#/panel', ancho = 1280 } = {}) {
  const documento = crearDocumento();
  const ventana = crearVentana(documento, { hash });
  const raiz = documento.createElement('div');
  raiz.id = 'raiz';
  documento.body.append(raiz);

  const avisos = documento.createElement('div');
  avisos.id = 'avisos';
  documento.body.append(avisos);

  definirGlobal('document', documento);
  definirGlobal('window', ventana);
  definirGlobal('localStorage', ventana.localStorage);
  definirGlobal('navigator', { userAgent: 'dom-falso/1.0', language: 'es-VE' });
  definirGlobal('HTMLElement', ElementoFalso);
  definirGlobal('Node', ElementoFalso);
  definirGlobal('Element', ElementoFalso);
  definirGlobal('CustomEvent', ventana.CustomEvent);
  definirGlobal('matchMedia', ventana.matchMedia);
  definirGlobal('requestAnimationFrame', (fn) => setTimeout(fn, 0));
  definirGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
  definirGlobal('Blob', class BlobFalso {
    constructor(partes, opciones = {}) {
      this.partes = partes;
      this.type = opciones.type ?? '';
      this.size = String(partes?.[0] ?? '').length;
    }
  });

  if (typeof globalThis.URL?.createObjectURL !== 'function') {
    globalThis.URL.createObjectURL = () => 'blob:falso';
  }
  globalThis.URL.revokeObjectURL = () => {};

  // Las dimensiones de la ventana se usan en algunas decisiones de la interfaz.
  Object.defineProperty(ventana, 'innerWidth', { value: ancho, writable: true });

  return { documento, ventana, raiz };
}
