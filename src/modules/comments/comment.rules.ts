import { AppError } from '../../shared/errors/app-error.js';

export const COMMENT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CommentActor {
  id: number;
  category: string;
}

interface CommentState {
  author: { id?: number };
  createdAt: Date;
  deletedAt: Date | null;
}

function assertActive(comment: CommentState): void {
  if (comment.deletedAt !== null) throw new AppError('Comentario no encontrado', 404);
}

// El repositorio verifica además la visibilidad de Review dentro de la transacción.
export function assertCanEditComment(comment: CommentState, actor: CommentActor, now: Date): void {
  assertActive(comment);
  if (comment.author.id !== actor.id) {
    throw new AppError('Solo el autor puede editar este comentario', 403);
  }
  if (now.getTime() >= comment.createdAt.getTime() + COMMENT_EDIT_WINDOW_MS) {
    throw new AppError('El plazo de 24 horas para editar el comentario terminó', 403);
  }
}

export function assertCanDeleteComment(comment: CommentState, actor: CommentActor): void {
  assertActive(comment);
  if (comment.author.id !== actor.id && actor.category !== 'ADMIN') {
    throw new AppError('No tiene permisos para borrar este comentario', 403);
  }
}
