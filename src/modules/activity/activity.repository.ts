import { RequestContext } from '@mikro-orm/core';

import { Review } from '../reviews/review.entity.js';

export type ActivityScope = 'following' | 'own';

export interface ActivityInput {
  scope: ActivityScope;
  page: number;
  pageSize: number;
}

interface ActivityTarget {
  type: 'track' | 'release';
  id: number;
  name: string;
  imageUrl: string | null;
  artists: Array<{
    id: number;
    name: string;
  }>;
}

interface ReviewActivityItem {
  type: 'REVIEW_CREATED';
  reviewId: number;
  createdAt: Date;
  author: {
    id: number;
    username: string;
  };
  rating: number;
  text: string | null;
  target: ActivityTarget;
}

type IncomingActivityType =
  | 'FOLLOW_RECEIVED'
  | 'LIKE_RECEIVED'
  | 'COMMENT_RECEIVED'
  | 'REPLY_RECEIVED';

interface IncomingActivityRow {
  type: IncomingActivityType;
  event_id: number;
  author_id: number;
  username: string;
  review_id: number | null;
  comment_id: number | null;
  parent_id: number | null;
  created_at: Date | string;
  text: string | null;
}

interface IncomingActivityItem {
  id: string;
  type: IncomingActivityType;
  createdAt: Date | string;
  author: {
    id: number;
    username: string;
  };
  reviewId: number | null;
  commentId: number | null;
  parentId: number | null;
  text: string | null;
  rating: number | null;
  target: ActivityTarget | null;
}

// Las entidades consultadas deben tener un ID asignado.
function persistedId(id: number | undefined): number {
  if (id === undefined) {
    throw new Error('Una entidad consultada no tiene ID');
  }

  return id;
}

export class ActivityRepository {
  private getEntityManager() {
    const em = RequestContext.getEntityManager();

    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }

