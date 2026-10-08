# Perfiles propios y públicos

## API

Todas las rutas de perfil y playlists por autor responden `Cache-Control: no-store`.
Las escrituras requieren cookie de sesión y `X-Jukeboxd-Request: 1`.

| Método y ruta | Acceso | Resultado |
| --- | --- | --- |
| `GET /users/me` | Sesión | Perfil propio, 200 |
| `GET /users/:id/profile` | Público | Perfil, 200 |
| `GET /users/search?username=...` | Público | Búsqueda exacta después de trim y minúsculas, 200 |
| `PATCH /users/me/profile` | Sesión + cabecera | Perfil actualizado, 200 |
| `POST /users/me/images` | Sesión + cabecera | Imagen disponible para asignación, 201 |
| `GET /media/:key` | Público | Archivo WebP procesado |
| `GET /users/:id/playlists?page=1&pageSize=20` | Público | Playlists creadas por ese usuario, 200 |

`GET /users/me`, gestión de cuenta, listado administrativo, `/playlist/mine` y
`/playlist/saved` siguen privados. `PATCH /users/:id` permite únicamente al dueño
editar los campos de cuenta existentes; un ADMIN ajeno recibe 403. Los permisos
de eliminación de cuentas permanecen iguales.

### Perfil compartido

```json
{
  "message": "Perfil del usuario",
  "data": {
    "id": 2,
    "username": "jeff",
    "fullName": "Jeff",
    "createdAt": "2026-10-02T00:46:55.162Z",
    "avatarUrl": null,
    "coverUrl": null,
    "favoriteReleases": [],
    "favoriteTracks": [],
    "followersCount": 0,
    "followingCount": 0,
    "isFollowing": false,
    "followsMe": false,
    "isOwnProfile": false
  }
}
```

- Release favorito: `{id,name,type,imageUrl,artists:[{id,name}]}`.
- Track favorito: `{id,name,durationMs,artists:[{id,name}],release:{id,name,imageUrl}}`.
- Los arrays están ordenados por posición. Usuarios anteriores tienen arrays vacíos e imágenes null.
- No se serializan email, hash, Spotify ID del usuario, categoría, sesión ni metadatos de almacenamiento.
- Sin sesión válida los tres indicadores personales son false; los contadores siguen siendo públicos.
  Los errores de base de datos se propagan, no se convierten en visitantes anónimos.
- Las reviews continúan disponibles en `GET /reviews?authorId=...`.

### Actualizar perfil

```json
{
  "avatarImageId": 81,
  "coverImageId": null,
  "favoriteReleaseIds": [12, 7, 31],
  "favoriteTrackIds": [45, 90]
}
```

Se permiten exclusivamente esos cuatro campos. Al menos uno debe estar presente.
Omitido conserva su valor; null quita una imagen; [] vacía una lista. Cada lista tiene
0–5 IDs distintos, enteros entre 1 y 2147483647, y reemplaza completamente la anterior.
El orden recibido genera posiciones 1..n. Todos los elementos deben existir localmente.
No se permiten proyectos SINGLE; sí canciones que pertenecen a singles.
Una imagen debe pertenecer al usuario de la sesión y tener la finalidad del campo.

Las validaciones y escrituras de base de datos se hacen en una transacción, tomando
`FOR UPDATE` sobre el usuario. Los reemplazos eliminan asociaciones anteriores antes
de insertar las nuevas, evitando conflictos temporales de posición. Las claves foráneas
eliminan asociaciones al borrar el usuario o elemento, sin borrar el catálogo.
Si queda un hueco de posición, la lectura conserva el orden relativo.

La migración instala el trigger `release_single_favorites`: cualquier cambio de tipo a
SINGLE, incluida una importación Spotify, retira asociaciones dentro de esa misma
transacción. La asignación toma `FOR SHARE` en los releases, ordenados por ID, para
coordinarse con cambios de catálogo y eliminaciones.

