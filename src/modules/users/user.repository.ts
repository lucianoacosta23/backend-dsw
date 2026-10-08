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

  // Compara el nombre completo sin distinguir mayúsculas.
  // El parámetro evita interpolar datos del usuario en el SQL.
  const rows: Array<{ id: number }> = await em
    .getConnection()
    .execute(
      `
        SELECT id
        FROM "user"
        WHERE LOWER(username) = LOWER(?)
        ORDER BY id ASC
        LIMIT 1
      `,
      [username.trim()],
    );

  const match = rows[0];

  if (!match) {
    return null;
  }

  return em.findOne(User, { id: match.id });
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