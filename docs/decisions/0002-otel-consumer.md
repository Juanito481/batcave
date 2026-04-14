# ADR 0002 — OTel Consumer (v5.0)

**Data:** 2026-04-14
**Status:** Accepted
**Contesto:** Sprint 2.2 dell'Observability Sprint (workspace `alfred-labs-infra`), build on ADR 0001 di quel repo che adotta OTel nativo di Claude Code come data source + Prometheus locale come backend.

---

## Contesto

Batcave v4.2 consuma solo JSONL transcripts (`~/.claude/projects/*.jsonl`) via polling 500ms. Funziona ma:

- Text-mining fragile: ogni cambio nel formato JSONL richiede patch.
- Latenza variabile (fino a 500ms).
- Perde semantica strutturata che Claude Code ora emette come OTel events:
  - `claude_code.skill_activated` con `skill.name`, `skill.source`
  - `claude_code.tool_result` con `success`, `duration_ms`, `tool_name`
  - `claude_code.api_error` con `status_code`, `attempt`
  - `claude_code.tool_decision` accept/reject
  - `claude_code.user_prompt`
  - `claude_code.plugin_installed`

## Decisione

Batcave v5.0 diventa **dual-source**: legge eventi da OTel (via file tail) **e** da JSONL (fallback), unificandoli nell'event bus interno.

### Architettura scelta: Opzione B (file JSON exporter)

Il collector OTel (in `Utilities/monitoring/` del workspace) viene esteso con un `file/json` exporter che scrive ogni log/event a un file su disco. Batcave tail-a questo file con lo stesso pattern del JSONL monitor attuale.

```
Claude Code
     │ OTLP/gRPC
     ▼
OTel Collector  ──► Prometheus (metrics)
     │
     │ file/json exporter
     ▼
~/.batcave/otel-events.jsonl
     │ tail polling (500ms)
     ▼
Batcave OtelMonitor
     │
     ▼
EventMerger (dedup + unified BatCaveEvent stream)
     │
     ▼
BatCave world
```

### Alternative considerate

| Opzione                              | Perche rifiutata                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **A — Prometheus pull**              | Metriche aggregate, perde event-level (niente `skill.name`, `tool_name`, success/fail granulare) |
| **C — Relay sidecar WebSocket**      | Nuovo servizio da mantenere — fallisce test singolo sviluppatore                                 |
| **D — Batcave OTLP receiver nativo** | Protocollo OTLP complesso, multi-endpoint non standard, extension host non e server              |

Opzione B vince perche:

- Mantiene il pattern noto (tail a file) che Batcave gia padroneggia.
- Config change isolata al collector (un exporter in piu).
- Zero nuovi servizi.
- File JSON e leggibile da umani e debuggabile facilmente.

## Modello eventi

Nuova `OtelEvent` in `shared/protocol.ts` rappresenta un log OTLP normalizzato:

```typescript
interface OtelEvent {
  name: string; // e.g. "claude_code.skill_activated"
  timestamp: number;
  attributes: Record<string, string | number | boolean>;
}
```

Mapping `OtelEvent` → `BatCaveEvent`:

| OTel event name                      | BatCaveEvent                                          | Source attributes                     |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------- |
| `claude_code.skill_activated`        | `agent_enter { agentId: skill.name, source: "otel" }` | `skill.name`                          |
| `claude_code.tool_result`            | `tool_start` + `tool_end { success, duration_ms }`    | `tool_name`, `success`, `duration_ms` |
| `claude_code.api_error`              | `api_error { statusCode, attempt }`                   | `status_code`, `attempt`              |
| `claude_code.tool_decision` (reject) | `tool_rejected { toolName }`                          | `tool_name`, `decision`               |
| `claude_code.user_prompt`            | `prompt_start { length }`                             | `prompt_length`                       |
| `claude_code.plugin_installed`       | `plugin_installed { name, version }`                  | `plugin.name`, `plugin.version`       |

## Settings

Nuovo setting `batcave.telemetrySource`:

- `"auto"` (default): OTel se il file esiste, JSONL comunque come fallback.
- `"jsonl"`: solo JSONL (backwards compat forzata).
- `"otel"`: solo OTel (opt-in puro).
- `"both"`: entrambi con dedup (event correlation via `prompt.id`).

## Event merger

Quando entrambe le sources emettono, l'`EventMerger`:

- Dedup su `(agentId + timestamp)` in finestra di 1 sec per `agent_enter`.
- Dedup su `(tool_name + timestamp)` in finestra di 500ms per `tool_start`/`tool_end`.
- Priorita a OTel event (piu strutturato).
- Fallback a JSONL se OTel assente per >5s.

## Conseguenze

### Positive

- Semantica strutturata preservata.
- Minore parsing fragile.
- Nuovi BatCaveEvent types (`api_error`, `tool_rejected`, `prompt_start`, `plugin_installed`) abilitano Sprint 2.3 (visual semantics).
- Dual-source = zero downtime durante transizione.

### Negative

- Utente deve configurare manualmente l'exporter `file/json` nel collector (documentato in `docs/monitoring-setup.md`).
- Coupling debole al collector config.
- File `~/.batcave/otel-events.jsonl` cresce — serve rotation/truncation (handled by OtelMonitor).

### Vincoli costituzionali

- Mai visualizzare `cost.usage` events — rispetta **No Cost Metrics** del workspace.
- Telemetria resta on-device: l'OTel file vive in `~/.batcave/` locale.

## Prossimi passi

- Sprint 2.3 (ADR 0003): nuove visual semantics che sfruttano gli eventi strutturati.
- Eventuale deprecation del JSONL monitor se OTel copre tutti i casi per 4+ settimane consecutive (gated da Fase 4 osservazione del workspace sprint).

## Setup utente

Vedi `docs/monitoring-setup.md` per:

1. Come aggiungere il `file/json` exporter al `otel-collector-config.yaml`.
2. Come verificare che gli eventi arrivino a `~/.batcave/otel-events.jsonl`.
3. Troubleshooting (file non creato, eventi assenti, etc.).
