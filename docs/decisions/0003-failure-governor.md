# ADR 0003 — Failure Governor (v5.1)

**Data:** 2026-04-17
**Status:** Accepted
**Contesto:** Sprint 2.3 Track A (PR #14). Rimozione del Cost Governor introdotto in v5.0, sostituito da un signal non basato su costo in USD.

---

## Contesto

v5.0 aveva un **Cost Governor**: il `Director` valutava `ctx.costUsd` contro `ctx.costBudget` e triggerava una decision critica quando il costo stimato superava il 70% del budget. Costo calcolato a `BatCave.ts` con `COST_PER_INPUT_TOKEN = $15/M` e `COST_PER_OUTPUT_TOKEN = $75/M` (Opus pricing).

Due problemi strutturali:

1. **Violazione "No Cost Metrics"** (workspace rule, `feedback_no_cost_metrics.md`): Giovanni ha Max subscription 20x, il costo marginale di una sessione e zero. Mostrare dollari fa leva sul frame sbagliato — "quanto sto spendendo?" invece di "il sistema sta funzionando?"
2. **Segnale inaffidabile**: il pricing era hardcoded a Opus. Cambio modello (Sonnet, Haiku) → stima fuori di 3-10x. Nessun meccanismo di update.

Issue #12 ha chiesto la rimozione.

## Decisione

Il Governor resta, ma cambia signal: **Failure Governor**. Il `Director` monitora il rolling window degli ultimi 20 `tool_end` events con `success: boolean`, e trigera quando il failure rate raggiunge una soglia configurata.

### Parametri scelti

- **Window size:** 20 eventi tool_end
- **Minimum sample:** 10 (il governor e silenzioso sotto questo)
- **Threshold:** 40% failure rate
- **Source:** solo OTel (il `success` boolean dei JSONL events e `undefined`)

### Perche questi numeri

| Parametro     | Valore | Rationale                                                                                                                                                                                       |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window 20     |        | Copre ~2-5 minuti di attivita tipica (tool_end ogni 10-30s). Grande abbastanza per smoothing di spike singoli; piccolo abbastanza per reagire entro una singola sessione                        |
| Min sample 10 |        | Evita trigger quando 2 fail su 3 = 66% (statisticamente rumore). Serve un campione decente prima di "osare" un signal critico                                                                   |
| Threshold 40% |        | Sopra questo, qualcosa e palesemente rotto (non retry intermittente). Tra 20-40% e "sospetto ma da vedere" — gestito dal color coding nella HistoryPanel (orange). Oltre 40% e rosso + decision |

## Alternative considerate

| Opzione                                                | Perche rifiutata                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rimuovere il Governor del tutto**                    | Il Director resterebbe solo deploy-oriented. Persiamo il pattern di "signal critico che blocca" che e utile per errori sistemici                  |
| **Signal context pressure**                            | Gia coperto dalla rule `context-pressure-critical` (>= 85%). Duplicazione                                                                         |
| **Signal rate-of-errors (api_error OTel)**             | Piu diretto ma piu raro. Il failure di tool e il canarino piu sensibile — include sia API error sia tool invocation failure sia assertion failure |
| **Window adattivo (5-50 in base alla session length)** | Complessita gratuita. Il fixed 20 funziona per sessioni >3min e per quelle corte il min-sample di 10 gate comunque                                |

## Modello tecnico

`BatCaveWorld` espone:

```typescript
trackToolResult(success: boolean): void;
getToolFailureRate(): number; // 0-1, 0 se window vuoto
getToolSampleSize(): number;  // 0-20
```

Chiamato da `BatCave.handleEvent('tool_end')` solo quando `typeof event.success === "boolean"` (cioe solo OTel, mai JSONL). Questo e intenzionale: JSONL non ha segnale di success affidabile, fondere le due source introdurrebbe false positive.

`Renderer` passa `toolFailureRate` e `toolSampleSize` a `Director.update()`. `Director` applica la condizione:

```typescript
condition: (ctx) => ctx.toolSampleSize >= 10 && ctx.toolFailureRate >= 0.4;
```

`SessionSummary` (shared type) cambia:

```diff
-  estimatedCostUsd: number;
+  toolFailureRate?: number;  // undefined quando OTel inattivo per quella sessione
+  toolSampleSize?: number;
```

Gli opzionali sono necessari: la `SessionSummary` e persistita — sessioni storiche pre-v5.1 non hanno questi campi, e sessioni post-v5.1 senza OTel attivo neanche. `HistoryPanel` distingue "no data" ("—") da "0% failure" (verde).

## Conseguenze

**Positive:**

- Signal piu onesto — "il sistema sta funzionando" > "quanto sto spendendo"
- Elimina pricing hardcoded che sarebbe rotto al cambio modello
- Il Failure Governor e actionable: se triggera, si prende la decision su cosa fare (rollback, invoke Specter, ecc.)

**Negative:**

- Richiede OTel attivo per avere signal. Senza collector in esecuzione, il Governor e muto
- La soglia 40% e empirica — dopo 1-2 settimane di uso potremmo calibrarla

**Follow-up:**

- Issue #16 tracks setTimeout/setInterval cleanup (scoperti durante Bishop review di questa PR)
- Osservare il trigger rate nelle prossime settimane; se triggera 0 volte o 10 volte al giorno, ricalibrare

## Riferimenti

- Issue #12 — No Cost Metrics violation (chiuso da PR #14)
- Issue #11 — OtelMonitor integration tests (chiuso da PR #14)
- ADR 0002 — OTel Consumer (v5.0)
- `feedback_no_cost_metrics.md` nel workspace memory
