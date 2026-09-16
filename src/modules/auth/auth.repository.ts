import { RequestContext } from '@mikro-orm/core';

import { User } from '../users/user.entity.js';

interface CreateLocalUserData {
  username: string;
  fullName: string;
  email: string;
  passwordHash: string;
}
interface CreateSpotifyUserData {
  spotifyId: string;
  displayName: string | null;
}

function getEntityManager() {
  const em = RequestContext.getEntityManager();

  if (!em) {
    throw new Error('No hay un contexto de base de datos activo');
  }

  return em;
}

async function findByEmail(email: string): Promise<User | null> {
  return getEntityManager().findOne(User, { email });
}

async function createLocal(data: CreateLocalUserData): Promise<User> {
  const em = getEntityManager();

  const user = new User();
  user.username = data.username;
  user.fullName = data.fullName;
  user.email = data.email;
  user.passwordHash = data.passwordHash;
  user.category = 'USER';
  user.spotifyId = null;
  user.createdAt = new Date();

  await em.persistAndFlush(user);

  return user;
}
async function findById(id: number): Promise<User | null> {
  return getEntityManager().findOne(User, { id });
}
async function findBySpotifyId(
  spotifyId: string,
): Promise<User | null> {
  return getEntityManager().findOne(User, { spotifyId });
}

async function createSpotify(
  data: CreateSpotifyUserData,
): Promise<User> {
  const em = getEntityManager();

  const fallbackName = `spotify_${data.spotifyId}`.slice(0, 255);
  const name = data.displayName ?? fallbackName;

  const user = new User();
  user.username = name;
  user.fullName = name;
  user.email = null;
  user.passwordHash = null;
  user.spotifyId = data.spotifyId;
  user.category = 'USER';
  user.createdAt = new Date();

  await em.persistAndFlush(user);

  return user;
}
export const authRepository = {
  findByEmail,
  findById,
  findBySpotifyId,
  createLocal,
  createSpotify,
};