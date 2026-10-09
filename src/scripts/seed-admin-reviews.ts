import { MikroORM } from '@mikro-orm/postgresql';
import { RequestContext } from '@mikro-orm/core';
import config from '../config/mikro-orm.config.js';
import { User } from '../modules/users/user.entity.js';
import { Release, ReleaseDatePrecision, ReleaseType } from '../modules/releases/release.entity.js';
import { Review } from '../modules/reviews/review.entity.js';
import { ReviewReport } from '../modules/reports/report.entity.js';
import { ReviewReportRepository } from '../modules/reports/report.repository.js';

const scenarios = [
  {
    username: 'demo_admin_review_mala', count: 4, rating: 1,
    text: '[DEMO ADMIN · 4 reportes] Este álbum es una basura y quienes lo escuchan no tienen idea de música. No pierdan el tiempo con esta porquería.',
    reason: 'HARASSMENT' as const,
    details: 'Reseña de prueba: comentarios ofensivos hacia quienes escuchan el álbum.',
  },
  {
    username: 'demo_admin_review_muy_mala', count: 10, rating: 0.5,
    text: '[DEMO ADMIN · 10 reportes] El artista es un inútil y sus fans son unos idiotas. Dejen de escuchar esta basura. COMPREN MIS PRODUCTOS: publicidad repetida, publicidad repetida, publicidad repetida.',
    reason: 'SPAM' as const,
    details: 'Reseña de prueba: insultos al artista y a sus fans, junto con publicidad repetida.',
  },
  {
    username: 'demo_admin_review_buena_2', count: 2, rating: 4.5,
    text: '[DEMO ADMIN · 2 reportes] Muy buen álbum: la producción es cuidada, las melodías se recuerdan y el cierre reúne lo mejor del disco. Lo recomiendo.',
    reason: 'OTHER' as const,
    details: 'Reporte de prueba sobre una reseña respetuosa; no hay una infracción evidente.',
  },
  {
    username: 'demo_admin_review_buena_1', count: 1, rating: 5,
    text: '[DEMO ADMIN · 1 reporte] Un disco excelente para escuchar de principio a fin. Me encantaron los arreglos y la variedad de canciones. Una de mis escuchas favoritas.',
    reason: 'OTHER' as const,
    details: 'Reporte de prueba sobre una opinión positiva y respetuosa.',
  },
];

async function seed() {
  const orm = await MikroORM.init(config);
  try {
    const results = await orm.em.fork().transactional(async em => {
      async function demoUser(username: string) {
        const existing = await em.findOne(User, { username });
        if (existing) return existing;
        const user = new User();
        user.username = username;
        user.fullName = 'Usuario de prueba de moderación';
        user.category = 'USER';
        // Sin credenciales: estas cuentas solo sirven como autores y reportantes.
        em.persist(user);
        return user;
      }

      let release = await em.findOne(Release, { id: { $gt: 0 } }, { orderBy: { id: 'asc' } });
      if (!release) {
        release = new Release();
        release.name = 'Álbum de prueba de moderación';
        release.type = ReleaseType.ALBUM;
        release.releaseDate = '2026';
        release.releaseDatePrecision = ReleaseDatePrecision.YEAR;
        em.persist(release);
      }
      const reporters: User[] = [];
      for (let i = 1; i <= 10; i++) {
        reporters.push(await demoUser(`demo_admin_reportante_${i}`));
      }
      const seeded = [];
      for (const scenario of scenarios) {
        const author = await demoUser(scenario.username);
        // No duplica datos ni revierte decisiones si se ejecuta nuevamente.
        const existing = author.id === undefined
          ? null
          : await em.findOne(Review, { author, text: scenario.text });
        if (existing) {
          seeded.push({ review: existing, created: false, expected: scenario.count });
          continue;
        }
        const review = new Review();
        review.author = author;
        review.release = release;
        review.text = scenario.text;
        review.rating = scenario.rating;
        review.createdAt = new Date();
        em.persist(review);
        for (const reporter of reporters.slice(0, scenario.count)) {
          const report = new ReviewReport();
          report.review = review;
          report.reporter = reporter;
          report.reason = scenario.reason;
          report.details = scenario.details;
          report.createdAt = new Date();
          em.persist(report);
        }
        seeded.push({ review, created: true, expected: scenario.count });
      }
      await em.flush();
      return seeded.map(item => ({
        id: item.review.id!, author: item.review.author.username,
        created: item.created, expected: item.expected, album: release.name,
      }));
    });

    await RequestContext.create(orm.em, async () => {
      const critical = await new ReviewReportRepository().findCriticalReviews();
      const em = RequestContext.getEntityManager()!;
      const summary = [];
      for (const result of results) {
        const pendingReports = await em.count(ReviewReport, { review: result.id, status: 'PENDING' });
        if (result.created && pendingReports !== result.expected) {
          throw new Error(`Cantidad inesperada de reportes para la reseña ${result.id}`);
        }
        const isCritical = critical.some(review => review.id === result.id);
        if (result.created && isCritical !== (result.expected >= 3)) {
          throw new Error(`Clasificación inesperada para la reseña ${result.id}`);
        }
        summary.push({ ...result, pendingReports, isCritical });
      }
      console.log(JSON.stringify(summary, null, 2));
    });
  } finally {
    await orm.close(true);
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Error al cargar datos de prueba');
  process.exitCode = 1;
});
