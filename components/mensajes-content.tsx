"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  MessageCircle,
  Send,
  Search,
  Loader2,
  MoreVertical,
  Check,
  CheckCheck,
  Paperclip,
  ArrowLeft,
  ImageIcon,
  FileText,
  Briefcase,
  X,
  Archive,
  Pin,
  Trash2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { obtenerConversaciones, obtenerMensajes, enviarMensaje } from "@/app/actions/mensajes"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface Message {
  id: string
  remitente_id: string
  contenido: string
  created_at: string
  leido?: boolean
  tipo?: "texto" | "archivo" | "imagen" | "oferta"
  archivo_url?: string
  archivo_nombre?: string
}

interface Conversation {
  id: string
  participante_1: string
  participante_2: string
  ultimo_mensaje?: string
  fecha_ultimo_mensaje?: string
  participante1?: { nombre: string; apellido: string; foto_perfil?: string }
  participante2?: { nombre: string; apellido: string; foto_perfil?: string }
  unread_count?: number
  proyecto?: { titulo: string; estado: string }
  pinned?: boolean
  archived?: boolean
}

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "conv-1",
    participante_1: "user-1",
    participante_2: "user-2",
    ultimo_mensaje: "Perfecto, mañana a las 10h paso a ver el trabajo",
    fecha_ultimo_mensaje: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    participante1: { nombre: "Carlos", apellido: "Rodríguez", foto_perfil: "/professional-man.png" },
    participante2: { nombre: "María", apellido: "García", foto_perfil: "/professional-woman.png" },
    unread_count: 2,
    proyecto: { titulo: "Reforma de baño completo", estado: "en_progreso" },
    pinned: true,
  },
  {
    id: "conv-2",
    participante_1: "user-1",
    participante_2: "user-3",
    ultimo_mensaje: "¿Puede enviarme fotos del estado actual?",
    fecha_ultimo_mensaje: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    participante1: { nombre: "Pedro", apellido: "Martínez", foto_perfil: "/electrician-man.jpg" },
    participante2: { nombre: "Ana", apellido: "López", foto_perfil: "/woman-client.png" },
    unread_count: 0,
    proyecto: { titulo: "Instalación eléctrica cocina", estado: "pendiente" },
  },
  {
    id: "conv-3",
    participante_1: "user-1",
    participante_2: "user-4",
    ultimo_mensaje: "El presupuesto incluye materiales y mano de obra",
    fecha_ultimo_mensaje: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    participante1: { nombre: "Luis", apellido: "Fernández", foto_perfil: "/plumber-man.jpg" },
    participante2: { nombre: "Carmen", apellido: "Ruiz", foto_perfil: "/woman-homeowner.png" },
    unread_count: 0,
    proyecto: { titulo: "Pintura interior vivienda", estado: "completado" },
  },
  {
    id: "conv-4",
    participante_1: "user-1",
    participante_2: "user-5",
    ultimo_mensaje: "Gracias por el excelente trabajo realizado",
    fecha_ultimo_mensaje: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    participante1: { nombre: "Roberto", apellido: "Sánchez", foto_perfil: "/contractor-man.jpg" },
    participante2: { nombre: "Elena", apellido: "Navarro", foto_perfil: "/business-woman.png" },
    unread_count: 0,
    proyecto: { titulo: "Montaje de muebles IKEA", estado: "completado" },
  },
]

