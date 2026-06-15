import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  error: Error | null
  loading: boolean
}

/**
 * Hook async minimal (chargement/erreur/rechargement), sans dépendance — suffisant pour l'admin.
 * Le rechargement passe par un `nonce` : le corps de l'effet ne fait JAMAIS de setState synchrone
 * (règle react-hooks/set-state-in-effect) — l'état n'est posé que dans la résolution asynchrone.
 */
export function useAsync<T>(fn: () => Promise<T>) {
  // Les appelants passent une référence STABLE (adminApi.overview/orgs/users/plans) → capture unique.
  const fnRef = useRef(fn)
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true })
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }))
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    let active = true
    fnRef
      .current()
      .then((d) => {
        if (active) setState({ data: d, error: null, loading: false })
      })
      .catch((e: Error) => {
        if (active) setState({ data: null, error: e, loading: false })
      })
    return () => {
      active = false
    }
  }, [nonce])

  return { data: state.data, error: state.error, loading: state.loading, reload }
}
