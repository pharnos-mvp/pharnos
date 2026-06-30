import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface ComboboxItem {
  value: string
  label: string
  /** Texte additionnel pris en compte par la recherche (ex. DCI d'un produit). */
  keywords?: string
}

/**
 * Combobox accessible (pattern WAI-ARIA « editable combobox with list autocomplete ») — zéro
 * dépendance. Clic/focus → ouvre la liste complète (comme un select) ; frappe → filtre par libellé
 * (et `keywords`). Clavier : ↑/↓ navigue, Entrée choisit, Échap ferme, Début/Fin. Pensé pour les
 * listes longues (centaines de produits). La liste est triée par l'appelant (passer `items` triés).
 */
export function Combobox({
  items,
  value,
  onChange,
  placeholder,
  emptyText,
  ariaLabel,
  id,
  className,
}: {
  items: ComboboxItem[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  ariaLabel?: string
  id?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const autoId = useId()
  const listId = `${autoId}-listbox`
  const optId = (i: number) => `${autoId}-opt-${i}`

  const selected = items.find((it) => it.value === value)
  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      q
        ? items.filter(
            (it) => it.label.toLowerCase().includes(q) || it.keywords?.toLowerCase().includes(q),
          )
        : items,
    [items, q],
  )

  // Affichage : la requête quand ouvert, le libellé sélectionné quand fermé.
  const display = open ? query : (selected?.label ?? '')

  // Maintient l'option active visible (no-op sûr en jsdom où scrollIntoView est absent).
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelectorAll('[role="option"]')[activeIndex]
    ;(el as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, open])

  // Clic en dehors → ferme (et abandonne la requête).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Ouvre la liste en repartant de la 1re option (évite un setState en effet → pas de cascading render).
  function openNow() {
    setOpen(true)
    setActiveIndex(0)
  }

  function close() {
    setOpen(false)
    setQuery('')
  }

  function select(it: ComboboxItem) {
    onChange(it.value)
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) openNow()
        else setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!open) openNow()
        else setActiveIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        if (open && filtered[activeIndex]) {
          e.preventDefault()
          select(filtered[activeIndex])
        }
        break
      case 'Escape':
        if (open) {
          e.preventDefault()
          close()
        }
        break
      case 'Home':
        if (open) {
          e.preventDefault()
          setActiveIndex(0)
        }
        break
      case 'End':
        if (open) {
          e.preventDefault()
          setActiveIndex(filtered.length - 1)
        }
        break
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          // Le garde `filtered[activeIndex]` est CE qui empêche un activedescendant fantôme si `items`
          // change pendant l'ouverture (re-emit Dexie/useLiveQuery) — ne pas le retirer.
          aria-activedescendant={open && filtered[activeIndex] ? optId(activeIndex) : undefined}
          aria-label={ariaLabel}
          autoComplete="off"
          value={display}
          placeholder={open && selected ? selected.label : placeholder}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActiveIndex(0)
          }}
          onFocus={() => {
            if (!open) openNow()
          }}
          onClick={() => {
            if (!open) openNow()
          }}
          onKeyDown={onKeyDown}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 placeholder:text-muted-foreground dark:bg-input/30 h-9 w-full rounded-md border bg-transparent py-2 pr-9 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
        />
        <ChevronDown
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
          aria-hidden
        />
      </div>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="bg-popover text-popover-foreground absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border p-1 shadow-md"
        >
          {filtered.length ? (
            filtered.map((it, i) => {
              const isSel = it.value === value
              const isActive = i === activeIndex
              return (
                <li
                  key={it.value}
                  id={optId(i)}
                  role="option"
                  aria-selected={isSel}
                  // mousedown avant blur → le clic sélectionne sans fermer prématurément.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(it)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                    isActive ? 'bg-accent text-accent-foreground' : '',
                  )}
                >
                  <Check className={cn('size-4 shrink-0', isSel ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{it.label}</span>
                </li>
              )
            })
          ) : (
            // `role=presentation` : un message n'est pas une `option` (containment ARIA du listbox).
            <li role="presentation" className="text-muted-foreground px-2 py-6 text-center text-sm">
              {emptyText}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  )
}
