// Loaded only in the bundled Android edition, after the game.
(() => {
  const native = window.PondAndroid;
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.href.startsWith('data:image/png;base64,') && native) {
      native.savePhoto(this.href.slice('data:image/png;base64,'.length));
      return;
    }
    return click.call(this);
  };
  window.pondAndroidSave = () => { saveNow(); if (typeof albumFlush === 'function') albumFlush(); };
  window.pondAndroidBack = () => {
    const confirmation = document.getElementById('pond-confirm');
    if (confirmation) { confirmation.querySelector('button').click(); return true; }
    const album = document.querySelector('#resident-album[open]');
    if (album) { album.close(); return true; }
    if (WINDOWS.some(([id]) => { const panel = document.getElementById(id); return panel && !panel.hidden; })) {
      closeWindows(); return true;
    }
    if (!document.getElementById('hud').classList.contains('hidden')) { setHud(false); return true; }
    if (world.tool !== 'pointer') { setTool('pointer'); return true; }
    return false;
  };
})();
