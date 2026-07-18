// Mobile nav toggle
const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
if (toggle && links) {
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  links.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    })
  );
}

// Header border on scroll
const header = document.querySelector('.site-header');
const onScroll = () => header && header.classList.toggle('scrolled', window.scrollY > 8);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Reveal sections on scroll
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.08 }
);
document.querySelectorAll('.section').forEach((s) => io.observe(s));

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

// Agentic hero: scripted conversation drives the web-view preview.
(function () {
  const hero = document.querySelector('[data-agent-hero]');
  if (!hero) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return; // static fallback stays visible

  // Hugo's jsonify inside a script tag can emit the payload double-encoded
  // (a JSON string wrapping the real JSON), so parse until we get the array.
  function parseJSON(id) {
    const node = document.getElementById(id);
    if (!node) return null;
    let v = node.textContent;
    for (let i = 0; i < 3 && typeof v === 'string'; i++) v = JSON.parse(v);
    return v;
  }

  let script, labels, skillFacts;
  try {
    script = parseJSON('agent-script');
    labels = parseJSON('agent-labels');
    skillFacts = parseJSON('skill-facts') || {};
  } catch (_) {
    return; // leave static content in place
  }
  if (!Array.isArray(script) || !script.length) return;

  const inputText = hero.querySelector('[data-input-text]');
  const placeholder = hero.querySelector('[data-input-placeholder]');
  const chatLog = hero.querySelector('[data-chat-log]');
  const blocks = hero.querySelectorAll('.wv-block');
  const loading = hero.querySelector('[data-loading]');
  const queueEl = hero.querySelector('[data-queue]');
  const skillBadges = hero.querySelectorAll('.hero-stack li[data-skill]');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  // typeInto is cancellable: pass a state object with a `cancelled` flag,
  // and it stops mid-character instead of finishing the string.
  async function typeInto(el, text, state) {
    el.textContent = '';
    for (const ch of text) {
      if (state && state.cancelled) return false;
      el.textContent += ch;
      await sleep(rand(28, 70));
    }
    return true;
  }

  function addBubble(cls, text) {
    const el = document.createElement('div');
    el.className = 'chat-bubble ' + cls;
    el.textContent = text;
    chatLog.appendChild(el);
    return el;
  }

  function showThinking() {
    const el = document.createElement('div');
    el.className = 'chat-bubble agent thinking';
    el.setAttribute('title', labels.thinking || 'thinking');
    el.innerHTML = '<span class="d"></span><span class="d"></span><span class="d"></span>';
    chatLog.appendChild(el);
    return el;
  }

  function revealBlock(name) {
    blocks.forEach((b) => {
      if (b.getAttribute('data-block') === name) b.classList.add('is-visible');
    });
  }

  // Shared busy flag: only one Q&A (intro script or skill click) types at a time.
  const busy = { active: false };

  async function playTurn(question, answer, opts) {
    opts = opts || {};
    busy.active = true;
    if (placeholder) placeholder.style.display = 'none';
    const typed = await typeInto(inputText, question, opts.state);
    if (!typed) { inputText.textContent = ''; busy.active = false; return; }
    await sleep(400);

    addBubble('user', question);
    inputText.textContent = '';
    if (placeholder) placeholder.style.display = '';
    await sleep(300);

    const thinking = showThinking();
    await sleep(rand(500, 800));
    thinking.remove();
    if (opts.state && opts.state.cancelled) { busy.active = false; return; }

    const bubble = addBubble('agent', '');
    if (opts.render) revealBlock(opts.render);
    const finished = await typeInto(bubble, answer, opts.state);
    if (!finished) bubble.remove();
    await sleep(700);
    busy.active = false;
  }

  async function runOnce() {
    for (const step of script) {
      await playTurn(step.q, step.a, { render: step.render });
    }
  }

  async function boot() {
    // Blocks start hidden in markup (loading dots cover the web-view), so
    // there's nothing to flash — just hold briefly, then hand off to the
    // scripted animation.
    await sleep(500);
    if (loading) loading.classList.add('is-hidden');
  }

  // --- Skill-click queue -------------------------------------------------
  // Clicking a stack badge queues a "what is X" Q&A. Only one turn plays at
  // a time (shared `busy` flag), so clicks made during the intro script or
  // while another answer is typing wait their turn. Each queued item can be
  // cancelled — either before it starts (just drop it) or mid-typing (flip
  // its `cancelled` flag so `playTurn`'s typing loop bails out).
  const queue = [];
  const lastVariant = new Map(); // skill -> last shown variant index, avoids immediate repeats
  let queueSeq = 0;

  function pickVariant(skill) {
    const variants = skillFacts[skill];
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
    const question = (labels.skillQuestion || '{skill}?').replace('{skill}', skill);
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

  skillBadges.forEach((badge) => {
    const skill = badge.getAttribute('data-skill');
    badge.addEventListener('click', () => queueSkill(skill));
    badge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        queueSkill(skill);
      }
    });
  });

  async function run() {
    await boot();
    await runOnce(); // plays once, then stays on the final state — skill clicks still queue after
  }

  // Start only when the hero scrolls into view (perf).
  const heroIO = new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) {
      obs.disconnect();
      run();
    }
  }, { threshold: 0.4 });
  heroIO.observe(hero);
})();
