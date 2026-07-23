// Theme toggle (dark/light mode)
const themeToggle = document.querySelector('.theme-toggle');
const html = document.documentElement;
const THEME_KEY = 'theme-preference';

function setTheme(theme) {
  html.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
}

function getTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = html.getAttribute('data-theme') || 'dark';
    setTheme(current === 'dark' ? 'light' : 'dark');
  });
  setTheme(getTheme());
}

// ===========================================================================
// Agentic IDE shell: titlebar + left file panel + webview (editor) + right
// chat panel persist across every page. A client-side router swaps the
// webview's content when navigating, so the shell never reloads — it feels
// like opening files in a real editor. Falls back to normal navigation if
// fetch/history APIs are unavailable or a request fails.
// ===========================================================================
(function () {
  const hero = document.querySelector('[data-agent-hero]');
  if (!hero) return;

  const webview = hero.querySelector('[data-webview]');
  const pageContent = hero.querySelector('[data-page-content]');
  const pageTitle = hero.querySelector('[data-page-title]');
  const loading = hero.querySelector('[data-loading]');
  const heroBody = hero.querySelector('.hero-body');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 720px)').matches;

  // Page content is already server-rendered on first paint — the loading
  // overlay only earns its keep during a real SPA fetch (see loadPage), so
  // hide it immediately here rather than leaving it up for an artificial delay.
  if (loading) loading.classList.add('is-hidden');

  // --- Panel layout persistence -------------------------------------------
  // Only panel widths persist across reloads. Collapsed/expanded (open/close)
  // state is intentionally session-only — every page load starts with both
  // panels expanded (desktop) or collapsed (mobile), never remembering
  // whether the user had them open or closed last time.
  const LAYOUT_KEY = 'ide-layout';
  const DEFAULT_LAYOUT = { filesW: 220, chatW: 340 };
  const FILES_MIN = 160, FILES_MAX = 420, CHAT_MIN = 240, CHAT_MAX = 560;

  function loadLayout() {
    try {
      const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY));
      if (!stored || typeof stored !== 'object') return { ...DEFAULT_LAYOUT };
      return { filesW: stored.filesW || DEFAULT_LAYOUT.filesW, chatW: stored.chatW || DEFAULT_LAYOUT.chatW };
    } catch (_) {
      return { ...DEFAULT_LAYOUT };
    }
  }

  function saveLayout(layout) {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ filesW: layout.filesW, chatW: layout.chatW }));
    } catch (_) { /* storage unavailable (private mode, quota) — layout just won't persist */ }
  }

  // Files panel starts collapsed on every load (desktop and mobile alike) —
  // it only opens automatically when the window is maximized, or whenever
  // the visitor clicks the toggle themselves.
  let layout = { ...loadLayout(), filesCollapsed: true, chatCollapsed: isMobile };
  const filesPanelEl = hero.querySelector('[data-files-panel]');
  const chatPanelEl = hero.querySelector('[data-chat-panel]');

  function applyLayout() {
    if (heroBody) {
      heroBody.style.setProperty('--files-w', layout.filesW + 'px');
      heroBody.style.setProperty('--chat-w', layout.chatW + 'px');
    }
    hero.classList.toggle('is-files-collapsed', layout.filesCollapsed);
    hero.classList.toggle('is-chat-collapsed', layout.chatCollapsed);
    // Mirror classes the mobile-drawer CSS keys off of — kept positive
    // (is-*-expanded) rather than :not(.is-*-collapsed) so a pre-JS page
    // load (no classes present yet) never matches the "open" rule. See the
    // comment above .hero-files in main.css for why that inversion mattered.
    hero.classList.toggle('is-files-expanded', !layout.filesCollapsed);
    hero.classList.toggle('is-chat-expanded', !layout.chatCollapsed);
    if (filesToggle) filesToggle.setAttribute('aria-expanded', String(!layout.filesCollapsed));
    if (chatToggle) chatToggle.setAttribute('aria-expanded', String(!layout.chatCollapsed));
    // Collapsed panels shrink to width:0/opacity:0 (not display:none), so
    // their contents stay in the tab order and can even hold focus unless
    // explicitly excluded — `inert` does that (and, unlike aria-hidden,
    // never conflicts with a focused descendant).
    if (filesPanelEl) filesPanelEl.toggleAttribute('inert', layout.filesCollapsed);
    if (chatPanelEl) chatPanelEl.toggleAttribute('inert', layout.chatCollapsed);
  }

  // --- Window controls (maximize / chat + file panel toggles) ------------
  // Wired unconditionally: these are real UI affordances, not part of the
  // scripted conversation, so they still work under reduced-motion.
  const maxBtn = hero.querySelector('[data-win-maximize]');
  const chatToggle = hero.querySelector('[data-chat-toggle]');
  const filesToggle = hero.querySelector('[data-files-toggle]');
  const resetBtn = document.querySelector('[data-reset-layout]');
  if (maxBtn) {
    maxBtn.addEventListener('click', () => {
      const maximized = hero.classList.toggle('is-maximized');
      layout.filesCollapsed = !maximized; // auto-show files when maximized, hide again when restored
      applyLayout();
    });
  }
  applyLayout();
  if (chatToggle) {
    chatToggle.addEventListener('click', () => {
      layout.chatCollapsed = !layout.chatCollapsed;
      applyLayout(); // collapsed state is never saved — see comment above loadLayout/saveLayout
    });
  }
  if (filesToggle) {
    filesToggle.addEventListener('click', () => {
      layout.filesCollapsed = !layout.filesCollapsed;
      applyLayout();
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      layout = { ...DEFAULT_LAYOUT, filesCollapsed: isMobile, chatCollapsed: isMobile };
      applyLayout();
      saveLayout(layout);
    });
  }

  // --- Drag-to-resize the file panel and chat panel -----------------------
  function bindResizer(el, side) {
    if (!el) return;
    let dragging = false;

    function widthFromEvent(clientX) {
      const rect = heroBody.getBoundingClientRect();
      return side === 'files' ? clientX - rect.left : rect.right - clientX;
    }

    function onMove(e) {
      if (!dragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      let w = widthFromEvent(clientX);
      w = side === 'files' ? Math.min(FILES_MAX, Math.max(FILES_MIN, w)) : Math.min(CHAT_MAX, Math.max(CHAT_MIN, w));
      if (side === 'files') layout.filesW = w; else layout.chatW = w;
      applyLayout();
    }

    function stop() {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('is-dragging');
      if (heroBody) heroBody.classList.remove('is-resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', stop);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', stop);
      saveLayout(layout);
    }

    function start(e) {
      // Dragging only makes sense while the panel is expanded.
      if (side === 'files' && layout.filesCollapsed) return;
      if (side === 'chat' && layout.chatCollapsed) return;
      dragging = true;
      el.classList.add('is-dragging');
      if (heroBody) heroBody.classList.add('is-resizing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', stop);
      document.addEventListener('touchmove', onMove, { passive: true });
      document.addEventListener('touchend', stop);
      e.preventDefault();
    }

    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start, { passive: false });

    // Keyboard resizing: arrow keys, 10px steps.
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const delta = side === 'files' ? dir * 10 : -dir * 10;
      let w = (side === 'files' ? layout.filesW : layout.chatW) + delta;
      w = side === 'files' ? Math.min(FILES_MAX, Math.max(FILES_MIN, w)) : Math.min(CHAT_MAX, Math.max(CHAT_MIN, w));
      if (side === 'files') layout.filesW = w; else layout.chatW = w;
      applyLayout();
      saveLayout(layout);
    });
  }
  bindResizer(hero.querySelector('[data-resizer="files"]'), 'files');
  bindResizer(hero.querySelector('[data-resizer="chat"]'), 'chat');

  // --- Mobile: file explorer is a slide-in drawer over a backdrop ---------
  // Collapsed, it's off-screen entirely. The titlebar toggle slides it in;
  // tapping the backdrop or picking a file closes it again.
  const filesBackdrop = hero.querySelector('[data-files-backdrop]');
  if (isMobile && filesBackdrop) {
    filesBackdrop.addEventListener('click', () => {
      layout.filesCollapsed = true;
      applyLayout();
    });
  }
  const filesPanel = hero.querySelector('[data-files-panel]');
  if (isMobile && filesPanel) {
    filesPanel.addEventListener('click', (e) => {
      if (e.target.closest('.file-row-folder')) return; // opening a folder shouldn't close the drawer
      if (!e.target.closest('.file-row')) return;
      layout.filesCollapsed = true;
      applyLayout();
    });
  }

  // --- Mobile: chat panel is a slide-in drawer over a backdrop, mirroring
  // the file explorer above (right side instead of left). --------------------
  const chatBackdrop = hero.querySelector('[data-chat-backdrop]');
  if (isMobile && chatBackdrop) {
    chatBackdrop.addEventListener('click', () => {
      layout.chatCollapsed = true;
      applyLayout();
    });
  }

  // --- File tree: folders expand/collapse ---------------------------------
  hero.querySelectorAll('[data-folder-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const node = btn.closest('.file-node-folder');
      const open = node.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });
  function autoExpandBlogFolder() {
    if (!/^\/(?:[a-z]{2}\/)?blog(\/|$)/.test(location.pathname)) return;
    const folder = hero.querySelector('.file-node-folder');
    if (!folder) return;
    folder.classList.add('is-open');
    const btn = folder.querySelector('[data-folder-toggle]');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
  autoExpandBlogFolder();

  // --- Active state in the file tree (left panel) -------------------------
  function normalizePath(pathname) {
    return pathname.replace(/\/$/, '') || '/';
  }

  function markActiveLinks() {
    const current = normalizePath(location.pathname);
    document.querySelectorAll('.file-row').forEach((link) => {
      if (!link.getAttribute('href')) return;
      const url = new URL(link.href, location.origin);
      const same = url.origin === location.origin && normalizePath(url.pathname) === current;
      // A link with a hash (e.g. #about) is active only when that exact hash
      // is current. A plain link (e.g. home.tsx) is active only when we're on
      // its path with no hash at all — otherwise both it and a hash-section
      // link would be active at once.
      const isActive = url.hash ? (same && url.hash === location.hash) : (same && !location.hash);
      link.classList.toggle('is-active', isActive);
    });
  }

  // --- SPA router: fetch same-origin pages and swap the webview content --
  const supportsRouting = 'fetch' in window && 'pushState' in history;

  function isRoutable(link) {
    if (!link.href) return false;
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return false;
    if (link.target && link.target !== '_self') return false;
    if (link.hasAttribute('download')) return false;
    if (link.hasAttribute('hreflang')) return false; // language switch: needs a full reload (lang, dir, all shell text change)
    if (/\.(pdf|zip|png|jpg|jpeg|svg|xml|txt)$/i.test(url.pathname)) return false;
    return true;
  }

  async function loadPage(url, opts) {
    opts = opts || {};
    if (loading) loading.classList.remove('is-hidden');
    let doc;
    try {
      const res = await fetch(url, { headers: { 'X-Requested-With': 'spa-router' } });
      if (!res.ok) throw new Error('bad status ' + res.status);
      doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    } catch (_) {
      location.href = url; // network error or non-2xx: fall back to a real navigation
      return;
    }

    const nextContent = doc.querySelector('[data-page-content]');
    if (!nextContent) {
      location.href = url; // markup we don't recognize: fall back rather than show a blank pane
      return;
    }

    navId += 1; // cancels any in-flight typing/intro from the page we're leaving
    pageContent.innerHTML = nextContent.innerHTML;
    document.title = doc.title;
    const nextTitleEl = doc.querySelector('[data-page-title]');
    if (pageTitle && nextTitleEl) pageTitle.textContent = nextTitleEl.textContent;

    if (!opts.isPopState) {
      const u = new URL(url, location.origin);
      history.pushState({ spa: true }, '', u.pathname + u.search + u.hash);
    }

    webview.scrollTop = 0;
    autoExpandBlogFolder();
    markActiveLinks();
    bindRouterLinks(pageContent);
    initSectionBehavior();
    initAgentForCurrentPage();
    bindContactForm();
    if (loading) loading.classList.add('is-hidden');

    const target = location.hash ? pageContent.querySelector(location.hash) : null;
    if (target) target.scrollIntoView({ block: 'start' });
  }

  function bindRouterLinks(root) {
    root.querySelectorAll('a[href]').forEach((link) => {
      if (link.dataset.routerBound) return;
      link.dataset.routerBound = '1';
      link.addEventListener('click', (e) => {
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (!supportsRouting || !isRoutable(link)) return;

        const url = new URL(link.href, location.origin);
        const samePage = normalizePath(url.pathname) === normalizePath(location.pathname);
        if (samePage && url.hash) {
          // In-page anchor (e.g. #about on the home page): just scroll, no fetch.
          const t = webview.querySelector(url.hash);
          if (t) {
            e.preventDefault();
            history.pushState({ spa: true }, '', url.pathname + url.hash);
            t.scrollIntoView({ behavior: 'smooth', block: 'start' });
            markActiveLinks();
          }
          return;
        }

        e.preventDefault();
        loadPage(link.href);
      });
    });
  }

  window.addEventListener('popstate', () => {
    loadPage(location.href, { isPopState: true });
  });

  bindRouterLinks(document);
  markActiveLinks();

  // --- Per-page behavior that needs re-running after every route swap ----
  let sectionIO = null;
  let tabIO = null;

  function initSectionBehavior() {
    if (sectionIO) sectionIO.disconnect();
    if (!reduced) {
      sectionIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('is-visible');
              sectionIO.unobserve(e.target);
            }
          });
        },
        { threshold: 0.08 }
      );
      pageContent.querySelectorAll('.section').forEach((s) => sectionIO.observe(s));
    } else {
      pageContent.querySelectorAll('.section').forEach((s) => s.classList.add('is-visible'));
    }

    if (tabIO) tabIO.disconnect();
    const hashLinks = document.querySelectorAll('.file-row[href*="#"]');
    const plainLinks = document.querySelectorAll('.file-row:not([href*="#"])');
    const sectionsWithIds = [...pageContent.querySelectorAll('[id]')].filter((el) =>
      [...hashLinks].some((l) => l.hash === '#' + el.id)
    );
    if (sectionsWithIds.length) {
      tabIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = entry.target.id;
            hashLinks.forEach((link) => link.classList.toggle('is-active', link.hash === '#' + id));
            plainLinks.forEach((link) => link.classList.remove('is-active')); // a hash section is active, so home.tsx etc. shouldn't be
          });
        },
        { root: webview, rootMargin: '-40% 0px -50% 0px' }
      );
      sectionsWithIds.forEach((el) => tabIO.observe(el));
    }

    // "How I Work" — SDLC as a self-running orbit loop.
    setupProcessOrbit();
  }

  // GSAP animates a marker gliding around a ring of SDLC stages, forever —
  // pausing briefly at each node while its detail card is shown at center.
  // Starts automatically once the section scrolls into view, pauses when it
  // scrolls back out (no point animating off-screen). Falls back to a plain
  // always-visible vertical list when motion is reduced, GSAP didn't load,
  // or there isn't room to draw a circle (narrow viewports).
  let processTimeline = null;
  let processVisibilityIO = null;
  function setupProcessOrbit() {
    if (processTimeline) { processTimeline.kill(); processTimeline = null; }
    if (processVisibilityIO) { processVisibilityIO.disconnect(); processVisibilityIO = null; }

    const section = pageContent.querySelector('[data-process-section]');
    if (!section) return;
    section.classList.remove('process-section--orbit');

    const canEnhance = !reduced &&
      window.matchMedia('(min-width: 320px)').matches &&
      window.gsap;
    if (!canEnhance) return;

    const orbit = section.querySelector('[data-process-orbit]');
    const dial = section.querySelector('[data-process-dial]');
    const nodes = section.querySelectorAll('[data-process-node]');
    const cards = section.querySelectorAll('[data-process-center-card]');
    if (!orbit || !dial || nodes.length < 2) return;

    section.classList.add('process-section--orbit');

    const gsap = window.gsap;
    const stepCount = nodes.length;
    // Only the center card changes — the ring's dots/labels stay neutral so
    // nothing that looks "lit" ever visibly travels around the circle. The
    // one fixed thing (the marker) is the one thing that stays lit.
    const setActive = (idx) => {
      cards.forEach((c) => c.classList.toggle('is-active', parseInt(c.getAttribute('data-index')) === idx));
    };
    setActive(0);

    // Node 0 sits at angle 0 (translateX with no rotation = pointing right),
    // which is exactly where the fixed marker is — so dial rotation 0
    // already lines node 0 up under the pointer with no offset needed.
    // Node i sits at +i*step in the dial's own (unrotated) frame, so to
    // bring it back around to the fixed marker at absolute 0 the dial has
    // to rotate *counter-clockwise* by that same amount — i.e. negative.
    gsap.set(dial, { rotation: 0 });
    orbit.style.setProperty('--dial-rotation', '0deg');
    const tl = gsap.timeline({ repeat: -1, paused: true });
    tl.addLabel('stage0', 0);
    for (let i = 1; i <= stepCount; i++) {
      const angle = -(360 / stepCount) * i;
      tl.to(dial, {
        rotation: angle,
        duration: 0.9,
        ease: 'power2.inOut',
        onUpdate: () => orbit.style.setProperty('--dial-rotation', gsap.getProperty(dial, 'rotation') + 'deg'),
        onComplete: () => setActive(i % stepCount),
      }, '+=1.4'); // pause at the previous node before gliding to this one
      // Label the moment this tween finishes — i.e. the resting point where
      // stage (i % stepCount) is under the marker — so a dot click can jump
      // straight there with tl.tweenTo() instead of animating a competing,
      // standalone tween on the same target (which GSAP's timeline was
      // silently winning against, leaving clicks with no visible effect).
      // The i === stepCount lap (wrapping back to stage 0) is skipped:
      // "stage0" already labels position 0, and re-adding it here would
      // silently move that label to the end of the timeline instead (GSAP
      // labels are unique by name) — every click to stage 0 would then
      // spin almost a full loop instead of landing instantly.
      if (i < stepCount) tl.addLabel('stage' + i);
    }
    processTimeline = tl;

    // Scroll-visibility auto-pauses/resumes the loop, but only while the
    // visitor hasn't taken manual control via the pause button — once they
    // have, their choice wins until they press it again.
    let userPaused = false;
    let sectionVisible = false;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          sectionVisible = e.isIntersecting;
          if (userPaused) return;
          if (sectionVisible) tl.play(); else tl.pause();
        });
      },
      { root: webview, threshold: 0.3 }
    );
    io.observe(section);
    processVisibilityIO = io;

    const playToggle = section.querySelector('[data-process-play-toggle]');
    function setPaused(next) {
      userPaused = next;
      if (userPaused) {
        tl.pause();
      } else if (sectionVisible) {
        tl.play();
      }
      if (playToggle) {
        playToggle.dataset.state = userPaused ? 'paused' : 'playing';
        playToggle.setAttribute('aria-label', userPaused ? playToggle.dataset.labelPlay : playToggle.dataset.labelPause);
      }
    }

    if (playToggle) {
      playToggle.hidden = false;
      playToggle.dataset.state = 'playing';
      playToggle.setAttribute('aria-label', playToggle.dataset.labelPause);
      if (!playToggle.dataset.processPlayBound) {
        playToggle.dataset.processPlayBound = '1';
        playToggle.addEventListener('click', () => setPaused(!userPaused));
      }
    }

    // Clicking a dot jumps straight to that stage using the timeline's own
    // tweenTo() — a standalone gsap.to() on the same target (dial.rotation)
    // silently lost to the timeline's own tweens (paused:true lives on the
    // timeline, not on each child tween, so GSAP still treated them as
    // live and overwrote the one-off tween), so scrubbing the existing
    // timeline to a label is what actually moves the ring on click.
    nodes.forEach((node, idx) => {
      const dotBtn = node.querySelector('[data-process-node-btn]');
      if (!dotBtn || dotBtn.dataset.processNodeBound) return;
      dotBtn.dataset.processNodeBound = '1';
      dotBtn.addEventListener('click', () => {
        setPaused(true);
        tl.tweenTo('stage' + idx, {
          duration: 0.6,
          ease: 'power2.inOut',
          onComplete: () => setActive(idx),
        });
      });
    });
  }

  initSectionBehavior();

  // ===========================================================================
  // Scripted agent conversation. Its data (agent-script / skill-facts) only
  // exists on the home page's payload, so this must re-check and re-run every
  // time the router swaps in new content — not just once at initial load.
  // ===========================================================================
  const inputText = hero.querySelector('[data-input-text]');
  const placeholder = hero.querySelector('[data-input-placeholder]');
  const chatLog = hero.querySelector('[data-chat-log]');
  const queueEl = hero.querySelector('[data-queue]');

  // Set as soon as the visitor interacts with the real chat input, so the
  // one-line greeting (see initAgentForCurrentPage below) knows to stay out
  // of the way instead of appearing over their in-progress question.
  let userStartedChat = false;
  const chatInputEl = hero.querySelector('[data-chat-input]');
  if (chatInputEl) {
    chatInputEl.addEventListener('focus', () => { userStartedChat = true; }, { once: true });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  function scrollChatToBottom() {
    const scroller = chatLog.parentElement; // .hero-chat-scroll, the scrollable element
    scroller.scrollTop = scroller.scrollHeight;
  }

  // typeInto is cancellable: pass a state object with a `cancelled` flag,
  // and it stops mid-character instead of finishing the string.
  async function typeInto(el, text, state) {
    const isChatBubble = el.parentElement === chatLog;
    el.textContent = '';
    for (const ch of text) {
      if (state && state.cancelled) return false;
      el.textContent += ch;
      if (isChatBubble) scrollChatToBottom();
      await sleep(rand(28, 70));
    }
    return true;
  }

  function addBubble(cls, text) {
    const el = document.createElement('div');
    el.className = 'chat-bubble ' + cls;
    el.textContent = text;
    chatLog.appendChild(el);
    scrollChatToBottom();
    return el;
  }

  let currentLabels = {};

  function showThinking() {
    const el = document.createElement('div');
    el.className = 'chat-bubble agent thinking';
    el.setAttribute('title', currentLabels.thinking || 'thinking');
    el.innerHTML = '<span class="d"></span><span class="d"></span><span class="d"></span>';
    chatLog.appendChild(el);
    scrollChatToBottom();
    return el;
  }

  // Shared busy flag: only one Q&A (intro script, skill click, or real chat)
  // types at a time. Setting it also toggles which of the decorative typed
  // span / real chat input is visible in the input bar.
  const heroInputBar = hero.querySelector('.hero-input');
  const busy = {
    _active: false,
    get active() { return this._active; },
    set active(v) {
      this._active = v;
      if (heroInputBar) heroInputBar.classList.toggle('is-busy', v);
    },
  };

  // Bumped on every SPA route swap. playTurn/runIntro check it to bail out if
  // the user navigated away mid-turn, so a stale intro doesn't keep typing
  // into a chat log that no longer matches the page in the webview.
  let navId = 0;

  async function playTurn(question, answer, opts) {
    opts = opts || {};
    const myNav = navId;
    busy.active = true;
    if (placeholder) placeholder.style.display = 'none';
    const typed = await typeInto(inputText, question, opts.state);
    if (!typed || myNav !== navId) { inputText.textContent = ''; busy.active = false; return; }
    await sleep(400);

    addBubble('user', question);
    inputText.textContent = '';
    if (placeholder) placeholder.style.display = '';
    await sleep(300);

    const thinking = showThinking();
    await sleep(rand(500, 800));
    thinking.remove();
    if ((opts.state && opts.state.cancelled) || myNav !== navId) { busy.active = false; return; }

    const bubble = addBubble('agent', '');
    const finished = await typeInto(bubble, answer, opts.state);
    if (!finished || myNav !== navId) { bubble.remove(); busy.active = false; return; }
    await sleep(700);
    busy.active = false;
  }

  // --- Skill-click queue ---------------------------------------------------
  // Clicking a stack badge queues a "what is X" Q&A. Only one turn plays at
  // a time (shared `busy` flag), so clicks made during the intro script or
  // while another answer is typing wait their turn. Each queued item can be
  // cancelled — either before it starts (just drop it) or mid-typing (flip
  // its `cancelled` flag so `playTurn`'s typing loop bails out).
  const queue = [];
  const lastVariant = new Map(); // skill -> last shown variant index, avoids immediate repeats
  let queueSeq = 0;
  let currentSkillFacts = {};

  function pickVariant(skill) {
    const variants = currentSkillFacts[skill];
    if (!variants || !variants.length) return null;
    if (variants.length === 1) return variants[0];
    let idx = Math.floor(Math.random() * variants.length);
    if (idx === lastVariant.get(skill)) idx = (idx + 1) % variants.length;
    lastVariant.set(skill, idx);
    return variants[idx];
  }

  function renderQueue() {
    if (!queueEl) return;
    queueEl.innerHTML = '';
    queue.forEach((item) => {
      const chip = document.createElement('span');
      chip.className = 'queue-chip';
      const label = document.createElement('span');
      label.textContent = item.skill;
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.setAttribute('aria-label', 'Cancel');
      cancel.textContent = '✕';
      cancel.addEventListener('click', () => cancelQueued(item.id));
      chip.appendChild(label);
      chip.appendChild(cancel);
      queueEl.appendChild(chip);
    });
  }

  function cancelQueued(id) {
    const idx = queue.findIndex((q) => q.id === id);
    if (idx === -1) return;
    const [item] = queue.splice(idx, 1);
    if (item.state) item.state.cancelled = true; // no-op if it hasn't started typing yet
    renderQueue();
  }

  function queueSkill(skill) {
    const answer = pickVariant(skill);
    if (!answer) return; // no facts for this skill, ignore
    const question = (currentLabels.skillQuestion || '{skill}?').replace('{skill}', skill);
    queue.push({ id: ++queueSeq, skill, question, answer, state: { cancelled: false } });
    renderQueue();
    processQueue();
  }

  let processing = false;
  async function processQueue() {
    if (processing) return;
    processing = true;
    while (queue.length) {
      if (busy.active) { await sleep(200); continue; }
      const item = queue[0];
      renderQueue();
      await playTurn(item.question, item.answer, { state: item.state });
      // Remove by id (it may already be gone if cancelled mid-flight).
      const idx = queue.findIndex((q) => q.id === item.id);
      if (idx !== -1) queue.splice(idx, 1);
      renderQueue();
    }
    processing = false;
  }

  function bindSkillBadges() {
    pageContent.querySelectorAll('.hero-stack li[data-skill], .skills li[data-skill]').forEach((badge) => {
      if (badge.dataset.skillBound) return;
      badge.dataset.skillBound = '1';
      const skill = badge.getAttribute('data-skill');
      badge.addEventListener('click', () => queueSkill(skill));
      badge.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          queueSkill(skill);
        }
      });
    });
  }

  // Submits the contact form to Web3Forms (https://web3forms.com) via fetch
  // so the visitor never leaves the page. Falls back to the mailto link
  // below the form if the request fails or the access key isn't configured.
  function bindContactForm() {
    const form = pageContent.querySelector('[data-contact-form]');
    if (!form || form.dataset.contactBound) return;
    form.dataset.contactBound = '1';

    const submitBtn = form.querySelector('[data-contact-submit]');
    const statusEl = form.querySelector('[data-contact-status]');
    const submitLabel = submitBtn.querySelector('[data-contact-submit-label]');
    const defaultLabel = submitLabel ? submitLabel.textContent : '';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitBtn.disabled) return;

      const accessKey = form.querySelector('input[name="access_key"]').value;
      if (!accessKey || accessKey === 'YOUR_WEB3FORMS_ACCESS_KEY') {
        setStatus('error', currentLabels.contactError || 'Something went wrong. Try again, or email me directly.');
        return;
      }

      submitBtn.disabled = true;
      if (submitLabel) submitLabel.textContent = currentLabels.contactSending || 'sending…';
      setStatus('', '');

      try {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        });
        const data = await res.json();
        if (data.success) {
          setStatus('success', currentLabels.contactSuccess || "Message sent — I'll get back to you soon.");
          form.reset();
        } else {
          throw new Error(data.message || 'submit failed');
        }
      } catch (_) {
        setStatus('error', currentLabels.contactError || 'Something went wrong. Try again, or email me directly.');
      } finally {
        submitBtn.disabled = false;
        if (submitLabel) submitLabel.textContent = defaultLabel;
      }
    });

    function setStatus(kind, text) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.className = 'contact-status' + (kind ? ' is-' + kind : '');
    }
  }

  function parseJSON(id) {
    const node = document.getElementById(id);
    if (!node) return null;
    let v = node.textContent;
    for (let i = 0; i < 3 && typeof v === 'string'; i++) v = JSON.parse(v);
    return v;
  }

  let greetedForNav = -1;

  // Called on initial load and after every SPA route swap. agent-labels and
  // skill-facts are present in the shell on every page; when not already
  // shown for this exact navigation, this shows a one-line greeting (no
  // scripted Q&A — real questions get real AI answers).
  function initAgentForCurrentPage() {
    if (reduced) return; // static fallback stays visible

    let labelsData, skillFacts;
    try {
      labelsData = parseJSON('agent-labels');
      skillFacts = parseJSON('skill-facts');
    } catch (_) {
      return;
    }
    currentLabels = labelsData || {};
    currentSkillFacts = skillFacts || {};
    bindSkillBadges();

    if (greetedForNav === navId) return; // already shown for this page load
    greetedForNav = navId;
    const myNav = navId;
    const greeting = currentLabels.greeting;
    if (!greeting) return;

    const heroIO = new IntersectionObserver((entries, obs) => {
      if (entries[0].isIntersecting) {
        obs.disconnect();
        if (myNav === navId && !userStartedChat) {
          sleep(500).then(() => {
            if (myNav === navId && !userStartedChat) addBubble('agent', greeting);
          });
        }
      }
    }, { threshold: 0.4 });
    heroIO.observe(hero);
  }

  initAgentForCurrentPage();
  bindContactForm();

  // ===========================================================================
  // Command palette: click the titlebar search button, or press Cmd/Ctrl+K
  // anywhere, to fuzzy-filter pages/sections and skills and jump to one.
  // Page entries route through the existing SPA loadPage(); skill entries
  // reuse queueSkill() to open the chat panel and show the scripted fact.
  // ===========================================================================
  (function initCommandPalette() {
    const trigger = hero.querySelector('[data-search-trigger]');
    const backdrop = document.querySelector('[data-cmdk-backdrop]');
    if (!trigger || !backdrop) return;
    const input = backdrop.querySelector('[data-cmdk-input]');
    const list = backdrop.querySelector('[data-cmdk-list]');
    const emptyEl = backdrop.querySelector('[data-cmdk-empty]');

    let entries = [];
    try { entries = parseJSON('search-index') || []; } catch (_) { entries = []; }

    let filtered = [];
    let selectedIndex = 0;

    function iconFor(type) {
      return type === 'skill'
        ? '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 2.5 1.5 8 4 13.5M12 2.5 14.5 8 12 13.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 1.5h5l2.8 2.8v10.2h-7.8z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    }

    function updateSelection() {
      [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === selectedIndex)));
      const activeEl = list.children[selectedIndex];
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    }

    // Rebuilds the DOM only when the filtered set changes. Selection changes
    // (from hover/arrow keys) just toggle aria-selected in place — replacing
    // nodes on every mouseenter used to swap the hovered <li> out from under
    // an in-progress click, so mousedown/mouseup landed on the parent <ul>
    // and no click event ever fired.
    function render() {
      list.innerHTML = '';
      filtered.forEach((entry, i) => {
        const li = document.createElement('li');
        li.className = 'cmdk-item';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === selectedIndex));
        li.innerHTML = '<span class="cmdk-item-icon">' + iconFor(entry.type) + '</span><span>' + entry.label + '</span>';
        li.addEventListener('mouseenter', () => { selectedIndex = i; updateSelection(); });
        li.addEventListener('click', () => selectEntry(entry));
        list.appendChild(li);
      });
      emptyEl.hidden = filtered.length !== 0;
      updateSelection();
    }

    function filterEntries(query) {
      const q = query.trim().toLowerCase();
      filtered = !q ? entries : entries.filter((e) => e.label.toLowerCase().includes(q));
      selectedIndex = 0;
      render();
    }

    function selectEntry(entry) {
      close();
      if (entry.type === 'skill') {
        layout.chatCollapsed = false;
        applyLayout();
        queueSkill(entry.value);
      } else if (entry.href) {
        const url = new URL(entry.href, location.origin);
        if (url.origin !== location.origin) { location.href = entry.href; return; }
        const samePage = normalizePath(url.pathname) === normalizePath(location.pathname);
        if (samePage && url.hash) {
          const t = webview.querySelector(url.hash);
          if (t) {
            history.pushState({ spa: true }, '', url.pathname + url.hash);
            t.scrollIntoView({ behavior: 'smooth', block: 'start' });
            markActiveLinks();
            return;
          }
        }
        loadPage(entry.href);
      }
    }

    function open() {
      backdrop.hidden = false;
      filterEntries('');
      input.value = '';
      input.focus();
      document.addEventListener('keydown', onKeydown);
    }

    function close() {
      backdrop.hidden = true;
      document.removeEventListener('keydown', onKeydown);
      // Hand focus back to the chat input (its default resting place) rather
      // than the search trigger, so the visitor can keep typing right away.
      if (chatInputEl && chatInputEl.offsetParent !== null) chatInputEl.focus({ preventScroll: true });
      else trigger.focus();
    }

    function onKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1); render(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); render(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (filtered[selectedIndex]) selectEntry(filtered[selectedIndex]); }
    }

    trigger.addEventListener('click', open);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    input.addEventListener('input', () => filterEntries(input.value));

    document.addEventListener('keydown', (e) => {
      const isK = e.key === 'k' || e.key === 'K';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (backdrop.hidden) open(); else close();
      }
    });
  })();

  // ===========================================================================
  // Real AI chat. Posts the visitor's question to a Cloudflare Worker proxy
  // (see /worker) which tries free-tier providers in order and returns a
  // portfolio-grounded answer. Shares the chat log and `busy` flag with the
  // skill-badge Q&A queue so the two never type into the log at the same time.
  // ===========================================================================
  const chatForm = hero.querySelector('[data-chat-form]');
  const chatInput = chatInputEl;
  let chatConfig = {};
  try { chatConfig = parseJSON('chat-config') || {}; } catch (_) { chatConfig = {}; }

  // Badge shows "Live" only once the Worker confirms it's actually up;
  // "Offline" if the health check fails or times out.
  const aiStatusEl = hero.querySelector('[data-ai-status]');
  if (aiStatusEl && chatConfig.endpoint) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    fetch(chatConfig.endpoint + '/health', { signal: controller.signal })
      .then((res) => {
        aiStatusEl.textContent = res.ok ? (chatConfig.liveLabel || 'Live') : (chatConfig.offlineLabel || 'Offline');
        aiStatusEl.dataset.aiStatus = res.ok ? 'live' : 'offline';
      })
      .catch(() => {
        aiStatusEl.textContent = chatConfig.offlineLabel || 'Offline';
        aiStatusEl.dataset.aiStatus = 'offline';
      })
      .finally(() => clearTimeout(timeout));
  } else if (aiStatusEl) {
    aiStatusEl.textContent = chatConfig.offlineLabel || 'Offline';
    aiStatusEl.dataset.aiStatus = 'offline';
  }

  async function askAI(question) {
    const myNav = navId;
    busy.active = true;
    addBubble('user', question);
    await sleep(200);

    const thinking = showThinking();

    let answer, isError = false;
    try {
      if (!chatConfig.endpoint) throw new Error('no endpoint configured');
      const res = await fetch(chatConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, lang: chatConfig.lang || 'en' }),
      });
      if (res.status === 429) {
        answer = chatConfig.rateLimited || 'Rate limited, try again shortly.';
        isError = true;
      } else if (!res.ok) {
        throw new Error('bad status ' + res.status);
      } else {
        const data = await res.json();
        answer = data.answer;
        if (!answer) throw new Error('empty answer');
      }
    } catch (_) {
      answer = chatConfig.error || "I'm sincerely sorry, I'm unable to respond right now — please try again shortly.";
      isError = true;
    }

    thinking.remove();
    if (myNav !== navId) { busy.active = false; return; }

    const bubble = addBubble('agent' + (isError ? ' chat-error' : ''), '');
    await typeInto(bubble, answer, null);
    busy.active = false;
  }

  // Suggested-question chips: clicking one asks it for real, then the whole
  // suggestion block goes away — it only exists to get the first question
  // going. Manually asking a question dismisses it too.
  const suggestionsEl = hero.querySelector('[data-chat-suggestions]');
  function dismissSuggestions() {
    if (suggestionsEl) suggestionsEl.classList.add('is-dismissed');
  }
  if (suggestionsEl) {
    suggestionsEl.querySelectorAll('.hero-suggestion').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (busy.active) return;
        userStartedChat = true;
        dismissSuggestions();
        askAI(btn.textContent.trim());
      });
    });
    // The chat log's min-height pushes everything below the fold until the
    // panel is scrolled; start at the bottom so the chips greet the visitor.
    requestAnimationFrame(scrollChatToBottom);
  }

  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (busy.active) return; // one turn (skill badge or real question) at a time
      const question = chatInput.value.trim();
      if (!question) return;
      chatInput.value = '';
      dismissSuggestions();
      askAI(question);
    });
  }

  // ===========================================================================
  // Focus management: the chat input holds keyboard focus by default, so a
  // visitor can start typing a question immediately. It only gives that up
  // once the visitor deliberately focuses another *typeable* field (a real
  // text input/textarea/select) — clicking a link, button, or skill badge is
  // a momentary action, not an ongoing intent to type elsewhere, so those
  // don't suppress the auto-focus.
  // ===========================================================================
  if (chatInput) {
    const isTypeable = (el) =>
      !!el && el !== chatInput &&
      (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ||
        (el.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio'].includes(el.type)));

    function refocusChatInput() {
      if (isTypeable(document.activeElement)) return;
      if (chatInput.offsetParent === null) return; // hidden (busy, or panel collapsed)
      if (document.activeElement !== chatInput) chatInput.focus({ preventScroll: true });
    }

    // Claim focus once the field is actually visible, right after load. Some
    // browsers ignore a focus() call made in the very first frame before the
    // document is fully settled, so retry a couple of times shortly after.
    requestAnimationFrame(refocusChatInput);
    setTimeout(refocusChatInput, 150);
    setTimeout(refocusChatInput, 600);

    // Reclaim focus whenever the input bar's busy state clears (a skill
    // badge's scripted answer finished typing, or a real AI answer finished)
    // and the visitor isn't mid-typing in some other real field.
    if (heroInputBar) {
      const busyObserver = new MutationObserver(() => {
        if (!heroInputBar.classList.contains('is-busy')) refocusChatInput();
      });
      busyObserver.observe(heroInputBar, { attributes: true, attributeFilter: ['class'] });
    }

    // Redirect the *first keystroke* into the chat input when nothing else
    // has focus — not every click. Refocusing on every click used to fight
    // text selection (mouseup on selected body text is a click too, and
    // stealing focus right after collapses the selection), so this only
    // reacts to the visitor actually starting to type.
    document.addEventListener('keydown', (e) => {
      if (isTypeable(document.activeElement)) return; // already typing somewhere real
      if (chatInput.offsetParent === null) return; // chat panel hidden/collapsed
      if (e.metaKey || e.ctrlKey || e.altKey) return; // shortcuts, not typing
      if (e.key.length !== 1) return; // letters/digits/symbols only — not Tab, Escape, arrows, etc.

      chatInput.focus({ preventScroll: true });
      chatInput.value += e.key; // focus() alone would eat this keystroke
      e.preventDefault();
    });
  }
})();
