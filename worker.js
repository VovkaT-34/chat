export default {
  async fetch(request, env) {

    // Отдаём сайт

    return env.ASSETS.fetch(request);

  }

};
