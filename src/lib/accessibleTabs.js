const TAB_NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

export function getKeyboardTabId(tabIds, activeId, key) {
  const ids = (tabIds || []).filter(Boolean);

  if (!ids.length || !TAB_NAVIGATION_KEYS.has(key)) {
    return null;
  }

  if (key === 'Home') return ids[0];
  if (key === 'End') return ids[ids.length - 1];

  const activeIndex = Math.max(ids.indexOf(activeId), 0);
  const direction = key === 'ArrowRight' ? 1 : -1;
  return ids[(activeIndex + direction + ids.length) % ids.length];
}

export function handleTabKeyNavigation(event, {
  activeId,
  idPrefix,
  onSelect,
  tabIds,
}) {
  const key = event?.nativeEvent?.key || event?.key;
  const nextId = getKeyboardTabId(tabIds, activeId, key);

  if (!nextId) return false;

  event?.preventDefault?.();
  onSelect(nextId);

  globalThis.setTimeout?.(() => {
    globalThis.document?.getElementById?.(`${idPrefix}${nextId}`)?.focus?.();
  }, 0);

  return true;
}
