const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!prefersReducedMotion) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  document.querySelectorAll("[data-animate]").forEach((el) => {
    el.classList.add("animate-ready");
    observer.observe(el);
  });
}

const feed = document.querySelector(".signal-feed");
if (feed && !prefersReducedMotion) {
  setInterval(() => {
    const first = feed.firstElementChild;
    if (!first) return;
    first.classList.add("fade-out");
    setTimeout(() => {
      first.classList.remove("fade-out");
      feed.appendChild(first);
    }, 400);
  }, 2600);
}
