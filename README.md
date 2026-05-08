# Web

 [PDF Translator](https://pdftranslator-g6t0.onrender.com/)

# PDF Translator

Aplicación web (**Next.js** + React) que traduce archivos **PDF** en el **navegador**: extrae el texto, lo traduce y genera un PDF con el resultado. Los archivos se procesan en tu equipo; no se suben a un backend propio del proyecto.

## Requisitos

- [Node.js](https://nodejs.org/) **20.x o 22.x** (el repositorio declara `>=20 <25`)
- [pnpm](https://pnpm.io/) **9.15** (el `package.json` del workspace fuerza su uso; no uses npm o Yarn para instalar en la raíz)

## Instalación

Clona el repositorio e instala dependencias en la raíz del monorepo:

```bash
cd pdftranslator1
pnpm install
```

> El proyecto usa un monorepo con `pnpm-workspace`. La app del traductor está en `artifacts/pdf-translator` (Next.js App Router).

## Desarrollo

Desde la **raíz** del repositorio:

```bash
pnpm dev
```

Por defecto Next.js sirve en **http://127.0.0.1:3000**. La variable `PORT` también la respeta Next (por ejemplo `PORT=3001 pnpm dev` en Unix).

## Compilación y producción local

**Compilar** todo el workspace:

```bash
pnpm build
```

**Arrancar** el servidor de producción del traductor (tras `pnpm build`):

```bash
pnpm start
```

Equivale a `next start` en el paquete del traductor (host `0.0.0.0`).

### Subruta (base path)

Si despliegas bajo un prefijo (p. ej. `https://ejemplo.com/app`), define **`BASE_PATH`** **sin** barra final al construir:

```bash
# Windows (PowerShell), ejemplo /app
$env:BASE_PATH="/app"; npx pnpm --filter @workspace/pdf-translator run build
```

```bash
# macOS / Linux
BASE_PATH=/app pnpm --filter @workspace/pdf-translator build
```

Next.js aplicará ese `basePath` en rutas y activos estáticos.

## Vercel

1. Conecta el repositorio en [Vercel](https://vercel.com/).
2. **Root Directory**: `artifacts/pdf-translator`.
3. **Install Command**: deja el valor del archivo `artifacts/pdf-translator/vercel.json` (`cd ../.. && pnpm install --frozen-lockfile`) para instalar el monorepo completo desde la raíz del repo.
4. **Build Command**: `pnpm run build` (ya está en `artifacts/pdf-translator/vercel.json`; evita `next build` suelto, que falla con *command not found* porque `next` no está en el `PATH` global).
5. **Output**: lo infiere Vercel para Next.js (no uses el antiguo `dist` de Vite).

Si en Vercel el directorio raíz del proyecto es la **raíz del monorepo**, configura allí `build` con filtro al paquete y ajusta la detección de framework, o mueve el proyecto Vercel al subdirectorio como arriba.

## Cómo usar la aplicación

1. **Abre** la URL local de desarrollo o la que corresponda en producción.
2. **Idioma de la interfaz**: menú en la barra superior.
3. **Idioma de destino** de la traducción: selector en el panel.
4. **Rango de páginas** (opcional): **vacío = todas**. Ejemplos: `1,3,5-10` (comas y rangos con guion).
5. **Añade PDFs** por arrastre o clic; solo **PDF**.
6. **Cola**: añadir, eliminar o vaciar antes de traducir.
7. **Traducir**: botón principal; verás fases y progreso.
8. **Descargas**: PDF individual o **ZIP** al terminar todos.

La traducción usa un **endpoint público de traducción de Google** desde el navegador. Revisa términos y privacidad; evita documentos muy sensibles si no aceptas enviar texto a terceros.

## Estructura relevante

| Ruta | Descripción |
|------|-------------|
| `artifacts/pdf-translator` | App Next.js (traductor de PDF) |
| `artifacts/api-server` | API de ejemplo (el traductor **no** la necesita para uso básico) |
| `lib/*` | Librerías compartidas del monorepo |

## Scripts en la raíz

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | `next dev` del traductor |
| `pnpm build` | Typecheck del workspace y builds (`next build` incluido) |
| `pnpm start` | `next start` del traductor |
| `pnpm typecheck` | Solo comprobación de tipos |

## Licencia

Ver `package.json` del workspace (indica MIT en la raíz).
