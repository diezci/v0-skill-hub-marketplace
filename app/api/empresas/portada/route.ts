import { type NextRequest } from "next/server"
import { subirImagenEmpresa } from "../_lib/subir-imagen"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return subirImagenEmpresa(request, "portada")
}
