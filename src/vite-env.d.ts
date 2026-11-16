/// <reference types="vite/client" />

declare module '*.toml?raw' {
  const content: string;
  export default content;
}
declare module 'pagedjs' {
  export class Previewer {
    constructor(options?: Record<string, unknown>);
    preview(
      content?: string | DocumentFragment | HTMLElement,
      stylesheets?: Array<string | Record<string, string>>,
      renderTo?: HTMLElement
    ): Promise<{
      total: number;
      pages: Array<{ element: HTMLElement }>;
      performance: number;
      size: Record<string, unknown>;
    }>;
    polisher: {
      destroy(): void;
    };
    chunker: {
      stop(): void;
    };
  }
  export class Handler {
    chunker: unknown;
    polisher: unknown;
    caller: unknown;
    constructor(chunker?: unknown, polisher?: unknown, caller?: unknown);
    afterParsed?(parsed: DocumentFragment | HTMLElement): void;
    beforePageLayout?(page: unknown, content: unknown, breakToken: unknown, chunker: unknown): void;
    afterPageLayout?(
      pageElement: HTMLElement,
      page: unknown,
      breakToken: { node: Node | null; offset?: number } | undefined,
      chunker: unknown
    ): void;
    afterRendered?(pages: unknown[], chunker: unknown): void;
  }
  export function registerHandlers(...handlers: Array<typeof Handler>): void;
}
