// Telegram Auto Fullscreen - background service worker
//
// Fallback engine: when a plain click is not allowed to start fullscreen,
// this script attaches the debugger for a split second and sends REAL
// mouse / keyboard input (which browsers always accept), then detaches.

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
// Random number in [a, b] - used to make real input look natural.
function rand(a, b) { return a + Math.random() * (b - a); }
function asExpr(fn) { return '(' + fn.toString() + ')()'; }

// ===== these functions run INSIDE the Telegram page =====
function pageIsFullscreen() {
  return !!document.fullscreenElement;
}

function pageClickButton() {
  var root = document.querySelector('.media-viewer-whole') || document;
  var b = root.querySelector('button[title="Full Screen"]') ||
          root.querySelector('button[title*="ull" i][title*="creen" i]') ||
          root.querySelector('.ckin__fullscreen');
  if (!b) return 'no-button';
  b.click();
  return 'clicked';
}

function pageButtonCenter() {
  var root = document.querySelector('.media-viewer-whole') || document;
  var b = root.querySelector('button[title="Full Screen"]') ||
          root.querySelector('button[title*="ull" i][title*="creen" i]') ||
          root.querySelector('.ckin__fullscreen');
  if (!b) return null;
  var r = b.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// True if no text field has focus (so pressing "F" is safe).
function pageCanPressKey() {
  var a = document.activeElement;
  if (!a) return true;
  var t = (a.tagName || '').toLowerCase();
  return !(t === 'input' || t === 'textarea' || a.isContentEditable);
}

function pageRequestViewerFs() {
  var el = document.querySelector('.media-viewer-whole');
  if (!el) return 'no-viewer';
  el.requestFullscreen().catch(function () {});
  return 'requested';
}
// ===== end of page functions =====

// Send a Chrome DevTools Protocol command to the tab.
function cdp(tabId, method, params) {
  return chrome.debugger.sendCommand({ tabId: tabId }, method, params || {});
}

// Run a function inside the page and return its result.
async function evalPage(tabId, fn, userGesture) {
  var res = await cdp(tabId, 'Runtime.evaluate', {
    expression: asExpr(fn),
    returnByValue: true,
    awaitPromise: true,
    userGesture: !!userGesture
  });
  if (res && res.exceptionDetails) {
    var d = res.exceptionDetails;
    throw new Error((d.exception && d.exception.description) || d.text || 'page script error');
  }
  return res && res.result ? res.result.value : undefined;
}

// Poll quickly until the page is fullscreen (or time runs out).
async function waitFs(tabId, ms) {
  var end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evalPage(tabId, pageIsFullscreen)) return true;
    await sleep(40);
  }
  return false;
}

// Real mouse click near (x, y), with a tiny random offset and natural timing.
async function realClick(tabId, x, y) {
  x += rand(-3, 3);
  y += rand(-3, 3);
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: x, y: y });
  await sleep(rand(35, 80));
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: x, y: y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(rand(30, 70));
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: x, y: y, button: 'left', buttons: 0, clickCount: 1 });
}

