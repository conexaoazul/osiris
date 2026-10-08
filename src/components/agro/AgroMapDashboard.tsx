'use client';

import { useMemo, useState } from 'react';
import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import { distanceKm, nearbyHotspots, type GeoPoint, type GeoHotspot } from '@/lib/agro/proximity';
import 'maplibre-gl/dist/maplibre-gl.css';

const FARMS = [
  { id: 'ba', name: 'Fazenda demonstrativa — Bahia', latitude: -12.90, longitude: -38.50 },
  { id: 'rs', name: 'Fazenda demonstrativa — RS', latitude: -29.75, longitude: -51.15 },
] as const;

// Explicitly synthetic observations — never label these as actual FIRMS incidents.
const SYNTHETIC_HOTSPOTS: GeoHotspot[] = [
  { id: 'demo-ba-01', source: 'SYNTHETIC', latitude: -12.93, longitude: -38.52, confidence: 'demo' },
  { id: 'demo-ba-02', source: 'SYNTHETIC', latitude: -13.05, longitude: -38.53, confidence: 'demo' },
  { id: 'demo-rs-01', source: 'SYNTHETIC', latitude: -29.77, longitude: -51.17, confidence: 'demo' },
  { id: 'demo-rs-02', source: 'SYNTHETIC', latitude: -29.95, longitude: -51.17, confidence: 'demo' },
];
const BASE_STYLE = 'https://demotiles.maplibre.org/style.json';

function circlePolygon(center: GeoPoint, radiusKm: number) {
  const coordinates: number[][] = [];
  for (let i = 0; i <= 72; i++) {
    const bearing = (i / 72) * 2 * Math.PI;
    const dLat = (radiusKm / 111.195) * Math.cos(bearing);
    const lonScale = Math.max(0.05, Math.cos(center.latitude * Math.PI / 180));
    const dLon = (radiusKm / (111.195 * lonScale)) * Math.sin(bearing);
    coordinates.push([center.longitude + dLon, center.latitude + dLat]);
  }
  return { type: 'FeatureCollection' as const, features: [{
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [coordinates] },
  }] };
}

export default function AgroMapDashboard() {
  const [farmId, setFarmId] = useState<string>('ba');
  const [radius, setRadius] = useState<number>(10);
  const [showHotspots, setShowHotspots] = useState(true);
  const farm = FARMS.find(f => f.id === farmId) ?? FARMS[0];
  const nearby = useMemo(() => nearbyHotspots(farm, SYNTHETIC_HOTSPOTS, radius), [farm, radius]);
  const circle = useMemo(() => circlePolygon(farm, radius), [farm, radius]);

  return <main className="min-h-screen bg-[#091419] text-slate-100 p-4 md:p-6">
    <header className="mb-4">
      <div className="text-xs tracking-[0.25em] text-emerald-300">OSIRIS × CONEXÃO AZUL</div>
      <h1 className="text-2xl md:text-3xl font-semibold mt-1">Blue Agro Intelligence</h1>
      <p className="text-sm text-slate-300 mt-2">Exploração geoespacial de propriedades e focos de calor — simulação sem dados reais.</p>
    </header>
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-xl bg-[#14252b] p-4 space-y-5 border border-slate-700">
        <div>
          <label htmlFor="agro-farm" className="block text-sm mb-2">Propriedade demonstrativa</label>
          <select id="agro-farm" value={farmId} onChange={e=>setFarmId(e.target.value)}
            className="w-full bg-[#091419] border border-slate-600 rounded-lg p-2">
            {FARMS.map(f => <option value={f.id} key={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="agro-radius" className="block text-sm mb-2">Raio de observação: {radius} km</label>
          <input id="agro-radius" aria-label="Raio em quilômetros" type="range" min="1" max="50" value={radius}
            onChange={e=>setRadius(Number(e.target.value))} className="w-full accent-emerald-400" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showHotspots} onChange={e=>setShowHotspots(e.target.checked)} />
          Mostrar ocorrências sintéticas
        </label>
        <div className="rounded-lg bg-[#20383e] p-3" aria-live="polite">
          <div className="text-xs text-slate-300">Pontos no raio selecionado</div>
          <div className="text-3xl font-bold text-emerald-300">{nearby.length}</div>
          <div className="text-xs text-amber-200 mt-2">Dados fictícios. Não representam incêndios confirmados.</div>
        </div>
        <div className="space-y-2">
          {nearby.map(p => <div key={p.id} className="border-b border-slate-600 pb-2 text-xs">
            <div className="font-medium">{p.id}</div>
            <div className="text-slate-300">{p.distanceKm.toFixed(2)} km da referência · simulação</div>
          </div>)}
          {!nearby.length && <p className="text-xs text-slate-300">Nenhum ponto demonstrativo dentro do raio.</p>}
        </div>
        <p className="text-xs text-slate-400">A distância é calculada do centro da propriedade; esta demonstração não usa polígonos de talhões.</p>
      </aside>
      <section className="rounded-xl overflow-hidden border border-slate-700 h-[480px] md:h-[680px] relative" aria-label="Mapa demonstrativo Agro">
        <Map key={farm.id} initialViewState={{ latitude: farm.latitude, longitude: farm.longitude, zoom: 9 }}
          mapStyle={BASE_STYLE} style={{ width: '100%', height: '100%' }}>
          <NavigationControl position="top-right" />
          <Source id="agro-radius" type="geojson" data={circle}>
            <Layer id="agro-radius-fill" type="fill" paint={{ 'fill-color': '#34d399', 'fill-opacity': 0.13 }} />
            <Layer id="agro-radius-outline" type="line" paint={{ 'line-color': '#047857', 'line-width': 2 }} />
          </Source>
          <Marker longitude={farm.longitude} latitude={farm.latitude} anchor="bottom">
            <div title={farm.name} className="rounded-full bg-emerald-600 p-2 border-2 border-white shadow-lg">🏡</div>
          </Marker>
          {showHotspots && SYNTHETIC_HOTSPOTS.map(p => {
            const within = distanceKm(farm, p) <= radius;
            return <Marker key={p.id} longitude={p.longitude} latitude={p.latitude} anchor="center">
              <div title={p.id + ' — ponto sintético'} className={within ? 'rounded-full bg-orange-500 border-2 border-white w-4 h-4' : 'rounded-full bg-slate-500 border border-white w-3 h-3'} />
            </Marker>;
          })}
        </Map>
        <div className="absolute left-3 bottom-3 z-10 bg-[#0a1721]/95 border border-amber-500/60 rounded-lg p-2 text-xs text-amber-200 pointer-events-none">
          AMBIENTE DE DEMONSTRAÇÃO · DADOS SINTÉTICOS
        </div>
      </section>
    </div>
  </main>;
}
