import { Entity, Enum, Index, ManyToOne, PrimaryKey, Property, type Rel } from '@mikro-orm/core';
import { User } from '../users/user.entity.js';

export enum ImagePurpose { AVATAR = 'avatar', COVER = 'cover' }

@Entity()
export class ProfileImage {
  @PrimaryKey({ type: 'number' }) id?: number;
  // Retener el registro tras borrar la cuenta permite reintentar la limpieza del archivo.
  @Index()
  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null' }) owner: Rel<User> | null = null;
  @Enum(() => ImagePurpose) purpose!: ImagePurpose;
  @Property({ type: 'string', unique: true }) key!: string;
  @Property({ type: 'string' }) format = 'webp';
  @Property({ type: 'integer' }) width!: number;
  @Property({ type: 'integer' }) height!: number;
  @Index()
  @Property({ type: 'Date' }) createdAt = new Date();
}
