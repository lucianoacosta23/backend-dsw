import type { Request, Response, NextFunction } from 'express';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import {
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { SpotifyAuthClient } from './spotify-auth.client.js';
import * as argon2 from 'argon2';
import type { User } from '../users/user.entity.js';
import { AppError } from '../../shared/errors/app-error.js';
import { authRepository } from './auth.repository.js';

function requiredText(
  value: unknown,
  field: string,
  maxLength = 255,
): string {
  if (typeof value !== 'string') {
    throw new AppError(`${field} es obligatorio y debe ser un texto`, 400);
  }

  const result = value.trim();

  if (result.length === 0 || result.length > maxLength) {
    throw new AppError(
      `${field} debe tener entre 1 y ${maxLength} caracteres`,
      400,
    );
  }

  return result;
}

function parseRegisterBody(body: unknown) {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new AppError('Debe enviar un objeto JSON', 400);
  }

  const data = body as Record<string, unknown>;
  const allowedFields = new Set([
    'username',
    'fullName',
    'email',
    'password',
  ]);

  if (Object.keys(data).some(key => !allowedFields.has(key))) {
    throw new AppError('El registro contiene campos no permitidos', 400);
  }

  const username = requiredText(data.username, 'username');
  const fullName = requiredText(data.fullName, 'fullName');
  const email = requiredText(data.email, 'email').toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('El email no tiene un formato válido', 400);
  }

  const password = data.password;

  if (typeof password !== 'string') {
    throw new AppError('password es obligatorio y debe ser un texto', 400);
  }

  // La contraseña se conserva exactamente como fue escrita.
  const passwordLength = Array.from(password).length;

if (passwordLength < 8 || passwordLength > 128) {
  throw new AppError(
    'La contraseña debe tener entre 8 y 128 caracteres',
    400,
  );
}

  return { username, fullName, email, password };
}

export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = parseRegisterBody(req.body);

    const existingUser = await authRepository.findByEmail(data.email);

    if (existingUser) {
      throw new AppError('Ya existe una cuenta con ese email', 409);
    }

    const passwordHash = await argon2.hash(data.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    const user = await authRepository.createLocal({
      username: data.username,
      fullName: data.fullName,
      email: data.email,
      passwordHash,
    });

    res.status(201).json({
      message: 'Usuario registrado correctamente',
      data: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        category: user.category,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    // También cubre dos registros simultáneos con datos únicos repetidos.
    if (error instanceof UniqueConstraintViolationException) {
      next(new AppError('Ya existe una cuenta con esos datos', 409));
      return;
    }

    next(error);
  }
}
function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    category: user.category,
    createdAt: user.createdAt,
  };
}

function parseLoginBody(body: unknown) {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new AppError('Debe enviar un objeto JSON', 400);
  }

  const data = body as Record<string, unknown>;

  if (
    Object.keys(data).some(
      key => key !== 'email' && key !== 'password',
    )
  ) {
    throw new AppError('El login contiene campos no permitidos', 400);
  }

  const email = requiredText(data.email, 'email').toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('El email no tiene un formato válido', 400);
  }

  if (
    typeof data.password !== 'string' ||
    data.password.length === 0 ||
    Array.from(data.password).length > 128
  ) {
    throw new AppError('Debe indicar una contraseña válida', 400);
  }

  return { email, password: data.password };
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie('jukeboxd.sid', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = parseLoginBody(req.body);

    const user = await authRepository.findByEmail(email);

    if (!user || !user.passwordHash) {
      throw new AppError('Email o contraseña incorrectos', 401);
    }

    const validPassword = await argon2.verify(
      user.passwordHash,
      password,
    );

    if (!validPassword) {
      throw new AppError('Email o contraseña incorrectos', 401);
    }

    if (user.id === undefined) {
      throw new Error('El usuario no tiene un ID persistido');
    }

    await regenerateSession(req);

    req.session.userId = user.id;

    await saveSession(req);

    res.setHeader('Cache-Control', 'no-store');

    res.status(200).json({
      message: 'Sesión iniciada correctamente',
      data: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
}

export async function me(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');

    const userId = req.session.userId;

    if (userId === undefined) {
      throw new AppError('Debe iniciar sesión', 401);
    }

    const user = await authRepository.findById(userId);

    if (!user) {
      await destroySession(req);
      clearSessionCookie(res);

      throw new AppError('La sesión ya no es válida', 401);
    }

    res.status(200).json({
      message: 'Usuario autenticado',
      data: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await destroySession(req);
    clearSessionCookie(res);

    res.setHeader('Cache-Control', 'no-store');
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
function createSpotifyAuthClient(): SpotifyAuthClient {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Faltan SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET o SPOTIFY_REDIRECT_URI',
    );
  }

  return new SpotifyAuthClient(
    clientId,
    clientSecret,
    redirectUri,
  );
}

function queryString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0
    ? value
    : null;
}

function validState(
  received: string,
  expected: string,
): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function spotifyLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const state = randomBytes(32).toString('hex');

    req.session.spotifyOauthState = state;
    await saveSession(req);

    const client = createSpotifyAuthClient();

    res.redirect(client.authorizationUrl(state));
  } catch (error) {
    next(error);
  }
}

export async function spotifyCallback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');

    const receivedState = queryString(req.query.state);
    const expectedState = req.session.spotifyOauthState;

    delete req.session.spotifyOauthState;
    await saveSession(req);

    if (
      !receivedState ||
      !expectedState ||
      !validState(receivedState, expectedState)
    ) {
      throw new AppError(
        'La validación de seguridad de Spotify falló',
        400,
      );
    }

    const spotifyError = queryString(req.query.error);

    if (spotifyError) {
      throw new AppError(
        spotifyError === 'access_denied'
          ? 'El usuario canceló la autorización de Spotify'
          : 'Spotify no pudo autorizar el acceso',
        400,
      );
    }

    const code = queryString(req.query.code);

    if (!code) {
      throw new AppError(
        'Spotify no devolvió un código de autorización',
        400,
      );
    }

    const client = createSpotifyAuthClient();
    const accessToken = await client.exchangeCode(code);
    const profile = await client.getCurrentProfile(accessToken);

    let user = await authRepository.findBySpotifyId(
      profile.accountId,
    );

    if (!user) {
      user = await authRepository.createSpotify({
        spotifyId: profile.accountId,
        displayName: profile.displayName,
      });
    }

    if (user.id === undefined) {
      throw new Error('El usuario no tiene un ID persistido');
    }

    await regenerateSession(req);

    req.session.userId = user.id;
    await saveSession(req);

    res.status(200).json({
      message: 'Sesión iniciada con Spotify correctamente',
      data: publicUser(user),
    });
  } catch (error) {
    if (error instanceof UniqueConstraintViolationException) {
      next(
        new AppError(
          'La cuenta de Spotify ya está vinculada a otro usuario',
          409,
        ),
      );
      return;
    }

    next(error);
  }
}