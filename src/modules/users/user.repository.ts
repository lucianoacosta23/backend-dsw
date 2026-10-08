import { LockMode, RequestContext } from '@mikro-orm/core';
import { ProfileImage } from '../profiles/profile-image.entity.js';
import { ImageService } from '../profiles/image.service.js';
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

    user.username = data.username.trim().toLowerCase();
    user.fullName = data.fullName.trim();
    user.email = data.email.trim().toLowerCase();
    user.spotifyId = data.spotifyId.trim();
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
      user.username = data.username.trim().toLowerCase();
    }

    if (data.fullName !== undefined) {
      user.fullName = data.fullName.trim();
    }

    if (data.email !== undefined) {
      user.email = data.email.trim().toLowerCase();
    }

    await em.flush();

    return user;
  }

  //esta funcion compra que un nombre de ususuario sea igual a otro 
  async findByUsername(username: string): Promise<User | null> {
    const em = RequestContext.getEntityManager();

    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }

    return em.findOne(User, { username: username.trim().toLowerCase() });
  }


  async delete(id: number): Promise<boolean> {
    const em = RequestContext.getEntityManager();

    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }

    const images = await em.transactional(async tx => {
      const user = await tx.findOne(User, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
      if (!user) return null;
      const images = await tx.find(ProfileImage, { owner: id });
      await tx.removeAndFlush(user);
      return images.map(image => image.id!);
    });
    if (images === null) return false;
    await new ImageService(em).cleanupSafely(images);
    return true;
  }

  //Esta funcion busca nombres similares, a diferencia de la funcion de arriba que busca exactamente el mismo nombre
  async searchByName(searchTerm: string): Promise<User[]> {
  const em = RequestContext.getEntityManager();
  if (!em) throw new Error('No hay un contexto de base de datos activo');

  return await em.find(User, {
    $or: [
      { username: { $ilike: `%${searchTerm}%` } }
    ]
  });
  }
}
