import { Check,
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core';

import { User } from '../users/user.entity.js';


@Entity()
@Check({
  name: 'follow_no_self_follow',
  expression: 'follower_id <> followed_id',
})
@Unique({ properties: ['follower', 'followed'] })
export class Follow {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @ManyToOne(() => User, {
    fieldName: 'follower_id',
    deleteRule: 'cascade',
  })
  follower!: User;

  @ManyToOne(() => User, {
    fieldName: 'followed_id',
    deleteRule: 'cascade',
  })
  followed!: User;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}