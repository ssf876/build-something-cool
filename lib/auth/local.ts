/** Explicit opt-in; the local server must bind to loopback. */
export function isLocalMode() {
  return process.env.SIKA_LOCAL_MODE === "true";
}
