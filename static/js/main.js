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

  let layout = { ...loadLayout(), filesCollapsed: isMobile, chatCollapsed: isMobile };

  function applyLayout() {
    if (heroBody) {
      heroBody.style.setProperty('--files-w', layout.filesW + 'px');
      heroBody.style.setProperty('--chat-w', layout.chatW + 'px');
    }
    hero.classList.toggle('is-files-collapsed', layout.filesCollapsed);
    hero.classList.toggle('is-chat-collapsed', layout.chatCollapsed);
    if (filesToggle) filesToggle.setAttribute('aria-expanded', String(!layout.filesCollapsed));
    if (chatToggle) chatToggle.setAttribute('aria-expanded', String(!layout.chatCollapsed));
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
      hero.classList.toggle('is-maximized');
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
    const scroller = chatLog.parentElement; // .hero-chat, the scrollable element
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
    pageContent.querySelectorAll('.hero-stack li[data-skill]').forEach((badge) => {
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

  function parseJSON(id) {
    const node = document.getElementById(id);
    if (!node) return null;
    let v = node.textContent;
    for (let i = 0; i < 3 && typeof v === 'string'; i++) v = JSON.parse(v);
    return v;
  }

  let greetedForNav = -1;

  // Called on initial load and after every SPA route swap. Only the home
  // page's payload carries agent-labels/skill-facts JSON; when present and
  // not already shown for this exact navigation, it shows a one-line
  // greeting (no scripted Q&A — real questions get real AI answers).
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

  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (busy.active) return; // one turn (skill badge or real question) at a time
      const question = chatInput.value.trim();
      if (!question) return;
      chatInput.value = '';
      askAI(question);
    });
  }
})();
