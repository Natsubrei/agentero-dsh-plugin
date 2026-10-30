/** Loader entry for the recommendation panel. The browser half owns the UI. */
export const name = 'agentero-recommend'

/** No host-side behavior; the host bundle serves `/agentero/api/recommend`. */
export function apply(): void {}
