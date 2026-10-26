const status = document.getElementById('google-bridge-status');
const returnUrl = new URLSearchParams(location.search).get('returnUrl');
const allowedOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1):(?:5173|5174|5501)$/;
const linkCode = location.hash.startsWith('#link-intent=') ? decodeURIComponent(location.hash.slice('#link-intent='.length)) : null;
if (linkCode) history.replaceState(null, '', location.pathname + location.search);

async function start() {
  let destination;
  try { destination = new URL(returnUrl); } catch { /* A PixelVerse page URL is required. */ }
  if (!destination || !allowedOrigin.test(destination.origin) || !/\/(?:blank|image|gallery)\.html$/.test(destination.pathname) ||
      location.origin !== 'http://localhost:5173') {
    status.textContent = 'This return page is not recognized. Go back to PixelVerse and start sign-in again.';
    return;
  }
  try {
    const response = await fetch('/api/auth/config');
    const config = await response.json();
    if (!response.ok || !config.googleClientId) throw new Error('Google sign-in is unavailable.');
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        use_fedcm_for_button: true,
        callback: async ({ credential }) => {
          if (typeof credential !== 'string') return;
          status.textContent = 'Completing sign-in…';
          try {
            const result = await fetch(linkCode ? '/api/auth/complete-google-link' : '/api/auth/google-transfer', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential, audienceOrigin: destination.origin, ...(linkCode ? { code: linkCode } : {}) }),
            });
            const data = await result.json().catch(() => ({}));
            if (!result.ok) throw new Error(data.error || `Google sign-in failed (HTTP ${result.status}).`);
            if (!linkCode && !data.code) throw new Error('Google sign-in did not receive a return code.');
            destination.hash = linkCode ? 'google-linked' : `google-transfer=${encodeURIComponent(data.code)}`;
            status.textContent = 'Returning to your canvas…';
            location.replace(destination.href);
          } catch (error) { status.textContent = error.message; }
        },
      });
      window.google.accounts.id.renderButton(document.getElementById('google-bridge-button'), {
        theme: 'filled_black', size: 'large', width: 260,
        click_listener: () => {
          const promptMessage = 'Choose your Google account in the browser prompt.';
          status.textContent = promptMessage;
          setTimeout(() => {
            if (status.textContent === promptMessage)
              status.textContent = 'No Google prompt appeared? Open PixelVerse at http://localhost:5173 in Chrome or Edge and try again.';
          }, 12000);
        },
      });
      status.textContent = 'Choose your Google account to continue.';
    };
    script.onerror = () => { status.textContent = 'Google sign-in could not load. Try again.'; };
    document.head.appendChild(script);
  } catch (error) { status.textContent = error.message; }
}

start();
