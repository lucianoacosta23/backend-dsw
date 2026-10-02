# Report de una Review

Entidad «report» del DER: un `User` (reportante) crea el reporte y el reporte «tiene» una
`Review`. Módulo en `src/modules/reports`; tabla `review_report`.

## API

| Método y ruta | Acceso | Resultado |
| --- | --- | --- |
| `POST /reviews/:reviewId/reports` | Sesión + `X-Jukeboxd-Request: 1` + `application/json` | Crea el reporte, `201` |

Cuerpo:

```json
{ "reason": "SPAM", "details": "Publicidad repetida" }
```

Solo se permiten `reason` y `details`. El reportante sale de la sesión; la reseña, de la ruta.

| Campo | Regla |
| --- | --- |
| `reason` | Obligatorio. Uno de `SPAM`, `HARASSMENT`, `HATE_SPEECH`, `INAPPROPRIATE_CONTENT`, `SPOILER`, `OTHER` |
| `details` | Opcional, salvo con `OTHER` (obligatorio). `trim()`, de 1 a 500 caracteres Unicode, sin NUL. No se acepta `null` |

Respuesta:

```json
{ "message": "Reporte registrado", "data": { "id": 7, "reviewId": 10, "reason": "SPAM", "details": "Publicidad repetida", "createdAt": "2026-09-29T20:00:00.000Z" } }
```

No se devuelve quién reportó.

Errores (`{ success: false, message }`):

| Código | Caso |
| --- | --- |
| 400 | ID, JSON o campos inválidos; el autor intenta reportar su propia reseña |
| 401 | Sin sesión o sesión inválida |
| 403 | Falta la cabecera `X-Jukeboxd-Request` |
| 404 | Reseña inexistente o borrada |
| 409 | El usuario ya había reportado esa reseña |

## Reglas

- Un usuario reporta una reseña una sola vez: `UNIQUE (review_id, reporter_id)`. Ante
  solicitudes simultáneas gana una (`201`) y las demás reciben `409`. Distintos usuarios
  sí pueden reportar la misma reseña.
- No se puede reportar la propia reseña; un ADMIN sigue las mismas reglas.
- Solo se reportan reseñas visibles. Un reporte ya creado se conserva aunque la reseña se
  borre después, para que la moderación no pierda información.
- `POST` toma `FOR SHARE` sobre la reseña dentro de una transacción, igual que Like.

## Esquema y migración

`Migration20260929120100_add_review_report` crea únicamente `review_report`: `id`,
`reporter_id`, `review_id`, `reason`, `details`, `created_at`, con CHECK del motivo
(`reason` es un `@Enum` de MikroORM sobre `text`), CHECK de longitud de `details`, la UNIQUE
`(review_id, reporter_id)` y dos claves foráneas con `ON DELETE CASCADE`.

## Pendiente

- Definir la moderación: estado del reporte (pendiente/resuelto/descartado), quién lo
  resolvió, listado para ADMIN y qué pasa con la reseña. Agregarlo requerirá una migración nueva.
- Definir si los motivos de la lista son los definitivos.

## Pruebas

```powershell
npm run test:report
```

Base PostgreSQL nueva por ejecución con migraciones, rutas y sesiones reales; incluye
validación del cuerpo, concurrencia, restricciones de la base y comparación entidad/migración
con `down`/`up`.
