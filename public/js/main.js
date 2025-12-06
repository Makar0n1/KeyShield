// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add animation on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
        }
    });
}, observerOptions);

// Observe all feature cards and steps
document.querySelectorAll('.feature-card, .step, .pricing-card').forEach(el => {
    observer.observe(el);
});

// Toggle Table of Contents
function toggleTOC() {
    const wrapper = document.querySelector('.toc-wrapper');
    const arrow = document.querySelector('.toc-toggle-arrow');
    if (wrapper) {
        wrapper.classList.toggle('open');
        if (arrow) {
            arrow.textContent = wrapper.classList.contains('open') ? '▲' : '▼';
        }
    }
}

// Toggle Description (category/tag) with gradient fade
function toggleDescription(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (wrapper) {
        wrapper.classList.toggle('open');
        const btn = wrapper.querySelector('.toggle-text');
        const icon = wrapper.querySelector('.toggle-icon');
        if (btn) {
            btn.textContent = wrapper.classList.contains('open') ? 'Свернуть' : 'Читать полностью';
        }
        if (icon) {
            icon.textContent = wrapper.classList.contains('open') ? '▲' : '▼';
        }
    }
}

// Legacy support
function toggleCategoryDescription() {
    toggleDescription('categoryDescWrapper');
}

// Toggle mobile menu
function toggleMobileMenu() {
    const nav = document.getElementById('mobileNav');
    const toggle = document.querySelector('.mobile-menu-toggle');
    if (nav && toggle) {
        nav.classList.toggle('active');
        toggle.classList.toggle('active');
    }
}
