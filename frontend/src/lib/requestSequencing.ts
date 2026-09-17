export interface SequencedRequest {
  id: number;
  signal: AbortSignal;
}

export interface RequestSequencer {
  begin: () => SequencedRequest;
  isCurrent: (id: number) => boolean;
  cancel: () => void;
}

export function createRequestSequencer(): RequestSequencer {
  let currentId = 0;
  let controller: AbortController | null = null;

  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      currentId += 1;
      return { id: currentId, signal: controller.signal };
    },
    isCurrent(id) {
      return id === currentId && controller?.signal.aborted === false;
    },
    cancel() {
      controller?.abort();
      controller = null;
      currentId += 1;
    },
  };
}

export interface CourseRefreshCoordinator {
  beginForeground: () => SequencedRequest;
  beginSilent: () => SequencedRequest | null;
  isForegroundCurrent: (id: number) => boolean;
  isSilentCurrent: (id: number) => boolean;
  finishForeground: (id: number) => boolean;
  cancel: () => void;
}

export function createCourseRefreshCoordinator(): CourseRefreshCoordinator {
  const foreground = createRequestSequencer();
  const silent = createRequestSequencer();
  let foregroundId: number | null = null;
  let silentQueued = false;

  return {
    beginForeground() {
      silent.cancel();
      const request = foreground.begin();
      foregroundId = request.id;
      return request;
    },
    beginSilent() {
      if (foregroundId !== null) {
        silentQueued = true;
        return null;
      }
      return silent.begin();
    },
    isForegroundCurrent(id) {
      return foreground.isCurrent(id);
    },
    isSilentCurrent(id) {
      return silent.isCurrent(id);
    },
    finishForeground(id) {
      if (foregroundId !== id || !foreground.isCurrent(id)) return false;
      foregroundId = null;
      const shouldRefresh = silentQueued;
      silentQueued = false;
      return shouldRefresh;
    },
    cancel() {
      foreground.cancel();
      silent.cancel();
      foregroundId = null;
      silentQueued = false;
    },
  };
}
