import type { ReactNode } from "react"
import { CardFooter } from "@/components/ui/card"

export function PieTarjetaDirectorio({ precio, children }: { precio?: ReactNode; children: ReactNode }) {
  return (
    <CardFooter className="mt-auto grid shrink-0 gap-2 border-t p-6 md:grid-rows-[minmax(3rem,auto)_auto] @[18rem]:grid-cols-[1fr_auto] @[18rem]:grid-rows-[minmax(3rem,auto)]">
      {precio}
      <div className={precio ? "min-w-0" : "col-span-full min-w-0 md:row-start-2 @[18rem]:row-start-1"}>
        {children}
      </div>
    </CardFooter>
  )
}
