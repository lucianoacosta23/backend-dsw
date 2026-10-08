import type { RequestHandler } from 'express';
import multer from 'multer';
import { RequestContext } from '@mikro-orm/core';
import { AppError } from '../../shared/errors/app-error.js';
import { ImagePurpose } from './profile-image.entity.js';
import { ImageService, MAX_IMAGE_BYTES } from './image.service.js';
import { IMAGE_KEY, uploadDirectory } from './image.storage.js';

const receive = multer({ storage: multer.memoryStorage(), limits: {
  fileSize: MAX_IMAGE_BYTES, files: 1, fields: 1, parts: 2, fieldSize: 32, fieldNameSize: 32,
} }).single('file');

export const receiveImage: RequestHandler = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next(new AppError('Debe enviar multipart/form-data', 400));
  receive(req, res, error => {
    if (error) return next(new AppError(error.code === 'LIMIT_FILE_SIZE' ? 'La imagen supera los 5 MiB' : 'Multipart no válido: se requiere un archivo file y purpose', error.code === 'LIMIT_FILE_SIZE' ? 413 : 400));
    next();
  });
};
export const uploadImage: RequestHandler = async (req, res, next) => {
  try {
    const purpose = req.body?.purpose;
    if (!req.file || Object.keys(req.body ?? {}).length !== 1 || !Object.values(ImagePurpose).includes(purpose)) {
      throw new AppError('Se requiere un archivo file y purpose avatar o cover', 400);
    }
    const em = RequestContext.getEntityManager()!;
    const data = await new ImageService(em).upload(res.locals.authUser.id, purpose, req.file.buffer);
    res.status(201).json({ message: 'Imagen subida', data });
  } catch (error) { next(error); }
};
export const serveImage: RequestHandler = (req, res, next) => {
  const key = req.params.key;
  if (typeof key !== 'string' || !IMAGE_KEY.test(key)) return next(new AppError('Imagen no encontrada', 404));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(key, { root: uploadDirectory(), dotfiles: 'deny' }, error => {
    if (error && !res.headersSent) next(new AppError('Imagen no encontrada', 404));
  });
};
