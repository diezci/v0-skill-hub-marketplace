// Plantilla base de los correos de Diime.
//
// HTML con estilos en línea a propósito: los clientes de correo (Gmail,
// Outlook, Apple Mail) ignoran o recortan las hojas de estilo y no soportan
// variables CSS, así que aquí no sirve nada de lo que usa la web.

const VERDE = "#059669"
const TEXTO = "#18181b"
const SUAVE = "#71717a"
const BORDE = "#e4e4e7"

export const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.diime.es"

function escapar(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function plantillaEmail(params: {
  titulo: string
  saludo: string
  cuerpo: string
  botonTexto?: string
  botonUrl?: string
  nota?: string
}) {
  const { titulo, saludo, cuerpo, botonTexto, botonUrl, nota } = params

  const boton =
    botonTexto && botonUrl
      ? `<tr><td style="padding:8px 0 24px;">
           <a href="${escapar(botonUrl)}"
              style="display:inline-block;background:${VERDE};color:#ffffff;text-decoration:none;
                     padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">
             ${escapar(botonTexto)}
           </a>
         </td></tr>`
      : ""

  const pie = nota
    ? `<p style="margin:0 0 8px;color:${SUAVE};font-size:13px;line-height:1.5;">${escapar(nota)}</p>`
    : ""

  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border:1px solid ${BORDE};border-radius:12px;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:24px 28px 0;">
          <span style="font-size:20px;font-weight:700;color:${VERDE};letter-spacing:-0.3px;">Diime</span>
        </td></tr>
        <tr><td style="padding:16px 28px 0;">
          <h1 style="margin:0 0 4px;font-size:20px;line-height:1.3;color:${TEXTO};">${escapar(titulo)}</h1>
          <p style="margin:0 0 16px;color:${SUAVE};font-size:15px;">${escapar(saludo)}</p>
          <p style="margin:0 0 20px;color:${TEXTO};font-size:15px;line-height:1.6;">${escapar(cuerpo)}</p>
        </td></tr>
        <tr><td style="padding:0 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0">${boton}</table>
        </td></tr>
        <tr><td style="padding:0 28px 24px;border-top:1px solid ${BORDE};padding-top:16px;">
          ${pie}
          <p style="margin:0;color:${SUAVE};font-size:12px;line-height:1.5;">
            Recibes este correo porque tienes una cuenta en Diime.
            Puedes dejar de recibir avisos por correo desde
            <a href="${BASE_URL}/mi-cuenta" style="color:${VERDE};">Mi cuenta</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// Versión en texto plano: mejora la entregabilidad y es lo que ven los clientes
// que bloquean HTML.
export function plantillaTexto(params: {
  titulo: string
  saludo: string
  cuerpo: string
  botonUrl?: string
}) {
  const { titulo, saludo, cuerpo, botonUrl } = params
  return [
    titulo,
    "",
    saludo,
    "",
    cuerpo,
    botonUrl ? `\n${botonUrl}` : "",
    "",
    "---",
    `Recibes este correo porque tienes una cuenta en Diime. Puedes dejar de recibir avisos en ${BASE_URL}/mi-cuenta`,
  ]
    .filter(Boolean)
    .join("\n")
}
