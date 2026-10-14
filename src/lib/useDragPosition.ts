import { useCallback, useState } from 'react';

export type Offset = { x: number; y: number };

const DRAGGABLE_SELECTOR = '.prompt-rail, .answer-panel, .command-dock, .capture-picker, .meeting-panel, .context-panel';

function clampMovement(target: HTMLElement | null, deltaX: number, deltaY: number): Offset {
  if (!target) return { x: deltaX, y: deltaY };
  const bounds = target.getBoundingClientRect();
  const minX = 16 - bounds.left;
  const maxX = window.innerWidth - 16 - bounds.right;
  const minY = 16 - bounds.top;
  const maxY = window.innerHeight - 16 - bounds.bottom;
  return {
    x: minX <= maxX
      ? Math.min(maxX, Math.max(minX, deltaX))
      : Math.min(window.innerWidth - 64 - bounds.left, Math.max(64 - bounds.right, deltaX)),
    y: minY <= maxY
      ? Math.min(maxY, Math.max(minY, deltaY))
      : Math.min(window.innerHeight - 40 - bounds.top, Math.max(40 - bounds.bottom, deltaY)),
  };
}

export function useDragPosition(initial: Offset) {
  const [offset, setOffset] = useState(initial);
  const moveBy = useCallback((deltaX: number, deltaY: number) => {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>(DRAGGABLE_SELECTOR) : null;
    const movement = clampMovement(target, deltaX, deltaY);
    setOffset((current) => ({ x: current.x + movement.x, y: current.y + movement.y }));
  }, []);
  const startDrag = useCallback((event: { clientX: number; clientY: number; currentTarget: HTMLElement; preventDefault(): void; stopPropagation(): void }) => {
    event.preventDefault();
    event.stopPropagation();
    window.persona.beginOverlayDrag();
    document.body.dataset.dragging = 'true';
    const dragTarget = event.currentTarget.closest<HTMLElement>(DRAGGABLE_SELECTOR);
    const bounds = dragTarget?.getBoundingClientRect();
    const startPointer = { x: event.clientX, y: event.clientY };
    const startOffset = offset;
    const move = (moveEvent: PointerEvent) => {
      const requested = { x: moveEvent.clientX - startPointer.x, y: moveEvent.clientY - startPointer.y };
      if (!bounds) { setOffset({ x: startOffset.x + requested.x, y: startOffset.y + requested.y }); return; }
      const clamped = clampMovement(dragTarget, requested.x, requested.y);
      setOffset({ x: startOffset.x + clamped.x, y: startOffset.y + clamped.y });
    };
    const stop = () => {
      delete document.body.dataset.dragging;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      window.persona.endOverlayDrag();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop, { once: true });
  }, [offset]);
  return { offset, startDrag, moveBy };
}
