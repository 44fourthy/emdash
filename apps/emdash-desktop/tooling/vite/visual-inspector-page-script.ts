import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import type { Plugin } from 'vite';

/**
 * Bundles the visual-inspector page script into a single self-contained IIFE
 * string that the renderer executes inside browser webviews.
 *
 * Bundling `react-grab/primitives` here is what keeps the inspector a property of
 * Emdash itself: inspected projects install nothing, and the guest page only ever
 * sees one injected script.
 */
export const VISUAL_INSPECTOR_PAGE_SCRIPT_ID = 'virtual:emdash-visual-inspector-page-script';

const RESOLVED_ID = `\0${VISUAL_INSPECTOR_PAGE_SCRIPT_ID}`;

export function visualInspectorPageScriptPlugin(options: { entry: string }): Plugin {
  const directory = dirname(options.entry);
  let minify = true;

  const watchedFiles = (): string[] => {
    try {
      return readdirSync(directory)
        .filter((name) => name.endsWith('.ts'))
        .map((name) => join(directory, name));
    } catch {
      return [options.entry];
    }
  };

  return {
    name: 'emdash:visual-inspector-page-script',
    enforce: 'pre',
    configResolved(config) {
      minify = config.command === 'build' || config.mode === 'production';
    },
    resolveId(id) {
      return id === VISUAL_INSPECTOR_PAGE_SCRIPT_ID ? RESOLVED_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return undefined;
      for (const file of watchedFiles()) this.addWatchFile(file);
      const result = await build({
        entryPoints: [options.entry],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'chrome126',
        write: false,
        minify,
        legalComments: 'eof',
        logLevel: 'silent',
        // The guest page has no `process`; define it away for the bundled deps.
        define: { 'process.env.NODE_ENV': '"production"' },
      });
      const code = result.outputFiles?.[0]?.text ?? '';
      if (!code) throw new Error('visual-inspector page script bundle was empty');
      return `export default ${JSON.stringify(code)};`;
    },
  };
}
