import { type RefObject, useCallback, useEffect, useRef } from 'react';
import type { Box } from './types';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => 1 - (1 - t) ** 3;

export interface Camera {
  fit: () => void;
  /** Zoom about the middle of the current view; a factor below 1 zooms in. */
  zoomBy: (factor: number) => void;
  focus: (box: { x: number; y: number; w: number; h: number }, zoom?: number) => void;
  intro: () => void;
  /** True for a moment after a drag, so the click that ends a drag does not select a node. */
  justDragged: () => boolean;
}

function clampOrigin(origin: number, size: number, min: number, full: number, slack = 0) {
  const edge = min + full - size;
  return Math.max(Math.min(min, edge) - slack, Math.min(Math.max(min, edge) + slack, origin));
}

/** `base` zoomed by `factor` (< 1 zooms in) so the point `anchor` stays where it is on screen. */
function zoomAbout(base: Box, full: Box, anchor: { x: number; y: number }, factor: number): Box {
  const [vx, vy, vw, vh] = base;
  const [fx, fy, fw, fh] = full;
  const width = Math.max(fw / 10, Math.min(fw * 1.5, vw * factor));
  const scale = width / vw;
  const height = vh * scale;
  const fracX = Math.max(0, Math.min(1, (anchor.x - vx) / vw));
  const fracY = Math.max(0, Math.min(1, (anchor.y - vy) / vh));
  return [clampOrigin(anchor.x - fracX * width, width, fx, fw), clampOrigin(anchor.y - fracY * height, height, fy, fh), width, height];
}

