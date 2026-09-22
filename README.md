Jukeboxd — Backend

Backend del TP de Desarrollo de Software 2026. API desarrollada con Node.js, TypeScript, Express, MikroORM y PostgreSQL.

Documentación de Review: [API, reglas, migración, pruebas e integraciones pendientes](docs/review.md).

Esta guía está pensada para trabajar en Windows con PowerShell. Ejecutar los comandos desde la carpeta `backend-dsw`, salvo la clonación inicial.

## 1. Qué instalar en cada PC

| Herramienta | Para qué sirve | Instalación |
| --- | --- | --- |
| Node.js 22.x con npm | Ejecutar el backend e instalar sus dependencias. Usar un parche actualizado de la rama 22 para mantener la misma versión principal del entorno utilizado. | [Descarga oficial](https://nodejs.org/en/download) |
| Git | Clonar el repositorio y compartir cambios. | [Git para Windows](https://git-scm.com/downloads/win) |
| PostgreSQL | Ejecutar la base de datos local. Acordar con el equipo la misma versión principal. | [Instalador oficial para Windows](https://www.postgresql.org/download/windows/) |
| pgAdmin | Crear y consultar la base mediante una interfaz gráfica. Está incluido en el instalador de PostgreSQL enlazado. | Seleccionarlo durante la instalación. |
| Editor de código | Editar los archivos del proyecto. | Pueden utilizar su editor habitual. |

Durante la instalación de PostgreSQL, anotar el usuario, la contraseña y el puerto elegidos. El puerto habitual es `5432`. El servicio de PostgreSQL debe estar iniciado.

Después de instalar, abrir una nueva terminal y comprobar:

```powershell
node --version
npm --version
git --version
```

No instalar Express, TypeScript, MikroORM, Argon2 ni otras bibliotecas manualmente o de forma global. Se instalan juntas mediante `npm ci` en los pasos siguientes.

## 2. Instrucciones para empezar desde cero

### 2.1. Clonar el repositorio

Desde la carpeta donde quieran guardar el proyecto:

```powershell
git clone https://github.com/lucianoacosta23/backend-dsw.git
cd backend-dsw
```

Si el repositorio es privado, necesitan acceso como colaboradores y autenticarse en GitHub. Si ya lo tienen clonado, no repetir este paso: seguir la sección de actualización.

### 2.2. Instalar las dependencias del proyecto

```powershell
npm ci
```

Este comando instala las versiones registradas en `package-lock.json`. Incluye las dependencias de desarrollo, necesarias para TypeScript y las migraciones. No usar `--omit=dev` para este entorno.

Conservar `package-lock.json`; no borrarlo para resolver errores de instalación.

### 2.3. Crear la base de datos local

En pgAdmin:

1. Conectarse al servidor PostgreSQL local con sus credenciales.
2. Hacer clic derecho sobre **Databases → Create → Database**.
3. Usar el nombre **Nukeboxd**, con la `N` mayúscula.
4. Elegir como **Owner** el usuario que utilizarán en `DB_USER`.
5. Guardar.

La aplicación se llama Jukeboxd, pero el nombre de base utilizado por el equipo actualmente es `Nukeboxd`. El valor de `DB_NAME` debe coincidir exactamente con la base creada.

Crear solo la base vacía. Las tablas y restricciones se crean con las migraciones; no crearlas manualmente.

### 2.4. Crear el archivo `.env`

En la raíz del proyecto, al lado de `package.json`, crear un archivo llamado exactamente `.env`, no `.env.txt`:

```dotenv
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=Nukeboxd
DB_USER=TU_USUARIO_POSTGRES
DB_PASSWORD="TU_CONTRASENA_POSTGRES"

SESSION_SECRET=REEMPLAZAR_POR_UN_VALOR_ALEATORIO

SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/auth/spotify/callback
```

Personalizar los valores:

- `DB_USER` y `DB_PASSWORD`: las credenciales de PostgreSQL de esa PC. No son las credenciales de GitHub ni las de un usuario de Jukeboxd.
- `DB_HOST` y `DB_PORT`: cambiarlos si la instalación local usa otros valores.
- `SESSION_SECRET`: cada integrante debe generar su propio valor.
- Credenciales de Spotify: solicitarlas al responsable de la aplicación del equipo por un canal privado. No hace falta crear una aplicación de Spotify por integrante para utilizar el importador compartido.

Para generar `SESSION_SECRET`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copiar el resultado en `.env`. Generarlo una sola vez y conservarlo: cambiarlo invalida las cookies existentes. En desarrollo cada PC puede tener una clave diferente.

El `.env` está excluido de Git. No subirlo, adjuntarlo a issues ni compartir capturas con secretos. Si el equipo entrega un `.env` como referencia, reemplazar las credenciales locales y `SESSION_SECRET`.

Las credenciales de Spotify son necesarias para sus scripts de consulta e importación. El registro y login local no las requieren. El callback indicado queda reservado para el login con Spotify, que todavía está pendiente.

### 2.5. Comprobar la conexión

```powershell
node --import=tsx ./node_modules/@mikro-orm/cli/cli.js debug --config ./src/config/mikro-orm.config.ts
```

Comprobar que la configuración se encuentre y que aparezca `database connection successful`.

Puede aparecer `ts-node not installed`. Si el comando ejecutado con `--import=tsx` encuentra la configuración y conecta correctamente, ese aviso no impide continuar.

### 2.6. Aplicar las migraciones existentes

```powershell
node --import=tsx ./node_modules/@mikro-orm/cli/cli.js migration:up --config ./src/config/mikro-orm.config.ts
```

Este comando aplica las migraciones pendientes y crea la estructura, incluida la tabla de sesiones.

Para consultar las migraciones ejecutadas:

```powershell
node --import=tsx ./node_modules/@mikro-orm/cli/cli.js migration:list --config ./src/config/mikro-orm.config.ts
```

**No ejecutar `migration:create` para instalar el proyecto.** Las migraciones ya están en el repositorio y deben compartirse entre todos.

Cada PC tendrá su propia base: las migraciones no copian los usuarios, artistas ni álbumes de la PC de otro integrante.

### 2.7. Verificar TypeScript e iniciar el backend

```powershell
npm run check
npm run dev
```

Continuar cuando `check` termine sin errores. `npm run dev` deja el servidor encendido y reinicia el proceso al guardar cambios.

Esperar los mensajes de conexión a PostgreSQL y servidor funcionando en el puerto 3000. Dejar esta terminal abierta.

### 2.8. Comprobar que responde

En una segunda terminal:

```powershell
curl.exe -i http://127.0.0.1:3000/health
```

Respuesta esperada: `200 OK`.

Para las pruebas de autenticación usar siempre `127.0.0.1`: no alternarlo con `localhost`, porque las cookies corresponden a hosts diferentes.

## 3. Crear una cuenta local y probar la sesión

No existen cuentas de prueba ni administradores creados automáticamente. Cada integrante debe registrar su usuario en su base local.

### Registro

Ejemplo con una contraseña exclusiva de prueba:

```powershell
$registro = @{
    username = 'usuario_prueba'
    fullName = 'Usuario de prueba'
    email = 'prueba@example.com'
    password = 'Mi clave de prueba 2026!'
} | ConvertTo-Json

$parametrosRegistro = @{
    Uri = 'http://127.0.0.1:3000/auth/register'
    Method = 'Post'
    ContentType = 'application/json'
    Body = $registro
    ErrorAction = 'Stop'
}

Invoke-RestMethod @parametrosRegistro
```

El registro crea un usuario `USER`, normaliza el email a minúsculas y elimina los espacios de sus extremos. La contraseña admite de 8 a 128 caracteres y se guarda como hash Argon2id. La respuesta no incluye el hash. Repetir el mismo email devuelve `409`.

### Login

```powershell
$login = @{
    email = 'prueba@example.com'
    password = 'Mi clave de prueba 2026!'
} | ConvertTo-Json

$parametrosLogin = @{
    Uri = 'http://127.0.0.1:3000/auth/login'
    Method = 'Post'
    ContentType = 'application/json'
    Body = $login
    SessionVariable = 'sesionJukeboxd'
    ErrorAction = 'Stop'
}

Invoke-RestMethod @parametrosLogin
```

La variable `sesionJukeboxd` conserva la cookie en esta terminal.

### Consultar el usuario conectado

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/auth/me' -WebSession $sesionJukeboxd
```

Debe devolver el usuario. Sin cookie o sin sesión válida devuelve `401`.

Para comprobar la persistencia, reiniciar solo el backend y repetir esta consulta sin cerrar la terminal de peticiones ni volver a iniciar sesión. Debe seguir devolviendo el usuario.

### Logout

```powershell
$parametrosLogout = @{
    Uri = 'http://127.0.0.1:3000/auth/logout'
    Method = 'Post'
    ContentType = 'application/json'
    Body = '{}'
    WebSession = $sesionJukeboxd
}

Invoke-RestMethod @parametrosLogout
```

Devuelve `204` sin cuerpo. Consultar `/auth/me` nuevamente con la misma variable debe devolver `401`. PowerShell muestra las respuestas HTTP de error como excepciones; en esta prueba es lo esperado.

## 4. Actualizarse con los cambios del equipo

Antes de trabajar, revisar si tienen cambios locales:

```powershell
git status
```

Guardar los cambios propios en la rama correspondiente antes de actualizar. No descartar archivos para resolver un conflicto sin revisarlo.

En una rama lista para actualizar, detener el backend y ejecutar:

```powershell
git pull --ff-only
npm ci
node --import=tsx ./node_modules/@mikro-orm/cli/cli.js migration:up --config ./src/config/mikro-orm.config.ts
npm run check
npm run dev
```

Si `git pull --ff-only` falla por ramas divergentes, coordinar cómo integrar los cambios. No usar `reset --hard` ni forzar el push como solución automática.

Revisar también si el cambio requiere nuevas variables de entorno: Git no actualiza el `.env` local.

## 5. Trabajar en una funcionalidad

Crear una rama desde la base acordada por el equipo. Por ejemplo, después de actualizar `main`:

```powershell
git switch -c feature/nombre-de-la-funcionalidad
```

Antes de compartir el trabajo:

1. Ejecutar `npm run check`.
2. Probar los endpoints modificados, incluidos los errores esperados.
3. Revisar `git status` y `git diff`.
4. Incluir las migraciones y el snapshot si cambió el esquema.
5. Incluir `package.json` y `package-lock.json` si cambiaron las dependencias.
6. Hacer commit, subir la rama y abrir el pull request según el flujo acordado.

No subir `.env`, `node_modules` ni `dist`.

### Cuando cambian las entidades

Solo si una funcionalidad modifica tablas, columnas, índices o relaciones:

```powershell
node --import=tsx ./node_modules/@mikro-orm/cli/cli.js migration:create --config ./src/config/mikro-orm.config.ts
```

Revisar el SQL generado y después aplicar la migración con `migration:up`.

El snapshot de `src/migrations` representa el esquema utilizado para calcular diferencias; no es una copia de los datos. Se versiona junto con la migración.

Coordinar los cambios de entidades entre integrantes para evitar migraciones superpuestas y conflictos en el snapshot. No editar una migración que otros ya aplicaron: crear una nueva para corregir el esquema. Tampoco resolver un conflicto del snapshot eligiendo una versión sin revisar las migraciones involucradas.

## 6. Importación opcional desde Spotify

Requiere las credenciales compartidas de la aplicación en `.env`, conexión a Internet y las migraciones aplicadas. Estos scripts pueden ejecutarse sin mantener el servidor Express encendido.

Consultar un álbum sin importarlo:

```powershell
npx tsx src/scripts/spotify-check.ts 2xkZV2Hl1Omi8rk2D7t5lN
```

Importarlo en la base local:

```powershell
npx tsx src/scripts/spotify-import.ts 2xkZV2Hl1Omi8rk2D7t5lN
```

El argumento es el ID del álbum, no la URL completa. Este ejemplo corresponde a The New Abnormal.

El importador guarda el lanzamiento, sus pistas y artistas. Reutiliza los registros identificados por `spotifyId` para evitar duplicarlos al repetir la importación. No descarga audio ni importa automáticamente todo el catálogo.

Usar el `releaseId` que devuelve el script para consultar el lanzamiento: los IDs locales pueden variar entre las bases de cada integrante.

## 7. Estado actual y permisos

Implementado:

- CRUD de usuarios, artistas, géneros, lanzamientos y pistas.
- Relaciones del catálogo y protección del borrado de registros asociados.
- Importador de álbumes de Spotify mediante scripts.
- Registro y login local con email y contraseña.
- Sesiones persistentes en PostgreSQL, consulta de sesión y logout.
- Protección de `/users`: listado para `ADMIN`; consulta, modificación y eliminación por propietario o `ADMIN`.

El registro público se realiza en `/auth/register`; el alta directa por `POST /users` fue retirada. Las modificaciones y eliminaciones en `/users/:id` requieren sesión y la cabecera `X-Jukeboxd-Request: 1`. El PATCH no permite cambiar el rol.

Pendiente:

- Login y callback de Spotify, incluida la vinculación de cuentas.
- Restringir las escrituras del catálogo a `ADMIN`.
- Permisos sobre reseñas, comentarios, playlists y otros módulos a medida que se implementen.
- Límite de intentos de autenticación y verificación de email.
- Completar pruebas de administración y eliminación.

La aplicación sigue en desarrollo; la autenticación implementada no implica que todos los endpoints estén protegidos.

## 8. Problemas frecuentes

| Problema | Qué revisar |
| --- | --- |
| `No es posible conectar con el servidor remoto` | Iniciar `npm run dev`, esperar el mensaje de arranque y revisar errores en esa terminal. |
| La base `nukeboxd` no existe | Comprobar que `DB_NAME` coincida exactamente con `Nukeboxd` u otro nombre elegido. |
| Error de autenticación de PostgreSQL | Revisar `DB_USER`, `DB_PASSWORD`, puerto y servicio local. |
| Falta una tabla o columna | Aplicar las migraciones existentes con `migration:up`. |
| Falta `SESSION_SECRET` | Generarlo, agregarlo al `.env` y reiniciar el backend. |
| `/auth/me` devuelve `401` | Iniciar sesión y enviar `-WebSession $sesionJukeboxd` desde la misma terminal. |
| `/users` devuelve `403` con sesión | Es lo esperado para un usuario `USER`: el listado requiere `ADMIN`. |
| Aviso sobre `ts-node` | Utilizar el comando de esta guía con `node --import=tsx`; revisar el resultado final del comando. |
| PowerShell no permite ejecutar `npm.ps1` | Probar `npm.cmd` en lugar de `npm`, sin modificar políticas del sistema. |
| Aparecen vulnerabilidades de dependencias | Consultar `npm audit` y coordinar la corrección. No aplicar `--force` sin revisar los cambios. |

Copiar únicamente el contenido de los bloques de comandos, sin los marcadores Markdown ni el prompt `PS ...>`.
