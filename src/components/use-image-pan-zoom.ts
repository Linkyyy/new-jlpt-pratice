"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

type Point = { x: number; y: number };
type Anchor = { image: Point; client: Point };

/** Keep native scroll bounds and keyboard panning while adding pointer gestures. */
export function useImagePanZoom(stageRef: RefObject<HTMLDivElement | null>, imageRef: RefObject<HTMLImageElement | null>, enabled: boolean) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const pendingAnchor = useRef<Anchor | null>(null);

  const getAnchor = useCallback((client?: Point): Anchor | null => {
    const stage = stageRef.current, image = imageRef.current;
    if (!stage || !image) return null;
    const bounds = stage.getBoundingClientRect(), picture = image.getBoundingClientRect();
    if (!picture.width || !picture.height) return null;
    const point = client ?? { x: bounds.left + stage.clientWidth / 2, y: bounds.top + stage.clientHeight / 2 };
    return { image: { x: (point.x - picture.left) / picture.width, y: (point.y - picture.top) / picture.height }, client: point };
  }, [stageRef, imageRef]);

  const applyAnchor = useCallback((anchor: Anchor) => {
    const stage = stageRef.current, image = imageRef.current;
    if (!stage || !image) return;
    const picture = image.getBoundingClientRect();
    stage.scrollLeft += picture.left + anchor.image.x * picture.width - anchor.client.x;
    stage.scrollTop += picture.top + anchor.image.y * picture.height - anchor.client.y;
    // Native scrolling clamps both axes, including when an image fits the stage.
  }, [stageRef, imageRef]);

  const zoomTo = useCallback((requested: number, anchor?: Anchor | null) => {
    const next = Math.max(1, Math.min(4, requested));
    const point = anchor ?? getAnchor();
    if (next === zoomRef.current) { if (point) applyAnchor(point); return; }
    pendingAnchor.current = point;
    zoomRef.current = next;
    setZoom(next);
  }, [applyAnchor, getAnchor]);

  useLayoutEffect(() => {
    if (pendingAnchor.current) applyAnchor(pendingAnchor.current);
    pendingAnchor.current = null;
  }, [zoom, applyAnchor]);

  useEffect(() => {
    const currentStage = stageRef.current;
    if (!currentStage || !enabled) return;
    const stage = currentStage;
    const pointers = new Map<number, Point & { target: Element }>();
    let drag: (Point & { left: number; top: number }) | null = null;
    let pinch: { distance: number; zoom: number; anchor: Anchor } | null = null;
    let suppressClick = false;

    function rebase() {
      const points = [...pointers.values()];
      if (points.length >= 2) {
        const [a, b] = points;
        const anchor = getAnchor({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        pinch = anchor ? { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: zoomRef.current, anchor } : null;
        drag = null;
        suppressClick = true;
      } else {
        pinch = null;
        drag = points.length ? { ...points[0], left: stage.scrollLeft, top: stage.scrollTop } : null;
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button, a, input, select"))) return;
      if (!pointers.size) suppressClick = false;
      const target = event.target instanceof Element ? event.target : stage;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, target });
      target.setPointerCapture(event.pointerId);
      stage.focus({ preventScroll: true });
      rebase();
    }
    function onPointerMove(event: PointerEvent) {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      if (event.pointerType === "mouse" && !(event.buttons & 1)) { onPointerEnd(event); return; }
      if (event.cancelable) event.preventDefault();
      pointers.set(event.pointerId, { ...pointer, x: event.clientX, y: event.clientY });
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        zoomTo(pinch.zoom * distance / pinch.distance, { image: pinch.anchor.image, client: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
        stage.dataset.dragging = "true";
      } else if (drag) {
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (Math.hypot(dx, dy) > 5) { suppressClick = true; stage.dataset.dragging = "true"; }
        stage.scrollLeft = drag.left - dx;
        stage.scrollTop = drag.top - dy;
      }
    }
    function onPointerEnd(event: PointerEvent) {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      pointers.delete(event.pointerId);
      if (pointer.target.hasPointerCapture(event.pointerId)) pointer.target.releasePointerCapture(event.pointerId);
      rebase();
      if (!pointers.size) delete stage.dataset.dragging;
    }
    function onClick(event: MouseEvent) {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }
    function clearPointers() {
      const captured = [...pointers];
      if (captured.length) suppressClick = true;
      pointers.clear();
      drag = null;
      pinch = null;
      for (const [id, { target }] of captured) if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
      delete stage.dataset.dragging;
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (pointers.size) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
      zoomTo(zoomRef.current * Math.exp(-Math.max(-600, Math.min(600, delta)) * .002), getAnchor({ x: event.clientX, y: event.clientY }));
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(zoomRef.current + .5); }
      if (event.key === "-") { event.preventDefault(); zoomTo(zoomRef.current - .5); }
      if (event.key === "0") { event.preventDefault(); zoomTo(1); }
    }
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", onPointerEnd);
    stage.addEventListener("pointercancel", onPointerEnd);
    stage.addEventListener("lostpointercapture", onPointerEnd);
    stage.addEventListener("click", onClick, true);
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", clearPointers);
    window.addEventListener("resize", clearPointers);
    return () => {
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerEnd);
      stage.removeEventListener("pointercancel", onPointerEnd);
      stage.removeEventListener("lostpointercapture", onPointerEnd);
      stage.removeEventListener("click", onClick, true);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", clearPointers);
      window.removeEventListener("resize", clearPointers);
      clearPointers();
      pendingAnchor.current = null;
    };
  }, [enabled, stageRef, getAnchor, zoomTo]);

  return { zoom, zoomIn: () => zoomTo(zoomRef.current + .5), zoomOut: () => zoomTo(zoomRef.current - .5), reset: () => zoomTo(1) };
}
