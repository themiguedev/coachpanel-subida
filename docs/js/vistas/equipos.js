/**
 * vistas/equipos.js — Equipos y sus integrantes.
 *
 * La regla del club (máximo 3 integrantes, un estudiante por equipo) se
 * valida aquí para dar buenos mensajes, y además está reforzada en la base
 * de datos con disparadores (ver supabase/01_esquema.sql).
 */

import { crear, limpiar, reemplazar, esqueletoKpis, estadoVacio, avisoOk, avisoError, icono } from '../ui.js';
import { tarjetaEquipo, insignia, kpi } from '../componentes/ladrillo.js';
import {
  estudiantesDisponibles, mapaPertenencia, integrantesConNombre, validarEquipo, MAX_INTEGRANTES,
} from '../equipos.js';
import { mensajeDeError } from '../api.js';

const CATEGORIAS_WRO = [
  'RoboMission Elementary',
  'RoboMission Junior',
  'RoboMission Senior',
  'Future Innovators',
  'Future Engineers',
  'RoboSports',
  'Otra categoría',
];

export async function renderEquipos(raiz, contexto) {
  const {
    api, cabecera, modal, confirmar, navegar, esCoach = () => true, permitirEdicion = () => true,
  } = contexto;

  /** ¿Esta modalidad puede modificar equipos? */
  const puedeEditar = () => esCoach();

  let equipos = [];
  let estudiantes = [];
  let resumenes = new Map();
  let enPantalla = true;

  const contenedor = crear('div', { 'aria-busy': 'true' }, [esqueletoKpis(3)]);

  raiz.append(cabecera({
    titulo: 'Equipos',
    descripcion: puedeEditar()
      ? `Cada equipo puede tener hasta ${MAX_INTEGRANTES} integrantes, y un estudiante pertenece a un solo equipo.`
      : 'Así están armados los equipos del club y cómo van en la pista.',
    acciones: puedeEditar()
      ? [
        crear('button', {
          clase: 'boton boton--primario',
          type: 'button',
          onclick: () => abrirEditor(null),
        }, [
          crear('span', { html: icono('mas', { tamano: 16, clase: 'boton__icono' }) }),
          crear('span', { texto: 'Nuevo equipo' }),
        ]),
      ]
      : [],
  }));

  raiz.append(contenedor);

  /* ---------------- carga ---------------- */

  async function cargar() {
    limpiar(contenedor);
    contenedor.setAttribute('aria-busy', 'true');
    contenedor.append(esqueletoKpis(3));

    try {
      const [resEquipos, resEstudiantes, resumen] = await Promise.all([
        api.listarEquipos({ incluirInactivos: true }),
        api.listarEstudiantes({ incluirInactivos: true }),
        api.listarEquiposResumen(),
      ]);

      equipos = resEquipos.datos ?? [];
      estudiantes = resEstudiantes.datos ?? [];
      resumenes = new Map((resumen.datos ?? []).map((fila) => [Number(fila.id), fila]));

      if (!enPantalla) return;
      pintar();
    } catch (error) {
      if (!enPantalla) return;
      contenedor.removeAttribute('aria-busy');
      reemplazar(contenedor, estadoVacio({
        titulo: 'No se pudieron cargar los equipos',
        texto: mensajeDeError(error),
        iconoNombre: 'equipos',
        accion: crear('button', { clase: 'boton boton--primario', type: 'button', texto: 'Reintentar', onclick: cargar }),
      }));
    }
  }

  /* ---------------- pintado ---------------- */

  function integrantesDe(equipo) {
    return integrantesConNombre(equipo, estudiantes);
  }

  function pintar() {
    reemplazar(contenedor);
    contenedor.removeAttribute('aria-busy');

    if (equipos.length === 0) {
      contenedor.append(estadoVacio({
        titulo: 'Todavía no hay equipos',
        texto: puedeEditar()
          ? 'Crea el primer equipo y elige hasta 3 integrantes. Después podrás registrar sus prácticas de pista.'
          : 'Cuando el coach arme los equipos, aparecerán aquí con sus integrantes y sus mejores marcas.',
        iconoNombre: 'equipos',
        accion: puedeEditar()
          ? crear('button', {
            clase: 'boton boton--primario',
            type: 'button',
            texto: 'Crear el primer equipo',
            onclick: () => abrirEditor(null),
          })
          : null,
      }));
      return;
    }

    const sinEquipo = estudiantes.filter(
      (e) => e.activo !== false && !mapaPertenencia(equipos).has(Number(e.id)),
    );
    const inscritosWro = equipos.filter((e) => e.wro_estado === 'inscrito' || e.wro_estado === 'participo');

    contenedor.append(
      crear('div', { clase: 'rejilla rejilla--kpi', estilo: 'margin-bottom:var(--e-5)' }, [
        kpi({
          etiqueta: 'Equipos activos',
          valor: String(equipos.filter((e) => e.activo !== false).length),
          detalle: `${equipos.length} en total`,
          iconoNombre: 'equipos',
        }),
        kpi({
          etiqueta: `Estudiantes sin equipo`,
          valor: String(sinEquipo.length),
          detalle: sinEquipo.length ? 'Se pueden asignar' : 'Todos tienen equipo',
          color: sinEquipo.length ? 'var(--ambar)' : 'var(--verde)',
          iconoNombre: 'estudiantes',
        }),
        kpi({
          etiqueta: 'Inscritos en la WRO',
          valor: String(inscritosWro.length),
          detalle: 'Inscritos o participantes',
          color: 'var(--violeta)',
          iconoNombre: 'wro',
        }),
      ]),

      crear('div', { clase: 'rejilla rejilla--equipos' }, equipos.map((equipo) => {
        const resumen = resumenes.get(Number(equipo.id)) ?? null;
        return tarjetaEquipo(equipo, {
          integrantes: integrantesDe(equipo),
          resumen,
          // En modo consulta no se ofrece editar: los datos son de solo lectura.
          alEditar: puedeEditar() ? () => abrirEditor(equipo) : null,
          alVerPracticas: () => navegar('practicas'),
        });
      })),

      crear('p', {
        clase: 'campo__ayuda',
        estilo: 'margin-top:var(--e-4)',
        texto: puedeEditar()
          ? 'Para ver la participación en la WRO Venezuela abre la sección WRO.'
          : 'Estás en modo consulta: los equipos y sus integrantes los administra el coach.',
      }),
    );
  }

  /* ---------------- editor ---------------- */

  function abrirEditor(equipo) {
    // Doble comprobación: aunque los botones no se pinten en modo consulta,
    // si algo llamara a esta función, no debe abrir el editor.
    if (!permitirEdicion()) return;

    const editando = Boolean(equipo);
    const integrantesIniciales = editando
      ? integrantesDe(equipo).map((i) => ({ estudianteId: i.estudianteId, rol: i.rol }))
      : [];

    // Estado local del editor: [{ estudianteId, rol }]
    let seleccionados = integrantesIniciales.map((i) => ({ ...i }));

    const campoNombre = crear('input', {
      type: 'text', id: 'equipo-nombre', required: true, maxlength: '60',
      value: equipo?.nombre ?? '', placeholder: 'Ej.: Los Rayos',
    });

    const campoCategoria = crear('select', { id: 'equipo-categoria' }, []);
    campoCategoria.append(
      crear('option', { value: '', texto: 'Sin definir' }),
      ...CATEGORIAS_WRO.map((categoria) => crear('option', {
        value: categoria,
        texto: categoria,
        selected: equipo?.categoria_wro === categoria ? true : null,
      })),
    );

    const errorGeneral = crear('p', { clase: 'campo__error', role: 'alert' });
    const contenedorRanuras = crear('div', { clase: 'pila pila--sm' });

    function contextoValidacion() {
      return {
        estudiantes,
        equipos,
        equipoId: editando ? equipo.id : null,
        pertenenciaActual: mapaPertenencia(equipos),
      };
    }

    function pintarRanuras() {
      limpiar(contenedorRanuras);

      for (let indice = 0; indice < MAX_INTEGRANTES; indice += 1) {
        const actual = seleccionados[indice] ?? null;

        if (!actual) {
          contenedorRanuras.append(crear('div', { clase: 'campo' }, [
            crear('label', { texto: `Integrante ${indice + 1}` }),
            crear('select', {
              onchange: (evento) => {
                const valor = Number(evento.target.value);
                if (!Number.isFinite(valor) || valor <= 0) return;
                seleccionados[indice] = {
                  estudianteId: valor,
                  rol: seleccionados.some((i) => i.rol === 'capitan') ? 'integrante' : 'capitan',
                };
                pintarRanuras();
              },
            }, [
              crear('option', { value: '', texto: '— Elegir estudiante —' }),
              ...opcionesPara(indice),
            ]),
          ]));
          continue;
        }

        const estudiante = estudiantes.find((e) => Number(e.id) === actual.estudianteId);
        const esCapitan = actual.rol === 'capitan';

        contenedorRanuras.append(crear('div', {
          clase: 'campo',
          estilo: 'padding:var(--e-3);border:1px solid var(--borde);border-radius:var(--radio);background:var(--superficie-2)',
        }, [
          crear('div', { estilo: 'display:flex;align-items:center;justify-content:space-between;gap:var(--e-2);flex-wrap:wrap' }, [
            crear('strong', { texto: estudiante?.nombre ?? `Estudiante ${actual.estudianteId}` }),
            crear('div', { clase: 'acciones' }, [
              crear('label', { clase: 'interruptor' }, [
                crear('input', {
                  type: 'radio',
                  name: 'capitan',
                  checked: esCapitan,
                  onchange: () => {
                    seleccionados = seleccionados.map((integrante, posicion) => ({
                      ...integrante,
                      rol: posicion === indice ? 'capitan' : 'integrante',
                    }));
                    pintarRanuras();
                  },
                }),
                crear('span', { texto: 'Capitán' }),
              ]),
              crear('button', {
                clase: 'boton boton--sm boton--fantasma',
                type: 'button',
                texto: 'Quitar',
                'aria-label': `Quitar a ${estudiante?.nombre ?? ''} del equipo`,
                onclick: () => {
                  seleccionados.splice(indice, 1);
                  // Si se fue el capitán, el primero asume el rol.
                  if (!seleccionados.some((i) => i.rol === 'capitan') && seleccionados.length > 0) {
                    seleccionados[0].rol = 'capitan';
                  }
                  pintarRanuras();
                },
              }),
            ]),
          ]),
          estudiante?.activo === false ? insignia('no_participa', 'Dado de baja') : null,
        ]));
      }

      const lleno = seleccionados.length >= MAX_INTEGRANTES;
      if (lleno) {
        contenedorRanuras.append(crear('p', {
          clase: 'campo__ayuda',
          texto: `El equipo ya tiene los ${MAX_INTEGRANTES} integrantes permitidos. `
            + 'Quita a uno para poder agregar a otro.',
        }));
      }
    }

    /** Opciones del selector, deshabilitando a quienes no se pueden elegir. */
    function opcionesPara(indice) {
      const otros = seleccionados.filter((_, posicion) => posicion !== indice);
      const disponibles = estudiantesDisponibles(estudiantes, otros, contextoValidacion());

      return disponibles.map(({ estudiante, disponible, motivo }) => crear('option', {
        value: String(estudiante.id),
        texto: disponible ? estudiante.nombre : `${estudiante.nombre} — ${motivo}`,
        disabled: !disponible,
      }));
    }

    pintarRanuras();

    const contenido = crear('form', {}, [
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'equipo-nombre', texto: 'Nombre del equipo *' }),
        campoNombre,
      ]),
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'equipo-categoria', texto: 'Categoría WRO' }),
        campoCategoria,
        crear('span', { clase: 'campo__ayuda', texto: 'Opcional. Se puede cambiar cuando se defina.' }),
      ]),
      crear('h3', { texto: 'Integrantes' }),
      contenedorRanuras,
      errorGeneral,
    ]);

    const guardar = async () => {
      errorGeneral.textContent = '';

      const validacion = validarEquipo(
        { nombre: campoNombre.value, categoriaWro: campoCategoria.value },
        seleccionados,
        contextoValidacion(),
      );

      if (!validacion.valido) {
        errorGeneral.textContent = validacion.errores.join(' ');
        return;
      }

      try {
        await api.guardarEquipo(
          { nombre: campoNombre.value, categoriaWro: campoCategoria.value },
          validacion.integrantes,
          {
            equipoId: editando ? equipo.id : null,
            equipos,
            estudiantes,
          },
        );
        avisoOk(editando ? 'Equipo actualizado.' : 'Equipo creado. Ya puedes registrar sus prácticas.');
        instanciaModal.cerrar();
        await cargar();
      } catch (error) {
        errorGeneral.textContent = mensajeDeError(error);
      }
    };

    const instanciaModal = modal({
      titulo: editando ? `Editar ${equipo.nombre}` : 'Nuevo equipo',
      contenido,
      ancho: true,
      pie: [
        editando
          ? crear('button', {
            clase: 'boton boton--peligro',
            type: 'button',
            texto: equipo.activo === false ? 'Reactivar' : 'Archivar',
            onclick: async () => {
              const archivar = equipo.activo !== false;
              if (archivar) {
                const seguro = await confirmar({
                  titulo: `¿Archivar ${equipo.nombre}?`,
                  mensaje: 'El equipo deja de aparecer como activo, pero sus prácticas y su historial se conservan.',
                  textoConfirmar: 'Archivar',
                  peligro: true,
                });
                if (!seguro) return;
              }
              try {
                await api.archivarEquipo(equipo.id, !archivar);
                avisoOk(archivar ? 'Equipo archivado.' : 'Equipo reactivado.');
                instanciaModal.cerrar();
                await cargar();
              } catch (error) {
                avisoError(mensajeDeError(error));
              }
            },
          })
          : null,
        crear('button', {
          clase: 'boton boton--fantasma', type: 'button', texto: 'Cancelar',
          onclick: () => instanciaModal.cerrar(),
        }),
        crear('button', {
          clase: 'boton boton--primario', type: 'button',
          texto: editando ? 'Guardar cambios' : 'Crear equipo',
          onclick: guardar,
        }),
      ].filter(Boolean),
    });

    contenido.addEventListener('submit', (evento) => {
      evento.preventDefault();
      guardar();
    });
  }

  await cargar();

  return {
    destruir() { enPantalla = false; },
  };
}
