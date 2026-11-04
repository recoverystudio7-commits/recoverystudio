# Paridad entre la app del repo y la versión Node

La app de GitHub (`Recoverystudionativo`) es un prototipo estático con datos en `localStorage`.
La versión Node (este repo) tiene backend real, sesiones, TOTP y persistencia en Redis.

## Estado actual

| Módulo | Versión Node | App del repo | Acción |
| --- | --- | --- | --- |
| Sitio público, servicios y planes | ✅ | ✅ | — |
| Registro e ingreso de clientes | ✅ | ✅ | — |
| Reservas, disponibilidad y política de 12 h | ✅ | ✅ | — |
| Compra de planes y comprobantes | ✅ | ✅ | — |
| Pagos y confirmación del admin | ✅ | ✅ | — |
| Rutinas | ✅ | ✅ | — |
| Perfil y cambio de contraseña | ✅ | ✅ | — |
| Dashboard, agenda y usuarios (admin) | ✅ | ✅ | — |
| TOTP obligatorio del admin | ✅ | ❌ (PIN) | — |
| Exportación CSV de pagos y boletas | ✅ | ✅ | — |
| Finanzas: gastos, utilidad, margen, 6 meses | ❌ | ✅ | **Portar** |
| Honorarios: boletas y resumen mensual | ⚠️ parcial (CSV + retención) | ✅ | **Portar UI** |
| Cotizaciones de empresas | ❌ | ✅ | **Portar** |
| Reseñas públicas con moderación | ✅ (Redis) | ✅ (Supabase) | — |
| Maximales (PRs) | ❌ | ✅ | **Portar** |
| Página pública de sauna húmedo | ✅ | ✅ | — |
| Auditoría de acciones del admin | ❌ | ✅ | **Portar** |
| PWA (manifest + service worker) | ✅ | ✅ | — |

## Fases sugeridas

1. **Base en la nube** (hecho): Vercel + Redis, staging probado, dominio preparado.
2. **Marketing** (hecho): reseñas con moderación, página de sauna y PWA.
3. **Contabilidad**: finanzas (gastos/utilidad/margen) y honorarios (boletas/resumen).
4. **Operación**: cotizaciones, maximales y auditoría.

Cada fase se puede desplegar sin romper lo que ya funciona.
