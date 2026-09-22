import { action, makeObservable, observable } from 'mobx';
import type { VisualSelection } from '../../browser/visual-inspector/protocol';

/**
 * One picked element plus the instruction the user typed for it. Kept as a list
 * so several elements can be annotated and sent together.
 */
export type VisualAnnotation = {
  id: string;
  selection: VisualSelection;
  instruction: string;
  createdAt: number;
};

export type VisualInspectorStatus = 'idle' | 'picking' | 'error';

export type VisualInspectorState = {
  status: VisualInspectorStatus;
  annotations: VisualAnnotation[];
  error: string | null;
};

const EMPTY_STATE: VisualInspectorState = { status: 'idle', annotations: [], error: null };

/**
 * Visual-inspector state per browser tab. Scoped by browserId so a selection in
 * one project's browser can never leak into another tab, project, or task.
 */
export class VisualInspectorStore {
  readonly sessions = observable.map<string, VisualInspectorState>();

  constructor() {
    makeObservable(this, {
      sessions: observable,
      beginPicking: action,
      finishPicking: action,
      fail: action,
      reset: action,
      setInstruction: action,
      removeAnnotation: action,
      clearAnnotations: action,
      clearBrowser: action,
    });
  }

  stateFor(browserId: string): VisualInspectorState {
    return this.sessions.get(browserId) ?? EMPTY_STATE;
  }

  beginPicking(browserId: string): void {
    this._update(browserId, (state) => ({
      ...state,
      status: 'picking' as const,
      error: null,
    }));
  }

  finishPicking(browserId: string, selection: VisualSelection | null): VisualAnnotation | null {
    const annotation = selection
      ? {
          id: crypto.randomUUID(),
          selection,
          instruction: '',
          createdAt: Date.now(),
        }
      : null;
    this._update(browserId, (state) => ({
      status: 'idle' as const,
      annotations: annotation ? [...state.annotations, annotation] : state.annotations,
      error: null,
    }));
    return annotation;
  }

  fail(browserId: string, message: string): void {
    this._update(browserId, (state) => ({ ...state, status: 'error' as const, error: message }));
  }

  setInstruction(browserId: string, annotationId: string, instruction: string): void {
    this._update(browserId, (state) => ({
      ...state,
      annotations: state.annotations.map((annotation) =>
        annotation.id === annotationId ? { ...annotation, instruction } : annotation
      ),
    }));
  }

  removeAnnotation(browserId: string, annotationId: string): void {
    this._update(browserId, (state) => ({
      ...state,
      annotations: state.annotations.filter((annotation) => annotation.id !== annotationId),
    }));
  }

  clearAnnotations(browserId: string): void {
    this._update(browserId, (state) => ({ ...state, annotations: [], error: null }));
  }

  reset(browserId: string): void {
    this.sessions.set(browserId, EMPTY_STATE);
  }

  clearBrowser(browserId: string): void {
    this.sessions.delete(browserId);
  }

  private _update(
    browserId: string,
    update: (state: VisualInspectorState) => VisualInspectorState
  ): void {
    this.sessions.set(browserId, update(this.stateFor(browserId)));
  }
}

export const visualInspectorStore = new VisualInspectorStore();
