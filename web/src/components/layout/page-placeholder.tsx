import { type ReactNode } from 'react'

interface PagePlaceholderProps {
  title: string
  description: string
  children?: ReactNode
}

/** Gabarit d'en-tête de page réutilisé par les écrans en attente d'implémentation. */
export function PagePlaceholder({ title, description, children }: PagePlaceholderProps) {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2">{description}</p>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  )
}
