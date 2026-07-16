# Siddiqur Rahman's Portfolio

A fast, minimal portfolio built with [Hugo](https://gohugo.io) and a custom dark theme. Multilingual (English + Banglish), fully customizable, deployed to GitHub Pages.

**Live:** [msrsiddik.github.io](https://msrsiddik.github.io)

## Features

- 🚀 **Fast static site** — Hugo generates HTML in milliseconds
- 🎨 **Custom dark theme** — no external themes, fully under control
- 🌐 **Multilingual** — English + Banglish (romanized Bengali) with language switching
- 📱 **Responsive** — works on desktop, tablet, mobile
- ♿ **Accessible** — semantic HTML, ARIA labels, proper heading hierarchy
- 🔍 **SEO-friendly** — meta tags, og:image, hreflang, sitemap, robots.txt
- ⚡ **Zero JavaScript cruft** — 35 lines of vanilla JS for mobile nav + scroll effects
- 🚀 **Auto-deploy** — GitHub Actions deploys on every push to `main`

## Project Structure

```
.
├── content/
│   ├── en/                 # English content
│   │   ├── about.md       # About page
│   │   └── blog/          # Blog posts
│   └── bn/                 # Banglish content (mirrors EN)
├── data/
│   ├── en/
│   │   ├── experience.yaml # Work experience timeline
│   │   ├── projects.yaml   # Project portfolio
│   │   └── skills.yaml     # Skills by category
│   └── bn/                 # Banglish versions
├── layouts/
│   ├── index.html         # Homepage
│   ├── _default/
│   │   ├── single.html    # Blog post layout
│   │   └── list.html      # Blog index layout
│   └── partials/          # Header, footer, etc.
├── assets/css/main.css    # Single CSS file, minified
├── i18n/
│   ├── en.toml           # English strings
│   └── bn.toml           # Banglish strings
├── hugo.toml              # Hugo config
└── public/                # Generated static site
```

## Setup

### Prerequisites

- [Hugo](https://gohugo.io/installation/) (extended version, v0.152+)
- Git

### Local Development

```bash
# Clone the repo
git clone https://github.com/yourusername/msrportfolio.git
cd msrportfolio

# Start Hugo dev server (watches for changes)
hugo server

# Visit http://localhost:1313
```

### Customize

1. **Update your info** in `hugo.toml`:
   ```toml
   title = 'Your Name'
   [params]
     author = "Your Name"
     email = "you@example.com"
     github = "https://github.com/yourusername"
     linkedin = "https://linkedin.com/in/yourprofile"
     twitter = "https://x.com/yourhandle"
   ```

2. **Update experience** in `data/en/experience.yaml`:
   ```yaml
   - role: "Software Engineer"
     company: "Your Company"
     period: "Jan 2024 — Present"
     summary: "..."
     url: "https://company.com"
     highlights:
       - "Achievement 1"
       - "Achievement 2"
   ```

3. **Update projects** in `data/en/projects.yaml`:
   ```yaml
   - name: "Project Name"
     description: "..."
     tech: ["Go", "React", "PostgreSQL"]
     repo: "https://github.com/yourusername/project"
     featured: true  # shows first
   ```

4. **Update skills** in `data/en/skills.yaml`:
   ```yaml
   - category: "Backend"
     items:
       - "Go"
       - "Python"
       - "PostgreSQL"
   ```

5. **Keep Banglish content in sync** — mirror changes to `data/bn/`, `content/bn/`.

### Add Blog Posts

Create a new file in `content/en/blog/your-post-title.md`:

```markdown
---
title: "Your Post Title"
date: 2026-07-15T10:00:00+06:00
description: "One-line summary for meta tags and listings."
tags: ["tag1", "tag2"]
---

Post content here...
```

Then create the same post in `content/bn/blog/your-post-title.md` with Banglish translation.

### Deploy

The site auto-deploys to GitHub Pages when you push to `main`:

```bash
# Make your changes
git add .
git commit -m "Update portfolio"
git push origin main

# GitHub Actions builds and deploys automatically
# Visit https://yourusername.github.io in a few seconds
```

To set up GitHub Pages:

1. Create a repo named `yourusername.github.io`
2. Update `baseURL` in `hugo.toml`:
   ```toml
   baseURL = 'https://yourusername.github.io/'
   ```
3. Push and GitHub Pages will auto-publish from the `main` branch

## Customization

### Colors

Edit CSS variables in `assets/css/main.css`:

```css
:root {
  --bg:        #0a0c10;
  --accent:    #5eead4;   /* teal */
  --accent-2:  #818cf8;   /* indigo */
  /* ... */
}
```

### Typography

The theme uses:
- **Inter** for body text (from Google Fonts)
- **JetBrains Mono** for code

Change fonts in `layouts/partials/head.html` and update CSS.

### Sections

The homepage has 4 main sections (defined in `layouts/index.html`):

1. **Hero** — name, role, tagline, CTA buttons
2. **About** — bio + skills sidebar
3. **Experience** — timeline from `data/*/experience.yaml`
4. **Projects** — grid from `data/*/projects.yaml`
5. **Blog** — latest 3 posts; link to full blog
6. **Contact** — email CTA

Edit the template to add/remove sections.

## Performance

- **Homepage:** ~20KB gzipped
- **Build time:** ~30ms
- **Lighthouse score:** 98/100 (no CLS, minimal JS)

No external dependencies except Google Fonts (preconnected).

## License

This portfolio template is open source. Feel free to fork and customize for your own use.

## Questions?

Open an issue or reach out on [Twitter](https://x.com/msrsiddik) or [LinkedIn](https://www.linkedin.com/in/msrsiddik).