const MOCK_MESSAGES: Message[] = [
  {
    id: "msg-1",
    remitente_id: "user-2",
    contenido: "Hola, he visto tu solicitud de reforma de baño y me interesa mucho el proyecto",
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    leido: true,
    tipo: "texto",
  },
  {
    id: "msg-2",
    remitente_id: "user-1",
    contenido: "¡Hola! Sí, necesito reformar el baño completo. Es de unos 6m² aproximadamente",
    created_at: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
    leido: true,
    tipo: "texto",
  },
  {
    id: "msg-3",
    remitente_id: "user-2",
    contenido: "foto_baño_actual.jpg",
    created_at: new Date(Date.now() - 1.2 * 60 * 60 * 1000).toISOString(),
    leido: true,
    tipo: "imagen",
    archivo_url: "/pre-renovation-bathroom.png",
    archivo_nombre: "foto_baño_actual.jpg",
  },
  {
    id: "msg-4",
    remitente_id: "user-2",
    contenido:
      "Perfecto, tengo disponibilidad la próxima semana para ver el trabajo y hacer una valoración más precisa. Adjunto mi presupuesto inicial.",
    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    leido: true,
    tipo: "texto",
  },
  {
    id: "msg-5",
    remitente_id: "user-2",
    contenido: "presupuesto_reforma.pdf",
    created_at: new Date(Date.now() - 58 * 60 * 1000).toISOString(),
    leido: true,
    tipo: "archivo",
    archivo_url: "#",
    archivo_nombre: "presupuesto_reforma.pdf",
  },
  {
    id: "msg-6",
    remitente_id: "user-1",
    contenido: "Genial, ¿qué día te vendría mejor? Yo tengo flexibilidad por las mañanas",
    created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    leido: true,
    tipo: "texto",
  },
  {
    id: "msg-7",
    remitente_id: "user-2",
    contenido: "Perfecto, mañana a las 10h paso a ver el trabajo",
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    leido: false,
    tipo: "texto",
  },
]

