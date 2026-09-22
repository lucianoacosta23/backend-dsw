import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/app-error.js';

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'El cuerpo debe contener JSON válido' });
    return;
  }

  if ('type' in err && err.type === 'entity.too.large') {
    res.status(413).json({ success: false, message: 'El cuerpo de la solicitud es demasiado grande' });
    return;
  }

  console.error(err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
  });
};
