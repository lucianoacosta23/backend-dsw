// Este modulo es para realizar busquedas de artistas, albun y canciones 

import type { Request, Response, NextFunction } from 'express';
import { ForeignKeyConstraintViolationException } from '@mikro-orm/core';

//estos 3 import es para usar directamente los repositorios
import { TrackRepository } from '../tracks/track.repository.js';
import { ReleaseRepository } from '../releases/release.repository.js';
import { ArtistRepository } from '../artists/artist.repository.js';

// Importamos las entidades solo para usarlas como identificadores en el repositorio
import { Track } from '../tracks/track.entity.js';
import { Release } from '../releases/release.entity.js';
import { Artist } from '../artists/artist.entity.js';

//import { AppError } from '../../errors/AppError'; 
import { AppError } from '../../shared/errors/app-error.js';

import { wrap, RequestContext } from '@mikro-orm/core';

const trackRepo = new TrackRepository();
const releaseRepo = new ReleaseRepository();
const artistRepo = new ArtistRepository();


export async function searchAll(req: Request, res: Response, next: NextFunction): Promise<void> {

  console.log('entre a la funcion de buscador')  
    try {
        const query = req.query.q;
        
        // Validamos que el usuario haya escrito algo en el buscador
        //if (typeof query !== 'string' || query.trim().length === 0) {
            //throw new AppError('Debes proporcionar un término de búsqueda (q)', 400);
        //}
        //separamos los parametros de la peticion en dos,lo que busca y el filtro
        const searchTerm = (req.query.q as string)?.trim() || '';
        const type = (req.query.type as string)?.toLowerCase();

        const em = RequestContext.getEntityManager();
        const trackRepo = em.getRepository(Track);
        const artistRepo = em.getRepository(Artist);
        const releaseRepo = em.getRepository(Release);

        // creamos las listas donde se guardan los datos en cada caso
        let tracks: Track[] = [];
        let artists: Artist[] = [];
        let releases: Release[] = [];

        if (!type || type === 'tracks') {
          tracks = await trackRepo.searchByName(searchTerm);
        }
        if (!type || type === 'artists') {
          artists = await artistRepo.searchByName(searchTerm);
        }
        if (!type || type === 'releases') {
          releases = await releaseRepo.searchByName(searchTerm);
        }


        //  EL PASO DE PRUEBA: Imprimimos lo que trajo el repositorio
        console.log('--- LO QUE DEVUELVE EL REPOSITORIO de canciones---');
        console.log(tracks);
        console.log('--- LO QUE DEVUELVE EL REPOSITORIO de artistas ---');
        console.log(artists);
        console.log('--------------------------------------');
        console.log('--- LO QUE DEVUELVE EL REPOSITORIO de releases osea albums ---');
        console.log(releases);
        console.log('--------------------------------------');

        res.status(200).json({
            success: true,
            data: {
                tracks: tracks.map(t => wrap(t).toPOJO()),
                releases: releases.map(r => wrap(r).toPOJO()),
                artists: artists.map(a => wrap(a).toPOJO()),
            }
        });
    } catch (error) {
        next(error);
    }
}
