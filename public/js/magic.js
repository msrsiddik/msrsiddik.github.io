/* ========================================
   MAGICAL PORTFOLIO - INTERACTIVE EFFECTS
   ======================================== */

document.addEventListener('DOMContentLoaded', function() {

    // ========== THEME COLOR DETECTION ==========
    // Automatically detects and uses existing theme colors

    function getThemeColors() {
        const root = getComputedStyle(document.documentElement);

        return {
            primary: root.getPropertyValue('--color-primary') ||
                root.getPropertyValue('--accent') || '#667eea',
            secondary: root.getPropertyValue('--color-secondary') ||
                root.getPropertyValue('--accent-alt') || '#764ba2',
            accent: root.getPropertyValue('--color-accent') ||
                root.getPropertyValue('--accent') || '#ffd700',
            text: root.getPropertyValue('--color-text') ||
                root.getPropertyValue('--fg') || '#333',
            bg: root.getPropertyValue('--color-bg') ||
                root.getPropertyValue('--bg') || '#fff'
        };
    }

    const themeColors = getThemeColors();

    // Apply theme colors to CSS variables
    document.documentElement.style.setProperty('--magic-primary', themeColors.primary);
    document.documentElement.style.setProperty('--magic-secondary', themeColors.secondary);
    document.documentElement.style.setProperty('--magic-accent', themeColors.accent);
    document.documentElement.style.setProperty('--magic-text', themeColors.text);
    document.documentElement.style.setProperty('--magic-bg', themeColors.bg);

    // ========== CONFIGURATION ==========

    const SECOND_IMAGE_URL = '/images/avatar.png';

    // ========== DOM ELEMENT SETUP ==========

    const about = document.querySelector('.about');
    const avatar = document.querySelector('.about .avatar');

    // Exit if required elements not found
    if (!about || !avatar) return;

    const originalImg = avatar.querySelector('img');
    if (!originalImg) return;

    // Store original image URL
    const ORIGINAL_IMAGE_URL = originalImg.src;

    // Add magic animation classes to elements
    avatar.classList.add('magic-item');
    const h1 = about.querySelector('h1');
    const h2 = about.querySelector('h2');
    const ul = about.querySelector('ul');

    if (h1) h1.classList.add('magic-item');
    if (h2) h2.classList.add('magic-item');
    if (ul) ul.classList.add('magic-item');

    // ========== CREATE MAGIC WAND ELEMENT ==========
    // Animated wand that appears on page load

    const wand = document.createElement('div');
    wand.className = 'magic-wand';
    wand.textContent = '🪄';
    about.appendChild(wand);

    // ========== CREATE SPARKLE ELEMENTS ==========
    // Decorative sparkles around the content

    const sparklesContainer = document.createElement('div');
    sparklesContainer.className = 'sparkles';
    for (let i = 1; i <= 5; i++) {
        const sparkle = document.createElement('span');
        sparkle.className = 'sparkle';
        sparkle.style.setProperty('--i', i);
        sparklesContainer.appendChild(sparkle);
    }
    about.appendChild(sparklesContainer);

    // ========== SETUP SINGLE IMAGE WITH CONTAINER ==========
    // Wrap image in container for hover detection

    const avatarContainer = document.createElement('div');
    avatarContainer.className = 'avatar-container';

    // Move existing image into container
    const img = originalImg.cloneNode(true);
    avatarContainer.appendChild(img);

    // Replace avatar content
    avatar.innerHTML = '';
    avatar.appendChild(avatarContainer);

    // ========== IMAGE SWAP ON HOVER ==========
    // Change image src on hover with smooth transition

    avatarContainer.addEventListener('mouseenter', function() {
        // Change to magic image
        img.style.opacity = '0';
        setTimeout(() => {
            img.src = SECOND_IMAGE_URL;
            img.style.opacity = '1';
        }, 250);

        // Trigger storm effect
        startStorm();
    });

    avatarContainer.addEventListener('mouseleave', function() {
        // Change back to original image
        img.style.opacity = '0';
        setTimeout(() => {
            img.src = ORIGINAL_IMAGE_URL;
            img.style.opacity = '1';
        }, 250);
    });

    // Add opacity transition to image
    img.style.transition = 'opacity 0.25s ease, transform 0.5s ease, filter 0.5s ease';

    // ========== CREATE STORM EFFECT OVERLAYS ==========
    // Full-screen storm elements

    const lightningOverlay = document.createElement('div');
    lightningOverlay.className = 'lightning-overlay';
    document.body.appendChild(lightningOverlay);

    const rainContainer = document.createElement('div');
    rainContainer.className = 'rain-container';
    document.body.appendChild(rainContainer);

    const windContainer = document.createElement('div');
    windContainer.className = 'wind-container';
    document.body.appendChild(windContainer);

    // ========== STORM EFFECT FUNCTIONS ==========

    let stormTimeout;

    // Create rain drops across entire screen
    function createRain() {
        rainContainer.innerHTML = '';
        for (let i = 0; i < 100; i++) {
            const rain = document.createElement('div');
            rain.className = 'rain';
            rain.style.left = Math.random() * 100 + '%';
            rain.style.animationDuration = Math.random() * 0.5 + 0.5 + 's';
            rain.style.animationDelay = Math.random() * 2 + 's';
            rainContainer.appendChild(rain);
        }
    }

    // Create wind particles
    function createWind() {
        windContainer.innerHTML = '';
        for (let i = 0; i < 30; i++) {
            const wind = document.createElement('div');
            wind.className = 'wind-particle';
            wind.style.top = Math.random() * 100 + '%';
            wind.style.animationDuration = Math.random() * 2 + 1 + 's';
            wind.style.animationDelay = Math.random() * 2 + 's';
            windContainer.appendChild(wind);
        }
    }

    // Create lightning strikes with flash effect
    function createLightning() {
        // Screen flash
        lightningOverlay.classList.add('flash');
        setTimeout(() => {
            lightningOverlay.classList.remove('flash');
        }, 400);

        // Create multiple lightning bolts
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const lightning = document.createElement('div');
                lightning.className = 'lightning strike';
                lightning.style.left = Math.random() * 100 + '%';
                lightning.style.top = '0';
                document.body.appendChild(lightning);

                // Remove after animation
                setTimeout(() => lightning.remove(), 300);
            }, i * 100);
        }
    }

    // Create moving clouds
    function createClouds() {
        for (let i = 0; i < 5; i++) {
            const cloud = document.createElement('div');
            cloud.className = 'cloud';
            cloud.style.width = Math.random() * 100 + 100 + 'px';
            cloud.style.height = Math.random() * 40 + 40 + 'px';
            cloud.style.top = Math.random() * 50 + '%';
            cloud.style.left = '-200px';
            document.body.appendChild(cloud);

            // Activate animation
            setTimeout(() => {
                cloud.classList.add('active');
            }, i * 200);

            // Remove after animation completes
            setTimeout(() => cloud.remove(), 3000);
        }
    }

    // Start full storm sequence
    function startStorm() {
        clearTimeout(stormTimeout);

        // Shake the card
        about.classList.add('storm-shake');
        setTimeout(() => {
            about.classList.remove('storm-shake');
        }, 500);

        // Create all storm elements
        createRain();
        createWind();
        createClouds();

        // Show rain and wind
        rainContainer.classList.add('active');
        windContainer.classList.add('active');

        // Multiple lightning strikes with delays
        createLightning();
        setTimeout(() => createLightning(), 500);
        setTimeout(() => createLightning(), 1200);

        // Stop storm after 2 seconds
        stormTimeout = setTimeout(stopStorm, 2000);
    }

    // Stop storm effects
    function stopStorm() {
        rainContainer.classList.remove('active');
        windContainer.classList.remove('active');
    }

    // ========== BACKGROUND STARS ==========
    // Create twinkling stars across the page

    function createStars() {
        for (let i = 0; i < 50; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.style.width = Math.random() * 3 + 'px';
            star.style.height = star.style.width;
            star.style.left = Math.random() * 100 + '%';
            star.style.top = Math.random() * 100 + '%';
            star.style.animationDelay = Math.random() * 2 + 's';
            document.body.appendChild(star);
        }
    }

    createStars();

    // ========== MAGIC PARTICLES ON HOVER ==========
    // Colorful particles that appear when hovering elements

    function createMagicParticles(e) {
        // Use detected theme colors
        const colors = [
            themeColors.primary,
            themeColors.secondary,
            themeColors.accent,
            themeColors.primary + '80', // Semi-transparent
            themeColors.secondary + '80'
        ];

        // Create 15 particles
        for(let i = 0; i < 15; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';

            // Random movement direction
            const tx = (Math.random() - 0.5) * 200;
            const ty = (Math.random() - 0.5) * 200;

            // Position at cursor
            particle.style.left = e.pageX + 'px';
            particle.style.top = e.pageY + 'px';
            particle.style.background = colors[Math.floor(Math.random() * colors.length)];
            particle.style.boxShadow = `0 0 10px ${colors[Math.floor(Math.random() * colors.length)]}`;
            particle.style.setProperty('--tx', tx + 'px');
            particle.style.setProperty('--ty', ty + 'px');
            particle.style.animationDelay = Math.random() * 0.1 + 's';

            document.body.appendChild(particle);

            // Remove after animation
            setTimeout(() => particle.remove(), 1000);
        }
    }

    // Add particle effect to all interactive elements
    document.querySelectorAll('.magic-item, .about ul li a').forEach(item => {
        item.addEventListener('mouseenter', createMagicParticles);
    });

    // ========== CURSOR TRAIL EFFECT ==========
    // Sparkly trail that follows the cursor

    document.addEventListener('mousemove', (e) => {
        // Only create trail 10% of the time (performance optimization)
        if (Math.random() > 0.9) {
            const trail = document.createElement('div');
            trail.className = 'particle';
            trail.style.left = e.pageX + 'px';
            trail.style.top = e.pageY + 'px';
            trail.style.background = themeColors.accent;
            trail.style.width = '3px';
            trail.style.height = '3px';
            trail.style.setProperty('--tx', (Math.random() - 0.5) * 50 + 'px');
            trail.style.setProperty('--ty', (Math.random() - 0.5) * 50 + 'px');
            document.body.appendChild(trail);
            setTimeout(() => trail.remove(), 1000);
        }
    });

    // ========== THEME CHANGE OBSERVER ==========
    // Watches for theme changes and updates colors accordingly

    const observer = new MutationObserver(() => {
        const newColors = getThemeColors();
        document.documentElement.style.setProperty('--magic-primary', newColors.primary);
        document.documentElement.style.setProperty('--magic-secondary', newColors.secondary);
        document.documentElement.style.setProperty('--magic-accent', newColors.accent);
        document.documentElement.style.setProperty('--magic-text', newColors.text);
        document.documentElement.style.setProperty('--magic-bg', newColors.bg);
    });

    // Watch for class or data-theme attribute changes on html element
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme']
    });

});