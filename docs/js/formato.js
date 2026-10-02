/**
 * formato.js — Conversión de fechas, tiempos de pista, puntajes y porcentajes.
 *
 * Todo es lógica pura (sin DOM ni red) para poder probarla con `node --test`.
 * Las fechas se manejan SIEMPRE como texto 'YYYY-MM-DD' y en hora local:
 * nunca se usa `new Date('YYYY-MM-DD')` porque interpreta UTC y puede
 * mostrar el día anterior en Venezuela.
 */

export const ZONA_HORARIA = 'America/Caracas';

/** Error de validación con código y mensaje listo para mostrar al usuario. */
export class ErrorFormato extends Error {
  constructor(codigo, mensaje, valorOriginal = null) {
    super(mensaje);
    this.name = 'ErrorFormato';
    this.codigo = codigo;
    this.valorOriginal = valorOriginal;
  }
}

function pad(n, ancho) {
  return String(n).padStart(ancho, '0');
}

/* ------------------------------------------------------------------ *
 * FECHAS
 * ------------------------------------------------------------------ */

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ¿El texto es una fecha 'YYYY-MM-DD' que existe de verdad? */
export function esFechaValida(texto) {
  if (typeof texto !== 'string') return false;
  const m = RE_FECHA.exec(texto.trim());
  if (!m) return false;

  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;

  // Comprueba que la fecha exista (rechaza 31 de febrero, etc.)
  const d = new Date(anio, mes - 1, dia);
  return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia;
}

/** Lanza ErrorFormato si la fecha no es válida. */
export function exigirFecha(texto, nombreCampo = 'fecha') {
  if (!esFechaValida(texto)) {
    throw new ErrorFormato(
      'fecha_invalida',
      `El campo ${nombreCampo} debe ser una fecha válida con formato AAAA-MM-DD.`,
      texto,
    );
  }
  return texto.trim();
}

/** Fecha de 'hoy' en hora local, como 'YYYY-MM-DD'. */
export function hoyISO(base = new Date()) {
  return `${base.getFullYear()}-${pad(base.getMonth() + 1, 2)}-${pad(base.getDate(), 2)}`;
}

