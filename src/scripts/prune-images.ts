import { MikroORM } from '@mikro-orm/postgresql';
import config from '../config/mikro-orm.config.js';
import { ImageService } from '../modules/profiles/image.service.js';

const orm = await MikroORM.init(config);
try { console.log(`Imágenes eliminadas: ${await new ImageService(orm.em.fork()).prune()}`); }
finally { await orm.close(true); }
