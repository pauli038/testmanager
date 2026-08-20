# Test Manager

Tu propio Test Manager (tipo TestRail/Qase), hecho a la medida y sin costo de licencia.

## Qué incluye

- 📁 **Proyectos** con miembros
- 🧪 **Casos de prueba** organizados en suites, con pasos + resultado esperado, prioridad, tipo y tags
- 📝 **Planes de prueba** para agrupar test runs
- ▶️ **Test Runs**: selecciona qué casos correr y ejecútalos uno por uno
- ✅❌⏭️🚫 Resultados: Passed / Failed / Skipped / Blocked, con comentarios
- 📸 **Evidencias**: sube screenshots a cada resultado de ejecución
- 🐞 **Defectos/Bugs** ligados a un resultado de ejecución fallido
- 📊 **Dashboard** con porcentajes y gráficas (por run y tendencia histórica)
- 🤖 **Integración con Playwright**: tus pruebas automatizadas mandan resultados solas (incluye pass/fail/skip, duración, error y screenshot)
- 👤 Usuarios con rol (admin / lead / tester) y quién ejecutó cada caso
- 📈 Historial de ejecuciones por run y por proyecto

## Stack técnico

- **Next.js 16** (App Router, TypeScript) — un solo proyecto para frontend + backend
- **Drizzle ORM + PostgreSQL** (`postgres-js`) — funciona con cualquier Postgres, incluyendo el plan gratis de [Neon](https://neon.tech) o [Supabase](https://supabase.com)
- **NextAuth v5** (credenciales + JWT) — login con correo/contraseña, sin dependencias externas
- **Tailwind CSS** para la interfaz
- **Recharts** para las gráficas del dashboard

> Las evidencias/screenshots se guardan directo en la base de datos (no en disco), así que la app entera no necesita ningún disco persistente — puede correr en cualquier hosting, incluyendo los serverless como Vercel.

## Correr en local

1. Crea una base de datos Postgres gratis en [Neon](https://neon.tech) (regístrate, "New Project", copia el "Connection string"). Toma 1 minuto y no pide tarjeta.
2. Copia `.env.example` a `.env` y pega esa cadena de conexión en `DATABASE_URL`.
3. Corre:

```bash
npm install
npm run dev
```

Todas las tablas se crean **automáticamente** la primera vez que arranca la app — no hace falta ningún paso manual de migración.

Abre `http://localhost:3000`, regístrate — **el primer usuario registrado es admin automáticamente** — y crea tu primer proyecto.

> Si alguna vez cambias el esquema en `src/db/schema.ts`, corre `npx drizzle-kit generate` para generar el archivo SQL de migración correspondiente en `./drizzle` (ese sí se sube al repo) — las migraciones se siguen aplicando solas al arrancar.

## Variables de entorno

Copia `.env.example` a `.env` y ajusta:

| Variable | Para qué sirve |
|---|---|
| `AUTH_SECRET` | Clave para firmar las sesiones. Genera una con `openssl rand -base64 32` y **cámbiala en producción**. |
| `DATABASE_URL` | Cadena de conexión de tu base de datos Postgres (Neon, Supabase, o cualquier otra). |
| `AUTH_TRUST_HOST` | Ponlo en `true` cuando despliegues en un dominio propio (fuera de `localhost`). No hace falta en Vercel, se detecta solo. |

## Desplegar "en la nube" (accesible desde cualquier lado)

Como la base de datos vive aparte (Postgres) y no hay archivos en disco, la app en sí puede vivir en **cualquier** hosting — incluyendo los gratis.

### Opción recomendada: Vercel (gratis) + Neon (gratis)

1. Crea la base de datos en [Neon](https://neon.tech) (gratis, sin tarjeta) y copia el connection string.
2. Sube este proyecto a un repositorio de GitHub.
3. Ve a [vercel.com](https://vercel.com), entra con GitHub, **"Add New" → "Project"** → selecciona tu repo `testmanager`.
4. En "Environment Variables" agrega:
   - `AUTH_SECRET`: genera una con `openssl rand -base64 32`
   - `DATABASE_URL`: el connection string de Neon
5. Click **"Deploy"**. En ~1 minuto te da una URL pública (`https://testmanager-tuusuario.vercel.app`), gratis, sin tarjeta.

> Nota: en el plan gratis de Vercel, la app "duerme" un poco entre visitas si nadie la usa (arranca en 1-2 segundos al primer request), pero para un equipo de QA chico no se nota.

### Alternativas (si prefieres no usar Vercel)

Todas usan el mismo `Dockerfile` — solo cambia dónde corre:

- **Railway** (~$5/mes): "New Project" → "Deploy from GitHub repo" → agrega la variable `DATABASE_URL` (puedes usar el mismo Neon, o el Postgres que ofrece Railway).
- **Render**: en su plan gratis la app se "duerme" tras 15 min sin tráfico igual que Vercel — funciona bien ya que no depende de disco. En el plan pagado (~$7/mes) no se duerme.
- **Tu propio VPS** (DigitalOcean, Hetzner, etc.):

```bash
git clone <tu-repo>
cd testmanager
docker compose up -d --build   # incluye un Postgres local si no quieres usar Neon
```

  Con un dominio + Nginx/Caddy como proxy inverso (para HTTPS), queda accesible en `https://testmanager.tudominio.com`.

## Integración con Playwright (mandar resultados automáticamente)

1. En el Test Manager: entra a tu proyecto → **Ajustes** → genera una **API Key**.
2. Copia el archivo [`playwright-integration/testmanager-reporter.ts`](./playwright-integration/testmanager-reporter.ts) a tu proyecto de Playwright.
3. En tu `playwright.config.ts`, agrega el reporter (ejemplo completo en [`playwright-integration/playwright.config.example.ts`](./playwright-integration/playwright.config.example.ts)):

```ts
reporter: [
  ["list"],
  ["./tests/testmanager-reporter.ts", {
    url: "https://tu-testmanager.com/api/ingest",
    apiKey: process.env.TESTMANAGER_API_KEY,
    runName: `Regression Run - ${new Date().toLocaleString()}`,
  }],
],
```

4. Corre tus pruebas normalmente (`npx playwright test`). Al terminar, el reporter manda todo automáticamente:

```
Playwright
→ ejecuta LoginTest
→ pasa ✅
→ manda resultado a tu Test Manager
→ tu dashboard muestra:
   Regression Run #15
   🧪 50 tests
   ✅ 44 Passed
   ❌ 4 Failed
   ⏭️ 2 Skipped
```

Si un test de Playwright tiene un título igual al campo "ID/título del test en Playwright" de un caso de prueba ya creado en el Test Manager, el resultado se asocia a ese caso. Si no existe, se crea automáticamente dentro de una suite "Automatizado (Playwright)".

## Estructura del proyecto

```
src/
  app/                 páginas y rutas de API (Next.js App Router)
  components/          componentes de UI (cliente)
  db/schema.ts         esquema completo de la base de datos (Drizzle)
  lib/auth.ts          configuración de NextAuth
playwright-integration/ reporter y config de ejemplo para Playwright
```

## Roles

- **admin**: gestiona todo, incluyendo eliminar proyectos.
- **lead**: gestiona proyectos, casos, runs y defectos.
- **tester**: ejecuta test runs, reporta defectos, sube evidencias.

(El primer usuario registrado es admin. Todos los usuarios registrados actualmente pueden ver todos los proyectos — modelo simple para equipos chicos. Si necesitas restringir por proyecto, es una extensión sencilla sobre la tabla `project_members` que ya existe en el esquema.)
