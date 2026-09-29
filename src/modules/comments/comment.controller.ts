import type { Request, Response, NextFunction } from 'express';
import { ForeignKeyConstraintViolationException } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import type { User } from '../users/user.entity.js';
import type { Comment } from './comment.entity.js';
import type { CommentActor } from './comment.rules.js';
import { CommentRepository } from './comment.repository.js';
import {
  parseCommentId, parseCommentPage, parseCreateComment, parseEditComment, validateDeleteCommentBody,
} from './comment.validation.js';
import type { CommentPage } from './comment.validation.js';

const repository = new CommentRepository();

function actor(res: Response): CommentActor {
  const user = res.locals.authUser as User | undefined;
  if (user?.id === undefined) throw new AppError('Debe iniciar sesión', 401);
  return { id: user.id, category: user.category };
}

function commentResponse(comment: Comment) {
  return {
    id: comment.id,
    reviewId: comment.review.id,
    parentId: comment.parent?.id ?? null,
    author: { id: comment.author.id, username: comment.author.username },
    text: comment.text,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
  };
}

function listResponse(res: Response, comments: Comment[], total: number, page: CommentPage): void {
  res.status(200).json({
    message: 'Listado de comentarios',
    data: comments.map(commentResponse),
    pagination: { ...page, total, totalPages: Math.ceil(total / page.pageSize) },
  });
}

export async function findRoots(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseCommentPage(req.query);
    const [comments, total] = await repository.findRoots(parseCommentId(req.params.reviewId), page);
    listResponse(res, comments, total, page);
  } catch (error) { next(error); }
}

export async function findReplies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseCommentPage(req.query);
    const [comments, total] = await repository.findReplies(parseCommentId(req.params.id), page);
    listResponse(res, comments, total, page);
  } catch (error) { next(error); }
}

export async function findById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const comment = await repository.findById(parseCommentId(req.params.id));
    if (!comment) throw new AppError('Comentario no encontrado', 404);
    res.status(200).json({ message: 'Comentario encontrado', data: commentResponse(comment) });
  } catch (error) { next(error); }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const comment = await repository.create(
      parseCommentId(req.params.reviewId), parseCreateComment(req.body), actor(res).id,
    );
    res.status(201).json({ message: 'Comentario creado', data: commentResponse(comment) });
  } catch (error) {
    if (error instanceof ForeignKeyConstraintViolationException) {
      next(new AppError('El autor, la reseña o el padre ya no existe', 409));
      return;
    }
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const comment = await repository.updateText(parseCommentId(req.params.id), parseEditComment(req.body), actor(res));
    res.status(200).json({ message: 'Comentario actualizado', data: commentResponse(comment) });
  } catch (error) { next(error); }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseCommentId(req.params.id);
    validateDeleteCommentBody(req.body);
    await repository.deleteSubtree(id, actor(res));
    res.status(204).send();
  } catch (error) { next(error); }
}