/** Wheel zoom, pinch zoom, drag pan with a little inertia, and animated focus, all by driving the SVG viewBox. */
export function useCamera(svgRef: RefObject<SVGSVGElement>, full: Box): Camera {
  const view = useRef<Box>(full);
  const fullRef = useRef<Box>(full);
  const frame = useRef(0);
  const dragged = useRef(false);

  const set = useCallback(
    (box: Box) => {
      view.current = box;
      svgRef.current?.setAttribute('viewBox', box.join(' '));
    },
    [svgRef],
  );
  const stop = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);
  const animateTo = useCallback(
    (target: Box, ms = 520) => {
      stop();
      if (reducedMotion()) return set(target);
      const from = view.current;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        const k = ease(t);
        set(from.map((v, i) => v + (target[i] - v) * k) as Box);
        frame.current = t < 1 ? requestAnimationFrame(step) : 0;
      };
      frame.current = requestAnimationFrame(step);
    },
    [set, stop],
  );

  // A new layout size resets the camera; a data refresh that keeps the size does not.
  useEffect(() => {
    const changed = fullRef.current.join() !== full.join();
    fullRef.current = full;
    if (changed || view.current.join() === full.join()) set(full);
  }, [full, set]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const toSvg = (inverse: DOMMatrix, x: number, y: number) => new DOMPoint(x, y).matrixTransform(inverse);

    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      event.preventDefault();
      stop();
      const anchor = toSvg(matrix.inverse(), event.clientX, event.clientY);
      const factor = Math.max(0.85, Math.min(1.18, Math.exp(event.deltaY * 0.0015)));
      set(zoomAbout(view.current, fullRef.current, anchor, factor));
    };

    let pan: { id: number; inverse: DOMMatrix; sx: number; sy: number; lx: number; ly: number; at: number; vx: number; vy: number; origin: Box; moved: boolean } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; base: Box; anchor: { x: number; y: number } } | null = null;
    const startPinch = () => {
      const matrix = svg.getScreenCTM();
      const [a, b] = [...pointers.values()];
      if (!matrix || !a || !b) return;
      pan = null;
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, base: view.current, anchor: toSvg(matrix.inverse(), (a.x + b.x) / 2, (a.y + b.y) / 2) };
    };
    const onDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        stop();
        return startPinch();
      }
      if (event.button !== 0) return;
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      stop();
      const inverse = matrix.inverse();
      const p = toSvg(inverse, event.clientX, event.clientY);
      pan = { id: event.pointerId, inverse, sx: p.x, sy: p.y, lx: p.x, ly: p.y, at: performance.now(), vx: 0, vy: 0, origin: view.current, moved: false };
    };
    const onMove = (event: PointerEvent) => {
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        dragged.current = true;
        set(zoomAbout(pinch.base, fullRef.current, pinch.anchor, pinch.dist / (Math.hypot(a.x - b.x, a.y - b.y) || 1)));
        return;
      }
      if (!pan || pan.id !== event.pointerId) return;
      const p = toSvg(pan.inverse, event.clientX, event.clientY);
      const dx = p.x - pan.sx;
      const dy = p.y - pan.sy;
      if (!pan.moved && Math.hypot(dx, dy) < 3) return;
      if (!pan.moved) svg.setPointerCapture?.(event.pointerId);
      pan.moved = true;
      const now = performance.now();
      const dt = Math.max(1, now - pan.at);
      pan.vx = pan.vx * 0.65 + ((p.x - pan.lx) / dt) * 0.35;
      pan.vy = pan.vy * 0.65 + ((p.y - pan.ly) / dt) * 0.35;
      pan.lx = p.x;
      pan.ly = p.y;
      pan.at = now;
      const [fx, fy, fw, fh] = fullRef.current;
      const [, , w, h] = pan.origin;
      set([clampOrigin(pan.origin[0] - dx, w, fx, fw, fw * 0.08), clampOrigin(pan.origin[1] - dy, h, fy, fh, fh * 0.08), w, h]);
      svg.classList.add('rm-dragging');
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pinch) {
        if (pointers.size < 2) {
          pinch = null;
          setTimeout(() => (dragged.current = false), 120);
        }
        return;
      }
      if (!pan || pan.id !== event.pointerId) return;
      const done = pan;
      pan = null;
      svg.classList.remove('rm-dragging');
      if (!done.moved) return;
      dragged.current = true;
      setTimeout(() => (dragged.current = false), 120);
      let vx = -done.vx;
      let vy = -done.vy;
      if (Math.hypot(vx, vy) < 0.025 || reducedMotion()) return;
      let prev = performance.now();
      const glide = (now: number) => {
        const dt = Math.min(32, now - prev);
        prev = now;
        const [x, y, w, h] = view.current;
        const [fx, fy, fw, fh] = fullRef.current;
        set([clampOrigin(x + vx * dt, w, fx, fw, fw * 0.08), clampOrigin(y + vy * dt, h, fy, fh, fh * 0.08), w, h]);
        vx *= 0.94 ** (dt / 16);
        vy *= 0.94 ** (dt / 16);
        frame.current = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(glide) : 0;
      };
      frame.current = requestAnimationFrame(glide);
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    return () => {
      stop();
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
    };
  }, [svgRef, set, stop]);

  return {
    fit: () => animateTo(fullRef.current),
    zoomBy: (factor) => {
      const [x, y, w, h] = view.current;
      const next = zoomAbout(view.current, fullRef.current, { x: x + w / 2, y: y + h / 2 }, factor);
      animateTo(next, 240);
    },
    focus: ({ x, y, w, h }, zoom = 1.9) => {
      const [fx, fy, fw, fh] = fullRef.current;
      const width = fw / zoom;
      const height = fh / zoom;
      const cx = x + w / 2;
      const cy = y + h / 2;
      animateTo([Math.max(fx, Math.min(cx - width / 2, fx + fw - width)), Math.max(fy, Math.min(cy - height / 2, fy + fh - height)), width, height]);
    },
    intro: () => {
      if (reducedMotion()) return;
      const [fx, fy, fw, fh] = fullRef.current;
      set([fx + fw * 0.3, fy + fh * 0.3, fw * 0.4, fh * 0.4]);
      animateTo(fullRef.current, 1500);
    },
    justDragged: () => dragged.current,
  };
}
