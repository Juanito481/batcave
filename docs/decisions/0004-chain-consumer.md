# ADR 0004 — Chain Consumer (v5.4)

**Data:** 2026-04-17
**Status:** Accepted
**Contesto:** workspace `alfred-labs-infra` ADR 0002 introduce il protocollo chains (`.claude/chains/active/<chain-id>/` con `status.md` + `todo.md` + `notes.md`) come working state durable delle chain Marshal. Batcave deve diventare consumer di questo nuovo stream per mantenere la promessa di "ambient observability" su tutta l'attivita Scacchiera.

---

## Contesto

Batcave v5.2 consuma due stream:

1. **JSONL** — trascritti `~/.claude/projects/*.jsonl` (v1.0 baseline).
2. **OTel** — eventi `~/.batcave/otel-events.jsonl` via collector locale (v5.0, vedi ADR 0002 di questo repo).

Con l'introduzione di `chains/` nel workspace (ADR 0002 del workspace), le chain Marshal scrivono working state durable su filesystem. Senza un terzo consumer, Batcave non avrebbe visibilita sulle chain — Giovanni vedrebbe agenti entrare/uscire ma non la struttura della chain che li orchestra. E un invisibility debt simmetrico a quello che chain ha risolto per gli handoffs.

## Decisione

Batcave v5.4 aggiunge un **terzo consumer**: `ChainMonitor` con polling di `.claude/chains/active/<chain-id>/status.md` (1000ms) e rendering come pixel-art quest cards su un mission board wall-mounted.

### Architettura

```text
Workspace (alfred-labs-infra)
  .claude/chains/active/<chain-id>/
       │
       │ status.md write (Marshal, agent steps)
       ▼
Batcave ChainMonitor (polling 1000ms)
       │ parse status.md front matter
       │ diff vs known state (in-memory Map)
       ▼
ChainEvent { created | updated | archived }
       │
       ├─► EventMerger ──► webview ──► BatCave world
       │                                │
       │                                ▼
       │                        MissionBoardLayer
       │                        (cork board + quest cards)
       │
       └─► StatusBarItem ──► TreeView "Scacchiera Chains"
                             (sidebar Explorer)
```

### Perche polling 1000ms (non 500ms come OTel/JSONL)

Chain status.md viene sovrascritto una volta per step Marshal (decine di secondi fra update, non millisecondi). 1000ms e ampiamente sufficiente e dimezza l'I/O rispetto a 500ms.

### Parsing

`parseStatus()` estrae i campi dal markdown tramite regex (`**Type:**`, `**Target:**`, `**Step:**`, `**Current:**`, `**Next:**`, `**Flag:**`). E tollerante: placeholder template (`<agent>`, `<chain-id>`) sono trattati come stringhe vuote; flag sconosciuti fallback a `clean`.

### Invisibilita `silenziosa` quando dir non esiste

Il monitor non protesta se `.claude/chains/active/` non esiste — aspetta in polling e si attiva al primo Marshal chain. Se la dir viene rimossa mid-session (rollback), emette `chain_archived` per ogni chain nota e torna dormiente. Stesso pattern di `otel-monitor.ts`.

## Alternative considerate e rifiutate

| Alternativa                                   | Perche scartata                                                                                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OTel instrumentation di Marshal**           | Richiederebbe far emettere span/log OTel agli agenti Scacchiera. Fuori scope Batcave (richiede lavoro cross-repo) e violerebbe la tesi "durable truth lives in files" del workspace ADR 0002. |
| **`fs.watch()` invece di polling**            | `fs.watch` e unreliable su macOS/WSL2. Lo stesso pattern e gia stato rifiutato per JSONL e OTel monitor. Coerenza > purismo.                                                |
| **Webview legge direttamente i file**         | Webview non puo accedere a fs nodo. Doveva passare da extension host comunque. Avrebbe duplicato logica senza beneficio.                                                    |
| **Render chains nel HudLayer come overlay**   | Il HUD e gia denso (state dot, context bar, pace, agents). Un overlay chain peggiorerebbe la leggibilita. Mission board dedicato separa la sorgente di dati.                |
| **Nessuna visualizzazione, solo status bar**  | Status bar e efficace per count ma non per stato semantico (step progress, flag color). Mission board + tree view sono complementari, non alternative.                     |
| **Dependency su un npm package (chokidar)**   | Dipendenza esterna per un caso d'uso di 200 righe di polling. Batcave tiene `dependencies` minime (solo `ws`).                                                             |

## Conseguenze

### Positive

- **Simmetria workspace**: Giovanni vede le chain nella cave (pixel-art) + nello status bar (count) + nel tree view (dettaglio navigabile). Tre canali ridondanti che rafforzano il segnale.
- **Coerenza principi**: durable-in-files + polling + no-external-deps + pixel-perfect. Nessun compromesso rispetto ai vincoli v5.0.
- **Zero config**: auto-discover del workspace root, nessuna nuova setting key.
- **Rollback safety**: rimozione della dir chains genera `chain_archived` events — niente state stantio lato webview.

### Negative

- **Terzo stream da mantenere**: ogni refactor del chain protocol richiede update di `chain-monitor.ts` parsing. Mitigato da: schema status.md e dichiarato nel workspace ADR 0002 con formato stabile.
- **`bus.emit` carta di credito**: usa gli stessi preset particle di agent events (`agent-enter` / `agent-exit`). Visual noise se Marshal lancia molte chain in burst. Mitigabile in v5.5 con preset dedicati se emerge debt visual.
- **MissionBoardLayer posizione fissa**: upper-left wall. Se layout mode `compact` restringe la cave, il board puo sovrapporsi ad altri elementi. Da monitorare; v5.5 potrebbe leggere posizione da `getLayout()` invece di hardcoded.

## File modificati

- `src/chain-monitor.ts` (new)
- `src/chains-tree-provider.ts` (new, v5.4 tree view)
- `shared/types.ts` (+`ChainEvent`)
- `src/types.ts` (+re-export)
- `src/extension.ts` (wire monitor, status bar, command, tree view)
- `webview/src/world/BatCave.ts` (+`ChainCardState`, handleEvent cases, getter)
- `webview/src/canvas/layers/MissionBoardLayer.ts` (new)
- `webview/src/canvas/Renderer.ts` (call drawMissionBoard)
- `package.json` (5.1.0 → 5.4.0, new command, new view)

## Riferimenti

- Workspace ADR 0002: `alfred-labs-infra/Docs/decisions/0002-chains-replace-handoffs.md`
- Chain protocol spec: `alfred-labs-infra/.claude/scacchiera/protocol.md` v3.2
- This repo ADR 0002: OTel Consumer (file tail pattern precursor)
- Pattern source: [hesamsheikh/octogent](https://github.com/hesamsheikh/octogent)
