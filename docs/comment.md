# Comment (issue #4)

Implementación sobre `origin/main` (`b8db913`, merge de Review), en la rama `comment`.
Cada comentario pertenece a una reseña y a su autor. `parent` es opcional e inmutable;
las respuestas pertenecen a la misma reseña que su padre y admiten cualquier profundidad.

## API

| Método y ruta | Acceso | Resultado |
| --- | --- | --- |
| `GET /reviews/:reviewId/comments` | Público | Solo comentarios principales de una reseña activa |
| `GET /comments/:id/replies` | Público | Solo respuestas directas del comentario activo |
| `GET /comments/:id` | Público | Comentario activo |
| `POST /reviews/:reviewId/comments` | Sesión + `X-Jukeboxd-Request: 1` | Crea comentario o respuesta, `201` |
| `PATCH /comments/:id` | Solo autor + sesión y cabecera | Edita texto antes de 24 horas, `200` |
| `DELETE /comments/:id` | Autor o ADMIN + sesión y cabecera | Borra lógicamente todo el subárbol, `204` |

Alta de un comentario principal:

```json
{ "text": "Mi comentario" }
```

Alta de una respuesta (en la misma ruta de la reseña):

```json
{ "text": "Mi respuesta", "parentId": 123 }
```

`parentId` debe omitirse para comentarios principales; si se envía, debe ser un número
entero positivo válido, no null. El autor se toma siempre de la sesión. No se admiten
`reviewId`, `authorId`, fechas ni otros campos en el cuerpo. El ID de la reseña está en
la ruta. El padre debe existir, estar activo y pertenecer a esa reseña activa.

Edición: únicamente `{ "text": "Texto revisado" }`. El texto usa `trim()`, de 1 a
2000 caracteres Unicode (puntos de código) y sin NUL, como Review. Solo el autor puede
editar, aunque un tercero tenga rol ADMIN. El autor ADMIN está sujeto al mismo plazo.
La condición es `ahora < createdAt + 24 horas`: exactamente en el límite se rechaza.
Una edición válida actualiza `editedAt`, conserva `createdAt` y no amplía el plazo.
El frontend puede mostrar «(editado)» cuando `editedAt !== null`.

La baja acepta cuerpo ausente o `{}`. El autor del comentario o un ADMIN pueden borrar
en cualquier momento; ser autor de la reseña no da permisos sobre comentarios ajenos.
Se marcan el comentario y todos sus descendientes, incluso escritos por otras personas.
No se devuelve ningún marcador «Comentario eliminado». Los nodos ya borrados conservan
su fecha de baja y una nueva baja directa devuelve 404.

Todas las lecturas verifican también que la Review siga activa. Si se borra la reseña,
sus comentarios y respuestas dejan de ser accesibles y todas sus escrituras devuelven
404. No hace falta actualizar físicamente cada comentario al borrar Review: su
visibilidad depende del estado de la reseña. No existe una operación de restauración.

## Respuestas, orden y paginación

Alta, detalle y edición usan `{ message, data }`. Cada comentario público contiene:

```json
{
  "id": 124,
  "reviewId": 10,
  "parentId": 123,
  "author": { "id": 3, "username": "usuario" },
  "text": "Mi respuesta",
  "createdAt": "2026-09-22T03:00:00.000Z",
  "editedAt": null
}
```

`parentId` es null en principales. No se exponen email, hash, Spotify ID, rol ni
`deletedAt`; la respuesta se construye explícitamente, sin serializar User completo.

Los listados aceptan `?page=1&pageSize=20`, con página inicial 1, tamaño predeterminado
20 y máximo 100. Se rechazan valores fuera de rango, parámetros repetidos o desconocidos.
La respuesta es `{ message, data, pagination: { page, pageSize, total, totalPages } }`.
Orden estable: `createdAt ASC, id ASC`; los datos y totales excluyen borrados y reseñas
borradas. Una reseña activa sin comentarios devuelve `200`, lista vacía y total 0;
una reseña o padre inexistente/borrado devuelve 404. La paginación es por offset y puede
desplazarse si hay altas o bajas entre solicitudes. Cada nivel se consulta por separado;
ningún endpoint devuelve un árbol completo.

Errores: `{ success: false, message }`. Se usa 400 para validación, JSON inválido o
padre de otra reseña; 401 para sesión ausente/inválida; 403 para permisos, cabecera o
edición fuera de plazo; 404 para recursos inexistentes o no visibles. Una relación
que desaparece al crear puede devolver 409. El parser existente limita cuerpos y usa 413.

## Transacciones y concurrencia

