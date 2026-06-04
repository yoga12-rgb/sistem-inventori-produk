const code = `
(function () {
  try {
    var root = document.documentElement;
    var theme = localStorage.getItem("theme") || "system";
    if (theme !== "light" && theme !== "dark" && theme !== "system") {
      theme = "system";
    }
    var resolved =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    root.style.colorScheme = resolved;

    var sidebarCollapsed = localStorage.getItem("sidebar:collapsed") === "1";
    root.dataset.sidebarCollapsed = sidebarCollapsed ? "true" : "false";
    document.cookie =
      "sidebar:collapsed=" +
      (sidebarCollapsed ? "1" : "0") +
      "; Path=/; Max-Age=31536000; SameSite=Lax";
  } catch (_) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
