# Finanzas Tino

App personal de finanzas para iPhone y PC. Es una PWA: una página web que se instala en el celular como una app y funciona sin internet.

## Estructura

- `app/`: la app (esto es lo que se publica).
  - `js/store.js`: los datos y los cálculos (saldos, totales del mes).
  - `js/db.js`: la base de datos local del dispositivo (IndexedDB).
  - `js/views/`: las 4 pantallas (Inicio, Movimientos, Reportes, Más).
  - `js/sheets/`: los paneles (cargar movimiento, cuentas, tarjetas, presupuestos, pagos recurrentes, vencimientos, categorías, ajustes, bienvenida).
  - `js/logic/`: cálculos de resúmenes de tarjeta y de pagos recurrentes.
  - `sw.js`: permite usarla sin conexión.
- `tools/`: scripts de desarrollo (servidor local, generar íconos).
- `muestra/`: la primera muestra de diseño.

## Probarla en la PC

```bash
npm run dev
```

Después abrí http://localhost:5173.

## Publicar cambios

Cuando cambies archivos de `app/`, subí `VERSION` en `app/sw.js` (por ejemplo `v1.0.1`). Así el celular descarta la copia vieja.

Si agregás íconos nuevos, sumalos en `tools/build-icons.mjs` y ejecutá `npm run icons`.

## Tus datos

Los datos quedan guardados en cada dispositivo. Hasta la etapa 5, que agrega la sincronización, hacé copias desde **Más → Ajustes → Exportar copia completa**.

## Etapas

1. ✅ Base: cuentas, categorías, gastos, ingresos, transferencias, inicio, movimientos, reportes, copias.
2. ✅ Tarjetas (cierre, vencimiento, resúmenes, pagos) y cuotas, presupuestos por categoría con avisos, pagos recurrentes (manuales o automáticos), próximos vencimientos y número en el ícono.
3. ✅ Inversiones (plazo fijo calculado solo, FCI, acciones, CEDEARs, bonos, cripto, dólares) con ganancia y evolución, metas de ahorro con plan mensual, deudas y préstamos, patrimonio neto completo.
4. ✅ Reportes avanzados: mes, 3 y 6 meses, año o rango; ajuste por inflación (IPC INDEC vía api.argentinadatos.com, con carga manual); comparación con el período anterior; medios de pago; patrimonio; exportar a PDF (jsPDF, en `app/vendor`, se copia con `npm run vendor`) y a Excel.
5. ✅ Sincronización entre dispositivos (Supabase, `supabase/schema.sql`), bloqueo con PIN / Face ID y carga de varios gastos pegando el resumen de la tarjeta.

## Mercado y avisos

- Pestaña **Mercado**: cartera con precios en vivo (data912/BYMA, Binance, dolarapi), seguimiento, dólar y riesgo país.
- Las inversiones con `ticker` + `market` + `units` se valúan solas (`app/js/logic/market.js`).
- Análisis técnico (`logic/analysis.js`) con los indicadores de la skill (`logic/ta.js`, copiado de `skills/analista-inversiones`).
- Reglas de alertas y planes de compra en `logic/alerts-core.js`: la misma lógica corre en la app y en el robot.
- Robot `tools/notifier/run.mjs` en GitHub Actions (`.github/workflows/avisos.yml`), cada 30 minutos en horario de BYMA.
  Secretos del repo: `SUPABASE_SERVICE_KEY` (clave secreta de Supabase) y `VAPID_PRIVATE_KEY`.
  Ojo: GitHub pausa los workflows programados si el repo no tiene actividad en 60 días; se reactivan desde la pestaña Actions.

## Sincronización (Supabase)

1. Crear un proyecto gratis en supabase.com.
2. SQL Editor → pegar `supabase/schema.sql` → Run.
3. Authentication → URL Configuration → Site URL: `https://suarezvalen.github.io/finanzas-tino/`.
4. Poner la Project URL y la clave pública (publishable/anon) en `SYNC` dentro de `app/js/constants.js`.

La clave pública puede estar en el código: los datos se protegen por usuario con Row Level Security. Cada registro guarda `updatedAt` y `_remote`; al sincronizar se suben los cambios pendientes y se bajan los nuevos (`server_ts`), y gana siempre la versión más reciente.
