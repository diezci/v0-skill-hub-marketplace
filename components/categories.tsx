"use client"

import { Card } from "@/components/ui/card"
import { ArrowRight, Hammer, House, Trees, Car, Laptop, PartyPopper, Shirt, LayoutGrid } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { TAXONOMIA_SERVICIOS } from "@/lib/categorias"
import { useT } from "@/components/idioma-provider"

// Atajos del homepage. Se DERIVAN de lib/categorias.ts en vez de escribirse a
// mano: antes había aquí 9 subcategorías sueltas ("Albañilería", "Fontanería"…)
// que no coincidían con las categorías que se ven en el formulario ni en el
// resto de la web. Así no pueden volver a desalinearse.
//
// Cada categoría lleva icono y color en vez de foto: de las 8, solo 4 tenían
// imagen en /public, y mezclar fotos con huecos quedaba peor que un icono.
const ESTILO: Record<string, { icono: LucideIcon; color: string; fondo: string }> = {
  "Reformas y Construcción": { icono: Hammer, color: "text-amber-500", fondo: "from-amber-500/20 to-amber-600/5" },
  "Hogar y mantenimiento": { icono: House, color: "text-emerald-500", fondo: "from-emerald-500/20 to-emerald-600/5" },
  "Exteriores y jardín": { icono: Trees, color: "text-lime-500", fondo: "from-lime-500/20 to-lime-600/5" },
  Automoción: { icono: Car, color: "text-blue-500", fondo: "from-blue-500/20 to-blue-600/5" },
  "Tecnología y electrónica": { icono: Laptop, color: "text-violet-500", fondo: "from-violet-500/20 to-violet-600/5" },
  Eventos: { icono: PartyPopper, color: "text-pink-500", fondo: "from-pink-500/20 to-pink-600/5" },
  "Moda y textil": { icono: Shirt, color: "text-rose-500", fondo: "from-rose-500/20 to-rose-600/5" },
  Otros: { icono: LayoutGrid, color: "text-slate-400", fondo: "from-slate-500/20 to-slate-600/5" },
}

const POR_DEFECTO = { icono: LayoutGrid, color: "text-slate-400", fondo: "from-slate-500/20 to-slate-600/5" }

function slug(nombre: string) {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const categorias = TAXONOMIA_SERVICIOS.map((cat) => {
  const subcategorias = cat.bloques.flatMap((b) => b.subcategorias)
  return {
    nombre: cat.nombre,
    // Muestra de lo que hay dentro, tomada de la propia taxonomía: si mañana
    // cambian las subcategorías, este texto cambia solo.
    ejemplos: subcategorias.slice(0, 3).map((s) => s.nombre).join(" · "),
    total: subcategorias.length,
    href: `/profesionales?categoria=${slug(cat.nombre)}`,
    ...(ESTILO[cat.nombre] ?? POR_DEFECTO),
  }
})

const Categories = () => {
  const t = useT()

  return (
    <section className="container mx-auto px-4 py-16 md:py-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div className="max-w-xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-3 tracking-tight text-balance">{t("categorias.titulo")}</h2>
          <p className="text-muted-foreground text-lg">{t("categorias.subtitulo")}</p>
        </div>
        <Link
          href="/profesionales"
          className="text-sm font-medium text-primary hover:gap-3 transition-all flex items-center gap-2 self-start md:self-auto"
        >
          {t("categorias.verTodos")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {categorias.map((cat) => {
          const Icono = cat.icono
          return (
            <Link key={cat.nombre} href={cat.href}>
              <Card className="h-full p-5 cursor-pointer group border-border/40 hover:border-primary/40 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 rounded-2xl">
                <div
                  className={`h-12 w-12 rounded-xl bg-gradient-to-br ${cat.fondo} flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110`}
                >
                  <Icono className={`h-6 w-6 ${cat.color}`} />
                </div>
                <h3 className="font-semibold text-base mb-1 leading-tight">{cat.nombre}</h3>
                <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{cat.ejemplos}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-2">
                  {cat.total} {cat.total !== 1 ? t("categorias.servicios") : t("categorias.servicio")}
                </p>
              </Card>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export default Categories
