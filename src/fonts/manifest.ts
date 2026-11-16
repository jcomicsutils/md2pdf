import '@fontsource/inter/400.css';
import '@fontsource/inter/400-italic.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/400-italic.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/400-italic.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/source-serif-4/700.css';

import interWoff2 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import jbMonoWoff2 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import sourceSerifWoff2 from '@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2?url';

export interface FontEntry {
  woff2: string;
  ttf?: string;
  weights: number[];
}

export const FONT_MANIFEST: Record<string, FontEntry> = {
  Inter: {
    woff2: interWoff2,
    weights: [400, 600, 700],
  },
  'JetBrains Mono': {
    woff2: jbMonoWoff2,
    weights: [400, 600],
  },
  'Source Serif 4': {
    woff2: sourceSerifWoff2,
    weights: [400, 600, 700],
  },
};

export async function loadManifestFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) {
    return;
  }
  const promises: Promise<FontFace[]>[] = [];
  for (const [family, entry] of Object.entries(FONT_MANIFEST)) {
    for (const weight of entry.weights) {
      promises.push(document.fonts.load(`${weight} 11pt "${family}"`));
    }
  }
  await Promise.all(promises);
  await document.fonts.ready;
}
