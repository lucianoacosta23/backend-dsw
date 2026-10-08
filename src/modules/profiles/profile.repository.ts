import { LockMode, RequestContext, type EntityManager } from '@mikro-orm/core';
import { AppError } from '../../shared/errors/app-error.js';
import { User } from '../users/user.entity.js';
import { Release, ReleaseType } from '../releases/release.entity.js';
import { Track } from '../tracks/track.entity.js';
import { FollowRepository } from '../follows/follow.repository.js';
import { ProfileImage, ImagePurpose } from './profile-image.entity.js';
import { UserFavoriteRelease } from './user-favorite-release.entity.js';
import { UserFavoriteTrack } from './user-favorite-track.entity.js';
import { LocalImageStorage } from './image.storage.js';
import { ImageService } from './image.service.js';
import type { ProfilePatch } from './profile.validation.js';

export function profileEntityManager(): EntityManager {
  const em = RequestContext.getEntityManager();
  if (!em) throw new Error('No hay un contexto de base de datos activo');
  return em;
}

export class ProfileRepository {
  async read(selector: { id: number } | { username: string }, viewerId: number | null) {
    const em = profileEntityManager();
    const user = await em.findOne(User, selector, { populate: ['avatarImage', 'coverImage'], refresh: true });
    if (!user) throw new AppError('Usuario no encontrado', 404);
    const [releases, tracks, stats] = await Promise.all([
      em.find(UserFavoriteRelease, { user: user.id! }, { populate: ['release.artists'], orderBy: { position: 'ASC' } }),
      em.find(UserFavoriteTrack, { user: user.id! }, { populate: ['track.artists', 'track.release'], orderBy: { position: 'ASC' } }),
      new FollowRepository().getProfileStats(user.id!, viewerId),
    ]);
    const storage = new LocalImageStorage();
    return {
      id: user.id, username: user.username, fullName: user.fullName, createdAt: user.createdAt,
      avatarUrl: user.avatarImage ? storage.url(user.avatarImage.key) : null,
      coverUrl: user.coverImage ? storage.url(user.coverImage.key) : null,
      favoriteReleases: releases.map(({ release }) => ({
        id: release.id, name: release.name, type: release.type, imageUrl: release.imageUrl,
        artists: release.artists.getItems().map(({ id, name }) => ({ id, name })),
      })),
      favoriteTracks: tracks.map(({ track }) => ({
        id: track.id, name: track.name, durationMs: track.durationMs,
        artists: track.artists.getItems().map(({ id, name }) => ({ id, name })),
        release: { id: track.release.id, name: track.release.name, imageUrl: track.release.imageUrl },
      })),
      ...stats,
    };
  }

  async update(userId: number, input: ProfilePatch) {
    const em = profileEntityManager();
    const oldImages = await em.transactional(async tx => {
      const user = await tx.findOne(User, userId, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
      if (!user) throw new AppError('Usuario no encontrado', 404);
      const old: number[] = [];
      for (const [field, value, purpose] of [
        ['avatarImage', input.avatarImageId, ImagePurpose.AVATAR],
        ['coverImage', input.coverImageId, ImagePurpose.COVER],
      ] as const) {
        if (value === undefined) continue;
        let image: ProfileImage | null = null;
        if (value !== null) {
          image = await tx.findOne(ProfileImage, value, { refresh: true });
          if (!image) throw new AppError('Imagen no disponible', 400);
          if (image.owner?.id !== userId) throw new AppError('Imagen no disponible para esta cuenta', 403);
          if (image.purpose !== purpose) throw new AppError('La finalidad de la imagen no corresponde al campo', 400);
        }
        if (user[field]?.id && user[field]?.id !== value) old.push(user[field]!.id!);
        user[field] = image;
      }
      if (input.favoriteReleaseIds !== undefined) {
        // Ordenar los bloqueos evita interbloqueos entre usuarios. FOR SHARE también
        // serializa con cambios de tipo de catálogo y con su eliminación.
        const releases = input.favoriteReleaseIds.length ? await tx.find(Release, { id: { $in: input.favoriteReleaseIds } }, {
          orderBy: { id: 'ASC' }, lockMode: LockMode.PESSIMISTIC_READ, refresh: true,
        }) : [];
        if (releases.length !== input.favoriteReleaseIds.length || releases.some(r => r.type === ReleaseType.SINGLE)) {
          throw new AppError('Los proyectos favoritos deben existir y no pueden ser SINGLE', 400);
        }
        await tx.nativeDelete(UserFavoriteRelease, { user: userId });
        input.favoriteReleaseIds.forEach((id, index) => {
          const favorite = new UserFavoriteRelease();
          Object.assign(favorite, { user, release: tx.getReference(Release, id), position: index + 1 });
          tx.persist(favorite);
        });
      }
      if (input.favoriteTrackIds !== undefined) {
        const tracks = input.favoriteTrackIds.length ? await tx.find(Track, { id: { $in: input.favoriteTrackIds } }, {
          orderBy: { id: 'ASC' }, lockMode: LockMode.PESSIMISTIC_READ, refresh: true,
        }) : [];
        if (tracks.length !== input.favoriteTrackIds.length) throw new AppError('Todas las canciones favoritas deben existir', 400);
        await tx.nativeDelete(UserFavoriteTrack, { user: userId });
        input.favoriteTrackIds.forEach((id, index) => {
          const favorite = new UserFavoriteTrack();
          Object.assign(favorite, { user, track: tx.getReference(Track, id), position: index + 1 });
          tx.persist(favorite);
        });
      }
      await tx.flush();
      return old;
    });
    await new ImageService(em).cleanupSafely(oldImages);
    return this.read({ id: userId }, userId);
  }
}
