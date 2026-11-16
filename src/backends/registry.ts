import type { Backend } from '../core/backend.ts';
import { HtmlPagedBackend } from './html-paged/index.ts';

const registry = new Map<string, Backend>();

function registerDefaultBackends(): void {
  const htmlPaged = new HtmlPagedBackend();
  registry.set(htmlPaged.id, htmlPaged);
}

registerDefaultBackends();

export function registerBackend(backend: Backend): void {
  registry.set(backend.id, backend);
}

export function listBackends(): Backend[] {
  return Array.from(registry.values());
}

export function getBackend(id?: string): Backend {
  if (id && registry.has(id)) {
    return registry.get(id)!;
  }
  return Array.from(registry.values())[0]!;
}
