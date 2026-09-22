import { useEffect, useMemo, useRef } from 'react';
import { VisualInspectorPicker } from '@core/features/browser/api/browser/visual-inspector-picker';
import { visualInspectorStore } from '@core/features/browser/api/browser/visual-inspector-store';
import type { BrowserWebviewAdapter } from '../browser-webview-types';

/**
 * Owns the picker for one browser pane. The adapter is read through a ref so the
 * picker survives webview re-mounts, and navigation resets any selection that
 * pointed at the previous page.
 */
export function useVisualInspector(input: {
  browserId: string;
  adapter: BrowserWebviewAdapter | null;
  currentUrl: string;
}): VisualInspectorPicker {
  const { browserId, adapter, currentUrl } = input;
  const adapterRef = useRef<BrowserWebviewAdapter | null>(adapter);
  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  const picker = useMemo(
    () =>
      new VisualInspectorPicker({
        browserId,
        store: visualInspectorStore,
        getRunner: () => adapterRef.current,
      }),
    [browserId]
  );

  const previousUrl = useRef(currentUrl);
  useEffect(() => {
    if (previousUrl.current === currentUrl) return;
    previousUrl.current = currentUrl;
    picker.handleNavigation();
  }, [currentUrl, picker]);

  useEffect(() => () => picker.dispose(), [picker]);

  return picker;
}
