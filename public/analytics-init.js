(() => {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;
  const DISTINCT_ID_KEY = 'umami.distinctId';
  const DISABLED_UNTIL_KEY = 'umami.disabledUntil';
  const LEGACY_DISABLED_KEY = 'umami.disabled';
  let expiryTimer;

  const storage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Tracking still works without persistent browser storage.
      }
    },
  };

  function createAnonymousId() {
    if (window.crypto?.randomUUID) return `anon-${window.crypto.randomUUID()}`;

    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return `anon-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }

  function getAnonymousId() {
    const savedId = storage.get(DISTINCT_ID_KEY);
    if (savedId) return savedId;

    const newId = createAnonymousId();
    storage.set(DISTINCT_ID_KEY, newId);
    return newId;
  }

  function getDisabledUntil() {
    const disabledUntil = Number(storage.get(DISABLED_UNTIL_KEY));
    if (!Number.isFinite(disabledUntil) || disabledUntil <= Date.now()) {
      storage.remove(DISABLED_UNTIL_KEY);
      return 0;
    }
    return disabledUntil;
  }

  function scheduleExpiry(disabledUntil) {
    window.clearTimeout(expiryTimer);
    if (!disabledUntil) return;

    expiryTimer = window.setTimeout(() => {
      storage.remove(DISABLED_UNTIL_KEY);
    }, Math.max(0, disabledUntil - Date.now()));
  }

  function disableFor24Hours() {
    const disabledUntil = Date.now() + DAY_MS;
    storage.set(DISABLED_UNTIL_KEY, String(disabledUntil));
    storage.remove(LEGACY_DISABLED_KEY);
    scheduleExpiry(disabledUntil);
    return new Date(disabledUntil);
  }

  function enable() {
    storage.remove(DISABLED_UNTIL_KEY);
    storage.remove(LEGACY_DISABLED_KEY);
    scheduleExpiry(0);
  }

  let disabledUntil = getDisabledUntil();

  // Convert Umami's permanent browser opt-out into the requested 24-hour opt-out.
  if (storage.get(LEGACY_DISABLED_KEY) !== null) {
    if (!disabledUntil) disabledUntil = disableFor24Hours().getTime();
    storage.remove(LEGACY_DISABLED_KEY);
  }

  scheduleExpiry(disabledUntil);
  const anonymousId = getAnonymousId();

  window.conwayAnalyticsBeforeSend = (_type, payload) => {
    if (getDisabledUntil()) return false;
    return { ...payload, id: anonymousId };
  };

  window.conwayAnalytics = Object.freeze({
    anonymousId,
    disableFor24Hours,
    enable,
    isDisabled: () => Boolean(getDisabledUntil()),
  });
})();