/** Convierte 'YYYY-MM-DD' a un Date local (sin sustos de zona horaria). */
export function fechaADate(iso) {
  const m = RE_FECHA.exec(String(iso ?? '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** '2026-10-02' -> 'viernes 2 de octubre de 2026' */
export function fechaLarga(iso) {
  const d = fechaADate(iso);
  if (!d) return '—';
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** '2026-10-02' -> 'viernes 2 de octubre' (para encabezados de sesión) */
export function fechaMedia(iso) {
  const d = fechaADate(iso);
  if (!d) return '—';
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** '2026-10-02' -> '02/10/2026' */
export function fechaCorta(iso) {
  const d = fechaADate(iso);
  if (!d) return '—';
  return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()}`;
}

/** '2026-10-02' -> '2026-10' (clave de mes para agrupar) */
export function claveMes(iso) {
  if (!esFechaValida(iso)) return null;
  return iso.trim().slice(0, 7);
}

/** '2026-10' -> 'octubre de 2026' */
export function nombreMes(clave) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(clave ?? ''));
  if (!m) return '—';
  return `${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

/** Lista de las últimas `cantidad` claves de mes, de la más vieja a la más nueva. */
export function ultimosMeses(cantidad = 12, base = new Date()) {
  const salida = [];
  for (let i = cantidad - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    salida.push(`${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}`);
  }
  return salida;
}

/** Fecha de lunes a domingo que contiene la fecha dada. */
export function rangoSemana(iso) {
  const d = fechaADate(iso);
  if (!d) return null;
  const diaSemana = d.getDay();               // 0 = domingo
  const offsetLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetLunes);
  const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
  return { desde: hoyISO(lunes), hasta: hoyISO(domingo) };
}

/** '14:30' -> '2:30 pm' */
export function hora12(texto) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(texto ?? '').trim());
  if (!m) return '—';
  const h = Number(m[1]);
  const min = m[2];
  const sufijo = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${sufijo}`;
}

/* ------------------------------------------------------------------ *
 * TIEMPO EN PISTA
 * ------------------------------------------------------------------ */

export const MAX_DURACION_MS = 3599999; // 59:59.999

const RE_CON_DOSPUNTOS = /^(\d{1,2}):([0-5]?\d)(?:[.,](\d{1,3}))?$/;
const RE_SOLO_SEGUNDOS = /^(\d{1,3})(?:[.,](\d{1,3}))?$/;

/**
 * Convierte lo que escribió el coach a milisegundos.
 *
 * Acepta: '1:23.45'  '1:23'  '1:23,45'  '83.45'  '83'  '83s'  '83,45 s'
 * Devuelve null si el campo está vacío (práctica registrada solo con puntaje).
 * Lanza ErrorFormato si el texto no es un tiempo entendible.
 *
 * Desambiguación de '83.45': si el decimal tiene 1 o 2 dígitos se lee como
 * fracción de segundo (83.45 s = 83 s + 450 ms); si tiene 3, como milisegundos.
 */
export function parsearDuracion(texto) {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === 'number') {
    if (!Number.isFinite(texto)) {
      throw new ErrorFormato('tiempo_invalido', 'El tiempo no es un número válido.', texto);
    }
    return redondearYValidar(texto * 1000, texto);
  }

  const limpio = String(texto).trim().toLowerCase().replace(/\s+/g, '');
  if (limpio === '' || /^[-–—]+$/.test(limpio)) return null;

  // Un guion suelto pegado al número (dedazo al escribir) se ignora en vez de
  // producir un tiempo negativo o un error incomprensible: '-5' -> 5 s.
  const sinGuiones = limpio.replace(/[-–—]/g, '');
  if (sinGuiones === '') return null;

  const sinSufijo = sinGuiones.replace(/s$/, '');
  const conPuntos = sinSufijo.replace(',', '.');

  let ms = null;

  const m1 = RE_CON_DOSPUNTOS.exec(conPuntos);
  if (m1) {
    const minutos = Number(m1[1]);
    const segundos = Number(m1[2]);
    ms = minutos * 60000 + segundos * 1000 + fraccionAMs(m1[3]);
  } else {
    const m2 = RE_SOLO_SEGUNDOS.exec(conPuntos);
    if (m2) {
      ms = Number(m2[1]) * 1000 + fraccionAMs(m2[2]);
    }
  }

  if (ms === null) {
    throw new ErrorFormato(
      'tiempo_invalido',
      `No entiendo el tiempo "${texto}". Escríbelo como 1:23.45 (minutos:segundos) o 83.45 (segundos).`,
      texto,
    );
  }

  return redondearYValidar(ms, texto);
}

function fraccionAMs(fraccion) {
  if (!fraccion) return 0;
  if (fraccion.length === 1) return Number(fraccion) * 100;   // .4  -> 400 ms
  if (fraccion.length === 2) return Number(fraccion) * 10;    // .45 -> 450 ms
  return Number(fraccion);                                    // .450 -> 450 ms
}

function redondearYValidar(ms, original) {
  const entero = Math.round(ms);
  if (!Number.isFinite(entero) || entero < 0) {
    throw new ErrorFormato('tiempo_invalido', 'El tiempo no puede ser negativo.', original);
  }
  if (entero > MAX_DURACION_MS) {
    throw new ErrorFormato(
      'tiempo_muy_grande',
      'El tiempo no puede pasar de 59:59.999. Si fue un error de tipeo, corrígelo antes de guardar.',
      original,
    );
  }
  return entero;
}

/** 83450 -> '1:23.450' */
export function formatearDuracion(ms) {
  if (ms === null || ms === undefined || ms === '') return '—';
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  const total = Math.round(n);
  const minutos = Math.floor(total / 60000);
  const segundos = Math.floor((total % 60000) / 1000);
  const resto = total % 1000;
  return `${minutos}:${pad(segundos, 2)}.${pad(resto, 3)}`;
}

/** 83450 -> '1:23.45' (versión corta para tablas) */
export function formatearDuracionCorta(ms) {
  if (ms === null || ms === undefined || ms === '') return '—';
  const total = Math.round(Number(ms));
  if (!Number.isFinite(total)) return '—';
  const minutos = Math.floor(total / 60000);
  const segundos = Math.floor((total % 60000) / 1000);
  const centesimas = Math.floor((total % 1000) / 10);
  return `${minutos}:${pad(segundos, 2)}.${pad(centesimas, 2)}`;
}

/** 83450 -> '1 min 23 s' (para texto corrido) */
export function duracionEnPalabras(ms) {
  if (ms === null || ms === undefined) return '—';
  const total = Math.round(Number(ms));
  if (!Number.isFinite(total)) return '—';
  const minutos = Math.floor(total / 60000);
  const segundos = Math.round((total % 60000) / 1000);
  if (minutos === 0) return `${segundos} s`;
  return `${minutos} min ${segundos} s`;
}

/* ------------------------------------------------------------------ *
 * PUNTAJES Y PORCENTAJES
 * ------------------------------------------------------------------ */

export const MAX_PUNTAJE = 1000000;

/**
 * Convierte el puntaje escrito a entero. Lanza ErrorFormato si no sirve.
 *
 * Entiende el separador de miles venezolano: '1.250' y '1,250' son 1250
 * (igual que lo que muestra `formatearPuntaje`), mientras que '12,7' es 12,7.
 */
export function parsearPuntaje(texto) {
  if (texto === null || texto === undefined || String(texto).trim() === '') {
    throw new ErrorFormato('puntaje_vacio', 'El puntaje es obligatorio.');
  }

  if (typeof texto === 'number') {
    return validarNumeroPuntaje(texto, texto);
  }

  const limpio = String(texto).trim().replace(/\s+/g, '');

  // Separadores: si el número tiene 2 o más grupos separados por '.' o ',',
  // esos separadores son de miles y el último bloque puede ser decimal:
  // '1.250' -> 1250  |  '1.250.000' -> 1250000  |  '12,7' -> 12.7
  let numero;
  const soloNumero = /^-?[\d.,]+$/.test(limpio);
  const bloques = limpio.replace(/^-/, '').split(/[.,]/);

  if (soloNumero && bloques.length > 2 && bloques.slice(1, -1).every((b) => /^\d{3}$/.test(b))) {
    const enteros = bloques.slice(0, -1).join('');
    const ultimo = bloques[bloques.length - 1];
    numero = Number(ultimo.length === 3 ? enteros + ultimo : `${enteros}.${ultimo}`);
  } else {
    // Un solo separador: es decimal si NO le siguen exactamente 3 dígitos.
    const sinMiles = limpio.replace(/(?<=\d)[.,](?=\d{3}$)/, '');
    numero = Number(sinMiles.replace(',', '.'));
  }

  if (!Number.isFinite(numero)) {
    throw new ErrorFormato('puntaje_invalido', `"${texto}" no es un puntaje válido.`, texto);
  }

  return validarNumeroPuntaje(numero, texto);
}

function validarNumeroPuntaje(numero, original) {
  const entero = Math.round(numero);
  if (entero < 0) {
    throw new ErrorFormato('puntaje_invalido', 'El puntaje no puede ser negativo.', original);
  }
  if (entero > MAX_PUNTAJE) {
    throw new ErrorFormato('puntaje_invalido', 'Ese puntaje es demasiado grande. Revisa el número.', original);
  }
  return entero;
}

/** 1250 -> '1.250' (separador de miles venezolano) */
export function formatearPuntaje(valor) {
  if (valor === null || valor === undefined) return '—';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 87.4 -> '87 %' ; null -> '—' (importante: 0 % NO es lo mismo que sin datos) */
export function formatearPorcentaje(valor) {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—';
  return `${Math.round(Number(valor))} %`;
}

/* ------------------------------------------------------------------ *
 * TEXTOS
 * ------------------------------------------------------------------ */

/**
 * Normaliza un nombre para comparar duplicados:
 * '  Ana   María  ' -> 'ana maría'
 */
export function normalizarNombre(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto).trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Limpia un nombre respetando mayúsculas: '  ana   maría ' -> 'Ana María'
 * (pone en mayúscula la primera letra de cada palabra).
 */
export function embellecerNombre(texto) {
  const limpio = String(texto ?? '').trim().replace(/\s+/g, ' ');
  if (limpio === '') return '';
  return limpio
    .split(' ')
    .map((palabra) =>
      palabra.length <= 2
        ? palabra.toLowerCase()          // partículas: "de", "la", "y"
        : palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase(),
    )
    .join(' ');
}

/** Recorta un texto largo para mostrarlo en una tabla. */
export function acortar(texto, maximo = 40) {
  const t = String(texto ?? '').trim();
  if (t.length <= maximo) return t;
  return `${t.slice(0, maximo - 1)}…`;
}

/** Escapa texto antes de insertarlo como HTML. */
export function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Pluraliza de forma sencilla para los textos de la interfaz. */
export function plural(cantidad, singular, pluralTexto = `${singular}s`) {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}
