# Review

Implementación en la rama `review`, siguiendo las rutas, sesiones, `RequestContext`,
repositorios y respuestas existentes. El módulo se encuentra en `src/modules/reviews`.

## API

| Método y ruta | Acceso | Resultado |
| --- | --- | --- |
| `GET /reviews?releaseId=1&page=1&pageSize=20` | Público | Reseñas visibles de un lanzamiento |
| `GET /reviews?authorId=1&page=1&pageSize=20` | Público | Reseñas visibles de un autor |
| `GET /reviews/:id` | Público | Una reseña visible |
| `POST /reviews` | Sesión + `X-Jukeboxd-Request: 1` | Crea reseña, `201` |
| `PATCH /reviews/:id` | Solo el autor + sesión y cabecera | Edita texto antes de 24 horas, `200` |
| `DELETE /reviews/:id` | Autor o ADMIN + sesión y cabecera | Borrado lógico sin límite de tiempo, `204` |

Los IDs del cuerpo son números enteros positivos de PostgreSQL (hasta 2147483647).
En rutas y query se aceptan únicamente dígitos, sin ceros iniciales. Se pueden combinar
`releaseId` y `authorId` para consultar su intersección; al menos uno es obligatorio.
Un filtro válido sin coincidencias devuelve una lista vacía. Los campos de query
desconocidos o repetidos se rechazan.

`page` comienza en 1; `pageSize` tiene valor predeterminado 20 y máximo 100. El listado
devuelve `{ message, data, pagination: { page, pageSize, total, totalPages }, sort: "newest" }`.
Se usa paginación por offset; el orden es estable por `createdAt DESC, id DESC`.
Si hay altas/bajas entre solicitudes, las páginas pueden desplazarse.

**Orden provisional:** `newest` significa cronológico, no popularidad. Likes aún no
existe: no hay contador ni opción `sort=likes`. Queda pendiente integrar con ese módulo
el orden predeterminado por likes y acordar los desempates. No se implementan rankings,
promedios, Comment, Report ni reglas de negocio para borrar usuarios o lanzamientos.

Alta (`Content-Type: application/json`):

```json
{ "releaseId": 1, "text": "Una buena reseña", "rating": 3.5 }
```

Solo se permiten esos tres campos. El autor se obtiene de la sesión. `rating` debe ser
un número JSON: `1`, `1.5`, `2`, `2.5`, `3`, `3.5`, `4`, `4.5` o `5`. La notación decimal
en JSON lleva punto; las cadenas `"1,5"` y `"1.5"` se rechazan. No hay unicidad entre
autor y lanzamiento: cada alta crea una reseña independiente.

Edición:

```json
{ "text": "Texto revisado" }
```

El texto se recorta con `trim()` y debe contener de 1 a 2000 caracteres Unicode
(puntos de código); se rechaza NUL porque PostgreSQL no lo admite. `PATCH` requiere
`text` y rechaza cualquier otro campo, incluso un `rating` igual al existente.
Una edición aceptada establece `editedAt`, conserva `createdAt` y jamás amplía el plazo.
El frontend puede mostrar «(editado)» cuando `editedAt !== null`.

**Solo el autor puede editar su reseña**, independientemente de su rol. Un `ADMIN`
distinto del autor recibe 403 al intentar editar, incluso dentro del plazo.
El autor, sea `USER` o `ADMIN`, está sujeto a `ahora < createdAt + 24 horas`;
exactamente a las 24 horas ya se rechaza. El reloj se consulta después de bloquear
la fila en la transacción.
El autor o un `ADMIN` pueden borrar la reseña sin límite de tiempo. La baja usa
el mismo bloqueo y establece `deletedAt`. Una reseña borrada devuelve
404 en consulta, edición y nueva baja, y se excluye de todos los listados y sus totales.
`DELETE` acepta un cuerpo ausente o `{}` y rechaza otros campos.

Las respuestas de alta, consulta y edición conservan `{ message, data }`. `data` contiene:

```json
{
  "id": 10,
  "author": { "id": 1, "username": "usuario" },
  "releaseId": 1,
  "text": "Texto revisado",
  "rating": 3.5,
  "createdAt": "2026-09-21T10:00:00.000Z",
  "editedAt": "2026-09-21T11:00:00.000Z"
}
```

