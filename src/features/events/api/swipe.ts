export function swipeDirection(dx: number, dy: number): 'approve' | 'skip' | null {
  if (Math.abs(dx) < 90 || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx > 0 ? 'approve' : 'skip';
}
