# Informes del mercado

Los arma una rutina de Claude en la nube (claude.ai/code/routines) de lunes a viernes a las 10:00 y 18:15
(hora de Argentina) y el domingo a las 10:00 la revisión semanal. Aparecen en la app en **Mercado → Informes**
y el robot de avisos (`tools/notifier`) manda la notificación.

## Pasos de la rutina

1. `node tools/report/context.mjs am|pm|weekly > /tmp/contexto.json`: junta cartera, precios, técnico,
   CEDEAR caro/barato, dólar, riesgo país, estado del mercado, noticias y avisos recientes.
2. Leer el contexto y la skill `analista-inversiones` (repositorio privado). Completar con búsqueda web
   (noticias del día, fechas de resultados, dividendos).
3. Escribir el informe en `/tmp/informe.json` con el formato de abajo.
4. `node tools/report/save.mjs /tmp/informe.json`: lo valida y lo guarda en Supabase (tipo `informes`).

Necesita la variable de entorno `SUPABASE_SERVICE_KEY` en el entorno de la rutina. No hace commits.

## Formato del informe (JSON)

```jsonc
{
  "kind": "am | pm | weekly",
  "date": "AAAA-MM-DD",
  "title": "Informe de cierre",
  "headline": "Una línea con lo más importante",
  "pushTitle": "Título de la notificación (≤ 80)",
  "pushBody": "Texto de la notificación (≤ 220)",
  "summary": "2 a 4 párrafos cortos (separados por \\n)",
  "portfolio": { "changePct": -1.2, "changeArs": -2900, "text": "Cómo afectó a tu cartera" },
  "outlook": {                          // obligatorio: los tres plazos
    "corto":   { "view": "alcista | neutral | bajista", "text": "…", "actions": ["…"] },
    "mediano": { "view": "…", "text": "…", "actions": ["…"] },
    "largo":   { "view": "…", "text": "…", "actions": ["…"] }
  },
  "macro": [{ "label": "MEP", "value": "$ 1.581", "change": 0.3 }],
  "macroText": "Qué pasó con el dólar, riesgo país, tasas, Wall Street",
  "news": [{ "title": "…", "link": "https://…", "source": "…", "ticker": "NVDA", "impact": "alta | media | baja", "why": "Por qué importa para tu cartera" }],
  "assets": [{                          // uno por activo de la cartera (y los de seguimiento con novedades)
    "ticker": "NVDA", "name": "Nvidia (CEDEAR)", "market": "cedear", "pct": -1.64,
    "why": "Por qué subió o bajó (o qué esperar, en el de apertura)",
    "news": [{ "title": "…", "link": "https://…", "source": "…" }],
    "technical": "Lectura técnica en una línea",
    "premium": "CEDEAR caro/barato vs. CCL en una línea",
    "horizons": {                       // obligatorio: los tres plazos
      "corto":   { "view": "bajista", "text": "…", "action": "Qué podrías hacer" },
      "mediano": { "view": "neutral", "text": "…", "action": "…" },
      "largo":   { "view": "alcista", "text": "…", "action": "…" }
    }
  }],
  "calendar": [{ "date": "Miércoles 18/11", "ticker": "NVDA", "event": "Resultados 3T", "note": "…" }],
  "ideas": ["Oportunidades para mirar (no órdenes)"],
  "risks": ["Riesgos a vigilar"],
  "sources": [{ "label": "…", "link": "https://…" }],
  "disclaimer": "Opcional: si falta, la app muestra uno por defecto"
}
```

El `id` es `fecha-kind` (ej. `2026-11-16-pm`): volver a guardar el mismo día lo reemplaza.
