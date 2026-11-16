import type { DocIR } from './ir.ts';
import type { DocSettings } from './settings.ts';

export interface Diagnostic {
  level: 'info' | 'warn' | 'error';
  msg: string;
  line?: number;
  page?: number;
}

export interface Capabilities {
  download: boolean;
  pageModel: boolean;
  needsUserPrintDialog: boolean;
}

export type ExportResult =
  | { kind: 'blob'; blob: Blob; filename: string }
  | { kind: 'print-dialog' };

export interface PreviewResult {
  pages: number;
  diagnostics: Diagnostic[];
}

export interface Backend {
  id: string;
  label: string;
  capabilities: Capabilities;
  init(signal: AbortSignal): Promise<void>;
  preview(
    doc: DocIR,
    s: DocSettings,
    host: HTMLElement,
    signal: AbortSignal
  ): Promise<PreviewResult>;
  export(doc: DocIR, s: DocSettings, signal: AbortSignal): Promise<ExportResult>;
}
