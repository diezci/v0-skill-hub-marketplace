// Se usa al consultar Connect y al procesar eventos de Stripe. Los metadatos
// identifican al titular creado por Diime; empresa_id se obtiene del perfil
// protegido en la base de datos, nunca de datos enviados por el navegador.
export function errorIdentidadCuentaStripe(
  cuenta: {
    deleted?: boolean | void
    metadata?: Record<string, string> | null
    business_type?: string | null
    details_submitted?: boolean
  },
  profesional: { id: string; empresa_id?: string | null },
): string | null {
  if (cuenta.deleted || cuenta.metadata?.diime_profesional_id !== profesional.id) {
    return "La cuenta de cobros no corresponde a este profesional. Contacta con soporte."
  }
  const tipoEsperado = profesional.empresa_id ? "company" : "individual"
  if ((cuenta.business_type || cuenta.details_submitted) && cuenta.business_type !== tipoEsperado) {
    return profesional.empresa_id
      ? "Tu cuenta de cobros está a nombre de un particular y ahora representas a una empresa. Contacta con soporte para regularizar la titularidad antes de aceptar nuevos cobros. Se conserva la cuenta y su historial."
      : "Tu cuenta de cobros está a nombre de una empresa y tu perfil actúa como particular. Contacta con soporte para regularizar la titularidad antes de aceptar nuevos cobros. Se conserva la cuenta y su historial."
  }
  const empresaCuenta = cuenta.metadata?.diime_empresa_id
  if (empresaCuenta && empresaCuenta !== profesional.empresa_id) {
    return "La empresa de tu cuenta de cobros no coincide con la que representas. Contacta con soporte para regularizarla. Se conserva la cuenta y su historial."
  }
  return null
}
