# Monitoring Setup — Batcave OTel Consumer

Da v5.0, Batcave puo consumare eventi OTel nativi di Claude Code in aggiunta (o al posto) dei JSONL transcripts.

Prerequisito: lo stack locale di `anthropics/claude-code-monitoring-guide` deve essere gia in esecuzione. Se non lo hai, segui ADR 0001 di `alfred-labs-infra` (workspace root).

## Step 1 — Estendi il collector

Apri `<workspace>/Utilities/monitoring/otel-collector-config.yaml` (o wherever il tuo clone vive) e aggiungi un exporter `file/json`:

```yaml
exporters:
  # ... existing exporters ...

  # Batcave OTel consumer — scrive eventi JSON line-delimited.
  file/batcave:
    path: /Users/giovannipalchettitosi/.batcave/otel-events.jsonl
    format: json
    rotation:
      max_megabytes: 50
      max_backups: 3

service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters:
        - otlphttp/prometheus # existing
        - file/batcave # new
```

**Sostituisci il path** con la tua home dir assoluta (il collector gira in Docker e deve avere accesso a quella directory — vedi step 2 per il volume mount).

## Step 2 — Monta il volume nel collector

In `docker-compose.yml` aggiungi un volume mount al servizio `otel-collector`:

```yaml
otel-collector:
  image: otel/opentelemetry-collector-contrib:latest
  # ...
  volumes:
    - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    - /Users/giovannipalchettitosi/.batcave:/Users/giovannipalchettitosi/.batcave
```

Restart:

```bash
docker compose down && docker compose up -d
```

## Step 3 — Verifica

Con Claude Code attivo (env OTel gia configurata in `~/.claude/settings.json`):

```bash
mkdir -p ~/.batcave
tail -f ~/.batcave/otel-events.jsonl
```

Invoca una skill o esegui un tool su Claude Code. Dovresti vedere righe JSON con eventi tipo:

```json
{"timestamp":"...","body":"","attributes":{"event.name":"claude_code.skill_activated","skill.name":"bishop",...}}
```

## Step 4 — Abilita il consumer in Batcave

In VSCode Settings (Cmd+,) cerca `batcave.telemetrySource`:

- `auto` (default) — OTel se il file esiste, JSONL comunque come fallback
- `jsonl` — solo JSONL (v4.x behavior)
- `otel` — solo OTel (richiede Step 1-3 completati)
- `both` — entrambi con dedup

## Troubleshooting

**Il file `~/.batcave/otel-events.jsonl` non viene creato**

- Verifica che il path nel collector config sia esattamente il tuo home dir (no `~`, serve assoluto).
- Verifica il volume mount in docker-compose.yml.
- `docker logs monitoring-otel-collector-1 2>&1 | grep -i batcave`

**File creato ma vuoto**

- Verifica che Claude Code abbia `CLAUDE_CODE_ENABLE_TELEMETRY=1` e `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` in `~/.claude/settings.json` env block.
- Riavvia Claude Code — le env var si applicano all'avvio.
- Verifica che `OTEL_LOGS_EXPORTER=otlp` sia settato (events arrivano come logs OTLP).

**Batcave non vede gli eventi**

- Verifica setting `batcave.telemetrySource` non sia `"jsonl"`.
- Reset view: Cmd+Shift+P → "Bat Cave: Reset View".
- Apri VSCode Output panel → Bat Cave per log di debug.

## Why this setup

Vedi ADR 0002 (`docs/decisions/0002-otel-consumer.md`) per il razionale completo. Tl;dr: file tail e il pattern che Batcave gia padroneggia, zero nuovi servizi, collector config cambia solo un exporter.
