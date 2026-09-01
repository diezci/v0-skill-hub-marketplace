"use client"

import type { AdminTrabajo } from "@/app/actions/admin-trabajos"
import { AdminTrabajosTable } from "@/components/admin-trabajos-table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function AdminUsuarioTrabajos({ trabajos, usuarioId }: { trabajos: AdminTrabajo[]; usuarioId: string }) {
  const recibidos = trabajos.filter((trabajo) => trabajo.cliente_id === usuarioId)
  const prestados = trabajos.filter((trabajo) => trabajo.profesional_id === usuarioId)

  return (
    <Tabs defaultValue="todos" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="todos">Todos ({trabajos.length})</TabsTrigger>
        <TabsTrigger value="recibidos">Recibidos ({recibidos.length})</TabsTrigger>
        <TabsTrigger value="prestados">Prestados ({prestados.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="todos" className="pt-3">
        <AdminTrabajosTable trabajos={trabajos} usuarioId={usuarioId} />
      </TabsContent>
      <TabsContent value="recibidos" className="pt-3">
        <AdminTrabajosTable
          trabajos={recibidos}
          usuarioId={usuarioId}
          mensajeVacio="Este usuario no ha recibido ningún trabajo."
        />
      </TabsContent>
      <TabsContent value="prestados" className="pt-3">
        <AdminTrabajosTable
          trabajos={prestados}
          usuarioId={usuarioId}
          mensajeVacio="Este usuario no ha prestado ningún trabajo."
        />
      </TabsContent>
    </Tabs>
  )
}
