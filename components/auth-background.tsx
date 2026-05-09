"use client"

export function AuthBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 pointer-events-none">
      {/* Blob superior izquierda */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-emerald-300 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob" />

      {/* Blob superior derecha */}
      <div className="absolute -top-20 right-0 w-[400px] h-[400px] bg-green-300 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob animation-delay-2000" />

      {/* Blob inferior */}
      <div className="absolute -bottom-40 left-1/3 w-[600px] h-[600px] bg-teal-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000" />

      {/* Blob centro accent */}
      <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-lime-200 rounded-full mix-blend-multiply filter blur-3xl opacity-25 animate-blob" />

      {/* Patrón de rejilla sutil */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(16, 185, 129, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.4) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
    </div>
  )
}
