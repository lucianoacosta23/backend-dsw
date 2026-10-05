import { Router } from 'express';
import { AppError } from '../shared/errors/app-error.js';
import userRoutes from '../modules/users/user.routes.js';
import artistRouter from '../modules/artists/artist.route.js';
import genreRouter from '../modules/genres/genres.route.js';
import releaseRouter from '../modules/releases/release.route.js';
import trackRouter from '../modules/tracks/track.route.js';
import authRouter from '../modules/auth/auth.route.js';
import spotifyRouter from '../modules/spotify/spotify.route.js';
import reviewRouter from '../modules/reviews/review.route.js';
import commentRouter, { reviewCommentRouter } from '../modules/comments/comment.route.js';
import reviewLikeRouter from '../modules/likes/like.route.js';
import reviewReportRouter from '../modules/reports/report.route.js';
import adminReportRouter from '../modules/reports/report.admin.route.js';
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

router.use('/admin/spotify', spotifyRouter);
router.use('/users', userRoutes);
router.use('/releases', releaseRouter);
router.use('/reviews', reviewRouter);
router.use('/reviews/:reviewId/comments', reviewCommentRouter);
router.use('/reviews/:reviewId/like', reviewLikeRouter);
router.use('/reviews/:reviewId/reports', reviewReportRouter);
router.use('/comments', commentRouter);
router.use('/tracks', trackRouter);
router.use('/artists', artistRouter);
router.use('/genres', genreRouter);
router.use('/auth', authRouter);
router.use('/admin/reports', adminReportRouter);
export default router;
