// Se ejecuta junto al HTML del diálogo, sin esperar al bundle de React. El
// mismo inicializador sirve para las navegaciones de cliente y es idempotente.
export const INICIAR_BIENVENIDA = `(() => {
  const dialog = document.getElementById('diime-bienvenida');
  if (!dialog || dialog.dataset.ready) return;
  dialog.dataset.ready = 'true';
  let cierresDiferidos = 0;
  const otroDialogoAbierto = () => Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]'))
    .some(elemento => elemento !== dialog && elemento.getClientRects().length > 0);
  const cerrar = () => {
    try { localStorage.setItem('diime_bienvenida_vista', '1'); } catch {}
    observer.disconnect();
    window.removeEventListener('diime:cookies-decididas', alDecidirCookies);
  };
  const abrir = () => {
    if (!dialog.isConnected || ['auth', 'admin'].includes(location.pathname.split('/')[1])) return;
    // Un dialog nativo en la capa superior no debe competir con un modal de
    // Radix que desactiva los punteros del body. Se aplaza la bienvenida sin
    // marcarla como vista cuando llega un diálogo asíncrono o un enlace directo.
    if (otroDialogoAbierto()) {
      if (dialog.open) { cierresDiferidos += 1; dialog.close(); }
      return;
    }
    try {
      const consentimiento = localStorage.getItem('diime_cookies_consentimiento');
      const nativa = navigator.userAgent.includes('DiimeNative/');
      if (!localStorage.getItem('diime_bienvenida_vista') &&
          (nativa || consentimiento === 'aceptadas' || consentimiento === 'rechazadas') &&
          !dialog.open) dialog.showModal();
    } catch {}
  };
  dialog.addEventListener('close', () => {
    if (cierresDiferidos) cierresDiferidos -= 1;
    else cerrar();
  });
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
    if (!dialog.isConnected) {
      observer.disconnect();
      window.removeEventListener('diime:cookies-decididas', alDecidirCookies);
    }
    else abrir();
  };
  const observer = new MutationObserver(alDecidirCookies);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'data-state'] });
  window.addEventListener('diime:cookies-decididas', alDecidirCookies);
  abrir();
})()`
