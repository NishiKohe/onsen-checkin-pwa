(() => {
  let scheduled = false;
  let lastHeader = -1;
  let lastTabs = -1;

  function applyMeasuredLayout() {
    scheduled = false;
    const header = document.querySelector('.header');
    const tabs = document.querySelector('.app-tabs');
    if (!header || !tabs) return;

    const headerH = Math.max(0, Math.ceil(header.getBoundingClientRect().height));
    const tabsH = Math.max(0, Math.ceil(tabs.getBoundingClientRect().height));

    if (headerH !== lastHeader || tabsH !== lastTabs) {
      lastHeader = headerH;
      lastTabs = tabsH;
      document.documentElement.style.setProperty('--app-header-h', `${headerH}px`);
      document.documentElement.style.setProperty('--app-tabs-h', `${tabsH}px`);
      document.body.classList.add('measured-app-layout');
    }

    if (typeof map !== 'undefined' && map) {
      requestAnimationFrame(() => map.resize?.());
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyMeasuredLayout);
  }

  function install() {
    const header = document.querySelector('.header');
    const tabs = document.querySelector('.app-tabs');
    if (!header || !tabs) {
      setTimeout(install, 100);
      return;
    }

    schedule();

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(schedule);
      observer.observe(header);
      observer.observe(tabs);
    }

    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });
    window.addEventListener('pageshow', schedule);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') schedule();
    });
    window.visualViewport?.addEventListener('resize', schedule, { passive: true });

    // 旅行タブ追加やユーザーボタン追加など、後からUIが変わるケースにも追従。
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(header, { childList: true, subtree: true, attributes: true });
    mutationObserver.observe(tabs, { childList: true, subtree: true, attributes: true });

    document.querySelector('.app-tabs')?.addEventListener('click', () => setTimeout(schedule, 0), true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
