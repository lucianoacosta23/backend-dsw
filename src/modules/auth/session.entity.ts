import {
  Entity,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';

@Entity({ tableName: 'session' })
export class Session {
  @PrimaryKey({ type: 'string', columnType: 'varchar' })
  sid!: string;

  @Property({ type: 'json', columnType: 'json' })
  sess!: Record<string, unknown>;

  @Index({ name: 'IDX_session_expire' })
  @Property({ type: 'Date', columnType: 'timestamp(6)' })
  expire!: Date;
}