Todas las escrituras de Comment obtienen primero `SELECT ... FOR UPDATE` sobre la
Review activa. `ReviewRepository.delete` ya toma ese bloqueo. Se mantiene un único
orden de adquisición: Review antes de leer/crear/modificar comentarios. Las escrituras
sobre reseñas distintas pueden avanzar simultáneamente; las de una misma reseña se
serializan, a cambio de limitar el paralelismo dentro de una conversación muy activa.

En edición y baja, una lectura inicial localiza la reseña; después de obtener el
bloqueo se vuelve a leer el comentario con `refresh: true`. En creación, el padre se
valida después del bloqueo. El reloj de edición también se consulta después de esperar.
Así ninguna decisión usa un estado anterior a una baja concurrente.

La baja usa un CTE recursivo y un solo UPDATE dentro de la transacción. Recorre toda
la profundidad, incluso a través de nodos previamente borrados, sin recursión en JS.
Si falla cualquier fila, se revierte la baja completa. Si crear gana la carrera,
el borrado posterior incluye la nueva respuesta; si borrar gana, crear devuelve 404.
Lo mismo aplica al borrado de un ancestro o de Review. Esta garantía depende de que
las futuras escrituras respeten el bloqueo de Review; no insertar/reubicar nodos con
SQL externo que omita estas reglas. La igualdad de reseña del padre y su inmutabilidad
se validan en el módulo; no hay endpoint para mover comentarios.

## Migración y snapshots

Se compararon los snapshots antes de escribir la migración:

- Versionado: `src/migrations/.snapshot-Nukeboxd.json`, aún sin Review.
- Local sin seguimiento: `src/migrations/.snapshot-jukeboxd.json`, agrega Review.
- Las tablas compartidas son idénticas; no hay otros cambios estructurales entre ambos.
- SHA-256 local conservado: `17140BE7ADEAF8DD29916C6EDF16A4D4A159ED45AAE3582130B9FE57EA634821`.

La base autoritativa para esta entrega es la secuencia de migraciones de `origin/main`,
incluida `Migration20260922000000`. La nueva `Migration20260922030000` se escribió
explícitamente: crea solo `comment`, sin regenerar Review ni modificar snapshots o
migraciones anteriores. Se prueba sobre una base temporal que primero aplica Review.

Incluye claves foráneas a Review, User y Comment, CHECK de longitud y rechazo de
autorreferencia directa. Los borrados físicos conservan la acción estándar NO ACTION.
Índices:

- `comment_visible_children_idx`: `(review_id, parent_id, created_at, id)`, parcial para
  comentarios no borrados; sirve para principales e hijos directos.
- `comment_parent_idx`: `(parent_id)`, sin filtro; sirve para recorrer todo el subárbol.

Antes de usar `migration:create` en el futuro, el equipo debe reconciliar los snapshots:
ninguno representa hoy todo el esquema de Comment y el versionado tampoco contiene
Review. No generar otra vez estas tablas. Para instalar Comment se aplica la migración
nueva con el procedimiento habitual de `migration:up`; las pruebas no la aplican a la
base de desarrollo. `down` elimina únicamente Comment y sus datos.

## Pruebas y pendientes

```powershell
npm run check
npm run check:tests
npm run test:comment
git diff --check
```

La suite usa PostgreSQL y la conexión del `.env`; necesita `CREATEDB`. Crea una base
`jukeboxd_comment_test_<id aleatorio>`, verifica su identidad, aplica las migraciones
y elimina solo esa base al finalizar. No escribe snapshots. Prueba rutas, login y
autorización reales; el almacén de sesiones de los tests es en memoria.

Se cubren varios niveles, respuestas directas, privacidad, validación, permisos, ADMIN
ajeno, límite exacto de 24 horas, edición reiterada, baja de subárboles con distintos
autores, rollback por un fallo en un descendiente, Review borrada, paginación e índices.
Las carreras fuerzan ambos órdenes frente a padre, ancestro y Review: se observa en
`pg_stat_activity` que las solicitudes realmente esperan el bloqueo antes de liberarlo.
También se verifica reversión/reaplicación de Comment y coincidencia con su entidad.

La prueba de migración de Review retira ahora las migraciones dependientes antes de
revertir su tabla, para respetar la nueva clave foránea de Comment.

Pendientes ajenos a Comment: la migración fusionada de Review admite rating `0.5`,
pero su entidad, validación y pruebas siguen usando mínimo `1`; requiere una decisión
y corrección propia de Review. Se conserva tal como llegó de `origin/main`.
La regresión de Review pasa 18 de 20 pruebas: fallan el rechazo SQL de `0.5` y la
comparación del CHECK de puntaje entre entidad y migración, por esa diferencia previa.
Likes, Report, rankings y comentarios directos sobre lanzamientos/pistas no forman
parte de esta entrega; no se agregan contadores ni orden por likes.
