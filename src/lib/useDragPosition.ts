import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useState } from 'react';

export type Offset = { x: number; y: number };

const DRAGGABLE_SELECTOR = '.prompt-rail, .answer-panel, .insight-panel, .command-dock, .capture-picker, .meeting-panel, .context-panel';
const NON_DRAG_SELECTOR = 'button, a, input, textarea, select, [contenteditable="true"], [role="button"]';

function clampMovement(bounds: DOMRect | null, deltaX: number, deltaY: number): Offset {
  if (!bounds) return { x: deltaX, y: deltaY };
  const minX = 24 - bounds.left;
  const maxX = window.innerWidth - 24 - bounds.right;
  const minY = 24 - bounds.top;
  const maxY = window.innerHeight - 24 - bounds.bottom;
  return {
    x: Math.min(maxX, Math.max(minX, deltaX)),
    y: Math.min(maxY, Math.max(minY, deltaY)),
  };
}

function readOffset(key: string | undefined, initial: Offset): Offset {
  if (!key) return initial;
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Offset> | null;
    return value && Number.isFinite(value.x) && Number.isFinite(value.y)
      ? { x: value.x!, y: value.y! }
      : initial;
  } catch {
    return initial;
  }
}

export function useDragPosition(initial: Offset, storageKey?: string) {
  const [offset, setOffset] = useState(() => readOffset(storageKey, initial));
  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(offset));
  }, [offset, storageKey]);
  const moveBy = useCallback((deltaX: number, deltaY: number) => {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>(DRAGGABLE_SELECTOR) : null;
    const movement = clampMovement(target?.getBoundingClientRect() ?? null, deltaX, deltaY);
    setOffset((current) => ({ x: current.x + movement.x, y: current.y + movement.y }));
  }, []);
  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest(NON_DRAG_SELECTOR))) return;
    event.preventDefault();
    event.stopPropagation();
    const dragTarget = event.currentTarget.closest<HTMLElement>(DRAGGABLE_SELECTOR);
    // Keep the initial bounds fixed during the gesture. Re-reading the moving
    // element made the available delta shrink on every pointermove, causing
    // the overlay to tremble and stop short of the screen edges.
    const bounds = dragTarget?.getBoundingClientRect() ?? null;
    const startPointer = { x: event.clientX, y: event.clientY };
    const startOffset = offset;
    const pointerId = event.pointerId;
    let dragStarted = true;
    window.persona.beginOverlayDrag();
    document.body.dataset.dragging = 'true';
    event.currentTarget.setPointerCapture(pointerId);
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const requested = { x: moveEvent.clientX - startPointer.x, y: moveEvent.clientY - startPointer.y };
      const clamped = clampMovement(bounds, requested.x, requested.y);
      setOffset({ x: startOffset.x + clamped.x, y: startOffset.y + clamped.y });
    };
    const stop = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      document.removeEventListener('pointercancel', stop);
      if (dragStarted) {
        delete document.body.dataset.dragging;
        window.persona.endOverlayDrag();
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop);
    document.addEventListener('pointercancel', stop);
  }, [offset]);
  return { offset, startDrag, moveBy };
}
