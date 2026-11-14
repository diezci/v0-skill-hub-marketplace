// Art. 233 LSC: la selección declara el título; la documentación acredita
// las facultades y, cuando corresponda, la actuación conjunta.
export const CARGOS_REPRESENTACION = [
  { valor: "Administrador único", ayuda: "Aporta el nombramiento vigente y la autorización para gestionar la cuenta, si corresponde." },
  { valor: "Administrador solidario", ayuda: "Aporta el nombramiento vigente que acredite la administración solidaria." },
  { valor: "Administrador mancomunado", ayuda: "Acredita la intervención conjunta exigida por los estatutos. El cargo por sí solo no permite actuar individualmente." },
  { valor: "Consejero delegado", ayuda: "Aporta el nombramiento y la delegación vigente, con sus límites y régimen de actuación." },
  { valor: "Miembro del consejo con facultades de representación", ayuda: "Acredita las facultades atribuidas y cómo debe ejercerse la representación. Pertenecer al consejo no basta por sí solo." },
  { valor: "Apoderado individual o solidario", ayuda: "Aporta el poder vigente y las facultades suficientes para actuar en nombre de la empresa." },
  { valor: "Apoderado mancomunado", ayuda: "Aporta el poder y la intervención de las personas que deban actuar conjuntamente." },
  { valor: "Representante de administrador persona jurídica", ayuda: "Aporta el nombramiento de la persona jurídica administradora y tu designación como representante persona física." },
  { valor: "Otra representación acreditada", ayuda: "Aporta el documento que identifique el título de representación, su vigencia y las facultades concretas." },
] as const

export function cargoRepresentacionValido(valor: unknown): valor is string {
  return typeof valor === "string" && CARGOS_REPRESENTACION.some((cargo) => cargo.valor === valor)
}
