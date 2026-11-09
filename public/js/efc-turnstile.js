// Turnstile site key by hostname (loaded BEFORE Cloudflare's api.js, both deferred, so this runs first).
// fish-cabo.com keeps the real site key written in the HTML. Any other host (localhost, *.workers.dev previews) uses
// Cloudflare's public TEST site key, which works on every hostname — the real key there causes error 110200
// ("domain not authorized"). The Worker pairs it with the matching test secret off-production only.
(function () {
  var h = location.hostname;
  if (h === 'fish-cabo.com' || h === 'www.fish-cabo.com') return;
  var els = document.querySelectorAll('.cf-turnstile');
  for (var i = 0; i < els.length; i++) els[i].setAttribute('data-sitekey', '1x00000000000000000000AA');
})();
