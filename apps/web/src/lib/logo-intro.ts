// Shared by the root layout (server) and LogoMark (client).

/** sessionStorage flag: the intro has played in this browser session. */
export const LOGO_INTRO_STORAGE_KEY = 'pme:logo-intro-played';

/**
 * Runs in <head> before first paint: if the intro hasn't played this session, mark the page
 * so CSS hides the intro logo's parts (only when motion is allowed) instead of flashing the
 * finished logo before the animation starts.
 */
export const LOGO_INTRO_SCRIPT = `try{if(!sessionStorage.getItem('${LOGO_INTRO_STORAGE_KEY}'))document.documentElement.dataset.logoIntro='pending'}catch(e){}`;
