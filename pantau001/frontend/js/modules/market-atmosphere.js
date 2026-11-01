(() => {
  const stage = document.querySelector('.hero-stage');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let inView = true;

  const updateMotion = () => {
    stage.classList.toggle('scene-running', inView && !document.hidden && !reducedMotion.matches);
  };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateMotion();
    }, { threshold: 0.03 }).observe(stage);
  }
  document.addEventListener('visibilitychange', updateMotion);
  reducedMotion.addEventListener('change', updateMotion);
  updateMotion();
})();
