import { Router } from 'express';
import { AppError } from '../shared/errors/app-error.js';
import userRoutes from '../modules/users/user.routes.js';
import userRouter from '../modules/users/user.routes.js';
import artistRouter from '../modules/artists/artist.route.js';
import genreRouter from '../modules/genres/genres.route.js';
import releaseRouter from '../modules/releases/release.route.js';
import trackRouter from '../modules/tracks/track.route.js';
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
router.use('/releases', releaseRouter);
router.use('/tracks', trackRouter);
router.use('/users', userRouter);
router.use('/artists', artistRouter);
router.use('/genres', genreRouter);
export default router;