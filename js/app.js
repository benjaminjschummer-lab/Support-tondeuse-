/* ComptaPro — routeur et démarrage */
(function (App) {
  const { $, $$ } = App;
  const strip = (h) => String(h || '').replace(/^#\/?/, '');
  let current = strip(location.hash) || 'dashboard';

  App.applyTheme = () => {
    let t = 'auto';
    try { t = localStorage.getItem('comptapro.theme') || 'auto'; } catch (e) { /* ignore */ }
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  };

  /* Navigation interne ; seul le nom de l'écran apparaît dans l'adresse (#factures, #tva…) */
  App.go = (h) => {
    current = strip(h) || 'dashboard';
    const top = current.split('/')[0];
    if (strip(location.hash) !== top) { try { history.replaceState(null, '', '#' + top); } catch (e) { /* ignore */ } }
    App.render();
    window.scrollTo(0, 0);
  };

  App.render = () => {
    const parts = current.split('/');
    const route = App.views[parts[0]] ? parts[0] : 'dashboard';
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
    document.body.classList.remove('nav-open');
    const view = $('#view');
    try { App.views[route](view, parts.slice(1)); }
    catch (e) { console.error(e); view.innerHTML = `<div class="alert danger">Erreur d'affichage : ${App.esc(e.message)}</div>`; }
    const pending = App.state.bank.filter((b) => !b.matched).length;
    const pill = $('#pill-bank'); pill.hidden = !pending; pill.textContent = pending;
    const toSend = App.peppolToSend ? App.peppolToSend().length : 0;
    const pp = $('#pill-peppol'); if (pp) { pp.hidden = !toSend; pp.textContent = toSend; }
    $('#company-foot').innerHTML = `<strong>${App.esc(App.state.settings.company.name)}</strong><br>${App.esc(App.state.settings.company.legalForm)} · ${App.cloudStatus === 'ok' ? 'enregistré dans votre espace privé' : 'données stockées sur cet appareil'}`;
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    if (a.getAttribute('href') !== '#') App.go(a.getAttribute('href'));
  });
  window.addEventListener('hashchange', () => {
    const h = strip(location.hash);
    if (h && h !== current.split('/')[0]) { current = h; App.render(); }
  });
  App.applyTheme();
  $('#menu-btn').onclick = () => document.body.classList.toggle('nav-open');
  App.render();
  App.initCloud(() => App.render());
  App.ai.init().then(() => App.render());
})(window.App);
