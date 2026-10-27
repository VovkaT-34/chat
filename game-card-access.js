// Show the two restricted game cards only after the site's auth check succeeds
// and Supabase confirms an administrator role. Fail closed on every error.
(async function applyGameCardAccess() {
  const selectors = [
    'a.play[href="game-glaz-boga.html"]',
    'a.play[href="game-airplanes2.html"]'
  ];
  const cards = selectors
    .map(selector => document.querySelector(selector)?.closest('.game-card'))
    .filter(Boolean);

  // The HTML hidden attribute is the safe default for logged-out/unverified users.
  try {
    if (typeof window.checkAuth === 'function') {
      // auth-check.js also loads/validates the current approved session.
      await window.checkAuth();
    }

    const client = window.supabaseClient;
    if (!client) return;

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    const user = sessionData && sessionData.session && sessionData.session.user;
    if (sessionError || !user || !user.id) return;

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return;
    const role = String(profile.role || '').trim().toLowerCase();
    if (role !== 'admin' && role !== 'superadmin') return;

    cards.forEach(card => { card.hidden = false; });
  } catch (error) {
    console.warn('Restricted game cards remain hidden because access could not be verified.', error);
  }
})();
