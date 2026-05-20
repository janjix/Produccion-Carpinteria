# MS Producción

App de seguimiento de producción para taller de carpintería. Tracking en tiempo real, multiusuario, con checklist por área, planificación cruzada entre proyectos e historial de actividad.

## Stack

- **Frontend:** React 18 + Vite
- **Backend/DB:** Supabase (PostgreSQL + Realtime + Storage)
- **Deploy:** Vercel, Netlify, o cualquier hosting de SPAs

## Setup

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. Ve a **SQL Editor** y ejecuta el contenido de `supabase/migrations/001_initial_schema.sql`
3. Ve a **Settings → API** y copia:
   - Project URL (ej: `https://abc123.supabase.co`)
   - `anon` public key

### 2. Variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales de Supabase.

### 3. Instalar y correr

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

### 4. Habilitar Realtime

En el dashboard de Supabase, ve a **Database → Replication** y activa realtime para las tablas: `projects`, `areas`, `furniture`, `activity_log`, `planning_tasks`.

## Estructura del proyecto

```
src/
  App.jsx              # Shell principal y navegación
  main.jsx             # Entry point
  index.css            # Tema oscuro (variables CSS)
  lib/
    supabase.js        # Cliente Supabase
    constants.js       # Etapas, mecanizados, estados
  hooks/
    useSupabase.js     # Hooks realtime + CRUD
  components/
    UI.jsx             # Componentes compartidos
    ProjectsList.jsx   # Lista de proyectos
    ProjectDetail.jsx  # Detalle: checklist por área, muebles, fotos
    Dashboard.jsx      # Vista macro de progreso
    Planning.jsx       # Planificación cruzada entre proyectos
    ActivityLog.jsx    # Historial con fecha y hora
supabase/
  migrations/
    001_initial_schema.sql  # Schema completo para Supabase
```

## Flujo de producción

Modelado 3D → Planos → Corte → Canteado → Mecanizado → Control Calidad → Acabados → Herrajes → Ensamblaje → Embalaje → Instalación

El mecanizado se desglosa en sub-tipos configurables por área: Bisagras, Tarugos, Cinta LED, Excéntricas, Ranuras de gavetas, Ranurado, Perforaciones especiales, CNC custom.

## Funcionalidades

- **Checklist por área** (no por mueble). Cada etapa tiene espacio para comentarios cuando falta un mueble por algún proceso.
- **Mecanizados configurables** por área. Al crear o editar un área, se seleccionan los mecanizados que aplican.
- **Lista de muebles con fotos.** Se pueden agregar muebles manualmente o subir una imagen (se almacena en Supabase Storage).
- **Planificación cruzada.** Tareas con dependencias entre proyectos, fechas, responsables y estados (pendiente, en proceso, bloqueado, listo).
- **Historial de actividad.** Toda acción queda registrada con fecha, hora y nombre de quien la hizo.
- **Tiempo real.** Cambios de cualquier usuario se reflejan al instante en todos los dispositivos.

## Deploy

```bash
npm run build
```

La carpeta `dist/` se sube a Vercel, Netlify, o cualquier hosting estático. Configura las variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el dashboard de tu hosting.

## Notas

- Las políticas de RLS están abiertas (cualquiera puede leer/escribir). Cuando agregues autenticación, reemplaza las policies en el migration.
- El nombre de usuario se almacena en localStorage del navegador. No hay sistema de login; es un placeholder para identificar quién hace qué.
