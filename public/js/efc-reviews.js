/* Exotic Fish Cabo — review carousels (Google / Tripadvisor). No dependencies.
   Autoplay every 5 s, seamless loop (clones), pauses on hover / focus / touch / out of viewport /
   hidden tab / "Read more", respects prefers-reduced-motion, play-pause button, arrows, keyboard, swipe. */
(function () {
  'use strict';
  var DELAY = 5000;
  var section = document.querySelector('.rv-section');
  if (!section) return;
  section.classList.add('rv-on');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  function Carousel(root) {
    var vp = root.querySelector('.rv-viewport');
    var track = root.querySelector('.rv-track');
    var real = Array.prototype.slice.call(track.children);
    var n = real.length;
    var btnPrev = root.querySelector('[data-prev]');
    var btnNext = root.querySelector('[data-next]');
    var btnPlay = root.querySelector('[data-play]');
    var name = (root.getAttribute('aria-label') || '').replace(/ reviews$/, '');
    var pv = 1, idx = 0, loop = false, timer = null, busy = false;
    var reasons = {}; // why autoplay is paused
    if (reduce.matches) reasons.user = true;

    function perView() { return Math.max(1, parseInt(getComputedStyle(section).getPropertyValue('--rv-pv'), 10) || 1); }
    function gap() { return parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0; }
    function step() { return real[0].getBoundingClientRect().width + gap(); }

    function clearClones() { Array.prototype.slice.call(track.querySelectorAll('.rv-clone')).forEach(function (c) { c.remove(); }); }
    function clone(el) {
      var c = el.cloneNode(true);
      c.classList.add('rv-clone');
      c.classList.remove('open');
      c.setAttribute('aria-hidden', 'true');
      c.setAttribute('inert', '');
      c.removeAttribute('role'); c.removeAttribute('aria-roledescription'); c.removeAttribute('aria-label');
      return c;
    }
    function build() {
      clearClones();
      pv = perView();
      loop = n > pv;
      if (loop) {
        for (var i = 0; i < pv; i++) track.insertBefore(clone(real[n - 1 - i]), track.firstChild);
        for (var j = 0; j < pv; j++) track.appendChild(clone(real[j]));
      }
      root.classList.toggle('rv-static', !loop);
      [btnPrev, btnNext, btnPlay].forEach(function (b) { if (b) b.hidden = !loop; });
      idx = ((idx % n) + n) % n;
      move(false);
      markActive();
      measureMore();
      sync();
    }
    function offset() { return loop ? idx + pv : 0; }
    function move(animate) {
      if (!animate || reduce.matches) {
        track.style.transition = 'none';
        track.style.transform = 'translateX(' + (-offset() * step()) + 'px)';
        void track.offsetWidth;
        track.style.transition = '';
      } else {
        track.style.transform = 'translateX(' + (-offset() * step()) + 'px)';
      }
    }
    function markActive() {
      real.forEach(function (el, i) {
        var visible = !loop || ((i - ((idx % n) + n) % n + n) % n) < pv;
        el.toggleAttribute('inert', !visible);
        if (visible) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');
      });
    }
    function go(delta) {
      if (!loop || busy) return;
      busy = !reduce.matches;
      idx += delta;
      move(true);
      if (reduce.matches) normalize(); else setTimeout(function () { if (busy) normalize(); }, 900);
    }
    function normalize() {
      busy = false;
      if (idx >= n) { idx -= n; move(false); }
      else if (idx < 0) { idx += n; move(false); }
      markActive();
    }
    track.addEventListener('transitionend', function (e) { if (e.target === track) normalize(); });

    // ---- autoplay ----
    function paused() { for (var k in reasons) if (reasons[k]) return true; return false; }
    function sync() {
      clearInterval(timer); timer = null;
      var userPaused = !!reasons.user;
      if (btnPlay) {
        btnPlay.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
        btnPlay.setAttribute('aria-label', (userPaused ? 'Play ' : 'Pause ') + name + ' reviews');
      }
      vp.setAttribute('aria-live', paused() ? 'polite' : 'off');
      if (loop && !paused()) timer = setInterval(function () { go(1); }, DELAY);
    }
    function set(reason, on) { if (!!reasons[reason] === on) return; reasons[reason] = on; sync(); }

    btnPlay && btnPlay.addEventListener('click', function () { set('user', !reasons.user); });
    btnPrev && btnPrev.addEventListener('click', function () { go(-1); sync(); });
    btnNext && btnNext.addEventListener('click', function () { go(1); sync(); });
    root.addEventListener('mouseenter', function () { set('hover', true); });
    root.addEventListener('mouseleave', function () { set('hover', false); });
    root.addEventListener('focusin', function () { set('focus', true); });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) set('focus', false); });
    vp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { set('offscreen', !es[0].isIntersecting); }, { threshold: 0.25 }).observe(root);
    }
    document.addEventListener('visibilitychange', function () { set('hidden', document.hidden); });
    reduce.addEventListener && reduce.addEventListener('change', function () { if (reduce.matches) set('user', true); move(false); });

    // ---- swipe ----
    var x0 = null, y0 = 0, dx = 0, base = 0, horiz = null, pid = null;
    vp.addEventListener('pointerdown', function (e) {
      if (!loop || e.button > 0 || busy) return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; horiz = null; pid = e.pointerId;
      base = -offset() * step();
      set('drag', true);
    });
    vp.addEventListener('pointermove', function (e) {
      if (x0 === null || e.pointerId !== pid) return;
      dx = e.clientX - x0;
      if (horiz === null && (Math.abs(dx) > 6 || Math.abs(e.clientY - y0) > 6)) {
        horiz = Math.abs(dx) > Math.abs(e.clientY - y0);
        if (horiz) { try { vp.setPointerCapture(pid); } catch (_) {} }
      }
      if (horiz) { track.style.transition = 'none'; track.style.transform = 'translateX(' + (base + dx) + 'px)'; }
    });
    function end() {
      if (x0 === null) return;
      track.style.transition = '';
      var threshold = Math.min(80, step() * 0.18);
      if (horiz && Math.abs(dx) > threshold) go(dx < 0 ? 1 : -1); else if (horiz) move(true);
      x0 = null; horiz = null;
      set('drag', false);
    }
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    vp.addEventListener('click', function (e) { if (Math.abs(dx) > 6) { e.preventDefault(); e.stopPropagation(); dx = 0; } }, true);

    // ---- read more ----
    function measureMore() {
      real.forEach(function (card) {
        var p = card.querySelector('.rv-text p');
        var b = card.querySelector('.rv-more');
        if (!p || !b) return;
        if (card.classList.contains('open')) { b.hidden = false; return; }
        b.hidden = !(p.scrollHeight > p.clientHeight + 2);
      });
    }
    real.forEach(function (card) {
      var b = card.querySelector('.rv-more');
      if (!b) return;
      b.addEventListener('click', function () {
        var open = card.classList.toggle('open');
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        b.textContent = open ? 'Show less' : 'Read more';
        set('open', real.some(function (c) { return c.classList.contains('open'); }));
      });
    });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (perView() !== pv) build(); else { move(false); measureMore(); } }, 150);
    });
    build();
    return { root: root, state: function () { return { idx: idx, pv: pv, loop: loop, playing: !!timer, reasons: Object.assign({}, reasons) }; } };
  }

  var list = Array.prototype.slice.call(section.querySelectorAll('[data-rv]')).map(Carousel);
  window.__efcReviews = list; // read-only hook used by the automated tests
})();