La respuesta se construye explícitamente: del autor solo se exponen ID y username.
No se serializa la entidad User completa ni sus relaciones.

Errores: `{ success: false, message }`. Se usa 400 para validación y JSON malformado,
401 para sesión ausente/inválida, 403 para cabecera ausente, permisos o plazo vencido,
404 para reseña no visible o lanzamiento inexistente al crear y 409 si una relación
desaparece durante el alta. El límite de tamaño del parser Express responde 413.
El ajuste del manejador compartido para JSON/413 también beneficia a las rutas existentes.

## Puntuación elegible para el futuro ranking

`ReviewRepository.findEligibleRating(authorId, releaseId)` devuelve `number | null`.
Se usa dentro de un `RequestContext`, igual que los demás métodos del repositorio.

1. Busca una sola reseña de esa pareja ordenando por `createdAt DESC, id DESC`,
   **incluyendo las borradas**.
2. Devuelve su puntuación solo si existe y `deletedAt` es null.
3. No hay fallback a una reseña anterior ni cálculo de promedio o ranking.

Con A seguida de B, cuenta B. Si B se borra, devuelve null aunque A siga visible.
Una nueva C pasa a aportar. Editar texto no altera qué reseña es la última.
La consulta no usa un filtro global de borrado lógico para evitar ocultar B antes de
seleccionarla. Esta función no se expone como endpoint; queda como punto de integración.

## Esquema y migración

`Migration20260922000000` crea únicamente `review`, sus claves foráneas e índices.
`rating` es `numeric` sin escala fija y con un CHECK de los nueve valores: valores
como 1.49 se rechazan en PostgreSQL sin redondearse previamente. El CHECK de longitud
acompaña la validación del texto. No hay restricción UNIQUE por autor/lanzamiento.

Índices:

- `review_release_visible_idx`: lanzamiento, fecha e ID, parcial para visibles.
- `review_author_visible_idx`: autor, fecha e ID, parcial para visibles.
- `review_author_release_latest_idx`: autor, lanzamiento, fecha e ID, incluyendo borradas.

Las claves foráneas usan la acción estándar NO ACTION en borrado; no se añaden cascadas
ni se modifican los controladores de User o Release. La política funcional de eliminación
de esas entidades queda para su integración posterior.

La migración se escribió explícitamente para conservar intactos las migraciones anteriores
y el archivo local sin seguimiento `src/migrations/.snapshot-jukeboxd.json`.
**Ese snapshot todavía no representa Review:** antes de generar futuras migraciones,
el equipo debe reconciliarlo con el esquema acordado; no ejecutar `migration:create`
sin revisar porque podría volver a generar la tabla. No hace falta generar otra migración
para instalar Review: aplicar la nueva mediante el procedimiento habitual de `migration:up`.

Las pruebas aplican las migraciones únicamente en su propia base temporal. No aplican
Review a la base de desarrollo. `down` elimina únicamente la tabla Review y sus datos.

## Verificación

```powershell
npm run check
npm run check:tests
npm run test:review
```

Las pruebas unitarias pueden ejecutarse sin PostgreSQL:

```powershell
node --import=tsx --test tests/review.rules.test.ts
```

La suite de integración usa PostgreSQL con la conexión del `.env`. Su usuario necesita
permiso `CREATEDB`: crea una base `jukeboxd_review_test_<id aleatorio>`, verifica su
identidad, aplica todas las migraciones y elimina solo esa base al terminar, incluso
si falla una prueba. No toca datos de bases existentes ni genera snapshots.
Prueba las rutas reales, login y middleware de sesión; únicamente el almacén de sesiones
es en memoria, para no depender del almacén persistente de la aplicación.

Cubre validación HTTP y SQL, toda la escala, Unicode, varias reseñas por pareja,
permisos sobre la reseña (incluido ADMIN ajeno que recibe 403 al editar y puede borrar
la misma reseña), privacidad, paginación, 24 horas exactas, edición reiterada,
borrado lógico, concurrencia, A/B/B borrada/C y desempates. También prueba `down/up`
y comprueba que no haya diferencias de esquema de Review entre entidad y migración.
