import { Router } from 'express';
import { AppError } from '../shared/errors/app-error.js';
import userRoutes from '../modules/users/user.routes.js';
import userRouter from '../modules/users/user.routes.js';
import artistRouter from '../modules/artists/artist.route.js';
const router = Router();


router.get('/error', (req,res)=>{
    throw new AppError(
        'Este es un error de prueba',
        400
    );
});


router.get('/health',(req,res)=>{
    res.status(200).json({
        status:'OK',
        message:'Backend funcionando correctamente'
    });
});


router.use('/users', userRoutes);

router.use('/users', userRouter);
router.use('/artists', artistRouter);
export default router;