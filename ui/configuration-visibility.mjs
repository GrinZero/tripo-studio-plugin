// A tool result can arrive long before its inline card is actually displayed.
// Only acknowledge visibility once the mounted controls intersect a visible page.
export function watchConfigurationVisibility(element, acknowledge, { doc = document, Observer = IntersectionObserver } = {}) {
  let visible = false, working = false, disposed = false, acknowledged = false;
  async function check() {
    if (disposed || acknowledged || working || !visible || doc.visibilityState !== 'visible') return;
    working = true;
    try {
      await acknowledge();
      acknowledged = true;
    } catch {
      // The card reports the error; subsequent status updates can retry.
    } finally { working = false; }
  }
  const observer = new Observer(entries => {
    visible = entries.some(entry => entry.target === element && entry.isIntersecting);
    check();
  });
  observer.observe(element);
  doc.addEventListener('visibilitychange', check);
  return { check, dispose() { disposed = true; observer.disconnect(); doc.removeEventListener('visibilitychange', check); } };
}
