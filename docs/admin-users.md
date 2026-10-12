# Gestión administrativa de usuarios

Implementación backend del contrato del frontend, con la política de eliminación
confirmada el 12/10/2026. Esta política reemplaza las secciones de conservación y
restauración del TXT original.

## Estados y acciones

- `ENABLED`: activo. Es el valor predeterminado para registros locales, Spotify y
  usuarios existentes al aplicar la migración.
- `SUSPENDED`: bloqueado hasta `suspendedUntil` (ISO 8601 UTC).
- `BANNED`: bloqueado indefinidamente; `suspendedUntil` es null.

Suspensiones, baneos y reactivaciones usan la tabla `user_sanction`, con una sola
secuencia de IDs, motivo, administrador, fecha de creación y fecha de vencimiento.
La duración de una suspensión es la diferencia entre ambas fechas.

## Rutas

Todas requieren sesión de administrador. POST también exige JSON y
`X-Jukeboxd-Request: 1`.

- `GET /admin/users?q=&page=1&pageSize=10&sort=priority`
- `GET /admin/users/:id`
- `GET /admin/users/:id/sanctions?page=1&pageSize=10`
- `GET /admin/users/:id/review-reports?page=1&pageSize=10`
- `POST /admin/users/:id/sanctions`

```json
{ "action": "SUSPEND", "reason": "Acoso reiterado", "suspendedUntil": "2027-01-20T18:00:00.000Z" }
```

```json
{ "action": "BAN", "reason": "Reincidencia" }
```

```json
{ "action": "REACTIVATE", "reason": "Revisión administrativa" }
```

Las respuestas de listas incluyen `message`, `data` y `pagination`. POST devuelve
201 con `message` y `data: AdminUserDetail`. El actor sale de la sesión. No se
exponen credenciales ni correo en las respuestas administrativas.

## Eliminación y evidencia

Suspender o banear elimina físicamente todas las reseñas de esa cuenta, incluyendo
las dadas de baja, sus comentarios asociados, likes, versiones y reportes recibidos.
También elimina los reportes que la cuenta realizó contra otras reseñas.
Suspender conserva sus playlists. Banear elimina sus playlists y, por cascada,
sus relaciones con canciones y los guardados de esas playlists por otros usuarios;
las canciones del catálogo no se eliminan. La cuenta se conserva.

Antes de borrar se guarda una copia administrativa de las reseñas y reportes
recibidos en `user_sanction.removed_reviews`. Se consulta desde `review-reports`.
No restaura contenido y no cuenta en prioridad: los grupos archivados tienen
`reportCount: 0` y `deletedAt` no nulo. Sus reportes conservan el estado que tenían
al archivarse. El endpoint individual de reportes sigue funcionando para reseñas
existentes; para una reseña físicamente eliminada devuelve 404 y la evidencia se
consulta desde el historial del usuario.

Los reportes realizados por el sancionado se eliminan: nunca vuelven a contar al
reactivar. Reactivación y vencimiento solo recuperan acceso y perfil.

## Sesiones y restricciones

Se valida el estado en login local, Spotify, `/auth/me`, `requireAuth` y
`optionalAuth`. Las restricciones devuelven 403 con `code: ACCOUNT_SUSPENDED` o
`ACCOUNT_BANNED`; la suspensión incluye `suspendedUntil`.

Cada cambio de estado incrementa `sessionVersion`: las sesiones anteriores tampoco
vuelven a servir al terminar una suspensión. Es necesario iniciar sesión nuevamente.
Las suspensiones vencidas se interpretan como ENABLED sin tareas programadas y sin
inventar una acción administrativa automática.

El perfil público restringido devuelve únicamente `id`, `username`, `status`,
`restricted: true` y `message`. El frontend debe renderizar la pantalla genérica.

No se permite cambiar el propio estado ni sancionar otras cuentas ADMIN. Suspender
requiere estado efectivo ENABLED; banear admite ENABLED o SUSPENDED; reactivar
requiere SUSPENDED o BANNED. Repeticiones/conflictos devuelven 409. Cuenta, borrado
y evidencia se guardan en una sola transacción.

## Validación

`npm run check:tests` y `npm run test:sanctions`. Las pruebas de integración crean
una base temporal nueva y la eliminan al finalizar; no sancionan usuarios reales.

La migración requerida es `Migration20261012000000_user_sanctions`.
