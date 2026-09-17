export function shouldDismissModal(key: string, busy: boolean): boolean {
  return key === "Escape" && !busy;
}

export function getNextFocusIndex(
  currentIndex: number,
  focusableCount: number,
  shiftKey: boolean
): number {
  if (focusableCount <= 0) return -1;
  if (shiftKey) {
    return currentIndex <= 0 ? focusableCount - 1 : currentIndex - 1;
  }
  return currentIndex >= focusableCount - 1 ? 0 : currentIndex + 1;
}
