/* Exotic Fish Cabo — motion layer (owner 2026-11-10, reference: destinationshockey.ca).
   Smooth inertial scrolling (Lenis) + soft fades. Presentation only: never changes text, links or metadata.
   Performance rules: deferred, no layout shift (nothing inserted in the flow), nothing already on screen is hidden,
   hero title untouched (LCP), one rAF per scroll only, off with reduced motion. */
(() => {
  try {
    const d = document, root = d.documentElement, W = window;
    if (W.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const main = d.querySelector('main');
    if (!main) return;
    const vh0 = innerHeight;
    const offscreen = (el) => el.getBoundingClientRect().top > vh0 * 0.98;

    /* 1. Smooth inertial scrolling (not on the booking flow / admin, where native scrolling is kept) */
    const functional = /^\/(book-now|booking-admin)/.test(location.pathname);
    let lenis = null;
    if (!functional && W.Lenis) {
      d.querySelectorAll('#efc-chat-window, #efc-chat-window *, .ss-track').forEach((n) => n.setAttribute('data-lenis-prevent', ''));
      lenis = new W.Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true, anchors: true, autoRaf: true });
    }

    /* 2. Reveals — only for elements below the first screen */
    const IO = 'IntersectionObserver' in W;
    if (IO) {
      const SEL = [
        '.rich > h2', '.rich > h3', '.head h2', '.rich > p', '.rich > ul > li', '.head p',
        '.card', '.media:not(.o-hero-bg):not(.banner-img):not(.o-small-logo) img', '.o-html > article',
        '.showcase .ss', '.showcase .sc-text > *', '.faq details', '.ll-media', '.price-scale',
      ].map((s) => 'main ' + s).join(',');
      const els = [...d.querySelectorAll(SEL)].filter((el) => !el.closest('.hero, form, [class*="bk-step"], .bk-boats') && offscreen(el));
      els.forEach((el) => {
        if (el.tagName === 'IMG') el.classList.add('efc-r-img');
        else el.classList.add('efc-r');
        const sib = el.parentElement ? [...el.parentElement.children].filter((c) => els.includes(c)) : [];
        el.style.setProperty('--efc-d', `${Math.min(Math.max(0, sib.indexOf(el)) % 4, 3) * 80}ms`);
      });
      root.classList.add('efc-motion');
      const io = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }), { rootMargin: '0px 0px 8% 0px', threshold: 0 });
      els.forEach((el) => io.observe(el));
      const showAll = () => els.forEach((el) => el.classList.add('is-in'));
      addEventListener('beforeprint', showAll);
      addEventListener('hashchange', showAll);
    }

    /* 3. Lead sentences fill word by word (first paragraph after each section heading, below the fold) */
    const fills = [...main.querySelectorAll('.rich > h2 + p, .rich > h2 + p.sub + p')]
      .filter((p) => !p.closest('.hero, .card, form') && offscreen(p) && p.textContent.length < 400);
    const words = [];
    fills.forEach((p) => {
      const walker = d.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((t) => {
        const frag = d.createDocumentFragment();
        t.nodeValue.split(/(\s+)/).forEach((w) => {
          if (!w) return;
          if (/^\s+$/.test(w)) frag.appendChild(d.createTextNode(w));
          else { const s = d.createElement('span'); s.className = 'efc-w'; s.textContent = w; frag.appendChild(s); words.push(s); }
        });
        t.parentNode.replaceChild(frag, t);
      });
      p.classList.add('efc-fill');
    });

    /* 4. Photo bands drifting behind dark / orange sections (lazy, authentic site photos; desktop only) */
    const PHOTOS = [
      '/media/c9e1cd77-6f97-4d43-90a4-5bccc9878876/freeman-left-932.webp',
      '/media/1762995762950-518K5X7NK9ADDTOV6H61/fishing-gordo-banks-on-a-panga-for-striped-marlin-1000.webp',
    ];
    const layers = [];
    if (W.matchMedia('(min-width: 900px)').matches) {
      [...main.querySelectorAll('.section.bg-black, .band-black, .section.bg-orange')].filter((s) => !s.closest('.hero')).forEach((s, i) => {
        const l = d.createElement('div'); l.className = 'efc-px'; l.setAttribute('aria-hidden', 'true');
        s.classList.add('efc-px-host'); s.prepend(l); layers.push({ l, src: PHOTOS[i % PHOTOS.length] });
      });
      if (IO) {
        const bgIo = new IntersectionObserver((es) => es.forEach((e) => {
          if (!e.isIntersecting) return;
          const it = layers.find((x) => x.l === e.target);
          if (it) e.target.style.backgroundImage = `url("${it.src}")`;
          bgIo.unobserve(e.target);
        }), { rootMargin: '400px 0px' });
        layers.forEach((x) => bgIo.observe(x.l));
      }
    }

    /* 5. Hero: scroll cue (absolute, no layout shift) */
    const hero = main.querySelector('.hero');
    if (hero && hero.classList.contains('hero-home')) {
      const cue = d.createElement('div'); cue.className = 'efc-cue'; cue.setAttribute('aria-hidden', 'true'); hero.appendChild(cue);
    }

    /* 6. One scroll-linked frame: hero parallax, drifting layers, word fill */
    const heroImg = hero && hero.querySelector('.hero-img, .o-hero-bg img');
    const heroTxt = hero && hero.querySelector('.hero-inner');
    let ticking = false;
    const frame = () => {
      ticking = false;
      const y = scrollY, vh = innerHeight;
      if (hero && y < vh * 1.3 && y > 2) {
        if (heroImg) heroImg.style.translate = `0 ${Math.round(y * 0.32)}px`;
        if (heroTxt) { heroTxt.style.translate = `0 ${Math.round(y * 0.15)}px`; heroTxt.style.opacity = String(Math.max(0, 1 - y / (vh * 0.8))); }
      } else if (hero && y <= 2) {
        if (heroImg) heroImg.style.translate = '';
        if (heroTxt) { heroTxt.style.translate = ''; heroTxt.style.opacity = ''; }
      }
      for (const { l } of layers) {
        const r = l.parentElement.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const p = (r.top + r.height / 2 - vh / 2) / (vh + r.height);
        l.style.transform = `translate3d(0, ${Math.round(p * -160)}px, 0) scale(1.12)`;
      }
      if (words.length) {
        const line = vh * 0.78;
        const st = words.map((s) => s.getBoundingClientRect().top < line); // read all, then write
        words.forEach((s, i) => { if (s.classList.contains('on') !== st[i]) s.classList.toggle('on', st[i]); });
      }
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    if (lenis) lenis.on('scroll', onScroll); else addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    frame();
  } catch (e) { document.documentElement.classList.remove('efc-motion'); }
})();
