/**
 * vistas/estudiantes.js — Catálogo de niños y niñas del club.
 *
 * Muestra quién está activo, a qué equipo pertenece, su porcentaje de
 * asistencia y su mejor puntaje. Alta y edición en un modal.
 *
 * Importante: no se borra a nadie. La baja es desactivar, así se conserva
 * todo el historial de asistencia y prácticas.
 */

import { crear, limpiar, reemplazar, retrasar, esqueletoFilas, estadoVacio, avisoOk, icono } from '../ui.js';
import { tabla, insignia, puntoEquipo, porcentajeAsistencia } from '../componentes/ladrillo.js';
import { formatearPuntaje, formatearDuracionCorta, fechaCorta, hoyISO } from '../formato.js';
import { desdeVistaAsistencia } from '../asistencia.js';
import { mapaPertenencia } from '../equipos.js';
import { resumirPracticas } from '../estadisticas.js';
import { mensajeDeError } from '../api.js';

export async function renderEstudiantes(raiz, contexto) {
  const { api, cabecera, modal, confirmar, avisoError, navegar } = contexto;

  let estudiantes = [];
  let equipos = [];
  let equiposPorEstudiante = new Map();
  let resumenAsistencia = new Map();
  let mejorPuntajePorEquipo = new Map();
  let busqueda = '';
  let soloActivos = false;
  let enPantalla = true;

  const contenedorLista = crear('div', { 'aria-busy': 'true' }, [esqueletoFilas(6)]);

  const campoBusqueda = crear('input', {
    type: 'search',
    placeholder: 'Buscar por nombre…',
    'aria-label': 'Buscar estudiante por nombre',
    oninput: retrasar((evento) => {
      busqueda = evento.target.value.trim().toLowerCase();
      pintarLista();
    }, 200),
  });

  const casillaActivos = crear('input', {
    type: 'checkbox',
    id: 'solo-activos',
    onchange: (evento) => {
      soloActivos = evento.target.checked;
      pintarLista();
    },
  });

  raiz.append(cabecera({
    titulo: 'Estudiantes',
    descripcion: 'Los niños y niñas del club. La baja no borra el historial: solo los deja inactivos.',
    acciones: [
      crear('button', {
        clase: 'boton boton--primario',
        type: 'button',
        onclick: () => abrirFormulario(null),
      }, [
        crear('span', { html: icono('mas', { tamano: 16, clase: 'boton__icono' }) }),
        crear('span', { texto: 'Nuevo estudiante' }),
      ]),
    ],
  }));

  raiz.append(crear('div', { clase: 'barra-busqueda' }, [
    crear('div', { clase: 'buscador' }, [
      crear('span', {
        clase: 'buscador__icono',
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
      }),
      campoBusqueda,
    ]),
    crear('label', { clase: 'interruptor', for: 'solo-activos' }, [
      casillaActivos,
      crear('span', { texto: 'Solo activos' }),
    ]),
  ]));

  raiz.append(contenedorLista);

  /* ---------------- carga ---------------- */

  async function cargar() {
    limpiar(contenedorLista);
    contenedorLista.setAttribute('aria-busy', 'true');
    contenedorLista.append(esqueletoFilas(6));

    try {
      const [resultadoEstudiantes, resultados] = await Promise.all([
        api.listarEstudiantes({ incluirInactivos: true }),
        Promise.allSettled([
          api.listarEquipos({ incluirInactivos: true }),
          api.vistaAsistenciaEstudiantes(),
          api.practicasRecientes(500),
        ]),
      ]);

      estudiantes = resultadoEstudiantes.datos ?? [];

      const [resEquipos, resAsistencia, resPracticas] = resultados.map(
        (r) => (r.status === 'fulfilled' ? r.value : { datos: [] }),
      );

      equipos = resEquipos?.datos ?? [];
      equiposPorEstudiante = mapaPertenencia(equipos);
      resumenAsistencia = new Map(
        desdeVistaAsistencia(resAsistencia?.datos ?? []).map((f) => [f.estudianteId, f]),
      );

      // Mejor puntaje por equipo -> para mostrarlo en la ficha del estudiante.
      mejorPuntajePorEquipo = new Map();
      const porEquipo = new Map();
      (resPracticas?.datos ?? []).forEach((practica) => {
        const id = Number(practica.equipo_id);
        if (!porEquipo.has(id)) porEquipo.set(id, []);
        porEquipo.get(id).push(practica);
      });
      porEquipo.forEach((lista, equipoId) => {
        mejorPuntajePorEquipo.set(equipoId, resumirPracticas(lista).mejorPuntaje);
      });

      if (!enPantalla) return;
      pintarLista();
    } catch (error) {
      if (!enPantalla) return;
      limpiar(contenedorLista);
      contenedorLista.removeAttribute('aria-busy');
      contenedorLista.append(estadoVacio({
        titulo: 'No se pudo cargar la lista',
        texto: mensajeDeError(error),
        accion: crear('button', {
          clase: 'boton boton--primario', type: 'button', texto: 'Reintentar', onclick: cargar,
        }),
      }));
    }
  }

  /* ---------------- pintado ---------------- */

  function filtrar() {
    const termino = busqueda;
    return estudiantes.filter((estudiante) => {
      if (soloActivos && estudiante.activo === false) return false;
      if (!termino) return true;
      return String(estudiante.nombre ?? '').toLowerCase().includes(termino);
    });
  }

  function equipoDe(estudianteId) {
    const equipoId = equiposPorEstudiante.get(Number(estudianteId));
    if (!equipoId) return null;
    return equipos.find((e) => Number(e.id) === Number(equipoId)) ?? null;
  }

  function mejorPuntajeDe(estudianteId) {
    const equipo = equipoDe(estudianteId);
    if (!equipo) return null;
    return mejorPuntajePorEquipo.get(Number(equipo.id)) ?? null;
  }

  function pintarLista() {
    const filas = filtrar();
    reemplazar(contenedorLista);
    contenedorLista.removeAttribute('aria-busy');

    if (estudiantes.length === 0) {
      contenedorLista.append(estadoVacio({
        titulo: 'Todavía no hay estudiantes',
        texto: 'Agrega a los niños y niñas del club para poder tomar asistencia y armar equipos.',
        iconoNombre: 'estudiantes',
        accion: crear('button', {
          clase: 'boton boton--primario',
          type: 'button',
          texto: 'Agregar el primero',
          onclick: () => abrirFormulario(null),
        }),
      }));
      return;
    }

    if (filas.length === 0) {
      contenedorLista.append(estadoVacio({
        titulo: 'Ningún estudiante coincide',
        texto: busqueda
          ? `No encontré a nadie que se llame "${busqueda}".`
          : 'Todos los estudiantes están dados de baja.',
        iconoNombre: 'buscar',
      }));
      return;
    }

    const tablaEstudiantes = tabla({
      titulo: 'Lista de estudiantes del club',
      filas,
      columnas: [
        {
          clave: 'nombre',
          etiqueta: 'Nombre',
          celda: (fila) => crear('div', { estilo: 'display:flex;align-items:center;gap:.5rem' }, [
            crear('strong', { texto: fila.nombre }),
            fila.activo === false ? insignia('no_participa', 'De baja') : null,
          ]),
        },
        {
          clave: 'equipo',
          etiqueta: 'Equipo',
          celda: (fila) => {
            const equipo = equipoDe(fila.id);
            if (!equipo) return crear('span', { clase: 'campo__ayuda', texto: 'Sin equipo' });
            return crear('span', { estilo: 'display:inline-flex;align-items:center;gap:.5rem' }, [
              puntoEquipo(equipo.id),
              crear('span', { texto: equipo.nombre }),
            ]);
          },
        },
        {
          clave: 'asistencia',
          etiqueta: 'Asistencia',
          alinear: 'centro',
          celda: (fila) => {
            const resumen = resumenAsistencia.get(Number(fila.id));
            if (!resumen) return porcentajeAsistencia(null);
            return crear('span', {
              title: `${resumen.presentes} presentes, ${resumen.tardes} tarde, `
                + `${resumen.justificados} justificados, ${resumen.ausencias} ausencias`,
              estilo: 'display:inline-flex;align-items:center;justify-content:center;gap:.4rem',
            }, [
              porcentajeAsistencia(resumen.porcentaje),
              crear('span', {
                clase: 'campo__ayuda',
                texto: `(${resumen.registros})`,
              }),
            ]);
          },
        },
        {
          clave: 'puntaje',
          etiqueta: 'Mejor puntaje',
          alinear: 'derecha',
          numeros: true,
          celda: (fila) => {
            const puntaje = mejorPuntajeDe(fila.id);
            return puntaje === null
              ? crear('span', { clase: 'campo__ayuda', texto: '—' })
              : crear('span', { estilo: 'font-weight:700', texto: formatearPuntaje(puntaje) });
          },
        },
        {
          clave: 'acciones',
          etiqueta: 'Acciones',
          aline: 'derecha',
          celda: (fila) => crear('div', { clase: 'acciones' }, [
            crear('button', {
              clase: 'boton boton--sm boton--fantasma',
              type: 'button',
              texto: 'Editar',
              'aria-label': `Editar a ${fila.nombre}`,
              onclick: () => abrirFormulario(fila),
            }),
            crear('button', {
              clase: 'boton boton--sm boton--fantasma',
              type: 'button',
              texto: 'Ficha',
              'aria-label': `Ver la ficha de ${fila.nombre}`,
              onclick: () => abrirFicha(fila),
            }),
          ]),
        },
      ],
    });

    contenedorLista.append(
      crear('p', {
        clase: 'campo__ayuda',
        texto: `${filas.length} de ${estudiantes.length} estudiantes`,
      }),
      tablaEstudiantes,
    );
  }

  /* ---------------- formulario ---------------- */

  function abrirFormulario(estudiante) {
    const editando = Boolean(estudiante);

    const campos = {
      nombre: crear('input', {
        type: 'text', id: 'campo-nombre', required: true, maxlength: '80',
        value: estudiante?.nombre ?? '', autocomplete: 'off',
      }),
      fechaNacimiento: crear('input', {
        type: 'date', id: 'campo-fecha', value: estudiante?.fecha_nacimiento ?? '',
        max: hoyISO(),
      }),
      representante: crear('input', {
        type: 'text', id: 'campo-representante', maxlength: '80',
        value: estudiante?.representante ?? '',
      }),
      telefono: crear('input', {
        type: 'tel', id: 'campo-telefono', maxlength: '30', value: estudiante?.telefono ?? '',
        placeholder: '0414-1234567',
      }),
      nota: crear('textarea', { id: 'campo-nota', maxlength: '300', value: estudiante?.nota ?? '' }),
      activo: crear('input', {
        type: 'checkbox', id: 'campo-activo',
        checked: estudiante ? estudiante.activo !== false : true,
      }),
    };

    const errorNombre = crear('p', { clase: 'campo__error', role: 'alert' });

    const contenido = crear('form', { id: 'form-estudiante' }, [
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'campo-nombre', texto: 'Nombre y apellido *' }),
        campos.nombre,
        errorNombre,
      ]),
      crear('div', { clase: 'rejilla rejilla--2' }, [
        crear('div', { clase: 'campo' }, [
          crear('label', { for: 'campo-fecha', texto: 'Fecha de nacimiento' }),
          campos.fechaNacimiento,
          crear('span', { clase: 'campo__ayuda', texto: 'Opcional. Sirve para saber la categoría WRO.' }),
        ]),
        crear('div', { clase: 'campo' }, [
          crear('label', { for: 'campo-telefono', texto: 'Teléfono del representante' }),
          campos.telefono,
        ]),
      ]),
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'campo-representante', texto: 'Representante' }),
        campos.representante,
      ]),
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'campo-nota', texto: 'Nota' }),
        campos.nota,
        crear('span', { clase: 'campo__ayuda', texto: 'Alergias, observaciones, lo que convenga recordar.' }),
      ]),
      crear('label', { clase: 'interruptor', for: 'campo-activo' }, [
        campos.activo,
        crear('span', { texto: 'Activo en el club' }),
      ]),
    ]);

    const guardar = async () => {
      const datos = {
        nombre: campos.nombre.value,
        fechaNacimiento: campos.fechaNacimiento.value || null,
        representante: campos.representante.value,
        telefono: campos.telefono.value,
        nota: campos.nota.value,
        activo: campos.activo.checked,
      };

      if (String(datos.nombre).trim().length < 2) {
        errorNombre.textContent = 'Escribe el nombre completo.';
        campos.nombre.setAttribute('aria-invalid', 'true');
        campos.nombre.focus();
        return;
      }
      errorNombre.textContent = '';
      campos.nombre.setAttribute('aria-invalid', 'false');

      const dialogo = raiz.querySelector('.modal-velo');
      dialogo?.setAttribute('aria-busy', 'true');

      try {
        if (editando) {
          await api.actualizarEstudiante(estudiante.id, datos);
          avisoOk(`${datos.nombre} quedó actualizado.`);
        } else {
          await api.crearEstudiante(datos);
          avisoOk(`${datos.nombre} se agregó al club.`);
        }
        instanciaModal.cerrar();
        await cargar();
      } catch (error) {
        errorNombre.textContent = mensajeDeError(error);
        dialogo?.removeAttribute('aria-busy');
      }
    };

    const instanciaModal = modal({
      titulo: editando ? `Editar a ${estudiante.nombre}` : 'Nuevo estudiante',
      contenido,
      pie: [
        crear('button', {
          clase: 'boton boton--fantasma', type: 'button', texto: 'Cancelar',
          onclick: () => instanciaModal.cerrar(),
        }),
        crear('button', {
          clase: 'boton boton--primario', type: 'button',
          texto: editando ? 'Guardar cambios' : 'Agregar',
          onclick: guardar,
        }),
      ],
    });

    contenido.addEventListener('submit', (evento) => {
      evento.preventDefault();
      guardar();
    });
  }

  /* ---------------- ficha con historial ---------------- */

  async function abrirFicha(estudiante) {
    const cuerpo = crear('div', { 'aria-busy': 'true' }, [esqueletoFilas(4)]);

    const instanciaModal = modal({
      titulo: estudiante.nombre,
      contenido: cuerpo,
      ancho: true,
      pie: [
        crear('button', {
          clase: 'boton boton--fantasma', type: 'button', texto: 'Cerrar',
          onclick: () => instanciaModal.cerrar(),
        }),
      ],
    });

    try {
      const resultado = await api.historialEstudiante(estudiante.id);
      const { asistencia = [], practicas = [], equipos: equiposDelChico = [] } = resultado.datos ?? {};

      const resumen = resumenAsistencia.get(Number(estudiante.id));
      const equipo = equipoDe(estudiante.id);

      const conteo = asistencia.reduce((acumulado, fila) => {
        acumulado[fila.estado] = (acumulado[fila.estado] ?? 0) + 1;
        return acumulado;
      }, {});

      reemplazar(cuerpo);
      cuerpo.removeAttribute('aria-busy');

      cuerpo.append(
        crear('div', { clase: 'rejilla rejilla--3', estilo: 'margin-bottom:var(--e-4)' }, [
          crear('div', {}, [
            crear('span', { clase: 'metrica__etiqueta', texto: 'Asistencia' }),
            porcentajeAsistencia(resumen?.porcentaje ?? null),
          ]),
          crear('div', {}, [
            crear('span', { clase: 'metrica__etiqueta', texto: 'Equipo actual' }),
            equipo
              ? crear('span', { clase: 'metrica__valor', texto: equipo.nombre })
              : crear('span', { clase: 'metrica__valor', texto: 'Sin equipo' }),
          ]),
          crear('div', {}, [
            crear('span', { clase: 'metrica__etiqueta', texto: 'Clases registradas' }),
            crear('span', { clase: 'metrica__valor', texto: String(asistencia.length) }),
          ]),
        ]),

        crear('div', { clase: 'utilidades', estilo: 'margin-bottom:var(--e-4)' }, [
          insignia('presente', `${conteo.presente ?? 0} presentes`),
          insignia('tarde', `${conteo.tarde ?? 0} tarde`),
          insignia('justificado', `${conteo.justificado ?? 0} justificados`),
          insignia('ausente', `${conteo.ausente ?? 0} ausencias`),
        ]),

        crear('h3', { texto: 'Equipos en los que ha estado' }),
        equiposDelChico.length
          ? crear('ul', {}, equiposDelChico.map((relacion) => crear('li', { estilo: 'display:flex;gap:.5rem;align-items:center;margin-bottom:.35rem' }, [
            puntoEquipo(relacion.equipos?.id ?? relacion.equipo_id),
            crear('span', { texto: relacion.equipos?.nombre ?? `Equipo ${relacion.equipo_id}` }),
            relacion.rol === 'capitan' ? insignia('cian', 'Capitán') : null,
          ])))
          : crear('p', { clase: 'campo__ayuda', texto: 'Todavía no ha pertenecido a ningún equipo.' }),

        crear('h3', { estilo: 'margin-top:var(--e-4)', texto: 'Últimas prácticas de su equipo' }),
        practicas.length
          ? tabla({
            titulo: `Prácticas de ${estudiante.nombre}`,
            filas: practicas.slice(0, 10),
            columnas: [
              { clave: 'fecha', etiqueta: 'Fecha', celda: (f) => fechaCorta(f.fecha) },
              { clave: 'equipo', etiqueta: 'Equipo', celda: (f) => f.equipos?.nombre ?? '—' },
              { clave: 'intento', etiqueta: 'Intento', aline: 'centro' },
              { clave: 'duracion_ms', etiqueta: 'Tiempo', aline: 'derecha', numeros: true, celda: (f) => formatearDuracionCorta(f.duracion_ms) },
              { clave: 'puntaje', etiqueta: 'Puntaje', aline: 'derecha', numeros: true, celda: (f) => formatearPuntaje(f.puntaje) },
            ],
          })
          : crear('p', { clase: 'campo__ayuda', texto: 'Todavía no hay prácticas registradas.' }),

        crear('div', { clase: 'acciones', estilo: 'margin-top:var(--e-4)' }, [
          crear('button', {
            clase: 'boton boton--sm boton--fantasma',
            type: 'button',
            texto: 'Editar datos',
            onclick: () => {
              instanciaModal.cerrar();
              abrirFormulario(estudiante);
            },
          }),
          estudiante.activo === false
            ? crear('button', {
              clase: 'boton boton--sm boton--primario',
              type: 'button',
              texto: 'Reactivar en el club',
              onclick: async () => {
                try {
                  await api.reactivarEstudiante(estudiante.id);
                  avisoOk(`${estudiante.nombre} vuelve a estar activo.`);
                  instanciaModal.cerrar();
                  await cargar();
                } catch (error) {
                  avisoError(mensajeDeError(error));
                }
              },
            })
            : crear('button', {
              clase: 'boton boton--sm boton--peligro',
              type: 'button',
              texto: 'Dar de baja',
              onclick: async () => {
                const seguro = await confirmar({
                  titulo: `¿Dar de baja a ${estudiante.nombre}?`,
                  mensaje: 'No se borra nada: se conserva todo el historial de asistencia y de prácticas. '
                    + 'Puedes reactivarlo cuando quieras.',
                  textoConfirmar: 'Dar de baja',
                  peligro: true,
                });
                if (!seguro) return;
                try {
                  await api.darDeBajaEstudiante(estudiante.id);
                  avisoOk(`${estudiante.nombre} quedó dado de baja. Su historial se conserva.`);
                  instanciaModal.cerrar();
                  await cargar();
                } catch (error) {
                  avisoError(mensajeDeError(error));
                }
              },
            }),
          crear('button', {
            clase: 'boton boton--sm boton--fantasma',
            type: 'button',
            texto: 'Ver asistencia',
            onclick: () => {
              instanciaModal.cerrar();
              navegar('asistencia');
            },
          }),
        ]),
      );
    } catch (error) {
      reemplazar(cuerpo, estadoVacio({
        titulo: 'No se pudo cargar la ficha',
        texto: mensajeDeError(error),
      }));
    }
  }

  /* ---------------- arranque de la vista ---------------- */

  await cargar();

  return {
    destruir() {
      enPantalla = false;
    },
    antiguedad: null,
  };
}
