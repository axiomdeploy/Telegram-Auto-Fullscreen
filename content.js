// Telegram Auto Fullscreen - content script
//
// What it does:
//   1. Watches the Telegram media viewer for a video.
//   2. As soon as a video is open, it enters fullscreen (fast path first,
//      then falls back to the background script that uses the debugger).
//   3. If YOU leave fullscreen on purpose, the extension PAUSES itself
//      (the switch stays ON). The pause ends when:
//        - you open another video, or
//        - you go fullscreen again by hand (F key / fullscreen button), or
//        - you leave the Telegram tab / reopen Telegram.
//
// Safety notes:
//   - This script never sends anything to Telegram's servers, never reads
//     your chats and never changes Telegram's data. The only thing it ever
//     does on the page is click the video's own fullscreen button.
//   - "Safe mode" (default ON) adds small human-like random delays and
//     limits how many attempts can happen per minute.
(function () {
  if (window.__tgAutoFullscreenLoaded) return;
  window.__tgAutoFullscreenLoaded = true;

  // ----- timing (milliseconds) -----
  var CHECK_MS = 150;        // how often we look for a video
  var SETTLE_MS = 250;       // short wait after a new video appears
  var COOLDOWN_MS = 1200;    // base gap between attempts (grows after each failure)
  var MAX_TRIES = 4;         // attempts per video before giving up
  var EXIT_CHECK_MS = 500;   // delay used to tell "manual exit" from "video switch"

  // ----- safe-mode limits (per minute) -----
  var MAX_ATTEMPTS_PER_MIN = 20;
  var MAX_FALLBACKS_PER_MIN = 8;

  // ----- settings (saved by the popup) -----
  var enabled = true;   // master switch
  var safe = true;      // human-like delays + rate limits
  var autoExit = true;  // leave fullscreen when the video is closed

  // ----- state -----
  var paused = false;   // temporary pause after a manual fullscreen exit
  var lastFp = '';      // fingerprint of the current video
  var want = false;     // true = we still need to enter fullscreen for this video
  var tries = 0;
  var lastTry = 0;
  var firstSeen = 0;
  var settleMs = SETTLE_MS;
  var busy = false;
  var hadVideo = false;
  var weEntered = false; // true if fullscreen was entered by this extension
  var gaveUp = false;
  var selfExit = false;  // true while WE are exiting fullscreen
  var fsWasOn = false;
  var timer = null;
  var attemptLog = [];   // timestamps of recent attempts
  var fallbackLog = [];  // timestamps of recent debugger fallbacks

  function log() {
    var a = ['[TG-AutoFS]'].concat([].slice.call(arguments));
    console.log.apply(console, a);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Keep only the timestamps from the last 60 seconds.
  function recent(list) {
    var cut = Date.now() - 60000;
    while (list.length && list[0] < cut) list.shift();
    return list;
  }

  // Save the paused flag so the popup can show it.
  function setPaused(flag) {
    if (paused === flag) return;
    paused = flag;
    try { chrome.storage.local.set({ paused: flag }); } catch (e) {}
    log(flag
      ? 'Paused: you left fullscreen. Resumes on the next video or when you go fullscreen again.'
      : 'Resumed.');
  }

  // Count successful auto fullscreens (shown in the popup).
  function bumpCount() {
    try {
      chrome.storage.local.get({ count: 0 }, function (s) {
        chrome.storage.local.set({ count: (s.count || 0) + 1 });
      });
    } catch (e) {}
  }

  // ----- load settings, and always start un-paused -----
  try {
    chrome.storage.local.set({ paused: false });
    chrome.storage.local.get({ enabled: true, safe: true, autoExit: true }, function (s) {
      enabled = s.enabled !== false;
      safe = s.safe !== false;
      autoExit = s.autoExit !== false;
      log(enabled ? 'ON' : 'OFF', '| safe mode:', safe, '| auto exit:', autoExit);
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (changes.safe) safe = changes.safe.newValue !== false;
      if (changes.autoExit) autoExit = changes.autoExit.newValue !== false;
      if (!changes.enabled) return;
      enabled = changes.enabled.newValue !== false;
      log(enabled ? 'ON' : 'OFF');
      if (enabled) {
        // Switched ON again: act on the current video right away.
        paused = false;
        want = true;
        tries = 0;
        gaveUp = false;
        lastTry = 0;
        settleMs = SETTLE_MS;
        firstSeen = Date.now() - SETTLE_MS;
      }
    });
  } catch (e) {}

  // Leaving the Telegram tab (or closing it) always clears the pause.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) setPaused(false);
  });
  window.addEventListener('pagehide', function () { setPaused(false); });

  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // The video element currently shown in the media viewer (or null).
  function activeVideo() {
    var viewer = document.querySelector('.media-viewer-whole');
    if (!viewer) return null;
    var list = Array.prototype.filter.call(viewer.querySelectorAll('video.ckin__video'), visible);
    return list.length ? list[list.length - 1] : null;
  }

  // A string that changes whenever a different video is shown.
  function fingerprint(v) {
    var viewer = document.querySelector('.media-viewer-whole');
    var cap = viewer && viewer.querySelector('.media-viewer-caption code');
    var extra = viewer && viewer.querySelector('.media-viewer-date-extra');
    return [
      ((cap && cap.textContent) || '').trim(),
      v.currentSrc || v.src || '',
      ((extra && extra.textContent) || '').trim()
    ].join('|');
  }

  function findFsButton() {
    var root = document.querySelector('.media-viewer-whole') || document;
    return root.querySelector('button[title="Full Screen"]') ||
           root.querySelector('button[title*="ull" i][title*="creen" i]') ||
           root.querySelector('.ckin__fullscreen');
  }

  // Fast path: while the browser still counts your last click as a user
  // gesture, a plain click on the fullscreen button works instantly and
  // needs no debugger at all.
  function tryDirect() {
    return new Promise(function (resolve) {
      var ua = navigator.userActivation;
      var b = findFsButton();
      if (!b || !ua || !ua.isActive) { resolve(false); return; }
      b.click();
      setTimeout(function () { resolve(!!document.fullscreenElement); }, 150);
    });
  }

  // Ask the background script to force fullscreen (slower fallback).
  function askBackground() {
    try {
      return chrome.runtime.sendMessage({ type: 'GO_FULLSCREEN' });
    } catch (e) {
      return Promise.resolve({ ok: false, error: 'extension context lost' });
    }
  }

  // ----- detect fullscreen changes -----
  document.addEventListener('fullscreenchange', function () {
    if (document.fullscreenElement) {
      fsWasOn = true;
      // You went fullscreen by hand while paused -> resume automatically.
      if (paused) setPaused(false);
      return;
    }
    if (!fsWasOn) return;
    fsWasOn = false;

    // We exited on our own (video closed) - not a manual exit.
    if (selfExit) { selfExit = false; return; }

    var fpAtExit = lastFp;
    setTimeout(function () {
      if (!enabled || document.fullscreenElement) return;
      var v = activeVideo();
      // Same video still open => the user left fullscreen on purpose.
      if (v && fingerprint(v) === fpAtExit) {
        want = false;
        setPaused(true);
      }
    }, EXIT_CHECK_MS);
  });

  function tick() {
    if (!chrome.runtime || !chrome.runtime.id) {
      clearInterval(timer);
      log('Extension was reloaded - please refresh this Telegram tab (F5).');
      return;
    }
    if (document.hidden) return;

    var v = activeVideo();

    // No video on screen (viewer closed).
    if (!v) {
      if (hadVideo) {
        hadVideo = false;
        lastFp = '';
        want = false;
        tries = 0;
        gaveUp = false;
        setPaused(false); // the next video starts fresh
        if (enabled && autoExit && weEntered && document.fullscreenElement) {
          selfExit = true;
          document.exitFullscreen().catch(function () { selfExit = false; });
        }
        weEntered = false;
      }
      return;
    }

    hadVideo = true;
    if (!enabled) return;

    var now = Date.now();
    var fp = fingerprint(v);

    // A different video appeared: reset everything and resume if paused.
    if (fp !== lastFp) {
      lastFp = fp;
      want = true;
      tries = 0;
      gaveUp = false;
      firstSeen = now;
      settleMs = SETTLE_MS + (safe ? rand(60, 240) : 0); // human-like pause
      setPaused(false);
    }

    if (paused) return;
    if (!want) return;
    if (document.fullscreenElement) { want = false; return; }
    if (busy || gaveUp) return;
    if (now - firstSeen < settleMs) return;
    if (v.readyState < 1 && now - firstSeen < 1500) return;
    if (now - lastTry < COOLDOWN_MS * Math.max(1, tries)) return;

    // Safe mode: never exceed the per-minute attempt limit.
    if (safe && recent(attemptLog).length >= MAX_ATTEMPTS_PER_MIN) return;

    busy = true;
    tries++;
    lastTry = now;
    attemptLog.push(now);

    tryDirect().then(function (ok) {
      if (ok) return { ok: true, method: 'direct-click' };
      // Safe mode: limit how often the debugger fallback may run.
      if (safe && recent(fallbackLog).length >= MAX_FALLBACKS_PER_MIN) {
        return { ok: false, error: 'rate limit reached (safe mode)' };
      }
      fallbackLog.push(Date.now());
      return askBackground();
    }).then(function (res) {
      if (res && res.ok) {
        weEntered = true;
        want = false;
        if (res.method !== 'already') bumpCount();
        log('Fullscreen OK via', res.method);
      } else if (res && res.error === 'off') {
        want = false;
      } else {
        log('Fullscreen failed (try ' + tries + '/' + MAX_TRIES + '):', res && res.error);
        if (tries >= MAX_TRIES) {
          gaveUp = true;
          log('Giving up on this video - press F manually.');
        }
      }
    }).catch(function (e) {
      log('Error:', e && e.message ? e.message : e);
    }).then(function () {
      busy = false;
    });
  }

  timer = setInterval(tick, CHECK_MS);
  log('Started');
})();
