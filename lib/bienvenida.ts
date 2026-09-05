// Se ejecuta junto al HTML del diálogo, sin esperar al bundle de React. El
// mismo inicializador sirve para las navegaciones de cliente y es idempotente.
export const INICIAR_BIENVENIDA = `(() => {
  const dialog = document.getElementById('diime-bienvenida');
  if (!dialog || dialog.dataset.ready) return;
  dialog.dataset.ready = 'true';
  const cerrar = () => {
    try { localStorage.setItem('diime_bienvenida_vista', '1'); } catch {}
  };
  const abrir = () => {
    if (!dialog.isConnected || ['auth', 'admin'].includes(location.pathname.split('/')[1])) return;
    try {
      const consentimiento = localStorage.getItem('diime_cookies_consentimiento');
      const nativa = navigator.userAgent.includes('DiimeNative/');
      if (!localStorage.getItem('diime_bienvenida_vista') &&
          (nativa || consentimiento === 'aceptadas' || consentimiento === 'rechazadas') &&
          !dialog.open) dialog.showModal();
    } catch {}
  };
  dialog.addEventListener('close', cerrar);
  dialog.addEventListener('cancel', cerrar);
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-cerrar-bienvenida]')) {
      cerrar();
      dialog.close();
    }
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) {
        cerrar();
        dialog.close();
      }
    }
  });
  const alDecidirCookies = () => {
    if (!dialog.isConnected) window.removeEventListener('diime:cookies-decididas', alDecidirCookies);
    else abrir();
  };
  window.addEventListener('diime:cookies-decididas', alDecidirCookies);
  abrir();
})()`
