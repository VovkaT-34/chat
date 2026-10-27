// Fail-closed visibility gate for the two administrator-only game cards.
(async function applyGameCardAccess() {
  const protectedCards = [
    { selector: 'a.play[href="game-glaz-boga.html"]', name: 'Glaz Boga' },
    { selector: 'a.play[href="game-airplanes2.html"]', name: 'Airplanes 2' }
  ];

  // Cards carry the HTML hidden attribute, so they remain hidden if this check
  // fails, Supabase is unavailable, or this script cannot complete.
  const cards = protectedCards.map(item => ({
    ...item,
    card: document.querySelector(item.selector)?.closest('.game-card')
  })).filter(item => item.card);

  try {
    if (!window.supabaseClient) {
      console.warn('Game access check: Supabase client is unavailable; restricted cards stay hidden.');
      return;
    }

    const { data: { user } = {}, error: userError } = await window.supabaseClient.auth.getUser();
    if (userError || !user) return;

    const { data: profile, error: profileError } = await window.supabaseClient
      .from('profiles')
      .select('approved,role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.approved !== true ||
        !['admin', 'superadmin'].includes(profile.role)) {
      return;
    }

    for (const item of cards) item.card.hidden = false;
  } catch (error) {
    console.warn('Game access check failed; restricted cards stay hidden.', error);
  }
})();
