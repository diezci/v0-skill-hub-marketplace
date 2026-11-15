type CuentaStripeIdentificable = {
  deleted?: boolean | void
  metadata?: Record<string, string> | null
  business_type?: string | null
  details_submitted?: boolean
}

/** Membership never changes the economic identity of a personal Connect account. */
export function esCuentaPersonalPropiaStripe(cuenta: CuentaStripeIdentificable, profesional: { id: string }): boolean {
  return !errorIdentidadCuentaStripe(cuenta, profesional)
}

export function errorIdentidadCuentaStripe(
  cuenta: CuentaStripeIdentificable,
  profesional: { id: string; empresa_id?: string | null },
): string | null {
  if (cuenta.deleted || cuenta.business_type !== "individual"
    || cuenta.metadata?.diime_profesional_id !== profesional.id
    || cuenta.metadata?.diime_empresa_id
    || (cuenta.metadata?.diime_proveedor_tipo && cuenta.metadata.diime_proveedor_tipo !== "personal")) {
    return "La cuenta de cobros no corresponde a tu actividad personal. Contacta con soporte para revisar la titularidad. Se conserva la cuenta y su historial."
  }
  return null
}

/** A company account belongs to the company, never to its current owner or staff. */
export function errorIdentidadCuentaStripeEmpresa(cuenta: CuentaStripeIdentificable, empresaId: string): string | null {
  if (cuenta.deleted || cuenta.business_type !== "company"
    || cuenta.metadata?.diime_empresa_id !== empresaId
    || cuenta.metadata?.diime_proveedor_tipo !== "empresa"
    || cuenta.metadata?.diime_profesional_id) {
    return "La cuenta de cobros no corresponde a esta empresa. Contacta con soporte para revisar la titularidad. Se conserva el destino de los contratos existentes."
  }
  return null
}

/** A company using the common professional profile has its own explicit legal
 * type. It is never inferred from membership or from editable Stripe metadata. */
export function errorIdentidadCuentaStripeProveedor(
  cuenta: CuentaStripeIdentificable,
  profesional: { id: string; tipoProveedor: "particular" | "empresa" },
): string | null {
  if (profesional.tipoProveedor === "particular") return errorIdentidadCuentaStripe(cuenta, profesional)
  if (cuenta.deleted || cuenta.business_type !== "company"
    || cuenta.metadata?.diime_profesional_id !== profesional.id
    || cuenta.metadata?.diime_empresa_id
    || cuenta.metadata?.diime_proveedor_tipo !== "profesional_empresa") {
    return "La cuenta de cobros no corresponde a la sociedad acreditada en tu perfil. Contacta con Diime para revisar la titularidad."
  }
  return null
}
