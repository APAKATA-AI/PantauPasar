"use strict";
(() => {
  const preference = matchMedia("(prefers-color-scheme: dark)");
  let chosen;
  try { chosen = localStorage.getItem("pp_theme"); } catch {}
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0d1927" : "#f3efe6");
    const button = document.querySelector("#theme-toggle");
    if (button) {
      button.textContent = theme === "dark" ? "Tema terang" : "Tema gelap";
      button.setAttribute("aria-label", `Aktifkan ${button.textContent.toLowerCase()}`);
    }
    window.dispatchEvent(new Event("pantau-theme-change"));
  };
  apply(["light", "dark"].includes(chosen) ? chosen : preference.matches ? "dark" : "light");
  document.addEventListener("DOMContentLoaded", () => {
    apply(document.documentElement.dataset.theme);
    document.querySelector("#theme-toggle")?.addEventListener("click", () => {
      chosen = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem("pp_theme", chosen); } catch {}
      apply(chosen);
    });
  });
  preference.addEventListener("change", () => {
    if (!["light", "dark"].includes(chosen)) apply(preference.matches ? "dark" : "light");
  });
})();
