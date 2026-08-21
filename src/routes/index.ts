import { Router } from 'express';
import { AppError } from '../shared/errors/app-error.js';
import userRoutes from '../modules/users/user.routes.js';

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


export default router;