import React, { useId, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  CheckCircle,
  ClipboardText,
  Copy,
  Database,
  DownloadSimple,
  FileJs,
  GitMerge,
  HardDrive,
  Trash,
  UploadSimple,
  Warning,
} from '@phosphor-icons/react';
import { AttendanceRecord, UserSettings } from '../../types';
import {
  BackupFormat,
  BackupValidationSuccess,
  UniScheduleBackupData,
} from '../../types/backup';
import { DeadlineItem, LessonNote } from '../../types/notes';
import {
  buildBackupPayload,
  formatBackupFilename,
  parseAndValidateBackup,
} from '../../utils/backup';
import { MetaChip } from '../ui/Badge';
import { GlassCard } from '../ui/GlassCard';
import { ModalDrawer } from '../ui/ModalDrawer';
import { useToast } from '../ui/Toast';

export interface BackupImportMeta {
  format: BackupFormat;
  isPartialAttendanceOnly: boolean;
}

export interface BackupSectionProps {
  attendanceRecords: readonly AttendanceRecord[];
  settings: UserSettings;
  notes: readonly LessonNote[];
  deadlines: readonly DeadlineItem[];
  onImportReplace: (data: UniScheduleBackupData, meta?: BackupImportMeta) => void;
  onImportMerge: (data: UniScheduleBackupData, meta?: BackupImportMeta) => void;
  onClearAll: () => void;
  className?: string;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const BackupSection: React.FC<BackupSectionProps> = ({
  attendanceRecords,
  settings,
  notes,
  deadlines,
  onImportReplace,
  onImportMerge,
  onClearAll,
  className,
}) => {
  const { toast } = useToast();
  const fileInputId = useId();
  const pasteTextareaId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [importError, setImportError] = useState<{
    message: string;
    details?: string[];
  } | null>(null);
  const [pendingImport, setPendingImport] = useState<BackupValidationSuccess | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const createSerializedBackup = () => {
    const payload = buildBackupPayload({
      attendance: [...attendanceRecords],
      settings,
      notes: [...notes],
      deadlines: [...deadlines],
    });
    return {
      filename: formatBackupFilename(),
      json: JSON.stringify(payload, null, 2),
    };
  };

  const handleDownloadJson = () => {
    const { filename, json } = createSerializedBackup();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Резервну копію завантажено', {
      description: filename,
    });
  };

  const handleCopyJson = async () => {
    const { json } = createSerializedBackup();
    const copied = await copyTextToClipboard(json);
    if (copied) {
      toast.success('JSON скопійовано в буфер обміну', {
        description: `Записів: ${attendanceRecords.length}, нотаток: ${notes.length}, дедлайнів: ${deadlines.length}`,
      });
    } else {
      toast.error('Не вдалося скопіювати JSON', {
        description: 'Скористайтеся завантаженням файлу нижче.',
      });
    }
  };

  const validateAndStageImport = (rawText: string) => {
    if (!rawText.trim()) {
      setImportError({
        message: 'Файл або поле введення порожнє. Вставте коректний JSON резервної копії.',
      });
      return;
    }

    const result = parseAndValidateBackup(rawText);
    if (!result.valid) {
      setImportError({
        message: result.error,
        details: result.details,
      });
      setPendingImport(null);
      return;
    }

    setImportError(null);
    setPendingImport(result);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const content = await file.text();
      validateAndStageImport(content);
    } catch {
      setImportError({
        message: 'Не вдалося прочитати вибраний файл.',
      });
    }
  };

  const handleApplyImport = (mode: 'merge' | 'replace') => {
    if (!pendingImport) return;
    const meta: BackupImportMeta = {
      format: pendingImport.format,
      isPartialAttendanceOnly: pendingImport.isPartialAttendanceOnly,
    };

    if (mode === 'merge') {
      onImportMerge(pendingImport.backup.data, meta);
      toast.success('Дані успішно об’єднано', {
        description: `Додано/оновлено відміток: ${pendingImport.counts.attendance}, нотаток: ${pendingImport.counts.notes}, дедлайнів: ${pendingImport.counts.deadlines}`,
      });
    } else {
      onImportReplace(pendingImport.backup.data, meta);
      toast.success('Усі дані замінено з копії', {
        description: `Відновлено відміток: ${pendingImport.counts.attendance}, нотаток: ${pendingImport.counts.notes}, дедлайнів: ${pendingImport.counts.deadlines}`,
      });
    }

    setPendingImport(null);
    setPastedJson('');
    setShowPasteBox(false);
    setImportError(null);
  };

  const handleConfirmClearAll = () => {
    onClearAll();
    setConfirmClearOpen(false);
    toast.info('Локальні дані очищено');
  };

  return (
    <GlassCard variant="glass" padding="lg" className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber/30 bg-amber-soft text-amber-fg">
            <Database weight="duotone" className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-serif text-sm font-semibold tracking-[-0.01em] text-ink">
              Резервна копія та перенесення
            </h3>
            <p className="text-xs text-ink-secondary">
              Експорт та імпорт у форматі JSON (v2 та v1)
            </p>
          </div>
        </div>

        <MetaChip variant="neutral" mono>
          {attendanceRecords.length + notes.length + deadlines.length} записів
        </MetaChip>
      </div>

      {/* Factual localStorage explanation */}
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface-elevated/55 p-3">
        <HardDrive weight="duotone" className="mt-0.5 h-4 w-4 shrink-0 text-amber-fg" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-ink-secondary">
          Усі ваші дані зберігаються локально в <span className="font-mono text-ink">localStorage</span> лише
          на цьому пристрої. Експорт у JSON дозволяє зробити резервну копію або перенести дані між
          телефоном і ноутбуком.
        </p>
      </div>

      {/* Current data summary chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <MetaChip variant="sage" mono>
          Відміток: {attendanceRecords.length}
        </MetaChip>
        <MetaChip variant="beige" mono>
          Нотаток: {notes.length}
        </MetaChip>
        <MetaChip variant="amber" mono>
          Дедлайнів: {deadlines.length}
        </MetaChip>
      </div>

      {/* Export JSON */}
      <div className="mt-4 space-y-2">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">
          Експорт даних
        </span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-amber/40 bg-amber-soft px-3.5 py-2 text-xs font-semibold text-amber-fg transition-colors hover:border-amber/65 hover:bg-amber/20 active:scale-[0.98]"
          >
            <DownloadSimple weight="regular" className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Завантажити JSON</span>
          </button>

          <button
            type="button"
            onClick={handleCopyJson}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-line bg-surface-elevated/80 px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:border-line-strong hover:bg-surface-elevated active:scale-[0.98]"
          >
            <Copy weight="regular" className="h-4 w-4 shrink-0 text-ink-secondary" aria-hidden="true" />
            <span>Копіювати JSON</span>
          </button>
        </div>
      </div>

      {/* Import JSON */}
      <div className="mt-4 space-y-2.5 border-t border-line/70 pt-4">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">
          Імпорт даних
        </span>

        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="sr-only"
        />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-line bg-surface-elevated/80 px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:border-amber/45 hover:bg-surface-elevated active:scale-[0.98]"
          >
            <UploadSimple weight="regular" className="h-4 w-4 shrink-0 text-amber-fg" aria-hidden="true" />
            <span>Обрати файл .json</span>
          </button>

          <button
            type="button"
            aria-expanded={showPasteBox}
            onClick={() => setShowPasteBox((prev) => !prev)}
            className={[
              'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors active:scale-[0.98]',
              showPasteBox
                ? 'border-amber/45 bg-amber-soft text-amber-fg'
                : 'border-line bg-surface-elevated/80 text-ink-secondary hover:border-line-strong hover:text-ink',
            ].join(' ')}
          >
            <ClipboardText weight="regular" className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Вставити JSON</span>
          </button>
        </div>

        {showPasteBox && (
          <div className="space-y-2 rounded-xl border border-line bg-surface-elevated/50 p-3">
            <label
              htmlFor={pasteTextareaId}
              className="block text-xs font-medium text-ink-secondary"
            >
              Вставте вміст резервної копії JSON:
            </label>
            <textarea
              id={pasteTextareaId}
              rows={4}
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              placeholder='{"schemaVersion": 2, "data": ...}'
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPasteBox(false);
                  setImportError(null);
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink"
              >
                Закрити
              </button>
              <button
                type="button"
                onClick={() => validateAndStageImport(pastedJson)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber/45 bg-amber-soft px-3 py-1.5 text-xs font-semibold text-amber-fg hover:bg-amber/20"
              >
                <FileJs weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Перевірити JSON</span>
              </button>
            </div>
          </div>
        )}

        {/* Validation Error Alert */}
        {importError && (
          <div
            role="alert"
            className="rounded-xl border border-terracotta/40 bg-terracotta-soft p-3 text-xs text-terracotta-fg"
          >
            <div className="flex items-start gap-2">
              <Warning weight="duotone" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold">{importError.message}</p>
                {importError.details && importError.details.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-ink-secondary">
                    {importError.details.map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clear All Data Danger Action */}
      <div className="mt-4 border-t border-line/70 pt-4">
        <button
          type="button"
          onClick={() => setConfirmClearOpen(true)}
          className="inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl border border-terracotta/30 bg-terracotta-soft/70 px-3.5 py-2 text-xs font-semibold text-terracotta-fg transition-colors hover:border-terracotta/55 hover:bg-terracotta-soft active:scale-[0.98]"
        >
          <Trash weight="regular" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Очистити всі дані на пристрої</span>
        </button>
      </div>

      {/* Import Confirmation ModalDrawer */}
      <ModalDrawer
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        title="Підтвердження імпорту"
        description="Оберіть режим застосування перевіреної резервної копії"
      >
        {pendingImport && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MetaChip variant="sage" icon={<CheckCircle weight="duotone" className="h-3 w-3" />}>
                JSON валідний
              </MetaChip>
              <MetaChip variant="amber" mono>
                {pendingImport.format === 'v2'
                  ? 'Формат v2.0'
                  : 'Формат v1 (лише відвідуваність)'}
              </MetaChip>
            </div>

            {pendingImport.warnings.length > 0 && (
              <div className="rounded-xl border border-amber/35 bg-amber-soft p-3 text-xs text-amber-fg">
                {pendingImport.warnings.map((warn, i) => (
                  <p key={i} className="leading-relaxed">
                    {warn}
                  </p>
                ))}
              </div>
            )}

            {/* Exact preview counts */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-line bg-surface-elevated/70 p-3">
                <span className="block text-[11px] text-ink-secondary">Відвідуваність</span>
                <span className="mt-0.5 block font-mono text-lg font-bold tabular-nums text-ink">
                  {pendingImport.counts.attendance}
                </span>
              </div>
              <div className="rounded-xl border border-line bg-surface-elevated/70 p-3">
                <span className="block text-[11px] text-ink-secondary">Нотатки</span>
                <span className="mt-0.5 block font-mono text-lg font-bold tabular-nums text-ink">
                  {pendingImport.counts.notes}
                </span>
              </div>
              <div className="rounded-xl border border-line bg-surface-elevated/70 p-3">
                <span className="block text-[11px] text-ink-secondary">Дедлайни</span>
                <span className="mt-0.5 block font-mono text-lg font-bold tabular-nums text-ink">
                  {pendingImport.counts.deadlines}
                </span>
              </div>
              <div className="rounded-xl border border-line bg-surface-elevated/70 p-3">
                <span className="block text-[11px] text-ink-secondary">Налаштування</span>
                <span className="mt-0.5 block text-sm font-semibold text-ink">
                  {pendingImport.counts.hasSettings ? 'Включено' : 'Відсутні'}
                </span>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-line/80 bg-surface/60 p-3 text-xs text-ink-secondary">
              <p>
                <strong className="text-ink">Об&apos;єднати (Merge):</strong> збереже наявні записи
                й додасть нові (при збігу ID перемагають новіші зміни).
              </p>
              <p>
                <strong className="text-terracotta-fg">Замінити все (Replace):</strong> повністю
                перезапише поточні дані вмістом резервної копії.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <button
                type="button"
                onClick={() => handleApplyImport('merge')}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl border border-sage/45 bg-sage-soft px-4 py-2 text-xs font-semibold text-sage-fg transition-colors hover:bg-sage/25 active:scale-[0.98]"
              >
                <GitMerge weight="regular" className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Об&apos;єднати (Merge)</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyImport('replace')}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl border border-terracotta/45 bg-terracotta-soft px-4 py-2 text-xs font-semibold text-terracotta-fg transition-colors hover:bg-terracotta/25 active:scale-[0.98]"
              >
                <ArrowsClockwise weight="regular" className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Замінити все (Replace)</span>
              </button>
            </div>
          </div>
        )}
      </ModalDrawer>

      {/* Clear All Confirmation ModalDrawer */}
      <ModalDrawer
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        title="Очистити всі дані?"
        description="Ця дія незворотна без попередньо збереженої резервної копії"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-terracotta/35 bg-terracotta-soft p-3.5 text-xs text-terracotta-fg">
            <Warning weight="duotone" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">
              Буде видалено всі відмітки відвідуваності ({attendanceRecords.length}), нотатки (
              {notes.length}) та дедлайни ({deadlines.length}) з пам&apos;яті цього браузера.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setConfirmClearOpen(false)}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-line bg-surface-elevated px-4 py-2 text-xs font-semibold text-ink hover:border-line-strong"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={handleConfirmClearAll}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-terracotta/50 bg-terracotta-soft px-4 py-2 text-xs font-semibold text-terracotta-fg hover:bg-terracotta/25"
            >
              <Trash weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Так, очистити все</span>
            </button>
          </div>
        </div>
      </ModalDrawer>
    </GlassCard>
  );
};
