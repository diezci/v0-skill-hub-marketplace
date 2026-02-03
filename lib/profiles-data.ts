export interface Review {
  id: number
  clientName: string
  clientAvatar: string
  rating: number
  date: string
  comment: string
  projectType: string
  helpfulCount: number
}

interface PortfolioItem {
  id: number
  title: string
  description: string
  image: string
  category: string
  completedDate: string
  location: string
  duration: string
  budget: string
}

export interface ProfessionalProfile {
  id: number
  name: string
  title: string
  avatar: string
  coverImage: string
  location: string
  rating: number
  totalReviews: number
  completedProjects: number
  yearsExperience: number
  level: string
  bio: string
  skills: string[]
  certifications: string[]
  languages: string[]
  hourlyRate: number
  responseTime: string
  portfolio: PortfolioItem[]
  reviews: Review[]
  availability: string
  phone: string
  email: string
}

export const professionalProfiles: ProfessionalProfile[] = [
  {
    id: 1,
    name: "Carlos Rodríguez",
    title: "Maestro Albañil Especializado en Reformas Integrales",
    avatar: "https://randomuser.me/api/portraits/men/32.jpg",
    coverImage:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    location: "Madrid, España",
    rating: 4.9,
    totalReviews: 87,
    completedProjects: 156,
    yearsExperience: 15,
    level: "Profesional Certificado",
    bio: "Albañil profesional con más de 15 años de experiencia en reformas integrales de viviendas. Especializado en construcción de muros, alicatados, solados y rehabilitación de fachadas. Trabajo con un equipo de profesionales cualificados para garantizar acabados de máxima calidad.",
    skills: [
      "Albañilería",
      "Reformas Integrales",
      "Alicatado",
      "Solado",
      "Rehabilitación de Fachadas",
      "Construcción de Muros",
    ],
    certifications: ["Certificado Profesional en Albañilería", "PRL Construcción", "Trabajos en Altura"],
    languages: ["Español", "Inglés Básico"],
    hourlyRate: 35,
    responseTime: "2 horas",
    availability: "Disponible",
    phone: "+34 612 345 678",
    email: "carlos.rodriguez@example.com",
    portfolio: [
      {
        id: 1,
        title: "Reforma Integral Piso 120m²",
        description: "Reforma completa incluyendo derribos, tabiquería, alicatados y solados",
        image:
          "https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Reforma Integral",
        completedDate: "Marzo 2024",
        location: "Madrid Centro",
        duration: "6 semanas",
        budget: "18.000€",
      },
      {
        id: 2,
        title: "Rehabilitación Fachada Edificio",
        description: "Restauración completa de fachada con mortero monocapa",
        image:
          "https://images.unsplash.com/photo-1503387762-592deb58ef4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Rehabilitación",
        completedDate: "Enero 2024",
        location: "Chamartín, Madrid",
        duration: "4 semanas",
        budget: "25.000€",
      },
      {
        id: 3,
        title: "Baño Completo con Plato de Ducha",
        description: "Reforma de baño con alicatado porcelánico y plato de ducha extraplano",
        image:
          "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Baños",
        completedDate: "Febrero 2024",
        location: "Salamanca, Madrid",
        duration: "2 semanas",
        budget: "5.500€",
      },
    ],
    reviews: [
      {
        id: 1,
        clientName: "María González",
        clientAvatar: "https://randomuser.me/api/portraits/women/32.jpg",
        rating: 5,
        date: "Hace 2 semanas",
        comment:
          "Excelente profesional. Realizó la reforma de mi piso en el tiempo acordado y con un acabado impecable. Muy recomendable.",
        projectType: "Reforma Integral",
        helpfulCount: 12,
      },
      {
        id: 2,
        clientName: "Juan Pérez",
        clientAvatar: "https://randomuser.me/api/portraits/men/54.jpg",
        rating: 5,
        date: "Hace 1 mes",
        comment:
          "Carlos y su equipo hicieron un trabajo fantástico en la rehabilitación de la fachada. Muy profesionales y limpios.",
        projectType: "Rehabilitación Fachada",
        helpfulCount: 8,
      },
      {
        id: 3,
        clientName: "Ana Martín",
        clientAvatar: "https://randomuser.me/api/portraits/women/44.jpg",
        rating: 4,
        date: "Hace 2 meses",
        comment: "Buen trabajo en general. El baño quedó muy bien, aunque hubo un pequeño retraso de 3 días.",
        projectType: "Reforma Baño",
        helpfulCount: 5,
      },
    ],
  },
  {
    id: 2,
    name: "Miguel Ángel Torres",
    title: "Fontanero Certificado - Instalaciones y Reparaciones",
    avatar: "https://randomuser.me/api/portraits/men/45.jpg",
    coverImage:
      "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    location: "Barcelona, España",
    rating: 4.8,
    totalReviews: 124,
    completedProjects: 289,
    yearsExperience: 12,
    level: "Experto Verificado",
    bio: "Fontanero profesional con certificación oficial en instalaciones de agua, gas y calefacción. Especializado en reparaciones urgentes, instalaciones completas y mantenimiento preventivo. Disponible 24/7 para emergencias.",
    skills: [
      "Fontanería",
      "Instalación de Calefacción",
      "Reparación de Fugas",
      "Instalación de Gas",
      "Desatascos",
      "Mantenimiento Preventivo",
    ],
    certifications: ["Certificado Instalador de Gas", "Carnet Profesional Fontanero", "PRL Construcción"],
    languages: ["Español", "Catalán", "Inglés"],
    hourlyRate: 40,
    responseTime: "1 hora",
    availability: "Disponible 24/7",
    phone: "+34 623 456 789",
    email: "miguel.torres@example.com",
    portfolio: [
      {
        id: 1,
        title: "Instalación Completa Fontanería Vivienda",
        description: "Instalación de fontanería completa en vivienda de nueva construcción",
        image:
          "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Instalación",
        completedDate: "Abril 2024",
        location: "Barcelona",
        duration: "8 semanas",
        budget: "20.000€",
      },
      {
        id: 2,
        title: "Sistema de Calefacción por Suelo Radiante",
        description: "Instalación de sistema de calefacción por suelo radiante en 150m²",
        image:
          "https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Calefacción",
        completedDate: "Marzo 2024",
        location: "Sants, Barcelona",
        duration: "6 semanas",
        budget: "15.000€",
      },
    ],
    reviews: [
      {
        id: 1,
        clientName: "Laura Sánchez",
        clientAvatar: "https://randomuser.me/api/portraits/women/28.jpg",
        rating: 5,
        date: "Hace 1 semana",
        comment:
          "Vino en menos de una hora para una urgencia. Solucionó la fuga rápidamente y dejó todo limpio. Muy profesional.",
        projectType: "Reparación Urgente",
        helpfulCount: 10,
      },
      {
        id: 2,
        clientName: "Roberto Díaz",
        clientAvatar: "https://randomuser.me/api/portraits/men/62.jpg",
        rating: 5,
        date: "Hace 3 semanas",
        comment: "Excelente trabajo en la instalación del suelo radiante. Muy meticuloso y profesional.",
        projectType: "Instalación Calefacción",
        helpfulCount: 15,
      },
    ],
  },
  {
    id: 3,
    name: "Javier Martínez",
    title: "Electricista Certificado - Instalaciones Residenciales y Comerciales",
    avatar: "https://randomuser.me/api/portraits/men/22.jpg",
    coverImage:
      "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    location: "Valencia, España",
    rating: 4.9,
    totalReviews: 156,
    completedProjects: 342,
    yearsExperience: 18,
    level: "Experto Verificado",
    bio: "Electricista certificado con amplia experiencia en instalaciones eléctricas residenciales y comerciales. Especializado en domótica, sistemas de iluminación LED y energías renovables. Todos mis trabajos cumplen con el REBT vigente.",
    skills: [
      "Instalaciones Eléctricas",
      "Domótica",
      "Iluminación LED",
      "Cuadros Eléctricos",
      "Energía Solar",
      "Certificaciones Eléctricas",
    ],
    certifications: [
      "Carnet Instalador Electricista",
      "Certificado REBT",
      "Instalador Fotovoltaico",
      "PRL Riesgo Eléctrico",
    ],
    languages: ["Español", "Valenciano", "Inglés"],
    hourlyRate: 45,
    responseTime: "1 hora",
    availability: "Disponible",
    phone: "+34 634 567 890",
    email: "javier.martinez@example.com",
    portfolio: [
      {
        id: 1,
        title: "Instalación Eléctrica Completa Vivienda 180m²",
        description: "Instalación eléctrica completa con sistema domótico integrado",
        image:
          "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Instalación Completa",
        completedDate: "Mayo 2024",
        location: "Valencia",
        duration: "10 semanas",
        budget: "22.000€",
      },
      {
        id: 2,
        title: "Sistema de Iluminación LED Comercial",
        description: "Diseño e instalación de iluminación LED en local comercial 300m²",
        image:
          "https://images.unsplash.com/photo-1565008576549-57569a49371d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Iluminación",
        completedDate: "Abril 2024",
        location: "Elche, Valencia",
        duration: "5 semanas",
        budget: "17.000€",
      },
      {
        id: 3,
        title: "Instalación Fotovoltaica 5kW",
        description: "Sistema de paneles solares con baterías de almacenamiento",
        image:
          "https://images.unsplash.com/photo-1509391366360-2e959784a276?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Energía Solar",
        completedDate: "Marzo 2024",
        location: "Valencia",
        duration: "7 semanas",
        budget: "28.000€",
      },
    ],
    reviews: [
      {
        id: 1,
        clientName: "Carmen López",
        clientAvatar: "https://randomuser.me/api/portraits/women/65.jpg",
        rating: 5,
        date: "Hace 1 semana",
        comment:
          "Javier es un profesional excepcional. La instalación domótica funciona perfectamente y nos explicó todo con mucha paciencia.",
        projectType: "Instalación Domótica",
        helpfulCount: 14,
      },
      {
        id: 2,
        clientName: "Francisco Ruiz",
        clientAvatar: "https://randomuser.me/api/portraits/men/76.jpg",
        rating: 5,
        date: "Hace 2 semanas",
        comment: "Excelente trabajo con los paneles solares. Muy profesional y cumplió todos los plazos.",
        projectType: "Instalación Solar",
        helpfulCount: 9,
      },
    ],
  },
  {
    id: 4,
    name: "Antonio López",
    title: "Pintor Profesional - Interior y Exterior",
    avatar: "https://randomuser.me/api/portraits/men/56.jpg",
    coverImage:
      "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    location: "Sevilla, España",
    rating: 4.7,
    totalReviews: 93,
    completedProjects: 178,
    yearsExperience: 20,
    level: "Profesional Certificado",
    bio: "Pintor profesional con 20 años de experiencia en pintura interior y exterior. Especializado en acabados decorativos, estuco veneciano y pintura de fachadas. Garantía de 2 años en todos mis trabajos.",
    skills: [
      "Pintura Interior",
      "Pintura Exterior",
      "Estuco Veneciano",
      "Pintura Decorativa",
      "Lacado de Muebles",
      "Empapelado",
    ],
    certifications: ["Certificado Profesional Pintor", "PRL Construcción", "Trabajos en Altura"],
    languages: ["Español"],
    hourlyRate: 30,
    responseTime: "3 horas",
    availability: "Disponible",
    phone: "+34 645 678 901",
    email: "antonio.lopez@example.com",
    portfolio: [
      {
        id: 1,
        title: "Pintura Interior Vivienda 140m²",
        description: "Pintura completa con acabado liso en blanco roto",
        image:
          "https://images.unsplash.com/photo-1562259949-e8e7689d7828?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Pintura Interior",
        completedDate: "Mayo 2024",
        location: "Sevilla",
        duration: "7 semanas",
        budget: "12.000€",
      },
      {
        id: 2,
        title: "Estuco Veneciano Salón",
        description: "Aplicación de estuco veneciano en salón de 45m²",
        image:
          "https://images.unsplash.com/photo-1615873968403-89e068629265?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Decorativa",
        completedDate: "Abril 2024",
        location: "Triana, Sevilla",
        duration: "3 semanas",
        budget: "8.000€",
      },
    ],
    reviews: [
      {
        id: 1,
        clientName: "Isabel Fernández",
        clientAvatar: "https://randomuser.me/api/portraits/women/52.jpg",
        rating: 5,
        date: "Hace 2 semanas",
        comment: "Antonio hizo un trabajo impecable. Muy limpio y cuidadoso con los muebles. El acabado es perfecto.",
        projectType: "Pintura Interior",
        helpfulCount: 11,
      },
      {
        id: 2,
        clientName: "Manuel García",
        clientAvatar: "https://randomuser.me/api/portraits/men/38.jpg",
        rating: 4,
        date: "Hace 1 mes",
        comment: "Buen trabajo en general. El estuco veneciano quedó muy bien, aunque tardó un día más de lo previsto.",
        projectType: "Estuco Veneciano",
        helpfulCount: 7,
      },
    ],
  },
  {
    id: 5,
    name: "Francisco Gómez",
    title: "Maestro Carpintero - Muebles a Medida",
    avatar: "https://randomuser.me/api/portraits/men/76.jpg",
    coverImage:
      "https://images.unsplash.com/photo-1617806118233-18e1de247200?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    location: "Bilbao, España",
    rating: 4.9,
    totalReviews: 78,
    completedProjects: 134,
    yearsExperience: 25,
    level: "Maestro Artesano",
    bio: "Maestro carpintero con más de 25 años de experiencia en diseño y fabricación de muebles a medida. Especializado en cocinas, armarios empotrados y mobiliario de alta calidad. Trabajo con maderas nobles y acabados personalizados.",
    skills: [
      "Carpintería a Medida",
      "Cocinas",
      "Armarios Empotrados",
      "Ebanistería",
      "Restauración de Muebles",
      "Diseño 3D",
    ],
    certifications: ["Maestro Carpintero", "Certificado Profesional Ebanistería", "PRL Construcción"],
    languages: ["Español", "Euskera"],
    hourlyRate: 50,
    responseTime: "4 horas",
    availability: "Disponible",
    phone: "+34 656 789 012",
    email: "francisco.gomez@example.com",
    portfolio: [
      {
        id: 1,
        title: "Cocina Completa a Medida",
        description: "Diseño y fabricación de cocina en madera de roble con isla central",
        image:
          "https://images.unsplash.com/photo-1556911220-bff31c812dba?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Cocinas",
        completedDate: "Junio 2024",
        location: "Bilbao",
        duration: "12 semanas",
        budget: "30.000€",
      },
      {
        id: 2,
        title: "Armarios Empotrados Dormitorio",
        description: "Armarios empotrados de suelo a techo con puertas correderas",
        image:
          "https://images.unsplash.com/photo-1595428774223-ef52624120d2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Armarios",
        completedDate: "Mayo 2024",
        location: "Bilbao",
        duration: "8 semanas",
        budget: "18.000€",
      },
      {
        id: 3,
        title: "Biblioteca a Medida",
        description: "Biblioteca de madera maciza con escalera integrada",
        image:
          "https://images.unsplash.com/photo-1524758631624-e2822e304c36?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Mobiliario",
        completedDate: "Abril 2024",
        location: "Bilbao",
        duration: "10 semanas",
        budget: "25.000€",
      },
    ],
    reviews: [
      {
        id: 1,
        clientName: "Patricia Ruiz",
        clientAvatar: "https://randomuser.me/api/portraits/women/72.jpg",
        rating: 5,
        date: "Hace 1 semana",
        comment:
          "Francisco es un verdadero artesano. La cocina que nos hizo es una obra de arte. Totalmente recomendable.",
        projectType: "Cocina a Medida",
        helpfulCount: 13,
      },
      {
        id: 2,
        clientName: "Alberto Moreno",
        clientAvatar: "https://randomuser.me/api/portraits/men/48.jpg",
        rating: 5,
        date: "Hace 3 semanas",
        comment: "Excelente trabajo con los armarios. Aprovechó al máximo el espacio y el acabado es impecable.",
        projectType: "Armarios Empotrados",
        helpfulCount: 16,
      },
    ],
  },
  {
    id: 6,
    name: "Roberto Sánchez",
    title: "Técnico en Climatización - Instalación y Mantenimiento",
    avatar: "https://randomuser.me/api/portraits/men/60.jpg",
    coverImage:
      "https://images.unsplash.com/photo-1631545806609-c2ce1e6e4e0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    location: "Málaga, España",
    rating: 4.8,
    totalReviews: 112,
    completedProjects: 267,
    yearsExperience: 14,
    level: "Técnico Certificado",
    bio: "Técnico especializado en instalación y mantenimiento de sistemas de climatización. Instalador oficial de las principales marcas (Daikin, Mitsubishi, LG). Servicio de mantenimiento preventivo y reparaciones urgentes.",
    skills: [
      "Instalación Aire Acondicionado",
      "Mantenimiento HVAC",
      "Sistemas VRV",
      "Aerotermia",
      "Reparaciones",
      "Certificación Energética",
    ],
    certifications: [
      "Certificado Manipulador Gases Fluorados",
      "Instalador Oficial Daikin",
      "Técnico Frigorista",
      "PRL Construcción",
    ],
    languages: ["Español", "Inglés"],
    hourlyRate: 42,
    responseTime: "2 horas",
    availability: "Disponible",
    phone: "+34 667 890 123",
    email: "roberto.sanchez@example.com",
    portfolio: [
      {
        id: 1,
        title: "Sistema VRV Vivienda Unifamiliar",
        description: "Instalación de sistema VRV con 6 unidades interiores",
        image:
          "https://images.unsplash.com/photo-1631545806609-c2ce1e6e4e0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Climatización",
        completedDate: "Mayo 2024",
        location: "Málaga",
        duration: "9 semanas",
        budget: "24.000€",
      },
      {
        id: 2,
        title: "Aerotermia con Suelo Radiante",
        description: "Sistema de aerotermia para calefacción y ACS",
        image:
          "https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        category: "Aerotermia",
        completedDate: "Abril 2024",
        location: "Costa del Sol, Málaga",
        duration: "11 semanas",
        budget: "32.000€",
      },
    ],
    reviews: [
      {
        id: 1,
        clientName: "Cristina Jiménez",
        clientAvatar: "https://randomuser.me/api/portraits/women/38.jpg",
        rating: 5,
        date: "Hace 1 semana",
        comment: "Roberto instaló el aire acondicionado de forma impecable. Muy profesional y limpio en su trabajo.",
        projectType: "Instalación Aire Acondicionado",
        helpfulCount: 17,
      },
      {
        id: 2,
        clientName: "David Navarro",
        clientAvatar: "https://randomuser.me/api/portraits/men/28.jpg",
        rating: 5,
        date: "Hace 2 semanas",
        comment: "Excelente servicio. El sistema de aerotermia funciona perfectamente y nos explicó todo muy bien.",
        projectType: "Instalación Aerotermia",
        helpfulCount: 19,
      },
    ],
  },
]

export function getProfileById(id: number): ProfessionalProfile | undefined {
  return professionalProfiles.find((profile) => profile.id === id)
}
