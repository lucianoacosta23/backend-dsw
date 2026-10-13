import { AppError } from '../../shared/errors/app-error.js';
import { enabledAccountFilter } from '../users/user-status.js';
import { lockEnabledUser, AccountRestrictionError } from '../users/account-access.js';
import { RequestContext } from '@mikro-orm/core';

import { Follow } from './follow.entity.js';
import { User } from '../users/user.entity.js';

export class FollowRepository {
  private getEntityManager() {
    const em = RequestContext.getEntityManager();

    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }

    return em;
  }
  // Devuelve los contadores y la relación entre el perfil y quien lo visita.
  async getProfileStats(profileId: number, viewerId: number | null) {
    const em = this.getEntityManager();
    const isOwnProfile = profileId === viewerId;

    const [followersCount, followingCount, isFollowing, followsMe] =
      await Promise.all([
        // Personas que siguen al usuario del perfil.
        em.count(Follow, { followed: profileId, follower: enabledAccountFilter() }),

        // Personas que el usuario del perfil sigue.
        em.count(Follow, { follower: profileId, followed: enabledAccountFilter() }),

        // ¿Yo sigo al usuario de este perfil?
        isOwnProfile || viewerId === null
          ? Promise.resolve(false)
          : this.exists(viewerId, profileId),

        // ¿El usuario de este perfil me sigue a mí?
        isOwnProfile || viewerId === null
          ? Promise.resolve(false)
          : this.exists(profileId, viewerId),
      ]);

    return {
      followersCount,
      followingCount,
      isFollowing,
      followsMe,
      isOwnProfile,
    };
  }

  async create(
    followerId: number,
    followedId: number,
  ): Promise<Follow> {
    const em = this.getEntityManager();

    return em.transactional(async tx => {
      for (const id of [...new Set([followerId, followedId])].sort((a, b) => a - b)) {
        try { await lockEnabledUser(tx, id); }
        catch (error) {
          if (id === followedId && error instanceof AccountRestrictionError) {
            throw new AppError('Usuario no disponible para seguir', 404);
          }
          throw error;
        }
      }
      const follower = await tx.findOne(User, { id: followerId });
    const followed = await tx.findOne(User, { id: followedId });

    if (!follower) {
      throw new Error('El usuario follower no existe');
    }

    if (!followed) {
      throw new Error('El usuario seguido no existe');
    }

    const follow = new Follow();

    follow.follower = follower;
    follow.followed = followed;

    await tx.persistAndFlush(follow);

    return follow;
    });
  }

  async delete(
    followerId: number,
    followedId: number,
  ): Promise<boolean> {
    const em = this.getEntityManager();

    const follow = await em.findOne(Follow, {
      follower: followerId,
      followed: followedId,
    });

    if (!follow) {
      return false;
    }

    await em.removeAndFlush(follow);

    return true;
  }

  async exists(
    followerId: number,
    followedId: number,
  ): Promise<boolean> {
    const em = this.getEntityManager();

    const follow = await em.findOne(Follow, {
      follower: { id: followerId, ...enabledAccountFilter() },
      followed: { id: followedId, ...enabledAccountFilter() },
    });

    return !!follow;
  }
}
