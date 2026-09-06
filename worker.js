const GITHUB_PAGES_URL = "https://vovkat-34.github.io/chat/index.html";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(GITHUB_PAGES_URL);

    // Старый Cloudflare Worker больше не должен быть адресом приложения.
    // Любой переход на workers.dev отправляет пользователя на GitHub Pages.
    if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "") {
      return Response.redirect(target.toString(), 301);
    }

    return Response.redirect(target.toString(), 301);
  }
};
