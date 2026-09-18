// Newsletter permission does not authorize product analytics. Keep existing
// call sites inert until a separate durable, withdrawable consent record exists.
export function serverAnalyticsEnabled() { return false; }
export async function captureServer() { return false; }