### Imágenes

Multipart con exactamente un archivo `file` y un campo `purpose` (`avatar` o `cover`).
La subida no asigna automáticamente la imagen al perfil.

```json
{"message":"Imagen subida","data":{"imageId":81,"url":"/media/uuid.webp","purpose":"avatar"}}
```

- Máximo 5 MiB durante recepción y 20 millones de píxeles al procesar.
- Contenido real JPEG, PNG o WebP estático, decodificado con Sharp. Se rechazan SVG,
  GIF, WebP animado y APNG. El MIME y nombre recibidos no determinan el formato.
- Corrige orientación, elimina metadatos y convierte a WebP.
- Avatar dentro de 512×512; portada dentro de 1920×1080; conserva proporción sin ampliar ni recortar.
- Nombre UUID generado por el servidor; solo claves relativas en PostgreSQL.
- `/media` sirve únicamente nombres UUID WebP, sin listado de directorios ni rutas arbitrarias.
- Las imágenes subidas son públicas mediante su URL, incluso antes de asignarlas.

Reemplazar o quitar una imagen confirma primero el cambio de perfil y luego comprueba
que la anterior no esté referenciada antes de eliminarla. La limpieza vuelve a tomar
el bloqueo del usuario, compartido con asignación y eliminación de cuenta. Si falla
el disco, el cambio confirmado se conserva y el registro queda para reintento.

Al eliminar una cuenta, el propietario de sus imágenes queda null en la base y se
intenta limpiar sus archivos después del commit. Esto permite reintentar una limpieza
fallida. Las restricciones existentes de otros módulos pueden impedir eliminar una
cuenta; en ese caso tampoco se borran sus imágenes.

Tarea manual para imágenes no asignadas con **más de 24 horas** desde la subida:

```powershell
npm run images:prune
```

Se ejecuta contra la base y carpeta configuradas. Revalida edad y referencias dentro
del bloqueo; nunca borra una imagen asignada. No se programa una tarea automática.
Una caída abrupta del proceso entre guardar el archivo y confirmar su registro puede
dejar un archivo sin registro; la tarea trabaja sobre registros de imágenes, no barre
archivos arbitrarios de la carpeta. La limpieza normal contempla errores de procesamiento
y persistencia; una recuperación tras caída requiere revisar esos archivos huérfanos.

### Playlists

Respuesta compatible con `/playlist/mine`:

```json
{
  "message": "Listado de playlists",
  "data": [{"id":10,"name":"Mi selección","author":{"id":2,"username":"jeff","fullName":"Jeff"},"trackCount":12,"saveCount":3,"savedByMe":false,"isOwnPlaylist":false}],
  "pagination": {"page":1,"pageSize":20,"total":1,"totalPages":1}
}
```

Orden ID descendente. `page`: 1..1000000; `pageSize`: 1..100. Solo playlists creadas;
no incluye guardadas de otros autores. Usuario existente sin playlists: array vacío;
inexistente: 404. Visitante anónimo: ambos indicadores false. Con sesión válida se
calculan para el visitante. No se incorpora privacidad configurable.

El CRUD existente de playlists mantiene sus mensajes y estados. Las respuestas que
antes devolvían entidades completas ahora construyen explícitamente `id`, `name`,
`user:{id,username,fullName}` y tracks públicos, sin datos privados de User.

### Errores

Formato existente: `{"success":false,"message":"..."}`.

| Estado | Motivo |
| --- | --- |
| 400 | JSON/cuerpo/IDs/paginación inválidos, favoritos inexistentes o SINGLE, imagen inexistente o finalidad incorrecta, multipart inválido |
| 401 | Escritura o lectura privada sin sesión válida |
| 403 | Falta cabecera de mutación, imagen ajena o edición de cuenta ajena |
| 404 | Perfil/username o archivo público inexistente |
| 413 | Más de 5 MiB o 20 millones de píxeles |
| 415 | Contenido no admitido, corrupto o animado |
| 500 | Fallo inesperado de base de datos/almacenamiento |

