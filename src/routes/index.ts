import { Router } from 'express';

const router = Router();
import { AppError } from '../shared/errors/app-error.js';

router.get('/error', (req, res) => {
  throw new AppError('Este es un error de prueba', 400);
});
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Backend funcionando correctamente',
  });
});

export default router;