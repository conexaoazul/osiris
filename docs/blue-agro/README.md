# OSIRIS × Blue Agro Intelligence

This fork preserves OSIRIS upstream and develops opt-in agricultural geospatial
features independently from the existing global intelligence surface.

## First implemented vertical primitive
`src/lib/agro/proximity.ts` provides validated geographic coordinates, Haversine
distance (including antimeridian crossing) and deterministic radius filtering of
hotspots by farm center. `src/lib/agro/proximity.test.ts` tests these behaviors.

**This is not a wildfire warning product.** Center-radius proximity is only a
candidate pre-filter: polygon intersection, reliable NASA FIRMS provenance, event
age, confidence, duplicates, coverage and local review are required before any
notification. No live API calls, farm coordinates or credentials are stored.

## Integration contract (proposed)
`Traccar → trusted backend → blue_agro_geo_bridge → blue_agro_telemetry_core`.
`FIRMS/OSIRIS verified feed → spatial store → farm polygon matching → reviewed
blue_agro_action_center incident`.

Related Odoo PR: https://github.com/conexaoazul/BlueApps19/pull/1034

## Safe rollout
1. `npm ci && npm test && npm run lint && npm run build` in isolated CI.
2. API boundary with server-side authorization and per-company isolation.
3. Geospatial polygon evaluation, FIRMS source validation and freshness.
4. Synthetic replay, rate limits and operator sign-off.
5. Isolated QA container; no production data or alert dispatch until validated.

Do not place credentials in repo or browser bundles. Keep external ingestion
and physical IoT actuation outside the interactive OSIRIS frontend.