## Configuración local

Ejecutar desde `E:\z-jukeboxd\back`. Usar las variables de conexión y sesión existentes
del `.env` (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `SESSION_SECRET`).
No incluir secretos en Git.

Variables nuevas opcionales:

- `UPLOAD_DIR`: ruta de almacenamiento local. Por defecto `<raíz-backend>/uploads`.
  Si se configura una carpeta dentro del repo distinta de uploads, agregarla al ignore local.
- `PUBLIC_BASE_URL`: base confiable del backend, por ejemplo `https://api.example.test`.
  Si se omite, se devuelve `/media/...`. No se usa el encabezado Host para construir URLs.
  El frontend separado debe resolver las URLs relativas contra la base del backend.

```powershell
Set-Location E:\z-jukeboxd\back
npm install
New-Item -ItemType Directory -Force uploads
node --import=tsx ./node_modules/@mikro-orm/cli/cli.js migration:up --config ./src/config/mikro-orm.config.ts
npm run dev
```

La migración nueva es `Migration20261007200000_profiles`. No hace falta regenerar
el snapshot para aplicarla. El snapshot local previo se preservó; no incluirlo
automáticamente en un commit de perfiles sin revisarlo por separado.

Uploads está excluido de Git y se crea automáticamente al subir si falta. Cada
desarrollador tiene sus archivos; PostgreSQL guarda sus referencias, no los archivos.
Un despliegue futuro requiere un volumen persistente o migrar el almacenamiento.

### Recorrido manual (PowerShell)

Con el servidor iniciado, cambiar los datos de ejemplo por una cuenta y archivo locales:

```powershell
$baseUrl = 'http://127.0.0.1:3000'
$login = @{ email = 'cuenta@example.test'; password = 'contraseña-local' } | ConvertTo-Json
Invoke-RestMethod "$baseUrl/auth/login" -Method Post -ContentType 'application/json' -Body $login -SessionVariable jukeboxSession -Headers @{ 'X-Jukeboxd-Request' = '1' }
```

En PowerShell 7, subir y asignar:

```powershell
$image = Invoke-RestMethod "$baseUrl/users/me/images" -Method Post -WebSession $jukeboxSession -Headers @{ 'X-Jukeboxd-Request' = '1' } -Form @{ purpose = 'avatar'; file = Get-Item 'C:\imagenes\avatar.png' }
$body = @{ avatarImageId = $image.data.imageId; favoriteReleaseIds = @(); favoriteTrackIds = @() } | ConvertTo-Json
$profile = Invoke-RestMethod "$baseUrl/users/me/profile" -Method Patch -WebSession $jukeboxSession -Headers @{ 'X-Jukeboxd-Request' = '1' } -ContentType 'application/json' -Body $body
Invoke-RestMethod "$baseUrl/users/$($profile.data.id)/profile"
Invoke-RestMethod "$baseUrl/users/$($profile.data.id)/playlists?page=1&pageSize=20"
```

El puerto debe coincidir con la configuración real del servidor. Para otros favoritos,
reemplazar los arrays vacíos por IDs existentes del catálogo local.

## Verificación automatizada

```powershell
npm run check
npm run check:tests
npm run test:profile
npm run test:comment
npm run test:review
git diff --check
```

Las pruebas de perfiles crean y eliminan una base `jukeboxd_profile_test_<UUID>` y una
carpeta temporal exclusiva. Requieren PostgreSQL disponible y permiso de crear bases.
No migran ni limpian la base o uploads de desarrollo. Verifican rutas reales con
sesiones, privacidad, validaciones, favoritos, rollback, imágenes, playlists, follows,
concurrencia, migración up/down/up y correspondencia de las entidades nuevas.

Resultados de esta entrega se registran en `profile-progress.md`, incluyendo los
fallos previos de Review comprobados también contra el último commit.
