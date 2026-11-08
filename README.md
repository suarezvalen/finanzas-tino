# Finanzas Tino

App personal de finanzas para iPhone y PC. Es una PWA: una página web que se instala en el celular como una app y funciona sin internet.

## Estructura

- `app/`: la app (esto es lo que se publica).
  - `js/store.js`: los datos y los cálculos (saldos, totales del mes).
  - `js/db.js`: la base de datos local del dispositivo (IndexedDB).
  - `js/views/`: las 4 pantallas (Inicio, Movimientos, Reportes, Más).
  - `js/sheets/`: los paneles (cargar movimiento, cuentas, categorías, ajustes, bienvenida).
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
2. Tarjetas y cuotas, presupuestos por categoría, pagos recurrentes, recordatorios.
3. Inversiones, metas de ahorro, deudas y préstamos.
4. Reportes avanzados (períodos, ajuste por inflación, exportar PDF).
5. Sincronización con la PC y bloqueo con PIN.
