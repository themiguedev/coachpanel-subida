/**
 * api.js — Capa de datos de CoachPanel.
 *
 * Traduce "lo que la app necesita" a consultas concretas contra Supabase
 * y decide cuándo guardar en la caché local para el modo sin conexión.
 *
 * Las lecturas devuelven siempre la misma forma:
 *     { datos, deCache, guardadoEn, antiguedad, error? }
 * así las vistas pueden mostrar el aviso de "sin conexión" sin lógica extra.
 */

import { ClientePostgrest, ErrorApi } from './postgrest.js';
import { Cache, conRespaldo, COLECCIONES } from './cache.js';
import {
  normalizarEquipo,
  normalizarIntegrantes,
  validarEquipo,
  mapaPertenencia,
} from './equipos.js';
import {
  construirListaSesion,
  prepararRegistros,
  validarGuardado,
} from './asistencia.js';
import { hoyISO, normalizarNombre, embellecerNombre, claveMes } from './formato.js';

export class ErrorApp extends Error {
  constructor(codigo, mensaje, detalles = {}) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

/**
 * Mensaje entendible para cualquier error, venga de donde venga.
 * Traduce los códigos de PostgREST/Postgres a algo que el coach pueda leer.
 */
export function mensajeDeError(error) {
  if (!error) return 'Ocurrió un error inesperado.';
  if (error.esFalloDeRed) {
    return 'No hay conexión con la base de datos. Revisa tu internet e inténtalo otra vez.';
  }

  const porCodigo = {
    sin_acceso: 'No tienes acceso a estos datos. Vuelve a entrar con tu token.',
    sin_permiso: 'La base de datos rechazó el cambio. Recuerda que desde la web no se pueden borrar registros; eso se hace en el panel de Supabase.',
    duplicado: 'Ese registro ya existe. Revisa si lo habías guardado antes.',
    nombre_duplicado: error.message ?? 'Ese nombre ya está registrado.',
    limite_integrantes: 'Un equipo no puede tener más de 3 integrantes.',
    sesion_cerrada: 'La sesión está cerrada. Reábrela antes de cambiar la asistencia.',
    solo_lectura: error.message ?? 'Estás en modo consulta: no se pueden guardar cambios.',
    servidor: 'El servidor de datos tuvo un problema. Si sigue pasando, revisa en supabase.com si el proyecto está pausado.',
    no_encontrado: 'No encontré ese registro. Puede que lo haya borrado otra persona.',
    sin_conexion: 'No hay conexión con la base de datos.',
  };

  return porCodigo[error.codigo] ?? error.message ?? 'Ocurrió un error inesperado.';
}

/* ------------------------------------------------------------------ *
 * COLUMNAS QUE SE PIDEN A LA BASE
 * ------------------------------------------------------------------ */

const CAMPOS_ESTUDIANTE = 'id,nombre,fecha_nacimiento,representante,telefono,activo,nota,creado_en';
const CAMPOS_EQUIPO = 'id,nombre,categoria_wro,wro_estado,wro_resultado,wro_nota,activo,creado_en';
const CAMPOS_INTEGRANTES = 'estudiante_id,rol,estudiantes(id,nombre,activo)';
const CAMPOS_PRACTICA = 'id,fecha,equipo_id,intento,reto_id,duracion_ms,puntaje,observaciones,creado_en,'
  + 'equipos(id,nombre),retos(id,nombre)';
const CAMPOS_SESION = 'id,fecha,hora_inicio,hora_fin,titulo,nota,estado';

export const PAGINA_PRACTICAS = 100;

/* ------------------------------------------------------------------ *
 * FÁBRICA PRINCIPAL
 * ------------------------------------------------------------------ */

/**
 * @param {object} opciones
 * @param {ClientePostgrest} opciones.cliente
 * @param {Cache} [opciones.cache]
 */
export function crearApi({ cliente, cache = new Cache() } = {}) {
  if (!cliente) throw new ErrorApp('sin_cliente', 'Falta la conexión con la base de datos.');

  /**
   * Modo solo-consulta (alumno o representante).
   *
   * Cuando está activo, TODA operación de escritura se rechaza aquí mismo, en
   * la capa de datos, no solo escondiendo botones. Así una vista que se olvide
   * de comprobar el modo no puede cambiar nada por descuido.
   *
   * Ojo: esto es una barrera del programa. Alguien con conocimientos podría
   * llamar a la base de datos directamente con la clave publicable; lo que es
   * infranqueable es el bloqueo de borrado de PostgreSQL (ver supabase/02_rls.sql).
   */
  let soloLectura = false;

  /** Activa o desactiva el modo solo-consulta. */
  function establecerSoloLectura(valor) {
    soloLectura = Boolean(valor);
    return soloLectura;
  }

  /** Lanza si se intenta escribir en modo solo-consulta. */
  function exigirEscritura(accion = 'guardar cambios') {
    if (!soloLectura) return;
    throw new ErrorApp(
      'solo_lectura',
      `No se puede ${accion}: estás en el modo de consulta (alumno o representante). `
      + 'Pídele al coach que lo registre desde su panel.',
    );
  }

  /** Ejecuta una lectura con respaldo en caché. */
  function leer(coleccion, consulta, porDefecto = []) {
    return conRespaldo(cache, coleccion, consulta, { porDefecto });
  }

  /** Guarda en caché un resultado que ya tenemos, para que quede disponible sin conexión. */
  function sembrar(coleccion, datos) {
    cache.guardar(coleccion, datos);
    return datos;
  }

  const api = {
    cache,
    cliente,
    establecerSoloLectura,
    get enSoloLectura() { return soloLectura; },

    /* ============================ ACCESO ============================ */

    /**
     * Comprueba el token de acceso contra la tabla app_ajustes.
     * No lanza: devuelve el resultado para que la pantalla de acceso
     * pueda mostrar un mensaje amable.
     */
    async validarToken(token) {
      const limpio = String(token ?? '').trim();
      if (limpio === '') {
        return { ok: false, codigo: 'vacio', mensaje: 'Escribe el token de acceso.' };
      }

      try {
        const filas = await cliente
          .desde('app_ajustes')
          .seleccionar('valor')
          .filtrar({ clave: 'token_acceso' })
          .limitar(1)
          .ejecutar();

        if (!Array.isArray(filas) || filas.length === 0) {
          return {
            ok: false,
            codigo: 'sin_configurar',
            mensaje: 'La base de datos no tiene token configurado. Revisa la guía de despliegue.',
          };
        }

        const esperado = String(filas[0].valor ?? '').trim();
        if (esperado !== limpio) {
          return { ok: false, codigo: 'incorrecto', mensaje: 'Ese token no es válido. Pídele el link al coach.' };
        }

        // Deja registro de la entrada: sirve para saber si el link circuló de más.
        api.registrarAcceso(esperado).catch(() => {});
        return { ok: true };
      } catch (error) {
        if (error.esFalloDeRed) {
          return {
            ok: false,
            codigo: 'sin_conexion',
            mensaje: 'No hay conexión. Revisa tu internet o espera a que el proyecto de Supabase despierte.',
          };
        }
        if (error.codigo === 'sin_acceso' || error.codigo === 'sin_permiso') {
          return {
            ok: false,
            codigo: 'sin_permiso',
            mensaje: 'La clave de Supabase no permite leer los ajustes. Revisa el RLS (02_rls.sql).',
          };
        }
        return { ok: false, codigo: 'error', mensaje: error.message ?? 'No se pudo validar el acceso.' };
      }
    },

    /** Registra la entrada en el log de accesos (no es crítico si falla). */
    async registrarAcceso(etiqueta) {
      const dispositivo = typeof navigator !== 'undefined'
        ? String(navigator.userAgent ?? '').slice(0, 180)
        : 'desconocido';
      return cliente.desde('log_acceso').insertar(
        [{ token_etiqueta: String(etiqueta).slice(0, 12), dispositivo }],
        { devolver: false },
      );
    },

    /** Lee un ajuste de la tabla app_ajustes. */
    async ajuste(clave, porDefecto = null) {
      try {
        const filas = await cliente
          .desde('app_ajustes')
          .seleccionar('valor')
          .filtrar({ clave })
          .limitar(1)
          .ejecutar();
        return filas?.[0]?.valor ?? porDefecto;
      } catch {
        return porDefecto;
      }
    },

    /** Cambia el token de acceso compartido (para rotarlo si el link se filtró). */
    async cambiarToken(nuevo) {
      const limpio = String(nuevo ?? '').trim();
      if (limpio.length < 6) {
        throw new ErrorApp('token_corto', 'El token debe tener al menos 6 caracteres.');
      }
      const filas = await cliente
        .desde('app_ajustes')
        .filtrar({ clave: 'token_acceso' })
        .actualizar({ valor: limpio, actualizado_en: new Date().toISOString() });
      return filas;
    },

    /* ========================= ESTUDIANTES ========================= */

    listarEstudiantes({ incluirInactivos = true, busqueda = '' } = {}) {
      return leer(COLECCIONES.ESTUDIANTES, async () => {
        let consulta = cliente
          .desde('estudiantes')
          .seleccionar(CAMPOS_ESTUDIANTE)
          .ordenar('nombre');

        const filtros = {};
        if (!incluirInactivos) filtros.activo = true;
        const termino = busqueda.trim();
        if (termino) {
          filtros.nombre = { ilike: `%${termino}%` };
        }
        consulta = consulta.filtrar(filtros);

        return consulta.ejecutar();
      }, []);
    },

    /** Estudiantes junto con el equipo al que pertenecen (una sola llamada). */
    listarEstudiantesConEquipo() {
      return leer('estudiantes-con-equipo', async () => {
        return cliente
          .desde('estudiantes')
          .seleccionar(`${CAMPOS_ESTUDIANTE},equipo_integrantes(equipo_id,equipos(id,nombre))`)
          .ordenar('nombre')
          .ejecutar();
      }, []);
    },

    async obtenerEstudiante(id) {
      return cliente.desde('estudiantes').seleccionar(CAMPOS_ESTUDIANTE).filtrar({ id: Number(id) }).unico();
    },

    async crearEstudiante(datos) {
      const preparado = prepararEstudiante(datos);
      const [creado] = await cliente.desde('estudiantes').insertar(preparado);
      cache.olvidar(COLECCIONES.ESTUDIANTES);
      return creado;
    },

    async actualizarEstudiante(id, datos) {
      const preparado = prepararEstudiante(datos, { parcial: true });
      const [actualizado] = await cliente
        .desde('estudiantes')
        .filtrar({ id: Number(id) })
        .actualizar(preparado);
      cache.olvidar(COLECCIONES.ESTUDIANTES);
      return actualizado;
    },

    /**
     * Da de baja a un estudiante (no se borra: conserva su historial).
     * La base prohíbe el DELETE, así que esta es la única baja posible.
     */
    async darDeBajaEstudiante(id) {
      return api.actualizarEstudiante(id, { activo: false });
    },

    async reactivarEstudiante(id) {
      return api.actualizarEstudiante(id, { activo: true });
    },

    /** Asistencia y prácticas de un estudiante, para su ficha. */
    historialEstudiante(id) {
      const estudianteId = Number(id);
      return leer(`historial-estudiante-${estudianteId}`, async () => {
        const [asistencia, practicas, equipos] = await Promise.all([
          cliente
            .desde('asistencia')
            .seleccionar('id,estado,observacion,sesiones(id,fecha,titulo)')
            .filtrar({ estudiante_id: estudianteId })
            .ejecutar(),
          cliente
            .desde('practicas')
            .seleccionar('id,fecha,duracion_ms,puntaje,intento,equipo_id,equipos(nombre)')
            .filtrar({ equipo_id: { in: await equiposDelEstudiante(estudianteId) } })
            .ordenar('fecha', { ascendente: false })
            .limitar(200)
            .ejecutar(),
          cliente
            .desde('equipo_integrantes')
            .seleccionar('equipo_id,rol,equipos(id,nombre,wro_estado)')
            .filtrar({ estudiante_id: estudianteId })
            .ejecutar(),
        ]);

        return { asistencia, practicas, equipos };
      }, { asistencia: [], practicas: [], equipos: [] });
    },

    /* =========================== EQUIPOS =========================== */

    listarEquipos({ incluirInactivos = true } = {}) {
      return leer(COLECCIONES.EQUIPOS, async () => {
        const filtros = incluirInactivos ? {} : { activo: true };
        return cliente
          .desde('equipos')
          .seleccionar(`${CAMPOS_EQUIPO},equipo_integrantes(${CAMPOS_INTEGRANTES})`)
          .filtrar(filtros)
          .ordenar('nombre')
          .ejecutar();
      }, []);
    },

    /** Resumen calculado en la base (integrantes, mejor tiempo, mejor puntaje). */
    listarEquiposResumen() {
      return leer('equipos-resumen', async () => {
        return cliente
          .desde('vista_equipos_resumen')
          .seleccionar('*')
          .ordenar('nombre')
          .ejecutar();
      }, []);
    },

    async obtenerEquipo(id) {
      return cliente
        .desde('equipos')
        .seleccionar(`${CAMPOS_EQUIPO},equipo_integrantes(${CAMPOS_INTEGRANTES})`)
        .filtrar({ id: Number(id) })
        .unico();
    },

    /**
     * Crea o actualiza un equipo con sus integrantes, validando las reglas
     * del club ANTES de tocar la base (mejores mensajes de error).
     */
    async guardarEquipo(datos, integrantes = [], { equipoId = null, equipos = [], estudiantes = [] } = {}) {
      const contexto = {
        estudiantes,
        equipos,
        equipoId: equipoId ? Number(equipoId) : null,
        pertenenciaActual: mapaPertenencia(equipos),
      };

      const validacion = validarEquipo(datos, integrantes, contexto);
      if (!validacion.valido) {
        throw new ErrorApp('validacion', validacion.errores.join(' '), { errores: validacion.errores });
      }

      const preparado = normalizarEquipo(datos);

      const equipo = equipoId
        ? (await cliente.desde('equipos').filtrar({ id: Number(equipoId) }).actualizar(preparado))[0]
        : (await cliente.desde('equipos').insertar(preparado))[0];

      await api.reemplazarIntegrantes(equipo.id, validacion.integrantes);

      cache.olvidar(COLECCIONES.EQUIPOS);
      cache.olvidar('equipos-resumen');
      return api.obtenerEquipo(equipo.id);
    },

    /**
     * Reemplaza la lista de integrantes de un equipo.
     * Primero quita a los que ya no van, después agrega a los nuevos y por
     * último ajusta el rol de los que se quedaron (por si cambió el capitán).
     * Es la única tabla donde la base permite borrar.
     */
    async reemplazarIntegrantes(equipoId, integrantes) {
      const id = Number(equipoId);
      const deseados = normalizarIntegrantes(integrantes);

      const actuales = await cliente
        .desde('equipo_integrantes')
        .seleccionar('id,estudiante_id,rol')
        .filtrar({ equipo_id: id })
        .ejecutar();

      const idsDeseados = new Set(deseados.map((i) => i.estudianteId));
      const idsActuales = new Set(actuales.map((fila) => Number(fila.estudiante_id)));

      const aQuitar = actuales.filter((fila) => !idsDeseados.has(Number(fila.estudiante_id)));
      const aAgregar = deseados.filter((i) => !idsActuales.has(i.estudianteId));

      for (const fila of aQuitar) {
        await cliente.desde('equipo_integrantes').filtrar({ id: Number(fila.id) }).borrar();
      }

      if (aAgregar.length > 0) {
        await cliente.desde('equipo_integrantes').insertar(
          aAgregar.map((i) => ({
            equipo_id: id,
            estudiante_id: i.estudianteId,
            rol: i.rol,
          })),
        );
      }

      // Solo se actualizan los roles que realmente cambiaron.
      for (const integrante of deseados) {
        const actual = actuales.find((f) => Number(f.estudiante_id) === integrante.estudianteId);
        if (!actual || actual.rol === integrante.rol) continue;
        await cliente
          .desde('equipo_integrantes')
          .filtrar({ id: Number(actual.id) })
          .actualizar({ rol: integrante.rol });
      }

      return true;
    },

    async actualizarWro(equipoId, { estado, resultado, nota, categoria }) {
      const [actualizado] = await cliente
        .desde('equipos')
        .filtrar({ id: Number(equipoId) })
        .actualizar({
          wro_estado: estado,
          wro_resultado: resultado || null,
          wro_nota: nota || null,
          categoria_wro: categoria || null,
        });
      cache.olvidar(COLECCIONES.EQUIPOS);
      cache.olvidar('equipos-resumen');
      return actualizado;
    },

    async archivarEquipo(id, activo = false) {
      const [actualizado] = await cliente
        .desde('equipos')
        .filtrar({ id: Number(id) })
        .actualizar({ activo });
      cache.olvidar(COLECCIONES.EQUIPOS);
      return actualizado;
    },

    /* =========================== SESIONES ========================== */

    listarSesiones({ desde = null, hasta = null, mes = null, limite = 300 } = {}) {
      return leer(`${COLECCIONES.SESIONES}-${mes ?? 'todas'}`, async () => {
        const filtros = {};
        if (mes) {
          filtros.fecha = { gte: `${mes}-01`, lte: `${mes}-31` };
        } else {
          if (desde) filtros.fecha = { gte: desde };
          if (hasta) filtros.fecha = { ...(filtros.fecha ?? {}), lte: hasta };
        }

        return cliente
          .desde('sesiones')
          .seleccionar(CAMPOS_SESION)
          .filtrar(filtros)
          .ordenar('fecha', { ascendente: false })
          .limitar(limite)
          .ejecutar();
      }, []);
    },

    async sesionDeFecha(fecha) {
      return cliente
        .desde('sesiones')
        .seleccionar(CAMPOS_SESION)
        .filtrar({ fecha })
        .quizasUnico();
    },

    async crearSesion(datos) {
      const preparado = {
        fecha: datos.fecha,
        hora_inicio: datos.horaInicio || null,
        hora_fin: datos.horaFin || null,
        titulo: datos.titulo?.trim() || null,
        nota: datos.nota?.trim() || null,
        estado: 'abierta',
      };
      const [creada] = await cliente.desde('sesiones').insertar(preparado);
      cache.olvidar('sesiones-todas');
      return creada;
    },

    /** Crea la sesión de esa fecha si no existe; si existe, la devuelve. */
    async asegurarSesion(fecha, extra = {}) {
      const existente = await api.sesionDeFecha(fecha);
      if (existente) return existente;
      try {
        return await api.crearSesion({ fecha, ...extra });
      } catch (error) {
        // Carrera entre dos dispositivos creando el mismo día: se reintenta la lectura.
        if (error.codigo === 'duplicado') return api.sesionDeFecha(fecha);
        throw error;
      }
    },

    async actualizarSesion(id, cambios) {
      const preparado = {};
      if ('horaInicio' in cambios) preparado.hora_inicio = cambios.horaInicio || null;
      if ('horaFin' in cambios) preparado.hora_fin = cambios.horaFin || null;
      if ('titulo' in cambios) preparado.titulo = cambios.titulo?.trim() || null;
      if ('nota' in cambios) preparado.nota = cambios.nota?.trim() || null;
      if ('estado' in cambios) preparado.estado = cambios.estado;

      const [actualizada] = await cliente.desde('sesiones').filtrar({ id: Number(id) }).actualizar(preparado);
      cache.olvidar('sesiones-todas');
      return actualizada;
    },

    cerrarSesion(id) {
      return api.actualizarSesion(id, { estado: 'cerrada' });
    },

    reabrirSesion(id) {
      return api.actualizarSesion(id, { estado: 'abierta' });
    },

    /* ========================== ASISTENCIA ========================= */

    /**
     * Lista a marcar de una sesión, combinando estudiantes activos con los
     * registros que ya existan. Si se pide una fecha sin sesión, se crea.
     */
    async listaAsistencia({ sesionId = null, fecha = null } = {}) {
      const sesion = sesionId
        ? await cliente.desde('sesiones').seleccionar(CAMPOS_SESION).filtrar({ id: Number(sesionId) }).unico()
        : await api.asegurarSesion(fecha ?? hoyISO());

      const [estudiantes, registros] = await Promise.all([
        cliente.desde('estudiantes').seleccionar('id,nombre,activo').ordenar('nombre').ejecutar(),
        cliente
          .desde('asistencia')
          .seleccionar('id,estudiante_id,estado,observacion')
          .filtrar({ sesion_id: sesion.id })
          .ejecutar(),
      ]);

      const lista = construirListaSesion({ estudiantes, registros });
      return { sesion, lista, registros, estudiantes };
    },

    /**
     * Guarda la asistencia marcada en un solo lote.
     * Se usa upsert con clave (sesion_id, estudiante_id): así volver a guardar
     * corrige en vez de duplicar.
     */
    async guardarAsistencia(lista, { sesion, registradoPor = null } = {}) {
      const errores = validarGuardado(lista, { sesion });
      if (errores.length > 0) {
        throw new ErrorApp('validacion', errores.join(' '), { errores });
      }

      const registros = prepararRegistros(lista, { sesionId: sesion.id, registradoPor });
      if (registros.length === 0) return [];

      const guardados = await cliente
        .desde('asistencia')
        .upsert(registros, { sobre: 'sesion_id,estudiante_id' });

      cache.olvidar(COLECCIONES.ASISTENCIA_ULTIMA);
      cache.olvidar('asistencia-meses');
      cache.olvidar(COLECCIONES.RESUMEN);
      return guardados;
    },

    /**
     * Últimos registros de asistencia con la fecha de su sesión.
     * Alimenta el porcentaje del mes y el gráfico de las últimas semanas.
     * (El límite se respeta: si la lista crece mucho, se pediría por meses.)
     */
    asistenciaReciente(limite = 1000) {
      return leer('asistencia-reciente', async () => {
        return cliente
          .desde('asistencia')
          .seleccionar('id,estado,estudiante_id,sesion_id,sesiones(fecha)')
          .ordenar('id', { ascendente: false })
          .limitar(limite)
          .ejecutar();
      }, []);
    },

    /** Registros de asistencia de un mes, con la fecha de la sesión incluida. */
    asistenciaDelMes(mes) {
      const clave = mes ?? claveMes(hoyISO());
      return leer(`asistencia-mes-${clave}`, async () => {
        return cliente
          .desde('asistencia')
          .seleccionar('id,estado,observacion,estudiante_id,sesion_id,sesiones(fecha)')
          .filtrar({ sesiones: { fecha: { gte: `${clave}-01`, lte: `${clave}-31` } } })
          .ejecutar();
      }, []);
    },

    /** Asistencia de un estudiante concreto (para su ficha). */
    asistenciaEstudiante(estudianteId) {
      const id = Number(estudianteId);
      return leer(`asistencia-estudiante-${id}`, async () => {
        return cliente
          .desde('asistencia')
          .seleccionar('id,estado,observacion,sesiones(fecha,titulo)')
          .filtrar({ estudiante_id: id })
          .ejecutar();
      }, []);
    },

    /** Porcentajes por estudiante, calculados en la base. */
    vistaAsistenciaEstudiantes() {
      return leer(COLECCIONES.ASISTENCIA_ULTIMA, async () => {
        return cliente
          .desde('vista_asistencia_estudiante')
          .seleccionar('*')
          .ordenar('nombre')
          .ejecutar();
      }, []);
    },

    /* ============================ RETOS =========================== */

    listarRetos({ soloActivos = true } = {}) {
      return leer(COLECCIONES.RETOS, async () => {
        let consulta = cliente.desde('retos').seleccionar('id,nombre,descripcion,activo').ordenar('nombre');
        if (soloActivos) consulta = consulta.filtrar({ activo: true });
        return consulta.ejecutar();
      }, []);
    },

    async crearReto(datos) {
      const [creado] = await cliente.desde('retos').insertar({
        nombre: embellecerNombre(datos.nombre),
        descripcion: datos.descripcion?.trim() || null,
      });
      cache.olvidar(COLECCIONES.RETOS);
      return creado;
    },

    /* ========================== PRÁCTICAS ========================= */

    /**
     * Prácticas con filtros y paginación.
     * PostgREST corta en 1000 filas, así que se pagina de verdad.
     */
    listarPracticas({
      equipoId = null, retoId = null, desde = null, hasta = null, pagina = 0, porPagina = 60,
    } = {}) {
      const clave = [COLECCIONES.PRACTICAS, equipoId ?? 'x', retoId ?? 'x', desde ?? 'x', hasta ?? 'x', pagina].join('-');
      const filtros = {};
      if (equipoId) filtros.equipo_id = Number(equipoId);
      if (retoId) filtros.reto_id = Number(retoId);
      if (desde) filtros.fecha = { gte: desde };
      if (hasta) filtros.fecha = { ...(filtros.fecha ?? {}), lte: hasta };

      return leer(clave, async () => {
        const consulta = cliente
          .desde('practicas')
          .seleccionar(CAMPOS_PRACTICA)
          .filtrar(filtros)
          .ordenar('fecha', { ascendente: false })
          .ordenar('intento', { ascendente: false })
          .limitar(porPagina + 1)
          .rango(pagina * porPagina, pagina * porPagina + porPagina);

        return consulta.ejecutar();
      }, []);
    },

    /** Todas las prácticas recientes (para estadísticas y evolución). */
    practicasRecientes(limite = 500) {
      return leer('practicas-recientes', async () => {
        return cliente
          .desde('practicas')
          .seleccionar('id,fecha,equipo_id,intento,reto_id,duracion_ms,puntaje')
          .ordenar('fecha', { ascendente: false })
          .limitar(limite)
          .ejecutar();
      }, []);
    },

    async crearPractica(datos) {
      const preparado = prepararPractica(datos);
      const [creada] = await cliente.desde('practicas').insertar(preparado);
      cache.olvidar('practicas-recientes');
      cache.olvidar(COLECCIONES.RANKING);
      cache.olvidar(COLECCIONES.RESUMEN);
      return creada;
    },

    async actualizarPractica(id, datos) {
      const preparado = prepararPractica(datos);
      const [actualizada] = await cliente
        .desde('practicas')
        .filtrar({ id: Number(id) })
        .actualizar(preparado);
      cache.olvidar('practicas-recientes');
      cache.olvidar(COLECCIONES.RANKING);
      return actualizada;
    },

    async borrarPractica(id) {
      await cliente.desde('practicas').filtrar({ id: Number(id) }).borrar();
      cache.olvidar('practicas-recientes');
      cache.olvidar(COLECCIONES.RANKING);
      return true;
    },

    /** Ranking por equipo y por reto, calculado en la base. */
    rankingPracticas() {
      return leer(COLECCIONES.RANKING, async () => {
        return cliente
          .desde('vista_ranking_practicas')
          .seleccionar('*')
          .ordenar('mejor_puntaje', { ascendente: false })
          .ejecutar();
      }, []);
    },

    /* ============================ PANEL =========================== */

    /** Porcentaje de asistencia de la última sesión registrada. */
    resumenUltimaSesion() {
      return leer('resumen-ultima-sesion', async () => {
        const filas = await cliente.rpc('fn_resumen_ultima_sesion');
        return filas?.[0] ?? null;
      }, null);
    },

    /**
     * Todo lo que necesita el panel.
     * Si alguna consulta falla pero hay caché, se muestra lo guardado.
     */
    async datosPanel() {
      const resultados = await Promise.allSettled([
        api.listarEstudiantes({ incluirInactivos: false }),
        api.listarEquiposResumen(),
        api.practicasRecientes(400),
        api.resumenUltimaSesion(),
        api.vistaAsistenciaEstudiantes(),
        api.listarRetos(),
      ]);

      const [estudiantes, equipos, practicas, ultimaSesion, porEstudiante, retos] = resultados.map((r) => (
        r.status === 'fulfilled' ? r.value : { datos: null, deCache: true, error: r.reason }
      ));

      const algunoDeCache = resultados.some((r) => r.status === 'rejected'
        || (r.status === 'fulfilled' && r.value?.deCache));

      const primerError = resultados
        .map((r) => (r.status === 'rejected' ? r.reason : r.value?.error))
        .find(Boolean) ?? null;

      const antiguedades = [estudiantes, equipos, practicas, ultimaSesion, porEstudiante, retos]
        .map((r) => r?.antiguedad)
        .filter(Boolean);

      return {
        estudiantes: estudiantes?.datos ?? [],
        equipos: equipos?.datos ?? [],
        practicas: practicas?.datos ?? [],
        ultimaSesion: ultimaSesion?.datos ?? null,
        porEstudiante: porEstudiante?.datos ?? [],
        retos: retos?.datos ?? [],
        deCache: algunoDeCache,
        antiguedad: antiguedades[0] ?? null,
        error: primerError,
      };
    },

    /* ========================== RESPALDO ========================== */

    /** Descarga completa de la base, para respaldar (el plan gratuito no respalda). */
    async exportarTodo() {
      const [estudiantes, equipos, integrantes, sesiones, asistencia, retos, practicas, ajustes] = await Promise.all([
        cliente.desde('estudiantes').seleccionar('*').ejecutar(),
        cliente.desde('equipos').seleccionar('*').ejecutar(),
        cliente.desde('equipo_integrantes').seleccionar('*').ejecutar(),
        cliente.desde('sesiones').seleccionar('*').ejecutar(),
        cliente.desde('asistencia').seleccionar('*').ejecutar(),
        cliente.desde('retos').seleccionar('*').ejecutar(),
        cliente.desde('practicas').seleccionar('*').ejecutar(),
        cliente.desde('app_ajustes').seleccionar('*').ejecutar(),
      ]);

      return {
        generado_en: new Date().toISOString(),
        version: 1,
        estudiantes,
        equipos,
        equipo_integrantes: integrantes,
        sesiones,
        asistencia,
        retos,
        practicas,
        app_ajustes: ajustes,
      };
    },
  };

  /* ------------------------------------------------------------------ *
   * BARRERA DE ESCRITURA
   * ------------------------------------------------------------------ */

  /**
   * Envuelve los métodos que escriben para que respeten el modo solo-consulta.
   *
   * Se hace aquí, sobre el objeto ya construido, por una razón práctica: una
   * lista con los nombres es fácil de auditar y de mantener, y evita que una
   * función nueva se quede sin barrera por descuido. Si mañana se agrega un
   * método de escritura, hay que agregarlo a esta lista.
   */
  const METODOS_ESCRITURA = {
    crearEstudiante: 'crear estudiantes',
    actualizarEstudiante: 'editar estudiantes',
    darDeBajaEstudiante: 'dar de baja a un estudiante',
    reactivarEstudiante: 'reactivar a un estudiante',
    guardarEquipo: 'guardar equipos',
    reemplazarIntegrantes: 'cambiar los integrantes de un equipo',
    actualizarWro: 'editar la participación en la WRO',
    archivarEquipo: 'archivar equipos',
    crearReto: 'crear retos',
    crearSesion: 'crear clases',
    asegurarSesion: 'crear clases',
    actualizarSesion: 'editar clases',
    cerrarSesion: 'cerrar clases',
    reabrirSesion: 'reabrir clases',
    guardarAsistencia: 'guardar asistencia',
    crearPractica: 'registrar prácticas',
    actualizarPractica: 'editar prácticas',
    borrarPractica: 'borrar prácticas',
    cambiarToken: 'cambiar el token de acceso',
  };

  Object.entries(METODOS_ESCRITURA).forEach(([nombre, accion]) => {
    const original = api[nombre];
    if (typeof original !== 'function') return;
    api[nombre] = async (...argumentos) => {
      exigirEscritura(accion);
      return original(...argumentos);
    };
  });

  /* ------------------------------------------------------------------ *
   * AYUDAS INTERNAS
   * ------------------------------------------------------------------ */

  /** Equipos a los que pertenece (o perteneció) un estudiante. */
  async function equiposDelEstudiante(estudianteId) {
    try {
      const filas = await cliente
        .desde('equipo_integrantes')
        .seleccionar('equipo_id')
        .filtrar({ estudiante_id: Number(estudianteId) })
        .ejecutar();
      const ids = filas.map((f) => Number(f.equipo_id)).filter(Number.isFinite);
      return ids.length ? ids : [-1];
    } catch {
      return [-1];
    }
  }

  return api;
}

/* ------------------------------------------------------------------ *
 * PREPARACIÓN DE DATOS
 * ------------------------------------------------------------------ */

export function prepararEstudiante(datos, { parcial = false } = {}) {
  const salida = {};

  const tieneNombre = Object.prototype.hasOwnProperty.call(datos, 'nombre');
  if (tieneNombre || !parcial) {
    const nombre = embellecerNombre(datos.nombre);
    if (nombre.length < 2) {
      throw new ErrorApp('validacion', 'El nombre del estudiante debe tener al menos 2 caracteres.');
    }
    if (nombre.length > 80) {
      throw new ErrorApp('validacion', 'El nombre no puede pasar de 80 caracteres.');
    }
    salida.nombre = nombre;
    salida.nombre_busqueda = normalizarNombre(nombre);
  }

  if ('fechaNacimiento' in datos) salida.fecha_nacimiento = datos.fechaNacimiento || null;
  if ('representante' in datos) salida.representante = datos.representante?.trim() || null;
  if ('telefono' in datos) salida.telefono = datos.telefono?.trim() || null;
  if ('nota' in datos) salida.nota = datos.nota?.trim() || null;
  if ('activo' in datos) salida.activo = Boolean(datos.activo);

  return salida;
}

export function prepararPractica(datos) {
  const salida = {};

  if (!datos.fecha) {
    throw new ErrorApp('validacion', 'Falta la fecha de la práctica.');
  }
  salida.fecha = datos.fecha;

  const equipoId = Number(datos.equipoId);
  if (!Number.isFinite(equipoId) || equipoId <= 0) {
    throw new ErrorApp('validacion', 'Elige el equipo que hizo la práctica.');
  }
  salida.equipo_id = equipoId;

  const intento = Number(datos.intento ?? 1);
  if (!Number.isFinite(intento) || intento < 1 || intento > 99) {
    throw new ErrorApp('validacion', 'El número de intento debe estar entre 1 y 99.');
  }
  salida.intento = Math.round(intento);

  salida.reto_id = datos.retoId ? Number(datos.retoId) : null;
  salida.duracion_ms = datos.duracionMs === null || datos.duracionMs === undefined
    ? null
    : Math.round(Number(datos.duracionMs));

  const puntaje = Number(datos.puntaje);
  if (!Number.isFinite(puntaje) || puntaje < 0) {
    throw new ErrorApp('validacion', 'El puntaje es obligatorio y no puede ser negativo.');
  }
  salida.puntaje = Math.round(puntaje);

  salida.observaciones = datos.observaciones?.trim() || null;
  if ('registradoPor' in datos) salida.registrado_por = datos.registradoPor || null;

  return salida;
}

/* ------------------------------------------------------------------ *
 * CONSTRUCCIÓN DESDE LA CONFIGURACIÓN
 * ------------------------------------------------------------------ */

/**
 * Crea el cliente y la API a partir de la configuración de config.js.
 * Lanza ErrorApp si falta configurar.
 */
export function crearApiDesdeConfig(config, { fetch: fetchInyectado = null } = {}) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = config ?? {};

  if (!SUPABASE_URL || String(SUPABASE_URL).includes('TU-PROYECTO')) {
    throw new ErrorApp('sin_configurar', 'Falta SUPABASE_URL en docs/js/config.js.');
  }
  if (!SUPABASE_ANON_KEY || String(SUPABASE_ANON_KEY).includes('TU-CLAVE')) {
    throw new ErrorApp('sin_configurar', 'Falta SUPABASE_ANON_KEY en docs/js/config.js.');
  }

  const cliente = new ClientePostgrest({
    baseUrl: SUPABASE_URL,
    apiKey: SUPABASE_ANON_KEY,
    fetch: fetchInyectado,
  });

  return { cliente, api: crearApi({ cliente }) };
}

export { ErrorApi, hoyISO };
