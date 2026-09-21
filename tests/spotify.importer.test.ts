import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { MikroORM } from '@mikro-orm/postgresql';
import type {
  EventArgs,
  EventSubscriber,
} from '@mikro-orm/core';

import testConfig from './mikro-orm.test.config.js';
import { Artist } from '../src/modules/artists/artist.entity.js';
import { Release } from '../src/modules/releases/release.entity.js';
import { Track } from '../src/modules/tracks/track.entity.js';
import { SpotifyClient } from '../src/modules/spotify/spotify.client.js';
import { SpotifyImporter } from '../src/modules/spotify/spotify.importer.js';

function fakeSpotifyId(): string {
  return randomBytes(11).toString('hex');
}

test(
  'revierte inserciones y modificaciones si falla la importación',
  async t => {
    assert.equal(testConfig.dbName, 'Nukeboxd_test');

    const orm = await MikroORM.init(testConfig);

    const existingArtistId = fakeSpotifyId();
    const newArtistId = fakeSpotifyId();
    const albumId = fakeSpotifyId();
    const trackId = fakeSpotifyId();

    const originalName = 'Artista antes de la importación';
    const forcedError = new Error('Fallo controlado después del INSERT');

    let trackWasInserted = false;
    let correctDatabase = false;

    try {
      // Verificamos la base antes de escribir datos.
      const database = await orm.em.getConnection().execute<
        Array<{ name: string }>
      >('select current_database() as name');

      assert.equal(database[0]?.name, 'Nukeboxd_test');
      correctDatabase = true;

      // Este artista existe antes de comenzar la importación.
      const setupEm = orm.em.fork();

      const existingArtist = new Artist();
      existingArtist.spotifyId = existingArtistId;
      existingArtist.name = originalName;

      await setupEm.persistAndFlush(existingArtist);

      const client = new SpotifyClient(
        'client-id-ficticio',
        'client-secret-ficticio',
      );

      // El importador recibirá estos datos sin consultar Spotify.
      t.mock.method(client, 'getAlbumWithTracks', async () => ({
        album: {
          id: albumId,
          name: 'Álbum para probar rollback',
          album_type: 'album',
          images: [],
          release_date: '2026-09-21',
          release_date_precision: 'day',
          artists: [
            {
              id: existingArtistId,
              name: 'Nombre cambiado durante la importación',
            },
            {
              id: newArtistId,
              name: 'Artista nuevo de la importación',
            },
          ],
        },
        tracks: [
          {
            id: trackId,
            name: 'Pista para probar rollback',
            duration_ms: 180000,
            disc_number: 1,
            track_number: 1,
            explicit: false,
            artists: [
              {
                id: existingArtistId,
                name: 'Nombre cambiado durante la importación',
              },
              {
                id: newArtistId,
                name: 'Artista nuevo de la importación',
              },
            ],
          },
        ],
      }));

      // Este evento ocurre después del INSERT,
      // mientras la transacción todavía está abierta.
      const failureSubscriber: EventSubscriber<Track> = {
        getSubscribedEntities: () => [Track],

        afterCreate(args: EventArgs<Track>): void {
          if (args.entity.spotifyId === trackId) {
            trackWasInserted = true;
            throw forcedError;
          }
        },
      };

      orm.em.getEventManager().registerSubscriber(
        failureSubscriber,
      );

      const importer = new SpotifyImporter(
        client,
        orm.em.fork(),
      );

      await assert.rejects(
        () => importer.importAlbum(albumId),
        (error: unknown) => error === forcedError,
      );

      assert.equal(
        trackWasInserted,
        true,
        'La prueba debe fallar después de insertar la pista',
      );

      // Usamos un contexto nuevo para consultar lo que quedó en la BD.
      const verificationEm = orm.em.fork();

      assert.equal(
        await verificationEm.count(Release, {
          spotifyId: albumId,
        }),
        0,
        'No debe quedar el lanzamiento',
      );

      assert.equal(
        await verificationEm.count(Track, {
          spotifyId: trackId,
        }),
        0,
        'No debe quedar la pista',
      );

      assert.equal(
        await verificationEm.count(Artist, {
          spotifyId: newArtistId,
        }),
        0,
        'No debe quedar el artista nuevo',
      );

      const preservedArtist = await verificationEm.findOneOrFail(
        Artist,
        { spotifyId: existingArtistId },
      );

      assert.equal(
        preservedArtist.name,
        originalName,
        'El artista existente debe conservar su nombre original',
      );
    } finally {
      try {
        if (correctDatabase) {
          // Limpiamos solo los registros identificados por esta prueba.
          // También se ejecuta si alguna comprobación falla.
          const cleanupEm = orm.em.fork();

          await cleanupEm.nativeDelete(Track, {
            spotifyId: trackId,
          });

          await cleanupEm.nativeDelete(Release, {
            spotifyId: albumId,
          });

          await cleanupEm.nativeDelete(Artist, {
            spotifyId: {
              $in: [existingArtistId, newArtistId],
            },
          });
        }
      } finally {
        await orm.close();
      }
    }
  },
);