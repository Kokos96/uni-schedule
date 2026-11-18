import { LnuAdapter } from './lnu/lnuAdapter';
import { ManualUniversityAdapter } from './manual/manualAdapter';
import type { UniversityAdapter, UniversityMeta } from './types';

const lnuAdapter = new LnuAdapter();
const manualAdapter = new ManualUniversityAdapter();

const ADAPTERS: readonly UniversityAdapter[] = [lnuAdapter, manualAdapter];

const ADAPTER_MAP = new Map<string, UniversityAdapter>(
  ADAPTERS.map((adapter) => [adapter.meta.id, adapter])
);

export function listUniversities(): UniversityMeta[] {
  return ADAPTERS.map((adapter) => adapter.meta);
}

export function getUniversityAdapter(id: string): UniversityAdapter | undefined {
  return ADAPTER_MAP.get(id);
}
