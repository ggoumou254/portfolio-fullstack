// frontend/js/nav.js
// Nav toggle, dropdowns, scroll behavior, reveal animations

document.addEventListener('DOMContentLoaded', () => {

    /* -------- Mobile toggle -------- */
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('navMenu');

    if (toggle && menu) {
        toggle.addEventListener('click', () => {
            const open = menu.classList.toggle('open');
            toggle.setAttribute('aria-expanded', String(open));
        });
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !toggle.contains(e.target)) {
                menu.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        });
        menu.querySelectorAll('.rg-nav__link').forEach(link => {
            link.addEventListener('click', () => {
                menu.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            });
        });
    }

    /* -------- Dropdowns -------- */
    document.querySelectorAll('.rg-dropdown').forEach(drop => {
        const trigger = drop.querySelector('.rg-dropdown__trigger');
        if (!trigger) return;
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.rg-dropdown.open').forEach(d => { if (d !== drop) d.classList.remove('open'); });
            drop.classList.toggle('open');
            trigger.setAttribute('aria-expanded', String(drop.classList.contains('open')));
        });
        drop.querySelectorAll('.rg-dropdown__item').forEach(item => {
            item.addEventListener('click', () => drop.classList.remove('open'));
        });
    });
    document.addEventListener('click', () => {
        document.querySelectorAll('.rg-dropdown.open').forEach(d => d.classList.remove('open'));
    });

    /* -------- Scroll: nav scrolled class -------- */
    const nav = document.querySelector('.rg-nav');
    if (nav) {
        const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* -------- Lang switch active state -------- */
    const storedLang = localStorage.getItem('app_language') || 'it';
    document.querySelectorAll('.rg-lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === storedLang);
        btn.addEventListener('click', () => {
            document.querySelectorAll('.rg-lang-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    /* -------- Scroll reveal -------- */
    initReveal();
});

function initReveal() {
    const reveals = document.querySelectorAll('.rg-reveal:not(.visible)');
    if (!reveals.length) return;
    if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(en => {
                if (en.isIntersecting) { en.target.classList.add('visible'); obs.unobserve(en.target); }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        reveals.forEach(el => obs.observe(el));
    } else {
        reveals.forEach(el => el.classList.add('visible'));
    }
}

window.addEventListener('routeChanged', initReveal);