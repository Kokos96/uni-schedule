# Інтеграція університетських розкладів (`src/integrations/universities/`)

## 1. Архітектура адаптерів

Уся логіка отримання розкладу з університетів ізольована в `src/integrations/universities/`:

- `types.ts` — спільний контракт `UniversityAdapter`, моделі `Faculty`, `Program`, `Course`, `Group`, `Subgroup`, `StudentSelection`, `ScheduleLesson`, `NormalizedSchedule`.
- `registry.ts` — реєстр доступних адаптерів (`listUniversities()`, `getUniversityAdapter(id)`).
- `normalizers/scheduleNormalizer.ts` — стабільна генерація `lessonId` та перетворення `NormalizedSchedule` у формат UI (`ScheduleDay[]`, `Teacher[]`, `Classroom[]`, `datedLessonsByIso`).
- `lnu/` — інтеграція Львівського національного університету імені Івана Франка (`cp1251.ts`, `lnuParser.ts`, `lnuAdapter.ts`).
- `manual/` — чесний fallback-адаптер (`manual_only`) для університетів, чиє джерело розкладу ще не підключено.

---

## 2. Як працює інтеграція ЛНУ

- Джерело: система «ПС-Розклад» (`https://dekanat.lnu.edu.ua/cgi-bin/timetable.cgi`).
- Кодування: `windows-1251` (`cp1251`) — реалізовано чистим TS-модулем `lnu/cp1251.ts` без Node-залежностей (працює в браузері та Cloudflare Workers).
- Список груп: `GET ?n=701&lev=142` повертає JSON `{ suggestions: string[] }` із назвами всіх груп ЛНУ (числові ID груп не потрібні).
- Розклад групи: `POST ?n=700` із `group=<cp1251>` та датами `sdate`/`edate` (`DD.MM.YYYY`).
- Парсер `lnuParser.ts` (технічний референс селекторів: `frankov-dev/CrutchShed`, реалізовано з нуля на TypeScript) розбирає `<h4>` дати, табличні рядки `<tr>` і блоки `.p_name`, `.p_type_name`, `.t_name`, `.gr2_name`, `.room_name`.

---

## 3. Стабільність `lessonId` та історія відвідуваності

Функція `buildStableLessonId()` формує ID виключно за координатами:
`(universityId, groupId, dayOfWeek, pairNumber, normalizedSubjectSlug, subgroup)`.

Ім'я викладача, аудиторія та корпус **навмисно виключені** з `lessonId`, щоб заміна викладача або перенесення аудиторії не руйнували історію відвідуваності студента.

---

## 4. Як додати новий університет

1. Створити папку `src/integrations/universities/<uni-id>/`.
2. Реалізувати клас, що імплементує `UniversityAdapter` (`meta`, `getFaculties`, `getCourses`, `getGroups`, `fetchSchedule`).
3. Повернути нормалізований `NormalizedSchedule`, використовуючи `buildStableLessonId()`.
4. Зареєструвати екземпляр у `src/integrations/universities/registry.ts`.

---

## 5. Поточні обмеження Етапу №2

- Запити з браузера напряму на `dekanat.lnu.edu.ua` можуть блокуватися політикою **CORS** на стороні університетського сервера. Проксування, спільне кешування для груп та серверна синхронізація будуть розгорнуті на **Етапі №3 (Cloudflare Worker + D1)**.
- Вбудований розклад `ФЕП-33с` (`src/data/schedule.json`) залишається активним за замовчуванням для повної зворотної сумісності зі старими записами `localStorage`.
