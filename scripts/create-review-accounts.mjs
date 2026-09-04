import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const clientEmail = process.env.REVIEW_CLIENT_EMAIL || "revision.cliente@diime.es"
const professionalEmail = process.env.REVIEW_PRO_EMAIL || "revision.profesional@diime.es"
const clientPassword = process.env.REVIEW_CLIENT_PASSWORD
const professionalPassword = process.env.REVIEW_PRO_PASSWORD

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["REVIEW_CLIENT_PASSWORD", clientPassword],
  ["REVIEW_PRO_PASSWORD", professionalPassword],
].filter(([, value]) => !value).map(([name]) => name)

if (missing.length) {
  console.error(`Faltan variables: ${missing.join(", ")}`)
  process.exit(1)
}

for (const [name, password] of [
  ["REVIEW_CLIENT_PASSWORD", clientPassword],
  ["REVIEW_PRO_PASSWORD", professionalPassword],
]) {
  if (password.length < 14) {
    console.error(`${name} debe tener al menos 14 caracteres.`)
    process.exit(1)
  }
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
    if (user) return user
    if (data.users.length < 100) return null
  }
  throw new Error(`No se pudo localizar ${email}: hay más de 2.000 usuarios.`)
}

async function ensureUser({ email, password, nombre, apellido }) {
  let user = await findUserByEmail(email)
  const legalAcceptedAt = new Date().toISOString()
  const metadata = {
    nombre,
    apellido,
    tipo_entidad: "particular",
    terms_accepted_at: legalAcceptedAt,
    terms_version: "2026-08",
    mayor_edad_confirmada_at: legalAcceptedAt,
    mayor_edad_version: "18-plus-2026-08",
    cuenta_revision_tiendas: true,
  }

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })
    if (error || !data.user) throw error || new Error(`No se pudo crear ${email}.`)
    user = data.user
  } else {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(user.user_metadata || {}), ...metadata },
    })
    if (error || !data.user) throw error || new Error(`No se pudo actualizar ${email}.`)
    user = data.user
  }

  return { user, legalAcceptedAt }
}

async function upsertProfile({ user, legalAcceptedAt, nombre, apellido, tipoUsuario, bio }) {
  const { error } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email: user.email,
      nombre,
      apellido,
      ubicacion: "Madrid",
      bio,
      tipo_usuario: tipoUsuario,
      verificado: false,
      cuenta_eliminada: null,
      mayor_edad_confirmada_at: legalAcceptedAt,
      mayor_edad_version: "18-plus-2026-08",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  )
  if (error) throw error
}

async function seedReviewJourney(clientId, professionalId) {
  const categoryName = "Pintura y decoración"
  let { data: category, error: categoryReadError } = await admin
    .from("categorias")
    .select("id")
    .eq("nombre", categoryName)
    .maybeSingle()
  if (categoryReadError) throw categoryReadError
  if (!category) {
    const created = await admin
      .from("categorias")
      .insert({ nombre: categoryName, descripcion: "Interior, exterior y acabados decorativos" })
      .select("id")
      .single()
    if (created.error) throw created.error
    category = created.data
  }

  const title = "Pintar un salón — recorrido de revisión"
  let { data: request, error: requestReadError } = await admin
    .from("solicitudes")
    .select("id")
    .eq("cliente_id", clientId)
    .eq("titulo", title)
    .maybeSingle()
  if (requestReadError) throw requestReadError
  if (!request) {
    const created = await admin
      .from("solicitudes")
      .insert({
        cliente_id: clientId,
        categoria_id: category.id,
        titulo: title,
        descripcion: "Solicitud ficticia para que los equipos de revisión comprueben ofertas y mensajería sin contratar un servicio real.",
        ubicacion: "Madrid",
        presupuesto_min: 250,
        presupuesto_max: 400,
        urgencia: "baja",
        estado: "abierta",
        archivos: [],
        fecha_necesaria: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10),
      })
      .select("id")
      .single()
    if (created.error) throw created.error
    request = created.data
  }

  const { data: existingOffer, error: offerReadError } = await admin
    .from("ofertas")
    .select("id")
    .eq("solicitud_id", request.id)
    .eq("profesional_id", professionalId)
    .maybeSingle()
  if (offerReadError) throw offerReadError
  if (!existingOffer) {
    const { error } = await admin.from("ofertas").insert({
      solicitud_id: request.id,
      profesional_id: professionalId,
      precio: 320,
      tiempo_estimado: 2,
      unidad_tiempo: "dias",
      descripcion: "Oferta ficticia para revisar el flujo de comparación y mensajería. No corresponde a un servicio real.",
      materiales_incluidos: "Pintura y material básico incluidos en la demostración.",
      condiciones_pago: "No aceptar ni pagar durante la revisión de la tienda.",
      estado: "pendiente",
      archivos: [],
    })
    if (error) throw error
  }
}

async function main() {
  const client = await ensureUser({
    email: clientEmail,
    password: clientPassword,
    nombre: "Clara",
    apellido: "Revisión",
  })
  const professional = await ensureUser({
    email: professionalEmail,
    password: professionalPassword,
    nombre: "Álex",
    apellido: "Profesional",
  })

  await upsertProfile({
    ...client,
    nombre: "Clara",
    apellido: "Revisión",
    tipoUsuario: "cliente",
    bio: "Cuenta ficticia exclusiva para la revisión de las tiendas.",
  })
  await upsertProfile({
    ...professional,
    nombre: "Álex",
    apellido: "Profesional",
    tipoUsuario: "profesional",
    bio: "Perfil profesional ficticio exclusivo para la revisión de las tiendas.",
  })

  const { error: professionalError } = await admin.from("profesionales").upsert(
    {
      id: professional.user.id,
      titulo: "Profesional de pintura — cuenta de revisión",
      tarifa_por_hora: 35,
      "años_experiencia": 8,
      idiomas: ["Español"],
      certificaciones: [],
      habilidades: ["Pintura interior", "Preparación de paredes"],
      categorias_interes: ["Pintura y decoración"],
      provincias_cobertura: ["Madrid"],
      disponible: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  )
  if (professionalError) throw professionalError

  await seedReviewJourney(client.user.id, professional.user.id)
  console.log(`Cuentas de revisión preparadas: ${clientEmail} y ${professionalEmail}.`)
  console.log("Las contraseñas no se muestran. Guárdalas en el gestor autorizado y en las consolas de las tiendas.")
}

main().catch((error) => {
  console.error("No se pudieron preparar las cuentas de revisión:", error.message || error)
  process.exit(1)
})
