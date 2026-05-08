'use strict';

(function (root) {
  // Pure helpers (filled in by Tasks 2 and 3).
  function shouldShowBanner(latestSha, baselineSha, dismissedSha) {
    if (!latestSha || !baselineSha) return false;
    if (latestSha === baselineSha)  return false;
    if (latestSha === dismissedSha) return false;
    return true;
  }
  function parseVersionPayload(/* text */) {
    throw new Error('not implemented');
  }

  // Runtime entry point (filled in by Task 5/6). Safe no-op for now.
  function init() {}

  const api = { shouldShowBanner, parseVersionPayload, init };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.versionCheck = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