export default function MensajesContent() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageInput, setMessageInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>("user-1")
  const [searchQuery, setSearchQuery] = useState("")
  const [showMobileChat, setShowMobileChat] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "archived">("all")
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loadingMessages, setLoadingMessages] = useState(true) // Added state for message loading
  const [newMessage, setNewMessage] = useState("") // State for new message input
  const [sendingMessage, setSendingMessage] = useState(false) // State for sending message indicator

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (selectedConversation) {
      const timer = setTimeout(() => {
        setIsTyping(true)
        setTimeout(() => setIsTyping(false), 3000)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [selectedConversation])

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) {
        setConversations(MOCK_CONVERSATIONS)
        setLoading(false)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        setCurrentUserId(user.id)
        const result = await obtenerConversaciones()
        if (result.data && result.data.length > 0) {
          setConversations(result.data as Conversation[])
        } else {
          setConversations(MOCK_CONVERSATIONS)
        }
      } else {
        setConversations(MOCK_CONVERSATIONS)
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const handleSelectConversation = async (conv: Conversation) => {
    setSelectedConversation(conv)
    setShowMobileChat(true)
    setLoadingMessages(true) // Set loading state before fetching messages
    const result = await obtenerMensajes(conv.id)
    if (result.data && result.data.length > 0) {
      setMessages(result.data as Message[])
    } else {
      setMessages(MOCK_MESSAGES)
    }
    setLoadingMessages(false) // Set loading state to false after fetching messages
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return

    setSendingMessage(true)
    const result = await enviarMensaje(selectedConversation.id, newMessage)

    if (result.error) {
      const newMsg: Message = {
        id: `msg-${Date.now()}`,
        remitente_id: currentUserId,
        contenido: newMessage,
        created_at: new Date().toISOString(),
        leido: false,
        tipo: "texto",
      }
      setMessages([...messages, newMsg])
    } else if (result.data) {
      setMessages([...messages, result.data as Message])
    }

    setNewMessage("")
    setSendingMessage(false)
  }

  const formatTime = (dateString?: string) => {
    if (!dateString) return ""
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "Ahora"
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    if (days < 7) {
      const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
      return dayNames[date.getDay()]
    }
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })
  }

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
  }

  const formatDateSeparator = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return "Hoy"
    if (date.toDateString() === yesterday.toDateString()) return "Ayer"
    return date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })
  }

  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })
  }

  const getOtherUser = (conv: Conversation) => {
    return currentUserId === conv.participante_1 ? conv.participante2 : conv.participante1
  }

  const getStatusColor = (estado?: string) => {
    switch (estado) {
      case "en_progreso":
        return "bg-amber-500"
      case "completado":
        return "bg-emerald-500"
      case "pendiente":
        return "bg-blue-500"
      default:
        return "bg-muted"
    }
  }

  const getStatusText = (estado?: string) => {
    switch (estado) {
      case "en_progreso":
        return "En progreso"
      case "completado":
        return "Completado"
      case "pendiente":
        return "Pendiente"
      default:
        return ""
    }
  }

  const filteredConversations = conversations.filter((conv) => {
    const otherUser = getOtherUser(conv)
    const name = `${otherUser?.nombre} ${otherUser?.apellido}`.toLowerCase()
    const matchesSearch =
      name.includes(searchQuery.toLowerCase()) ||
      conv.proyecto?.titulo.toLowerCase().includes(searchQuery.toLowerCase())

    if (activeTab === "unread") return matchesSearch && (conv.unread_count || 0) > 0
    if (activeTab === "archived") return matchesSearch && conv.archived
    return matchesSearch && !conv.archived
  })

  // Sort: pinned first, then by date
  const sortedConversations = [...filteredConversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.fecha_ultimo_mensaje || 0).getTime() - new Date(a.fecha_ultimo_mensaje || 0).getTime()
  })

  const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0)

  // Group messages by date
  const groupedMessages = messages.reduce(
    (groups, msg) => {
      const date = formatMessageDate(msg.created_at)
      if (!groups[date]) groups[date] = []
      groups[date].push(msg)
      return groups
    },
    {} as Record<string, Message[]>,
  )

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Cargando conversaciones...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar de conversaciones */}
        <div
          className={cn(
            "w-full md:w-80 lg:w-96 border-r border-border flex flex-col bg-card",
            selectedConversation && "hidden md:flex",
          )}
        >
          {/* Header del sidebar */}
          <div className="p-4 border-b border-border shrink-0">
            <h1 className="text-xl font-semibold mb-4">Mensajes</h1>

            {/* Barra de búsqueda */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversaciones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-muted/50"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Tabs de filtro */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
              <TabsList className="w-full grid grid-cols-3 h-9">
                <TabsTrigger value="all" className="text-xs">
                  Todos
                </TabsTrigger>
                <TabsTrigger value="unread" className="text-xs">
                  No leídos {totalUnread > 0 && `(${totalUnread})`}
                </TabsTrigger>
                <TabsTrigger value="archived" className="text-xs">
                  Archivados
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Lista de conversaciones - scrollable */}
          <ScrollArea className="flex-1">
            <div className="divide-y divide-border">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : sortedConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <MessageCircle className="h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">
                    {activeTab === "unread"
                      ? "No hay mensajes sin leer"
                      : activeTab === "archived"
                        ? "No hay chats archivados"
                        : "No tienes conversaciones"}
                  </p>
                </div>
              ) : (
                sortedConversations.map((conv) => {
                  const otherUser = getOtherUser(conv)
                  const isSelected = selectedConversation?.id === conv.id
                  const hasUnread = (conv.unread_count || 0) > 0

                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv)}
                      className={cn(
                        "flex items-start gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50",
                        isSelected && "bg-muted",
                        conv.pinned && "bg-primary/5",
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={otherUser?.foto_perfil || "/placeholder.svg"} />
                          <AvatarFallback
                            className={cn(
                              "text-sm font-medium",
                              hasUnread ? "bg-primary text-primary-foreground" : "bg-muted",
                            )}
                          >
                            {otherUser?.nombre?.[0]}
                            {otherUser?.apellido?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        {conv.pinned && (
                          <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5">
                            <Pin className="h-2.5 w-2.5 text-primary-foreground" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("font-medium truncate", hasUnread && "text-foreground")}>
                            {otherUser?.nombre} {otherUser?.apellido}
                          </span>
                          <span
                            className={cn(
                              "text-xs shrink-0",
                              hasUnread ? "text-primary font-medium" : "text-muted-foreground",
                            )}
                          >
                            {formatTime(conv.fecha_ultimo_mensaje)}
                          </span>
                        </div>

                        {conv.proyecto && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Briefcase className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground truncate">{conv.proyecto.titulo}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-1.5 py-0 h-4",
                                getStatusColor(conv.proyecto.estado) === "bg-emerald-500" &&
                                  "border-green-500/50 text-green-500",
                                getStatusColor(conv.proyecto.estado) === "bg-amber-500" &&
                                  "border-blue-500/50 text-blue-500",
                                getStatusColor(conv.proyecto.estado) === "bg-blue-500" &&
                                  "border-yellow-500/50 text-yellow-500",
                              )}
                            >
                              {getStatusText(conv.proyecto.estado)}
                            </Badge>
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-1">
                          <p
                            className={cn(
                              "text-sm truncate pr-2",
                              hasUnread ? "text-foreground font-medium" : "text-muted-foreground",
                            )}
                          >
                            {conv.ultimo_mensaje}
                          </p>
                          {hasUnread && (
                            <Badge className="h-5 min-w-5 flex items-center justify-center rounded-full text-[10px] px-1.5">
                              {conv.unread_count}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Panel de chat */}
        <div className={cn("flex-1 flex flex-col bg-background", !selectedConversation && "hidden md:flex")}>
          {selectedConversation ? (
            <>
              {/* Header del chat */}
              <div className="h-16 px-4 flex items-center justify-between border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={() => setSelectedConversation(null)}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>

                  <Avatar className="h-10 w-10">
                    <AvatarImage src={getOtherUser(selectedConversation)?.foto_perfil || "/placeholder.svg"} />
                    <AvatarFallback>
                      {getOtherUser(selectedConversation)?.nombre?.[0]}
                      {getOtherUser(selectedConversation)?.apellido?.[0]}
                    </AvatarFallback>
                  </Avatar>

                  <div>
                    <h2 className="font-medium">
                      {getOtherUser(selectedConversation)?.nombre} {getOtherUser(selectedConversation)?.apellido}
                    </h2>
                    {selectedConversation.proyecto && (
                      <p className="text-xs text-muted-foreground">{selectedConversation.proyecto.titulo}</p>
                    )}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Pin className="h-4 w-4 mr-2" />
                      Fijar conversación
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Archive className="h-4 w-4 mr-2" />
                      Archivar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar chat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Mensajes - scrollable area */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <MessageCircle className="h-12 w-12 text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground">No hay mensajes aún</p>
                      <p className="text-sm text-muted-foreground/70">Envía el primer mensaje</p>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, index) => {
                        const isOwn = msg.remitente_id === currentUserId
                        const prevMsg = index > 0 ? messages[index - 1] : null
                        const showAvatar = !prevMsg || prevMsg.remitente_id !== msg.remitente_id
                        const showDate =
                          index === 0 ||
                          new Date(msg.created_at).toDateString() !==
                            new Date(messages[index - 1].created_at).toDateString()

                        return (
                          <div key={msg.id}>
                            {showDate && (
                              <div className="flex justify-center my-4">
                                <span className="text-xs bg-muted px-3 py-1 rounded-full text-muted-foreground">
                                  {formatDateSeparator(msg.created_at)}
                                </span>
                              </div>
                            )}

                            <div className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}>
                              {!isOwn && showAvatar && (
                                <Avatar className="h-8 w-8 mt-auto shrink-0">
                                  <AvatarImage
                                    src={getOtherUser(selectedConversation)?.foto_perfil || "/placeholder.svg"}
                                  />
                                  <AvatarFallback className="text-xs bg-muted">
                                    {getOtherUser(selectedConversation)?.nombre?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              {!isOwn && !showAvatar && <div className="w-8 shrink-0" />}

                              <div className={cn("max-w-[70%]", isOwn ? "items-end" : "items-start")}>
                                {/* Image message */}
                                {msg.tipo === "imagen" && msg.archivo_url && (
                                  <div
                                    className={cn(
                                      "rounded-2xl overflow-hidden shadow-sm mb-1",
                                      isOwn ? "rounded-br-md" : "rounded-bl-md",
                                    )}
                                  >
                                    <img
                                      src={msg.archivo_url || "/placeholder.svg"}
                                      alt={msg.archivo_nombre}
                                      className="max-w-full h-auto max-h-64 object-cover"
                                    />
                                  </div>
                                )}

                                {/* File message */}
                                {msg.tipo === "archivo" && msg.archivo_nombre && (
                                  <div
                                    className={cn(
                                      "rounded-2xl px-4 py-3 shadow-sm mb-1 flex items-center gap-3",
                                      isOwn
                                        ? "bg-primary text-primary-foreground rounded-br-md"
                                        : "bg-card border rounded-bl-md",
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                                        isOwn ? "bg-primary-foreground/20" : "bg-muted",
                                      )}
                                    >
                                      <FileText className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{msg.archivo_nombre}</p>
                                      <p
                                        className={cn(
                                          "text-xs",
                                          isOwn ? "text-primary-foreground/70" : "text-muted-foreground",
                                        )}
                                      >
                                        PDF • Haz clic para descargar
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Text message */}
                                {(msg.tipo === "texto" || !msg.tipo) && (
                                  <div
                                    className={cn(
                                      "rounded-2xl px-4 py-2.5 shadow-sm",
                                      isOwn
                                        ? "bg-primary text-primary-foreground rounded-br-md"
                                        : "bg-card border rounded-bl-md",
                                    )}
                                  >
                                    <p className="text-sm whitespace-pre-wrap">{msg.contenido}</p>
                                  </div>
                                )}

                                {/* Time and read status */}
                                <div
                                  className={cn(
                                    "flex items-center gap-1 mt-1 px-1",
                                    isOwn ? "justify-end" : "justify-start",
                                  )}
                                >
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatMessageTime(msg.created_at)}
                                  </span>
                                  {isOwn &&
                                    (msg.leido ? (
                                      <CheckCheck className="h-3 w-3 text-primary" />
                                    ) : (
                                      <Check className="h-3 w-3 text-muted-foreground" />
                                    ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {/* Typing indicator */}
                      {isTyping && (
                        <div className="flex gap-2 justify-start">
                          <Avatar className="h-8 w-8 mt-auto shrink-0">
                            <AvatarImage src={getOtherUser(selectedConversation)?.foto_perfil || "/placeholder.svg"} />
                            <AvatarFallback className="text-xs bg-muted">
                              {getOtherUser(selectedConversation)?.nombre?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="bg-card border rounded-2xl rounded-bl-md px-4 py-3">
                            <div className="flex gap-1">
                              <span
                                className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce"
                                style={{ animationDelay: "0ms" }}
                              />
                              <span
                                className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce"
                                style={{ animationDelay: "150ms" }}
                              />
                              <span
                                className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce"
                                style={{ animationDelay: "300ms" }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>
              </ScrollArea>

              {/* Input de mensaje */}
              <div className="p-4 border-t border-border shrink-0">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-10 w-10 text-muted-foreground"
                      >
                        <Paperclip className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                        <ImageIcon className="h-4 w-4 mr-2" />
                        Imagen
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                        <FileText className="h-4 w-4 mr-2" />
                        Documento
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <div className="flex-1">
                    <Input
                      placeholder="Escribe un mensaje..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      disabled={sendingMessage}
                      className="bg-muted/50 border-0 focus-visible:ring-1 rounded-full py-5"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="icon"
                    disabled={!newMessage.trim() || sendingMessage}
                    className="bg-primary hover:bg-primary/90 shrink-0 h-10 w-10 rounded-full"
                  >
                    {sendingMessage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            /* Estado vacío - sin conversación seleccionada */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageCircle className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Tus mensajes</h2>
              <p className="text-muted-foreground max-w-sm">
                Selecciona una conversación de la lista para ver los mensajes
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
