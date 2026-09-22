import { LockMode, RequestContext } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';

import { AppError } from '../../shared/errors/app-error.js';
import { User } from '../users/user.entity.js';
import { Review } from '../reviews/review.entity.js';
import { Comment } from './comment.entity.js';
import { assertCanDeleteComment, assertCanEditComment } from './comment.rules.js';
import type { CommentActor } from './comment.rules.js';
import type { CommentPage, CreateCommentInput } from './comment.validation.js';

export class CommentRepository {
  constructor(private readonly now: () => Date = () => new Date()) {}

  private getEntityManager(): EntityManager {
    const em = RequestContext.getEntityManager();
    if (!(em instanceof EntityManager)) throw new Error('No hay un contexto de PostgreSQL activo');
    return em;
  }

  async findById(id: number): Promise<Comment | null> {
    return this.getEntityManager().findOne(Comment, {
      id, deletedAt: null, review: { deletedAt: null },
    }, { populate: ['author'] });
  }

  private findChildren(reviewId: number, parentId: number | null, page: CommentPage): Promise<[Comment[], number]> {
    return this.getEntityManager().findAndCount(Comment, {
      review: { id: reviewId, deletedAt: null }, parent: parentId, deletedAt: null,
    }, {
      populate: ['author'],
      orderBy: { createdAt: 'asc', id: 'asc' },
      limit: page.pageSize,
      offset: (page.page - 1) * page.pageSize,
    });
  }

  async findRoots(reviewId: number, page: CommentPage): Promise<[Comment[], number]> {
    const review = await this.getEntityManager().findOne(Review, { id: reviewId, deletedAt: null });
    if (!review) throw new AppError('Reseña no encontrada', 404);
    return this.findChildren(reviewId, null, page);
  }

  async findReplies(id: number, page: CommentPage): Promise<[Comment[], number]> {
    const parent = await this.findById(id);
    if (!parent) throw new AppError('Comentario no encontrado', 404);
    return this.findChildren(parent.review.id!, id, page);
  }

  /** Todas las escrituras bloquean Review primero, igual que ReviewRepository.delete. */
  private async lockReview(tx: EntityManager, reviewId: number): Promise<Review> {
    const review = await tx.findOne(Review, { id: reviewId, deletedAt: null }, {
      lockMode: LockMode.PESSIMISTIC_WRITE,
      refresh: true,
    });
    if (!review) throw new AppError('Reseña no encontrada', 404);
    return review;
  }

  private async lockCommentReview(tx: EntityManager, id: number): Promise<Comment> {
    // Esta lectura solo localiza la Review. Se vuelve a leer el comentario después
    // del bloqueo porque otra transacción pudo borrarlo mientras esperábamos.
    const reference = await tx.findOne(Comment, { id }, { fields: ['id', 'review'] });
    if (!reference) throw new AppError('Comentario no encontrado', 404);
    await this.lockReview(tx, reference.review.id!);
    const comment = await tx.findOne(Comment, { id, deletedAt: null }, { refresh: true });
    if (!comment) throw new AppError('Comentario no encontrado', 404);
    return comment;
  }

  async create(reviewId: number, data: CreateCommentInput, authorId: number): Promise<Comment> {
    return this.getEntityManager().transactional(async tx => {
      const review = await this.lockReview(tx, reviewId);
      let parent: Comment | null = null;
      if (data.parentId !== undefined) {
        parent = await tx.findOne(Comment, { id: data.parentId, deletedAt: null }, { refresh: true });
        if (!parent) throw new AppError('Comentario padre no encontrado', 404);
        if (parent.review.id !== reviewId) {
          throw new AppError('El comentario padre debe pertenecer a la misma reseña', 400);
        }
      }

      const comment = new Comment();
      comment.review = review;
      comment.author = tx.getReference(User, authorId);
      comment.parent = parent;
      comment.text = data.text;
      comment.createdAt = this.now();
      await tx.persistAndFlush(comment);
      await tx.populate(comment, ['author']);
      return comment;
    });
  }

  async updateText(id: number, text: string, actor: CommentActor): Promise<Comment> {
    return this.getEntityManager().transactional(async tx => {
      const comment = await this.lockCommentReview(tx, id);
      const now = this.now();
      assertCanEditComment(comment, actor, now);
      comment.text = text;
      comment.editedAt = now;
      await tx.flush();
      await tx.populate(comment, ['author']);
      return comment;
    });
  }

  async deleteSubtree(id: number, actor: CommentActor): Promise<void> {
    await this.getEntityManager().transactional(async tx => {
      const comment = await this.lockCommentReview(tx, id);
      assertCanDeleteComment(comment, actor);
      // Sin recursión en JS ni límite de profundidad. Se recorren incluso nodos
      // ya borrados, conservando sus fechas, y toda la baja es una sola sentencia.
      await tx.execute(`with recursive subtree as (
        select id from "comment" where id = ? and review_id = ?
        union
        select child.id from "comment" child
        join subtree on child.parent_id = subtree.id
        where child.review_id = ?
      )
      update "comment" set deleted_at = ?
      where id in (select id from subtree) and deleted_at is null`,
      [id, comment.review.id, comment.review.id, this.now()]);
    });
  }
}
