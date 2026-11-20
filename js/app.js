/* ComptaPro — routeur et démarrage */
(function (App) {
  const { $, $$ } = App;

  App.applyTheme = () => {
    let t = 'auto';
    try { t = localStorage.getItem('comptapro.theme') || 'auto'; } catch (e) { /* ignore */ }
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  };

  App.render = () => {
    const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
    const route = App.views[parts[0]] ? parts[0] : 'dashboard';
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
    document.body.classList.remove('nav-open');
    const view = $('#view');
    try { App.views[route](view, parts.slice(1)); }
    catch (e) { console.error(e); view.innerHTML = `<div class="alert danger">Erreur d'affichage : ${App.esc(e.message)}</div>`; }
    const pending = App.state.bank.filter((b) => !b.matched).length;
    const pill = $('#pill-bank'); pill.hidden = !pending; pill.textContent = pending;
    $('#company-foot').innerHTML = `<strong>${App.esc(App.state.settings.company.name)}</strong><br>${App.esc(App.state.settings.company.legalForm)} · données stockées localement`;
    document.title = 'ComptaPro';
  };

  App.applyTheme();
  window.addEventListener('hashchange', App.render);
  $('#menu-btn').onclick = () => document.body.classList.toggle('nav-open');
  App.render();
})(window.App);
