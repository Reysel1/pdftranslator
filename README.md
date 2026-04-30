# Web

 [PDF Translator] (https://pdftranslator-g6t0.onrender.com/)

# PDF Translator

Aplicación web (React + Vite) que traduce archivos **PDF** en el **navegador**: extrae el texto, lo traduce y genera un PDF con el resultado. Los archivos se procesan en tu equipo; no se suben a un backend propio del proyecto.

## Requisitos

- [Node.js](https://nodejs.org/) **20.x o 22.x** (el repositorio declara `>=20 <25`)
- [pnpm](https://pnpm.io/) **9.15** (el `package.json` del workspace fuerza su uso; no uses npm o Yarn para instalar en la raíz)

## Instalación

Clona el repositorio e instala dependencias en la raíz del monorepo:

```bash
cd pdftranslator1
pnpm install
```

> El proyecto usa un monorepo con `pnpm-workspace`. La app que verás al desarrollar es el paquete `artifacts/pdf-translator`.

## Desarrollo

Desde la **raíz** del repositorio:

```bash
pnpm dev
```

Por defecto la interfaz queda en **http://127.0.0.1:5173** (Vite). Para cambiar el puerto:

```powershell
# Windows (PowerShell)
$env:PORT=3000; pnpm dev
```

```bash
# macOS / Linux
PORT=3000 pnpm dev
```

## Compilación y vista previa de producción

**Compilar** todo el workspace (comprobación de tipos y builds donde existan scripts):

```bash
pnpm build
```

**Servir** la build estática del traductor (después de `pnpm build`):

```bash
pnpm start
```

Esto usa `serve` apuntando a `artifacts/pdf-translator/dist/public`.

### Despliegue bajo un subruta (base path)

Si publicas la app bajo un prefijo (p. ej. `https://ejemplo.com/app/`), define `BASE_PATH` al construir, con barra final:

```bash
# Ejemplo: la app vive en /app/
set BASE_PATH=/app/   & pnpm build
```

(En Unix: `BASE_PATH=/app/ pnpm build`.)

Vite inyecta `import.meta.env.BASE_URL` según `BASE_PATH` (por defecto `/`).

## Cómo usar la aplicación

1. **Abre** la URL local de desarrollo o la que corresponda en producción.
2. **Idioma de la interfaz**: usa el menú de idioma en la barra superior si está disponible.
3. **Idioma de destino** de la traducción: elige en el panel el idioma al que quieres traducir el PDF.
4. **Rango de páginas** (opcional): **vacío = todas** las páginas. Si rellenas el campo, usa números y comas, por ejemplo `1,3,5-10` (rangos con guion, páginas sueltas separadas por comas; solo se tienen en cuenta páginas válidas del PDF).
5. **Añade PDFs**: arrastra archivos al área indicada o haz clic para elegir. Solo se aceptan **PDF**; otros formatos se ignoran.
6. **Cola**: verás la lista de archivos con su tamaño. Puedes añadir más, quitar entradas o vaciar la cola antes de traducir.
7. **Traducir**: pulsa el botón de traducir para procesar la cola. Verás fases (lectura, traducción, generación) y una barra de progreso por archivo.
8. **Descargas**:
   - Cada PDF terminado ofrece un botón para **descargar** ese PDF traducido.
   - Al terminar todos, puedes **descargar un ZIP** con los resultados o **empezar de nuevo** limpiando la cola.

La traducción se realiza en el cliente llamando a un **endpoint público de traducción de Google** (mismo enfoque que muchas demos “gtx” en el navegador). Úsalo con responsabilidad: revisa términos y privacidad de Google, y evita documentos **confidenciales** si no aceptas enviar su texto a terceros.

## Estructura relevante

| Ruta | Descripción |
|------|-------------|
| `artifacts/pdf-translator` | App web Vite + React (traductor de PDF) |
| `artifacts/api-server` | Servidor API de ejemplo (el flujo del traductor en navegador **no** depende de este paquete para uso básico) |
| `lib/*` | Librerías compartidas del monorepo |

## Scripts en la raíz

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Desarrollo del traductor (Vite) |
| `pnpm build` | Typecheck y builds del workspace |
| `pnpm start` | Sirve el `dist` del traductor |
| `pnpm typecheck` | Solo comprobación de tipos |

## Licencia

Ver `package.json` del workspace (indica MIT en la raíz).
