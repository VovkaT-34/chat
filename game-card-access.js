// Show only applications explicitly allowed for the signed-in, approved user.
(async function applyGameCardAccess() {
  const links = [...document.querySelectorAll('a.play[data-app-id]')];
  if (!links.length) return;
  try {
    const client = window.supabaseClient;
    if (!client) return;
    const { data, error } = await client.rpc('get_my_app_permissions');
    if (error || !Array.isArray(data)) return;
    const permissions = new Map(data.map(item => [item.app_id, item.allowed === true]));
    links.forEach(link => {
      const card = link.closest('.game-card');
      if (card) card.hidden = permissions.get(link.dataset.appId) !== true;
    });
  } catch (error) {
    console.warn('Application access verification failed; restricted cards remain hidden.', error);
  }
})();
