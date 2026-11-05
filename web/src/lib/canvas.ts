/** Resize a canvas only when needed: assigning width/height reallocates and clears it. */
export function syncCanvasSize(canvas: { width: number; height: number }, width: number, height: number): boolean {
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}
