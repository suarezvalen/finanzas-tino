# Negocio (pestaña aparte de la app)

La app tiene un sector **Negocio** (botón de la tienda arriba en Inicio, o Más → Negocio) con su propia barra:
Resumen, Campañas, Registro y Ajustes. Los datos del negocio viven aparte (`biz_days`, `biz_cfg`, `biz_costs`):
nunca suman a los saldos, movimientos, reportes ni copias de las finanzas personales.

## Cómo llegan los datos

1. Todos los días a las 9:05 la tarea programada `reporte-diario` (Claude en la PC, con Shopify, Meta y Klaviyo
   conectados) escribe un archivo por día cerrado en una carpeta local (`AAAA-MM-DD.json`), fuera de este repositorio.
2. Después corre:

   ```bash
   node tools/negocio/save.mjs <carpeta de los días> --economia <ruta a economia.json>
   ```

   Sube a Supabase solo los días nuevos o que cambiaron (lo anota en `.subidos.json` dentro de esa carpeta) y la economía del producto.
   `--todo` vuelve a subir todo; `--probar` valida sin subir.
3. La app los baja con la sincronización normal, en todos los dispositivos.

Sin clave o sin internet, los archivos quedan en la carpeta y se suben en la próxima corrida. También se pueden cargar
a mano desde la app: Negocio → Ajustes → Importar archivo (acepta varios días y `economia.json`).

## La clave

`save.mjs` usa la clave secreta de Supabase (la misma `SUPABASE_SERVICE_KEY` de los informes del mercado). La lee de la
variable de entorno `SUPABASE_SERVICE_KEY` o del archivo `%USERPROFILE%\.finanzas-tino\service-key`, que está fuera de
OneDrive y fuera del repositorio. Se saca de Supabase → Project Settings → API Keys → *secret*.

## Formato de un día

```jsonc
{
  "fecha": "2026-01-15",                       // día cerrado, hora de Argentina
  "fuente": "reporte-diario",
  "ventas": { "bruto": 100000, "descuentos": 5000, "neto": 95000, "devoluciones": 0, "pedidos": 6 },   // neto = net_sales de Shopify: ya descuenta descuentos y devoluciones
  "embudo": { "visitas": 250, "carritos": 20, "checkouts": 18, "compras": 6 },
  "meta": { "gasto": 40000 },                  // total de la cuenta (por si falta algún anuncio)
  "anuncios": [{                               // nivel anuncio: con gasto > 0 o activos (aunque no hayan gastado)
    "id": "111", "nombre": "Anuncio A", "conjunto_id": "222", "conjunto": "Conjunto A",
    "campania": "Campaña de prueba", "estado": "ACTIVE",
    "gasto": 20000, "impresiones": 5000, "clics": 60, "carritos": 6, "pagos": 5, "compras": 3, "valor": 48000
  }],
  "email": { "ventas": 0, "pedidos": 0 },      // atribuido al email ese día, o null si no hay dato
  "pedidos": [{ "nombre": "#1001", "hora": "10:30", "total": 16000, "descuento": 1000, "cupon": "PROMO" }],
  "reporte": { "titular": "Una línea con lo más importante", "md": "# Reporte · …" }   // el informe de ese día, o null
}
```

La validación está en `app/js/logic/biz-format.js` (la usan la app y este script).

## Análisis diario

Después del reporte, la misma tarea escribe `analisis/AAAA-MM-DD.json` (dentro de la carpeta de los días) y
actualiza `analisis/memoria.json`, que guarda los aprendizajes y las ideas vigentes para que cada día arranque de lo
acumulado. `save.mjs` sube los análisis como `biz_insights`; la app los muestra en Negocio → Análisis.

Lo que marcás en la app (idea aplicada, funcionó, no funcionó, descartada) y los cambios que anotás quedan en
`biz_notes`. `node tools/negocio/leer.mjs` los devuelve en JSON para que el análisis del día siguiente los mida.

```jsonc
{
  "fecha": "2026-01-15",            // el día analizado
  "tipo": "diario",                 // o "semanal" (los lunes)
  "titular": "Una línea con lo más importante",
  "resumen": "2 a 4 párrafos: qué pasó y por qué (separados por \n)",
  "numeros": [{ "etiqueta": "Ventas", "valor": "$ 95.000", "cambio": "+20%", "tono": "bueno" }],   // bueno | malo | neutro
  "por_que": [{ "factor": "Anuncio A", "detalle": "3 de 6 ventas…", "peso": "alto" }],            // alto | medio | bajo
  "sin_ventas": null,               // o el texto que explica por qué no se vendió
  "aprendizajes": [{
    "id": "a-cupon", "texto": "…", "evidencia": "…", "certeza": "probable",   // firme | probable | hipotesis
    "desde": "2026-01-10", "actualizado": "2026-01-15", "tendencia": "se_confirma"   // nuevo | se_confirma | se_debilita | igual
  }],
  "ideas": [{
    "id": "i-titulo-landing", "area": "landing",   // landing | anuncios | email | oferta | marketing | contenido | otro
    "titulo": "…", "por_que": "…", "como": "Paso a paso (markdown simple)",
    "impacto": "alto", "esfuerzo": "bajo", "basada_en": ["a-cupon"],
    "estado": "nueva",               // nueva | en_prueba | funciono | no_funciono | descartada
    "resultado": "",                 // al cerrarla, con números
    "desde": "2026-01-15"
  }],
  "seguimiento": [{ "idea": "i-titulo-landing", "texto": "3 días después: conversión 3,1% contra 2,4% antes…" }],
  "proximos_pasos": ["…"]
}
```
