import { RequestContext } from '@mikro-orm/core';
import { User } from './user.entity.js';
export interface CreateUserInput {
  username: string;
  fullName: string;
  email: string;
  spotifyId: string;
}
export interface UpdateUserInput {
  username?: string;
  fullName?: string;
  email?: string;
}
export class UserRepository {
  async findAll(): Promise<User[]> {
    const em = RequestContext.getEntityManager();

    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }

    return em.find(User, {});
  }
  async create(data: CreateUserInput): Promise<User> {
  const em = RequestContext.getEntityManager();

  if (!em) {
    throw new Error('No hay un contexto de base de datos activo');
  }

  const user = new User();

  user.username = data.username;
  user.fullName = data.fullName;
  user.email = data.email;
  user.spotifyId = data.spotifyId;
  user.category = 'USER';

  await em.persistAndFlush(user);

  return user;
}
async findById(id: number): Promise<User | null> {
  const em = RequestContext.getEntityManager();

  if (!em) {
    throw new Error('No hay un contexto de base de datos activo');
  }

  return em.findOne(User, { id });
}
async update(
  id: number,
  data: UpdateUserInput,
): Promise<User | null> {
  const em = RequestContext.getEntityManager();

  if (!em) {
    throw new Error('No hay un contexto de base de datos activo');
  }

  const user = await em.findOne(User, { id });

  if (!user) {
    return null;
  }

  if (data.username !== undefined) {
    user.username = data.username;
  }

  if (data.fullName !== undefined) {
    user.fullName = data.fullName;
  }

  if (data.email !== undefined) {
    user.email = data.email;
  }

  await em.flush();

  return user;
}
async delete(id: number): Promise<boolean> {
  const em = RequestContext.getEntityManager();

  if (!em) {
    throw new Error('No hay un contexto de base de datos activo');
  }

  const user = await em.findOne(User, { id });

  if (!user) {
    return false;
  }

  await em.removeAndFlush(user);

  return true;
}
}