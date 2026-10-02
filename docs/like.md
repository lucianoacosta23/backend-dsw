# Like a una Review

Relación N:M entre `User` y `Review` (el rombo «like» del DER). Módulo en `src/modules/likes`.
La tabla se llama `review_like` porque `like` es una palabra reservada de SQL.

## API

| Método y ruta | Acceso | Resultado |
| --- | --- | --- |
| `PUT /reviews/:reviewId/like` | Sesión + `X-Jukeboxd-Request: 1` | Da like con el usuario de la sesión, `201` |
| `DELETE /reviews/:reviewId/like` | Sesión + `X-Jukeboxd-Request: 1` | Quita el like propio, `200` |

No llevan cuerpo: el usuario sale siempre de la sesión. El ID de la ruta se valida igual que
en Review (entero positivo hasta 2147483647, sin ceros iniciales).

Respuesta de `PUT`:

```json
{ "message": "Like registrado", "data": { "reviewId": 10, "liked": true, "likeCount": 3, "createdAt": "2026-09-29T20:00:00.000Z" } }
```

Respuesta de `DELETE`: `{ "message": "Like eliminado", "data": { "reviewId": 10, "liked": false, "likeCount": 2 } }`.
`likeCount` es el total de la reseña después de la operación, para que el frontend actualice
el contador sin otra consulta. No se expone quién dio like.

Errores (`{ success: false, message }`):

| Código | Caso |
| --- | --- |
| 400 | ID inválido; el autor intenta dar like a su propia reseña |
| 401 | Sin sesión o sesión inválida |
| 403 | Falta la cabecera `X-Jukeboxd-Request` |
| 404 | Reseña inexistente o borrada; `DELETE` sin like previo |
| 409 | `PUT` cuando el usuario ya había dado like (mismo criterio que Follow) |

## Reglas

- Un usuario da como máximo un like por reseña: `UNIQUE (review_id, user_id)`. Ante
  solicitudes simultáneas gana una (`201`) y las demás reciben `409`.
- No se puede dar like a la propia reseña (regla de la API, no del esquema).
- Solo se puede dar/quitar like sobre reseñas visibles (`deletedAt IS NULL`). Al borrar una
  reseña sus likes quedan en la base pero inaccesibles, igual que los comentarios.
- `PUT` toma `FOR SHARE` sobre la reseña dentro de una transacción: varios likes no se
  bloquean entre sí, pero esperan a un borrado en curso (`ReviewRepository.delete` usa `FOR UPDATE`).

## Esquema y migración

`Migration20260929120000_add_review_like` crea únicamente `review_like`:
`id`, `user_id`, `review_id`, `created_at`, la UNIQUE `(review_id, user_id)` y dos claves
foráneas con `ON DELETE CASCADE`. La UNIQUE empieza por `review_id`, así que también cubre
el conteo de likes por reseña sin otro índice.

## Pendiente

- Exponer `likeCount` en las respuestas de Review y agregar `sort=likes` (ver «Orden
  provisional» en `docs/review.md`). No se modificó el módulo Review.
- Listado de reseñas que le gustan a un usuario (haría falta un índice por `user_id`).

## Pruebas

```powershell
npm run test:like
```

Base PostgreSQL nueva por ejecución con migraciones, rutas y sesiones reales; incluye
concurrencia, borrado concurrente de la reseña, restricciones de la base y comparación
entidad/migración con `down`/`up`.
