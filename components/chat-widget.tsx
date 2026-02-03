"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MessageCircle, X, Send, ArrowLeft, FileText, Euro, MapPin } from "lucide-react"
import { obtenerConversaciones, obtenerMensajes, enviarMensaje, crearConversacion } from "@/app/actions/mensajes"
import { obtenerOfertasPorProfesional } from "@/app/actions/ofertas"
import { obtenerSolicitudesPorUsuario } from "@/app/actions/solicitudes"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface Message {
  id: string
  remitente_id: string
  contenido: string
  created_at: string
  remitente?: {
    nombre: string
    apellido: string
    foto_perfil?: string
  }
}

interface Conversation {
  id: string
  participante_1: string
  participante_2: string
  ultimo_mensaje?: string
  fecha_ultimo_mensaje?: string
  participante1?: {
    nombre: string
    apellido: string
    foto_perfil?: string
  }
  participante2?: {
    nombre: string
    apellido: string
    foto_perfil?: string
  }
  messages?: Message[]
  unreadCount?: number
}

export function useChatWidget() {
  const openChat = (userId?: string, userName?: string) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("openChat", { detail: { userId, userName } }))
    }
  }
  return { openChat }
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messageInput, setMessageInput] = useState("")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeTab, setActiveTab] = useState<"mensajes" | "info">("mensajes")
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [offers, setOffers] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const initializeChat = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        setCurrentUserId(user.id)
        setIsAuthenticated(true)
        loadConversations()
      } else {
        setIsAuthenticated(false)
      }
    }

    initializeChat()
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel("chat-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mensajes",
        },
        (payload) => {
          // Refresh conversations when new message arrives
          loadConversations()

          // If message is for current conversation, add it
          if (selectedConversation && payload.new.conversacion_id === selectedConversation.id) {
            loadMessages(selectedConversation.id)
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedConversation])

  const getCurrentUser = async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)
      setIsAuthenticated(true)
    } else {
      setIsAuthenticated(false)
    }
  }

  const loadConversations = async () => {
    if (!isAuthenticated) return

    const result = await obtenerConversaciones()
    if (result.error) {
      console.error("[v0] Error loading conversations:", result.error)
      return
    }
    if (result.data) {
      setConversations(result.data as Conversation[])
    }
  }

  const loadMessages = async (conversacionId: string) => {
    const result = await obtenerMensajes(conversacionId)
    if (result.error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los mensajes",
        variant: "destructive",
      })
      return
    }
    if (result.data && selectedConversation) {
      setSelectedConversation({
        ...selectedConversation,
        messages: result.data as Message[],
      })
    }
  }

  const loadServiceInfo = async (otherUserId: string, isProvider: boolean) => {
    if (isProvider) {
      // Load offers sent to this client
      const result = await obtenerOfertasPorProfesional()
      if (result.data) {
        setOffers(result.data.filter((offer: any) => offer.usuario_id === otherUserId))
      }
    } else {
      // Load requests from this client
      const result = await obtenerSolicitudesPorUsuario(otherUserId)
      if (result.data) {
        setRequests(result.data)
      }
    }
  }

  useEffect(() => {
    const handleOpenChat = async (event: Event) => {
      const customEvent = event as CustomEvent
      const { userId, userName } = customEvent.detail
      setIsOpen(true)

      if (userId && userName) {
        setLoading(true)

        // Check if conversation exists
        const existingConv = conversations.find(
          (conv) => conv.participante_1 === userId || conv.participante_2 === userId,
        )

        if (existingConv) {
          await handleSelectConversation(existingConv)
        } else {
          // Create new conversation
          const result = await crearConversacion(userId)
          if (result.error) {
            toast({
              title: "Error",
              description: "No se pudo crear la conversación",
              variant: "destructive",
            })
            setLoading(false)
            return
          }
          if (result.data) {
            await loadConversations()
            const newConv = result.data as Conversation
            await handleSelectConversation(newConv)
          }
        }

        setLoading(false)
      }
    }

    window.addEventListener("openChat", handleOpenChat)
    return () => window.removeEventListener("openChat", handleOpenChat)
  }, [conversations])

  const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0)

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation) return

    setLoading(true)
    const result = await enviarMensaje(selectedConversation.id, messageInput)

    if (result.error) {
      toast({
        title: "Error",
        description: "No se pudo enviar el mensaje",
        variant: "destructive",
      })
      setLoading(false)
      return
    }

    setMessageInput("")
    await loadMessages(selectedConversation.id)
    await loadConversations()
    setLoading(false)
  }

  const handleSelectConversation = async (conversation: Conversation) => {
    setSelectedConversation(conversation)
    setActiveTab("mensajes")

    // Load messages for this conversation
    await loadMessages(conversation.id)

    // Determine other user and load their service info
    const otherUserId =
      currentUserId === conversation.participante_1 ? conversation.participante_2 : conversation.participante_1

    // TODO: Determine if other user is provider or client
    // For now, assume they could be either
    await loadServiceInfo(otherUserId, true)
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
    if (minutes < 60) return `Hace ${minutes}m`
    if (hours < 24) return `Hace ${hours}h`
    if (days < 7) return `Hace ${days}d`
    return date.toLocaleDateString()
  }

  const getOtherUserName = (conv: Conversation) => {
    if (!currentUserId) return "Usuario"
    const otherUser = currentUserId === conv.participante_1 ? conv.participante2 : conv.participante1
    if (!otherUser) return "Usuario"
    return `${otherUser.nombre} ${otherUser.apellido}`
  }

  const getOtherUserInitials = (conv: Conversation) => {
    if (!currentUserId) return "U"
    const otherUser = currentUserId === conv.participante_1 ? conv.participante2 : conv.participante1
    if (!otherUser) return "U"
    return `${otherUser.nombre?.[0] || ""}${otherUser.apellido?.[0] || ""}`
  }

  return (
    <>
      {isAuthenticated && (
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
          size="icon"
        >
          {isOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <>
              <MessageCircle className="h-6 w-6" />
              {totalUnread > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
                  {totalUnread}
                </Badge>
              )}
            </>
          )}
        </Button>
      )}

      {isOpen && isAuthenticated && (
        <Card className="fixed bottom-24 right-6 w-96 h-[600px] shadow-2xl z-50 flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2">
              {selectedConversation && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedConversation(null)
                    setActiveTab("mensajes")
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <h3 className="font-semibold text-lg">
                {selectedConversation ? getOtherUserName(selectedConversation) : "Mensajes"}
              </h3>
            </div>
          </div>

          {!selectedConversation ? (
            <ScrollArea className="flex-1">
              <div className="p-2">
                {conversations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No tienes conversaciones aún</p>
                  </div>
                ) : (
                  conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      onClick={() => handleSelectConversation(conversation)}
                      className="w-full p-3 hover:bg-accent rounded-lg transition-colors text-left"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar>
                          <AvatarFallback>{getOtherUserInitials(conversation)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium truncate">{getOtherUserName(conversation)}</p>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatTime(conversation.fecha_ultimo_mensaje)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-muted-foreground truncate">
                              {conversation.ultimo_mensaje || "Empieza una conversación"}
                            </p>
                            {conversation.unreadCount && conversation.unreadCount > 0 && (
                              <Badge variant="default" className="shrink-0">
                                {conversation.unreadCount}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          ) : (
            <>
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "mensajes" | "info")}
                className="flex-1 flex flex-col"
              >
                <TabsList className="mx-4 mt-2">
                  <TabsTrigger value="mensajes" className="flex-1">
                    Mensajes
                  </TabsTrigger>
                  <TabsTrigger value="info" className="flex-1">
                    Información
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="mensajes" className="flex-1 flex flex-col m-0">
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {selectedConversation.messages?.map((message) => {
                        const isOwn = message.remitente_id === currentUserId
                        return (
                          <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[80%] rounded-lg p-3 ${
                                isOwn ? "bg-primary text-primary-foreground" : "bg-muted"
                              }`}
                            >
                              <p className="text-sm">{message.contenido}</p>
                              <p
                                className={`text-xs mt-1 ${
                                  isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                                }`}
                              >
                                {formatTime(message.created_at)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>

                  <div className="p-4 border-t">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Escribe un mensaje..."
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            handleSendMessage()
                          }
                        }}
                        disabled={loading}
                      />
                      <Button onClick={handleSendMessage} size="icon" disabled={loading}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="info" className="flex-1 m-0">
                  <ScrollArea className="h-full p-4">
                    <div className="space-y-4">
                      <h4 className="font-semibold text-sm text-muted-foreground mb-3">Ofertas y Solicitudes</h4>
                      {offers.length === 0 && requests.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p className="text-sm">No hay información adicional disponible</p>
                        </div>
                      ) : (
                        <>
                          {offers.map((offer) => (
                            <Card key={offer.id} className="p-4">
                              <div className="space-y-3">
                                <div className="flex items-start justify-between">
                                  <h5 className="font-semibold">{offer.titulo}</h5>
                                  <Badge variant={offer.estado === "aceptada" ? "default" : "secondary"}>
                                    {offer.estado}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{offer.descripcion}</p>
                                <div className="space-y-2 text-sm">
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Euro className="h-3.5 w-3.5" />
                                    <span className="font-semibold text-foreground">{offer.precio_ofertado}€</span>
                                  </div>
                                </div>
                              </div>
                            </Card>
                          ))}
                          {requests.map((request) => (
                            <Card key={request.id} className="p-4">
                              <div className="space-y-3">
                                <h5 className="font-semibold">{request.titulo}</h5>
                                <p className="text-sm text-muted-foreground">{request.descripcion}</p>
                                <div className="space-y-2 text-sm">
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Euro className="h-3.5 w-3.5" />
                                    <span>Presupuesto: {request.presupuesto_max}€</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <MapPin className="h-3.5 w-3.5" />
                                    <span>{request.ubicacion}</span>
                                  </div>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </>
          )}
        </Card>
      )}
    </>
  )
}
