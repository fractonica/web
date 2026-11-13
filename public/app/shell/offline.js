/**
 * offline.js - ask the browser to keep the site for use without a network.
 *
 * Registers ../../sw.js (network first, cache as the fallback; see that file)
 * and, once it runs, hands it the list of everything this page loaded, so the
 * next visit opens offline too. Nothing happens where there is no service
 * worker: a file:// page, an old browser, a private window that refuses it.
 * Failure is silent on purpose: offline use is a convenience, not a feature
 * the clock depends on.
 */
export function keepForOffline() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker
    .register(new URL('../../sw.js', import.meta.url), { scope: new URL('../../', import.meta.url).pathname })
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => {
      const keep = [location.href, ...performance.getEntriesByType('resource').map((entry) => entry.name)];
      registration.active?.postMessage({ keep });
    })
    .catch(() => {});
}
