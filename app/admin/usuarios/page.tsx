"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/client"
import { Search, Users, Briefcase, Building2, Loader2, Mail, Phone, MapPin, Calendar } from "lucide-react"
import { formatearFecha } from "@/lib/utils"

interface Usuario {
  id: string
  nombre: string
  apellido: string
  email: string
  telefono: string | null
  ubicacion: string | null
  foto_perfil: string | null
  tipo_usuario: string
  rol: string
  created_at: string
  profesional?: {
    titulo: string | null
    verificado: boolean
    rating_promedio: number
    total_reseñas: number
  } | null
  empresa?: {
    nombre: string | null
  } | null
}

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [filteredUsuarios, setFilteredUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [tipoFilter, setTipoFilter] = useState<string>("todos")
  const supabase = createClient()

  useEffect(() => {
    cargarUsuarios()
  }, [])

  useEffect(() => {
    filterUsuarios()
  }, [searchQuery, tipoFilter, usuarios])

  const cargarUsuarios = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          *,
          profesional:profesionales(titulo, verificado, rating_promedio, total_reseñas),
          empresa:empresas(nombre)
        `)
        .order("created_at", { ascending: false })

      if (error) throw error

      // Transform the data to handle the array/single object difference
      const transformedData = (data || []).map(user => ({
        ...user,
        profesional: Array.isArray(user.profesional) ? user.profesional[0] : user.profesional,
        empresa: Array.isArray(user.empresa) ? user.empresa[0] : user.empresa,
      }))

      setUsuarios(transformedData)
    } catch (error) {
      console.error("Error loading users:", error)
    } finally {
      setLoading(false)
    }
  }

  const filterUsuarios = () => {
    let filtered = [...usuarios]

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (u) =>
          u.nombre?.toLowerCase().includes(query) ||
          u.apellido?.toLowerCase().includes(query) ||
          u.email?.toLowerCase().includes(query) ||
          u.ubicacion?.toLowerCase().includes(query)
      )
    }

    // Filter by type
    if (tipoFilter !== "todos") {
      if (tipoFilter === "profesional") {
        filtered = filtered.filter((u) => u.profesional)
      } else if (tipoFilter === "empresa") {
        filtered = filtered.filter((u) => u.empresa)
      } else if (tipoFilter === "cliente") {
        filtered = filtered.filter((u) => !u.profesional && !u.empresa && u.rol !== "admin")
      } else if (tipoFilter === "admin") {
        filtered = filtered.filter((u) => u.rol === "admin")
      }
    }

    setFilteredUsuarios(filtered)
  }

  const getInitials = (nombre: string, apellido: string) => {
    return `${nombre?.charAt(0) || ""}${apellido?.charAt(0) || ""}`.toUpperCase()
  }

  const getTipoBadge = (usuario: Usuario) => {
    if (usuario.rol === "admin") {
      return <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/30">Admin</Badge>
    }
    if (usuario.profesional) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
          Profesional
          {usuario.profesional.verificado && " (Verificado)"}
        </Badge>
      )
    }
    if (usuario.empresa) {
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">Empresa</Badge>
    }
    return <Badge variant="secondary">Cliente</Badge>
  }

  const stats = {
    total: usuarios.length,
    profesionales: usuarios.filter((u) => u.profesional).length,
    empresas: usuarios.filter((u) => u.empresa).length,
    clientes: usuarios.filter((u) => !u.profesional && !u.empresa && u.rol !== "admin").length,
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="h-8 w-8 text-primary" />
          Usuarios Registrados
        </h1>
        <p className="text-muted-foreground mt-1">
          Gestiona todos los usuarios de la plataforma
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Profesionales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{stats.profesionales}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Empresas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{stats.empresas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.clientes}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, email o ubicacion..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los usuarios</SelectItem>
                <SelectItem value="profesional">Profesionales</SelectItem>
                <SelectItem value="empresa">Empresas</SelectItem>
                <SelectItem value="cliente">Clientes</SelectItem>
                <SelectItem value="admin">Administradores</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsuarios.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No se encontraron usuarios
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Ubicacion</TableHead>
                  <TableHead>Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsuarios.map((usuario) => (
                  <TableRow key={usuario.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={usuario.foto_perfil || ""} />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(usuario.nombre, usuario.apellido)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {usuario.nombre} {usuario.apellido}
                          </p>
                          {usuario.profesional?.titulo && (
                            <p className="text-sm text-muted-foreground">
                              {usuario.profesional.titulo}
                            </p>
                          )}
                          {usuario.empresa?.nombre && (
                            <p className="text-sm text-muted-foreground">
                              {usuario.empresa.nombre}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getTipoBadge(usuario)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">{usuario.email}</span>
                        </div>
                        {usuario.telefono && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">{usuario.telefono}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {usuario.ubicacion ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {usuario.ubicacion}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatearFecha(usuario.created_at)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
