import { cn } from "@/lib/utils"

type DiimeLogoProps = {
  className?: string
}

export function DiimeLogo({ className }: DiimeLogoProps) {
  return (
    <img
      src="/brand/diime-mark-v3.svg?v=logo-unmasked-4"
      alt=""
      aria-hidden="true"
      className={cn("block shrink-0 object-contain", className)}
    />
  )
}
