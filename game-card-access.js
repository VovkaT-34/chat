// Restrict the two special game cards to approved admin accounts.
(async function applyGameCardAccess() {
  const cards = [
    'a.play[href="game-glaz-boga.html"]',
    'a.play[href="game-airplanes2.html"]'
  ].map(selector => document.querySelector(selector)?.closest('.game-card')).filter(Boolean);

  // HTML marks these cards hidden by default; keep them hidden on any failure.
  try {
    const client = window.supabaseClient;
    if (!client) return;

    const { data: userData, error: userError } = await client.auth.getUser();
    const user = userData && userData.user;
    if (userError || !user || !user.id) return;

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('approved,role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.approved !== true) return;
    const role = String(profile.role || '').trim().toLowerCase();
    if (role !== 'admin' && role !== 'superadmin') return;

    cards.forEach(card => { card.hidden = false; });
  } catch (error) {
    console.warn('Game card access verification failed; restricted cards remain hidden.', error);
  }
})();
