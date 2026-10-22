/** Runs independently of the application bundles, so a failed bundle can still
 * expose a recovery link. Only short failure codes/static paths stay in this tab. */
function installStartupCheck(timeout: number) {
  let ready = false;
  const state = {version: 1, at: Date.now(), status: "starting", failedResources: [] as string[]};
  function save(status: string) {
    state.status = status;
    try { window.sessionStorage.setItem("jlpt-practice.startup-check.v1", JSON.stringify(state)); } catch { /* Optional diagnostics must never block the page. */ }
  }
  function show() {
    const panel = document.getElementById("app-startup-help");
    if (panel) panel.hidden = false;
    else document.addEventListener("DOMContentLoaded", show, {once: true});
  }
  const timer = window.setTimeout(function () { if (!ready) { save("timeout"); show(); } }, timeout);
  window.addEventListener("jlpt:startup-ready", function () {
    ready = true; window.clearTimeout(timer); save("ready");
    const panel = document.getElementById("app-startup-help");
    if (panel) panel.hidden = true;
  });
  window.addEventListener("jlpt:startup-failed", function () { window.clearTimeout(timer); save("page-error"); });
  window.addEventListener("error", function (event) {
    const element = event.target as HTMLElement | null;
    if (element && (element.tagName === "SCRIPT" || element.tagName === "LINK")) {
      const address = element.getAttribute("src") || element.getAttribute("href");
      if (address) {
        try {
          const url = new URL(address, window.location.href);
          if (url.origin === window.location.origin && url.pathname.indexOf("/_next/static/") === 0 && state.failedResources.length < 8 && state.failedResources.indexOf(url.pathname) < 0) state.failedResources.push(url.pathname);
        } catch { /* Ignore unsupported/non-URL resource hints. */ }
      }
      if (!ready) { save("resource-error"); show(); }
      else if (state.failedResources.length) save(state.status);
    } else if (!ready) { save("script-error"); show(); }
  }, true);
  window.addEventListener("unhandledrejection", function () { if (!ready) { save("script-error"); show(); } });
  save("starting");
}

export const startupBootScript = `(${installStartupCheck.toString()})(15000);`;
