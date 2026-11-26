/**
 * Canonical Release Metadata Catalog — Single Source of Truth for Uni Schedule.
 *
 * Shared across:
 * - Frontend («Що нового?», «Історія оновлень», offline fallback, installed version)
 * - Cloudflare Worker API (`GET /api/releases*`, protected release push dispatch)
 * - CLI release tool (`scripts/publish-release.ts`)
 */

export const INSTALLED_APP_VERSION = '4.3.0';

export type ReleasePublicationStatus = 'draft' | 'published';

export interface ReleaseEntry {
  /** Stable unique release identifier (e.g. `rel_4_3_0`). */
  id: string;
  /** Strict SemVer string (`MAJOR.MINOR.PATCH`). */
  version: string;
  /** Short English/product release name. */
  title: string;
  /** User-facing Ukrainian headline. */
  ukTitle: string;
  /** Concise user-facing summary in Ukrainian. */
  summary: string;
  /** ISO date (`YYYY-MM-DD`) when published, or `null` while draft. */
  publishedAt: string | null;
  /** Publication lifecycle state: `draft` releases are hidden from end users until published. */
  publicationStatus: ReleasePublicationStatus;
  /** User-facing new features (empty array hides the section). */
  features: readonly string[];
  /** User-facing improvements (empty array hides the section). */
  improvements: readonly string[];
  /** User-facing fixes (empty array hides the section). */
  fixes: readonly string[];
  /** Web Push notification title template. */
  notificationTitle: string;
  /** Web Push notification body template. */
  notificationBody: string;
  /** Verified GitHub Release URL (only for actually published GitHub releases). */
  githubReleaseUrl?: string;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function isValidSemver(version: string): boolean {
  return SEMVER_RE.test(version.trim());
}

export function parseSemver(version: string): [number, number, number] | null {
  const match = version.trim().match(SEMVER_RE);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Compares two SemVer strings numerically (never lexicographically):
 * - Returns > 0 if `a > b` (e.g. `4.10.0` > `4.9.0`, `4.3.1` > `4.3.0`)
 * - Returns < 0 if `a < b`
 * - Returns 0 if equal
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  if (pa[1] !== pb[1]) return pa[1] - pb[1];
  return pa[2] - pb[2];
}

/**
 * Canonical catalog built exclusively from verified project releases and docs/releases/*.md.
 * Note: v4.3.0 remains `draft` with `publishedAt: null` until actual production publication.
 */
export const RELEASES_CATALOG: readonly ReleaseEntry[] = [
  {
    id: 'rel_4_3_0',
    version: '4.3.0',
    title: 'Experience & Communication Update',
    ukTitle: 'Оновлення інтерфейсу та нові можливості зв’язку',
    summary:
      'Uni Schedule отримав нову фірмову анімацію запуску Signature Calendar Reveal, зв’язок із розробником у Telegram, перегляд історії оновлень, вікно «Що нового?» та окремі push-сповіщення про вихід наступних версій.',
    publishedAt: null,
    publicationStatus: 'draft',
    features: [
      'Фірмова 3-секундна анімація запуску Signature Calendar Reveal із реальною датою дня та плавним розкриттям розкладу.',
      'Зв’язок із розробником у Telegram (@kost99_99) прямо з налаштувань застосунку.',
      'Вікно «Що нового?» для зручного перегляду змін після оновлення.',
      'Історія версій Uni Schedule з офлайн-доступом до попередніх релізів.',
      'Окремий перемикач «Новини та оновлення» для push-сповіщень про нові версії.',
    ],
    improvements: [
      'Синхронізована поява BottomNav і підтримка prefers-reduced-motion під час запуску.',
      'Захист від повторної доставки push-сповіщень про один і той самий реліз.',
      'Безпечне відкриття деталей релізу напряму після натискання на сповіщення.',
    ],
    fixes: [],
    notificationTitle: 'Uni Schedule v4.3.0',
    notificationBody:
      'Нова анімація запуску, історія оновлень, зв’язок із розробником та сповіщення про нові версії. Дізнайся, що нового!',
  },
  {
    id: 'rel_4_2_1',
    version: '4.2.1',
    title: 'Academic Schedule Integrity Update',
    ukTitle: 'Точність академічного розкладу та мовні підгрупи',
    summary:
      'Усунуто відображення зайвих паралельних пар у збірних мовних групах та додано персоналізацію підгруп і викладачів.',
    publishedAt: '2026-11-26',
    publicationStatus: 'published',
    features: [
      'Динамічний вибір мовних та паралельних підгруп (наприклад, перша й друга іноземна мова) у профілі.',
      'Швидкий перемикач «Перевірити заміни» у денному розкладі для перегляду прихованих паралельних занять.',
    ],
    improvements: [
      'Узгоджена фільтрація паралельних підгруп у Day View, Week View, офлайн-кеші та Push-сповіщеннях.',
      'Автоматичний захист від зникнення пар при заміні викладача.',
    ],
    fixes: [
      'Виправлено надлишкове відображення паралельних пар для ІНА-35с, ІНА-34с, ІНА-36с та ФЕП-13с.',
      'Збережено зворотну сумісність профілю та історії відвідуваності.',
    ],
    notificationTitle: 'Uni Schedule v4.2.1',
    notificationBody:
      'Додано вибір мовних і паралельних підгруп та швидку перевірку замін викладачів.',
    githubReleaseUrl: 'https://github.com/Kokos96/uni-schedule/releases/tag/v4.2.1',
  },
  {
    id: 'rel_4_2_0',
    version: '4.2.0',
    title: 'Premium Experience Update',
    ukTitle: 'Оновлена мобільна навігація та плавність інтерфейсу',
    summary:
      'Покращено роботу на iPhone, додано плавну нижню навігацію, що реагує на прокручування, та оновлено списки вибору факультету й групи.',
    publishedAt: '2026-11-26',
    publicationStatus: 'published',
    features: [
      'Оновлені списки вибору факультету, спеціальності та групи у зручному нижньому меню.',
      'Нижня навігація, що плавно компактно змінюється під час прокручування.',
    ],
    improvements: [
      'Усунуто автоматичний зум полів вводу на iPhone та покращено поведінку клавіатури.',
      'Оновлено фірмову заставку запуску для світлої та темної тем.',
    ],
    fixes: [
      'Виправлено перекриття випадаючих списків сусідніми картками в налаштуваннях.',
    ],
    notificationTitle: 'Uni Schedule v4.2.0',
    notificationBody: 'Оновлена мобільна навігація, покращені списки вибору та плавний запуск.',
    githubReleaseUrl: 'https://github.com/Kokos96/uni-schedule/releases/tag/v4.2.0',
  },
  {
    id: 'rel_4_1_1',
    version: '4.1.1',
    title: 'Academic Reliability Update',
    ukTitle: 'Надійність академічного каталогу та активації груп',
    summary:
      'Посилено фільтрацію факультетів і спеціальностей та стабілізовано завантаження розкладу груп.',
    publishedAt: '2026-11-25',
    publicationStatus: 'published',
    features: [
      'Окремий режим глобального пошуку груп по університету.',
    ],
    improvements: [
      'Точніша фільтрація груп за факультетом та спеціальністю.',
      'Стабільніша активація розкладу без зайвих повторних запитів.',
    ],
    fixes: [
      'Виправлено появу сторонніх груп у фільтрах факультетів.',
    ],
    notificationTitle: 'Uni Schedule v4.1.1',
    notificationBody: 'Покращено точність каталогу факультетів та надійність завантаження груп.',
    githubReleaseUrl: 'https://github.com/Kokos96/uni-schedule/releases/tag/v4.1.1',
  },
  {
    id: 'rel_4_1_0',
    version: '4.1.0',
    title: 'Motion & Native Interaction',
    ukTitle: 'Плавна анімація та нативна взаємодія',
    summary:
      'Оновлено іконки, перемикання вкладок та адаптивну нижню панель навігації.',
    publishedAt: '2026-11-25',
    publicationStatus: 'published',
    features: [],
    improvements: [
      'Усунуто вертикальні стрибки індикаторів та скролу при перемиканні вкладок.',
      'Узгоджено набір іконок та динамічну мобільну панель навігації.',
    ],
    fixes: [],
    notificationTitle: 'Uni Schedule v4.1.0',
    notificationBody: 'Плавніше перемикання вкладок та оновлена нижня навігація.',
    githubReleaseUrl: 'https://github.com/Kokos96/uni-schedule/releases/tag/v4.1.0',
  },
  {
    id: 'rel_4_0_0',
    version: '4.0.0',
    title: 'Native Mobile Experience & Academic Profiles',
    ukTitle: 'Академічні профілі та мобільний досвід',
    summary:
      'Додано онбординг першого запуску, підтримку кафедр для живих груп та оновлений мобільний інтерфейс.',
    publishedAt: '2026-11-25',
    publicationStatus: 'published',
    features: [
      'Онбординг першого запуску для швидкого вибору університету та групи.',
      'Підтримка поділу за кафедрами (СП / ОІТ / РКС / РКТ) у живих розкладах.',
    ],
    improvements: [
      'Покращений пошук академічних груп.',
    ],
    fixes: [],
    notificationTitle: 'Uni Schedule v4.0.0',
    notificationBody: 'Академічні профілі, онбординг та оновлений мобільний інтерфейс.',
    githubReleaseUrl: 'https://github.com/Kokos96/uni-schedule/releases/tag/v4.0.0',
  },
];

/**
 * Returns releases sorted newest-first by strict SemVer.
 * By default returns only `published` releases (hides unpublished `draft` release candidates).
 */
export function getReleases(
  options: { includeDraft?: boolean; catalog?: readonly ReleaseEntry[] } = {}
): ReleaseEntry[] {
  const source = options.catalog ?? RELEASES_CATALOG;
  const filtered = options.includeDraft
    ? [...source]
    : source.filter((r) => r.publicationStatus === 'published');
  return filtered.sort((a, b) => compareSemver(b.version, a.version));
}

export function getPublishedReleases(catalog: readonly ReleaseEntry[] = RELEASES_CATALOG): ReleaseEntry[] {
  return getReleases({ includeDraft: false, catalog });
}

export function getLatestPublishedRelease(
  catalog: readonly ReleaseEntry[] = RELEASES_CATALOG
): ReleaseEntry | null {
  return getPublishedReleases(catalog)[0] ?? null;
}

export function getReleaseByVersion(
  version: string,
  options: { includeDraft?: boolean; catalog?: readonly ReleaseEntry[] } = {}
): ReleaseEntry | null {
  const clean = version.trim().replace(/^v/i, '');
  if (!isValidSemver(clean)) return null;
  const list = getReleases(options);
  return list.find((r) => r.version === clean) ?? null;
}

export function buildReleaseNotificationPayload(release: ReleaseEntry): {
  title: string;
  body: string;
  tag: string;
  url: string;
} {
  const title = (release.notificationTitle || `Uni Schedule v${release.version}`).slice(0, 80);
  const body = (release.notificationBody || release.summary).slice(0, 180);
  return {
    title,
    body,
    tag: `release-${release.version}`,
    url: `/?view=release&version=${encodeURIComponent(release.version)}`,
  };
}
