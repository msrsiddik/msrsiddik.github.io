
document.addEventListener('DOMContentLoaded', function() {
    const symbols = ['✨', '⭐', '🌟', '💫', '✵', '🎩', '🪄'];

    function createMagicParticle() {
        const particle = document.createElement('div');
        particle.className = 'magic-particle';
        particle.textContent = symbols[Math.floor(Math.random() * symbols.length)];
        particle.style.left = Math.random() * window.innerWidth + 'px';
        particle.style.top = Math.random() * window.innerHeight + 'px';
        particle.style.animationDelay = Math.random() * 2 + 's';

        document.body.appendChild(particle);

        setTimeout(() => particle.remove(), 3000);
    }

    // Create particles during page load
    for (let i = 0; i < 15; i++) {
        setTimeout(() => createMagicParticle(), i * 200);
    }
});