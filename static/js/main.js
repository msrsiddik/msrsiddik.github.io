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
    let v = document.getElementById(id).textContent;
    for (let i = 0; i < 3 && typeof v === 'string'; i++) v = JSON.parse(v);
    return v;
  }

  let script, labels;
  try {
    script = parseJSON('agent-script');
    labels = parseJSON('agent-labels');
  } catch (_) {
    return; // leave static content in place
  }
  if (!Array.isArray(script) || !script.length) return;

  const inputText = hero.querySelector('[data-input-text]');
  const placeholder = hero.querySelector('[data-input-placeholder]');
  const chatLog = hero.querySelector('[data-chat-log]');
  const blocks = hero.querySelectorAll('.wv-block');
  const loading = hero.querySelector('[data-loading]');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  async function typeInto(el, text) {
    el.textContent = '';
    for (const ch of text) {
      el.textContent += ch;
      await sleep(rand(28, 70));
    }
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

  async function runOnce() {
    for (const step of script) {
      // Type the question in the input bar.
      if (placeholder) placeholder.style.display = 'none';
      await typeInto(inputText, step.q);
      await sleep(500);

      // Send: move question into chat as a user bubble.
      addBubble('user', step.q);
      inputText.textContent = '';
      if (placeholder) placeholder.style.display = '';
      await sleep(350);

      // Agent thinks, then answers while the preview reveals.
      const thinking = showThinking();
      await sleep(rand(600, 900));
      thinking.remove();

      const bubble = addBubble('agent', '');
      revealBlock(step.render);
      await typeInto(bubble, step.a);
      await sleep(900);
    }
  }

  async function boot() {
    // Blocks start hidden in markup (loading dots cover the web-view), so
    // there's nothing to flash — just hold briefly, then hand off to the
    // scripted animation.
    await sleep(500);
    if (loading) loading.classList.add('is-hidden');
  }

  async function run() {
    await boot();
    await runOnce(); // plays once, then stays on the final state
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
