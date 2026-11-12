// Telegram Auto Fullscreen - popup logic
// A switch you can DRAG or simply TAP. While dragging, the knob "scrubs" the
// little demo video above it. State is saved in chrome.storage.local:
//   enabled  : master ON/OFF switch (set here)
//   paused   : temporary pause set by the content script after a manual exit
//   safe     : safe mode (human-like delays + rate limits)
//   autoExit : leave fullscreen when the video is closed
//   count    : number of successful auto fullscreens
(function () {
  var body = document.body;
  var stage = document.getElementById('stage');
  var track = document.getElementById('track');
  var knob = document.getElementById('knob');
  var statusEl = document.getElementById('status');
  var chipSafe = document.getElementById('chipSafe');
  var chipExit = document.getElementById('chipExit');
  var countEl = document.getElementById('count');

  var enabled = true;
  var paused = false;
  var safe = true;
  var autoExit = true;

  var dragging = false;
  var moved = false;
  var startX = 0;
  var startPos = 0;
  var lastX = 0;
  var pos = 0;
  var passedMid = false;
  var scrubTimer = null;
  var squashTimer = null;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // Farthest the knob can travel (track inner width - knob width - 2 * padding).
  function maxPos() {
    return track.clientWidth - knob.offsetWidth - 8;
  }

  function progressOf(p) {
    var m = maxPos();
    return m > 0 ? clamp(p / m, 0, 1) : 0;
  }

  // Move the knob; sx / sy squash and stretch it while dragging.
  function setPos(p, sx, sy) {
    pos = p;
    knob.style.transform = 'translateX(' + p + 'px) scale(' + (sx || 1) + ',' + (sy || 1) + ')';
  }

  function setProgress(v) {
    body.style.setProperty('--p', String(v));
  }

  // Redraw everything from the current state.
  function render() {
    body.classList.toggle('is-on', enabled);
    body.classList.toggle('is-paused', enabled && paused);
    track.setAttribute('aria-checked', enabled ? 'true' : 'false');
    if (!dragging) {
      setPos(enabled ? maxPos() : 0);
      setProgress(enabled ? 1 : 0);
    }
    chipSafe.classList.toggle('on', safe);
    chipExit.classList.toggle('on', autoExit);

    if (!enabled) {
      statusEl.innerHTML = '<b>OFF</b><br>Auto fullscreen is disabled.';
    } else if (paused) {
      statusEl.innerHTML = '<b>PAUSED</b><br>You left fullscreen. It resumes on the next video, or when you go fullscreen again.';
    } else {
      statusEl.innerHTML = '<b>ON</b><br>Any video you open in Telegram goes fullscreen automatically.';
    }
  }

  // Particle + ring burst around the knob.
  function burst(big) {
    var kr = knob.getBoundingClientRect();
    var tr = track.getBoundingClientRect();
    var cx = kr.left - tr.left + kr.width / 2;
    var cy = kr.top - tr.top + kr.height / 2;

    var ring = document.createElement('div');
    ring.className = 'ring';
    ring.style.left = cx + 'px';
    ring.style.top = cy + 'px';
    track.appendChild(ring);
    setTimeout(function () { ring.remove(); }, 650);

    var n = big ? 14 : 6;
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      var d = (big ? 28 : 18) + Math.random() * 22;
      var p = document.createElement('div');
      p.className = 'p';
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.setProperty('--dx', Math.cos(a) * d + 'px');
      p.style.setProperty('--dy', Math.sin(a) * d + 'px');
      track.appendChild(p);
      (function (el) { setTimeout(function () { el.remove(); }, 700); })(p);
    }
  }

  // Quick flash of the demo stage (used when the knob crosses the middle).
  function flashStage() {
    if (!stage.animate) return;
    stage.animate(
      [{ boxShadow: '0 0 0 rgba(255,255,255,0)' },
       { boxShadow: '0 0 34px rgba(255,255,255,.4)' },
       { boxShadow: '0 0 0 rgba(255,255,255,0)' }],
      { duration: 380, easing: 'ease-out' }
    );
  }

  // Apply a new ON/OFF value and save it.
  function commit(next) {
    if (next === enabled) { render(); return; }
    enabled = next;
    paused = false;
    render();
    burst(true);
    chrome.storage.local.set({ enabled: next, paused: false });
  }

  // ----- pointer handling: tap or drag -----
  track.addEventListener('pointerdown', function (e) {
    dragging = true;
    moved = false;
    startX = e.clientX;
    lastX = e.clientX;
    startPos = pos;
    passedMid = progressOf(pos) > 0.5;
    clearTimeout(scrubTimer);
    track.classList.add('drag');
    body.classList.add('scrub', 'live');
    setProgress(progressOf(pos));
    setPos(pos, 0.94, 0.94); // pressed-in feel
    try { track.setPointerCapture(e.pointerId); } catch (_) {}
  });

  track.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    if (!moved) return;

    // Rubber-band resistance past both ends.
    var m = maxPos();
    var raw = startPos + dx;
    var p = raw;
    if (raw < 0) p = raw * 0.3;
    if (raw > m) p = m + (raw - m) * 0.3;
    p = clamp(p, -14, m + 14);

    // Squash and stretch based on drag speed.
    var v = Math.min(Math.abs(e.clientX - lastX), 28);
    lastX = e.clientX;
    setPos(p, 1 + v / 90, 1 - v / 200);
    clearTimeout(squashTimer);
    squashTimer = setTimeout(function () { if (dragging) setPos(pos, 1, 1); }, 90);

    // Drive the demo video, glow, labels and timeline.
    var prog = progressOf(p);
    setProgress(prog);

    // Crossing the middle = little "click" feedback.
    var onSide = prog > 0.5;
    if (onSide !== passedMid) {
      passedMid = onSide;
      body.classList.toggle('is-on', onSide);
      burst(false);
      flashStage();
    }
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    clearTimeout(squashTimer);
    track.classList.remove('drag');
    body.classList.remove('live'); // lets --p glide to its final value

    var next = !moved ? !enabled : progressOf(pos) > 0.5;
    setPos(pos, 1, 1);
    if (next === enabled) render(); else commit(next);

    // Remove the scrub styles after the settle animation finishes.
    scrubTimer = setTimeout(function () { body.classList.remove('scrub'); }, 520);
  }
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  // Keyboard support (Space / Enter / arrow keys).
  track.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); commit(!enabled); }
    if (e.key === 'ArrowRight') commit(true);
    if (e.key === 'ArrowLeft') commit(false);
  });

  // ----- option chips -----
  chipSafe.addEventListener('click', function () {
    safe = !safe;
    render();
    chrome.storage.local.set({ safe: safe });
  });
  chipExit.addEventListener('click', function () {
    autoExit = !autoExit;
    render();
    chrome.storage.local.set({ autoExit: autoExit });
  });

  // ----- load saved state and keep it in sync -----
  function showCount(n) { countEl.textContent = String(n || 0); }

  chrome.storage.local.get(
    { enabled: true, paused: false, safe: true, autoExit: true, count: 0 },
    function (s) {
      enabled = s.enabled !== false;
      paused = !!s.paused;
      safe = s.safe !== false;
      autoExit = s.autoExit !== false;
      showCount(s.count);
      render();
    }
  );

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.count) showCount(changes.count.newValue);
    if (dragging) return;
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    if (changes.paused) paused = !!changes.paused.newValue;
    if (changes.safe) safe = changes.safe.newValue !== false;
    if (changes.autoExit) autoExit = changes.autoExit.newValue !== false;
    render();
  });
})();