    return em;
  }

  // Arma los datos de la música asociada a una reseña.
  private getTarget(review: Review): ActivityTarget {
    const track = review.track;

    if (track) {
      return {
        type: 'track',
        id: persistedId(track.id),
        name: track.name,
        imageUrl: track.release.imageUrl,
        artists: track.artists.getItems().map(artist => ({
          id: persistedId(artist.id),
          name: artist.name,
        })),
      };
    }

    const release = review.release;

    if (!release) {
      throw new Error('La reseña no tiene música asociada');
    }

    return {
      type: 'release',
      id: persistedId(release.id),
      name: release.name,
      imageUrl: release.imageUrl,
      artists: release.artists.getItems().map(artist => ({
        id: persistedId(artist.id),
        name: artist.name,
      })),
    };
  }

  async findAll(
    userId: number,
    input: ActivityInput,
  ): Promise<{ items: ReviewActivityItem[]; total: number }> {
    const em = this.getEntityManager();

    // El usuario se obtiene de la sesión.
    const condition = input.scope === 'own'
      ? 'r.author_id = ?'
      : `
          EXISTS (
            SELECT 1
            FROM follow AS f
            WHERE f.follower_id = ?
              AND f.followed_id = r.author_id
          )
        `;

    const totals = (await em.getConnection().execute(
      `
        SELECT COUNT(*)::int AS total
        FROM review AS r
        WHERE r.deleted_at IS NULL
          AND ${condition}
      `,
      [userId],
    )) as Array<{ total: number }>;

    const rows = (await em.getConnection().execute(
      `
        SELECT r.id
        FROM review AS r
        WHERE r.deleted_at IS NULL
          AND ${condition}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ? OFFSET ?
      `,
      [
        userId,
        input.pageSize,
        (input.page - 1) * input.pageSize,
      ],
    )) as Array<{ id: number }>;

    const total = Number(totals[0]?.total ?? 0);

    if (rows.length === 0) {
      return { items: [], total };
    }

    const reviews = await em.find(
      Review,
      {
        id: { $in: rows.map(row => row.id) },
        deletedAt: null,
      },
      {
        populate: [
          'author',
          'release.artists',
          'track.release',
          'track.artists',
        ],
      },
    );

    const byId = new Map(
      reviews.map(review => [review.id, review]),
    );

    // Conserva el orden calculado por SQL.
    const items = rows.flatMap<ReviewActivityItem>(row => {
      const review = byId.get(row.id);

      if (!review) return [];

      return [{
        type: 'REVIEW_CREATED',
        reviewId: row.id,
        createdAt: review.createdAt,
        author: {
          id: persistedId(review.author.id),
          username: review.author.username,
        },
        rating: review.rating,
        text: review.text,
        target: this.getTarget(review),
      }];
    });

    return { items, total };
  }

  async findIncoming(
    userId: number,
    page: number,
    pageSize: number,
  ): Promise<{ items: IncomingActivityItem[]; total: number }> {
    const em = this.getEntityManager();

    // Unifica los eventos antes de ordenar y paginar.
    // Excluye acciones propias y contenido dado de baja.
    const eventsSql = `
      SELECT
        'FOLLOW_RECEIVED'::text AS type,
        f.id AS event_id,
        f.follower_id AS author_id,
        NULL::int AS review_id,
        NULL::int AS comment_id,
        NULL::int AS parent_id,
        f.created_at,
        NULL::text AS text
      FROM follow AS f
      WHERE f.followed_id = ?
        AND f.follower_id <> ?

      UNION ALL

      SELECT
        'LIKE_RECEIVED'::text AS type,
        l.id AS event_id,
        l.user_id AS author_id,
        r.id AS review_id,
        NULL::int AS comment_id,
        NULL::int AS parent_id,
        l.created_at,
        NULL::text AS text
      FROM review_like AS l
      JOIN review AS r ON r.id = l.review_id
      WHERE r.author_id = ?
        AND l.user_id <> ?
        AND r.deleted_at IS NULL

      UNION ALL

      SELECT
        CASE
          WHEN parent.author_id = ? THEN 'REPLY_RECEIVED'
          ELSE 'COMMENT_RECEIVED'
        END AS type,
        c.id AS event_id,
        c.author_id,
        r.id AS review_id,
        c.id AS comment_id,
        c.parent_id,
        c.created_at,
        c.text
      FROM "comment" AS c
      JOIN review AS r ON r.id = c.review_id
      LEFT JOIN "comment" AS parent
        ON parent.id = c.parent_id
        AND parent.review_id = c.review_id
        AND parent.deleted_at IS NULL
      WHERE c.author_id <> ?
        AND c.deleted_at IS NULL
        AND r.deleted_at IS NULL
        AND (c.parent_id IS NULL OR parent.id IS NOT NULL)
        AND (
          r.author_id = ?
          OR parent.author_id = ?
        )
    `;

    // Cada posición corresponde a un parámetro ? de eventsSql.
    const params = [
      userId, userId,
      userId, userId,
      userId, userId, userId, userId,
    ];

    const totals = (await em.getConnection().execute(
      `
        SELECT COUNT(*)::int AS total
        FROM (${eventsSql}) AS events
      `,
      params,
    )) as Array<{ total: number }>;

    const rows = (await em.getConnection().execute(
      `
        SELECT
  events.type,
  events.event_id,
  events.author_id,
  events.review_id,
  events.comment_id,
  events.parent_id,
  events.text,
  to_char(
    events.created_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS created_at,
  u.username
        FROM (${eventsSql}) AS events
        JOIN "user" AS u ON u.id = events.author_id
        ORDER BY
          events.created_at DESC,
          events.type ASC,
          events.event_id DESC
        LIMIT ? OFFSET ?
      `,
      [
        ...params,
        pageSize,
        (page - 1) * pageSize,
      ],
    )) as IncomingActivityRow[];

    const total = Number(totals[0]?.total ?? 0);

    if (rows.length === 0) {
      return { items: [], total };
    }

    const reviewIds = [...new Set(
      rows
        .map(row => row.review_id)
        .filter((id): id is number => id !== null),
    )];

    const reviews = reviewIds.length === 0
      ? []
      : await em.find(
          Review,
          {
            id: { $in: reviewIds },
            deletedAt: null,
          },
          {
            populate: [
              'release.artists',
              'track.release',
              'track.artists',
            ],
          },
        );

    const byId = new Map(
      reviews.map(review => [review.id, review]),
    );

    const items = rows.flatMap<IncomingActivityItem>(row => {
      const base = {
        id: `${row.type}-${row.event_id}`,
        type: row.type,
        createdAt: row.created_at,
        author: {
          id: row.author_id,
          username: row.username,
        },
        reviewId: row.review_id,
        commentId: row.comment_id,
        parentId: row.parent_id,
        text: row.text,
      };

      // Un nuevo seguidor no tiene reseña ni música asociada.
      if (row.type === 'FOLLOW_RECEIVED') {
        return [{
          ...base,
          rating: null,
          target: null,
        }];
      }

      if (row.review_id === null) {
        throw new Error('La interacción no tiene reseña asociada');
      }

      const review = byId.get(row.review_id);

      // Puede haberse dado de baja entre las consultas.
      if (!review) return [];

      return [{
        ...base,
        rating: review.rating,
        target: this.getTarget(review),
      }];
    });

    return { items, total };
  }
}