// Real keyboard press of the "F" key.
async function realKeyF(tabId) {
  var base = { key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 };
  await cdp(tabId, 'Input.dispatchKeyEvent', Object.assign({ type: 'keyDown', text: 'f', unmodifiedText: 'f' }, base));
  await sleep(rand(30, 70));
  await cdp(tabId, 'Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
}

// Attach the debugger (re-attach if something else was attached).
async function ensureAttached(tabId) {
  try {
    await chrome.debugger.attach({ tabId: tabId }, '1.3');
  } catch (e) {
    if (/already attached/i.test(String(e && e.message))) {
      try { await chrome.debugger.detach({ tabId: tabId }); } catch (_) {}
      await chrome.debugger.attach({ tabId: tabId }, '1.3');
    } else {
      throw e;
    }
  }
}

var busyTabs = new Set();

// Try every method in order, fastest first. Stops at the first success.
async function goFullscreen(tabId) {
  var st = await chrome.storage.local.get({ enabled: true });
  if (st.enabled === false) return { ok: false, error: 'off' };
  if (busyTabs.has(tabId)) return { ok: false, error: 'busy' };
  busyTabs.add(tabId);
  var attached = false;
  var steps = [];
  try {
    await ensureAttached(tabId);
    attached = true;

    if (await evalPage(tabId, pageIsFullscreen)) return { ok: true, method: 'already' };

    // 1) Click with the user-gesture flag
    steps.push('gesture-click=' + (await evalPage(tabId, pageClickButton, true)));
    if (await waitFs(tabId, 450)) return { ok: true, method: 'gesture-click' };

    // 2) Real mouse click on the button
    var c = await evalPage(tabId, pageButtonCenter);
    if (c) {
      await realClick(tabId, c.x, c.y);
      if (await waitFs(tabId, 450)) return { ok: true, method: 'real-mouse' };
      steps.push('mouse-failed');
    } else {
      steps.push('no-button-position');
    }

    // 3) Real keyboard "F"
    if (await evalPage(tabId, pageCanPressKey)) {
      await realKeyF(tabId);
      if (await waitFs(tabId, 450)) return { ok: true, method: 'real-key-F' };
      steps.push('key-failed');
    } else {
      steps.push('input-focused');
    }

    // 4) requestFullscreen() on the viewer container
    steps.push('viewer-fs=' + (await evalPage(tabId, pageRequestViewerFs, true)));
    if (await waitFs(tabId, 450)) return { ok: true, method: 'viewer-element' };

    return { ok: false, error: 'no method worked (' + steps.join(', ') + ')' };
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    if (/attach|not attached|devtools/i.test(msg)) {
      msg += ' | Close DevTools (F12) and try again';
    }
    return { ok: false, error: msg };
  } finally {
    busyTabs.delete(tabId);
    // Detach immediately so the "debugging" banner disappears fast.
    if (attached) {
      try { await chrome.debugger.detach({ tabId: tabId }); } catch (_) {}
    }
  }
}

// Short result badge on the toolbar icon.
function showBadge(tabId, r) {
  var text = r.ok ? 'FS' : '!';
  var color = r.ok ? '#2e9e44' : '#d33';
  var title = r.ok ? 'Fullscreen OK (' + r.method + ')' : 'Fullscreen failed: ' + r.error;
  chrome.action.setBadgeText({ tabId: tabId, text: text }).catch(function () {});
  chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: color }).catch(function () {});
  chrome.action.setTitle({ tabId: tabId, title: title }).catch(function () {});

  // Return the badge to its normal ON/OFF look after a moment.
  setTimeout(function () {
    chrome.storage.local.get({ enabled: true }, function (s) {
      var on = s.enabled !== false;
      chrome.action.setBadgeText({ tabId: tabId, text: on ? '' : 'OFF' }).catch(function () {});
      chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#777777' }).catch(function () {});
      chrome.action.setTitle({
        tabId: tabId,
        title: 'Telegram Auto Fullscreen: ' + (on ? 'ON' : 'OFF')
      }).catch(function () {});
    });
  }, 2500);
}

// ----- ON / OFF badge on Telegram tabs -----
function applyEnabledBadge(enabled) {
  chrome.tabs.query({ url: 'https://web.telegram.org/*' }, function (tabs) {
    (tabs || []).forEach(function (t) {
      chrome.action.setBadgeText({ tabId: t.id, text: enabled ? '' : 'OFF' }).catch(function () {});
      chrome.action.setBadgeBackgroundColor({ tabId: t.id, color: '#777777' }).catch(function () {});
      chrome.action.setTitle({
        tabId: t.id,
        title: 'Telegram Auto Fullscreen: ' + (enabled ? 'ON' : 'OFF')
      }).catch(function () {});
    });
  });
}

function syncBadge() {
  chrome.storage.local.get({ enabled: true }, function (s) {
    applyEnabledBadge(s.enabled !== false);
  });
}

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes.enabled) {
    applyEnabledBadge(changes.enabled.newValue !== false);
  }
});
chrome.runtime.onInstalled.addListener(syncBadge);
chrome.runtime.onStartup.addListener(syncBadge);

// The content script asks us to force fullscreen for its tab.
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'GO_FULLSCREEN' || !sender.tab) return;
  var tabId = sender.tab.id;
  goFullscreen(tabId).then(function (r) {
    if (r.error !== 'busy' && r.error !== 'off') showBadge(tabId, r);
    sendResponse(r);
  });
  return true; // keep the message channel open for the async reply
});
