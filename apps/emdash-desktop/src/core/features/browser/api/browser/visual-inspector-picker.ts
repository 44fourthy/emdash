import pageScript from 'virtual:emdash-visual-inspector-page-script';
import {
  VISUAL_INSPECTOR_API_KEY,
  isVisualSelection,
} from '../../browser/visual-inspector/protocol';
import type { VisualInspectorStore } from './visual-inspector-store';

/** Minimal surface the picker needs from a browser tab's webview. */
export type VisualInspectorScriptRunner = {
  runScript(code: string): Promise<unknown>;
};

export type VisualInspectorPickerOptions = {
  browserId: string;
  store: VisualInspectorStore;
  /** Resolved per call: the webview adapter only exists once the page is ready. */
  getRunner: () => VisualInspectorScriptRunner | null;
};

const PAGE_API_REF = `globalThis.${VISUAL_INSPECTOR_API_KEY}`;

/**
 * Drives element picking for one browser tab: injects the page script, awaits the
 * selection, and keeps the store in sync. Stale interactions (cancelled picks,
 * navigation) are dropped by comparing a monotonic sequence number.
 */
export class VisualInspectorPicker {
  private sequence = 0;

  constructor(private readonly options: VisualInspectorPickerOptions) {}

  isPicking(): boolean {
    return this.options.store.stateFor(this.options.browserId).status === 'picking';
  }

  async togglePick(): Promise<void> {
    if (this.isPicking()) {
      await this.cancelPick();
      return;
    }
    await this.startPick();
  }

  async startPick(): Promise<void> {
    const { browserId, store } = this.options;
    const runner = this.options.getRunner();
    if (!runner) {
      store.fail(browserId, 'Open a page in this browser tab before selecting elements.');
      return;
    }
    const sequence = ++this.sequence;
    store.beginPicking(browserId);
    try {
      const result = await runner.runScript(`${pageScript}\n;${PAGE_API_REF}.start()`);
      if (sequence !== this.sequence) return;
      store.finishPicking(browserId, isVisualSelection(result) ? result : null);
    } catch (error) {
      if (sequence !== this.sequence) return;
      store.fail(browserId, describeFailure(error));
    }
  }

  /** Ends an in-flight pick; the page resolves the pending start() with null. */
  async cancelPick(): Promise<void> {
    this.sequence += 1;
    this.options.store.finishPicking(this.options.browserId, null);
    await this._runPageCommand('stop()');
  }

  /** Drops every annotation and the committed highlight in the page. */
  async clearAnnotations(): Promise<void> {
    this.sequence += 1;
    this.options.store.clearAnnotations(this.options.browserId);
    await this._runPageCommand('clearSelection()');
  }

  /**
   * The page navigated: injected state is gone with it, so any in-flight pick is
   * abandoned and stale selections are dropped without touching the page.
   */
  handleNavigation(): void {
    this.sequence += 1;
    this.options.store.reset(this.options.browserId);
  }

  dispose(): void {
    this.sequence += 1;
  }

  private async _runPageCommand(command: string): Promise<void> {
    const runner = this.options.getRunner();
    if (!runner) return;
    try {
      await runner.runScript(`${PAGE_API_REF}?.${command}`);
    } catch {
      // The page may be mid-navigation; there is nothing left to clean up.
    }
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'The page could not be inspected.';
}
