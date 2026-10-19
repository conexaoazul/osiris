'use client';

import { useEffect, useRef, useState } from 'react';
import type { DemoAreaId, SatelliteScene } from '@/lib/agro/stac-scenes';

type SatelliteResult = { scenes: SatelliteScene[]; source: string; searchedAt: string };
type Status = 'idle' | 'loading' | 'ready' | 'error';

export default function SatelliteScenesPanel({ area }: { area: DemoAreaId }) {
  const controller = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<SatelliteResult | null>(null);

  useEffect(() => () => { controller.current?.abort(); }, []);

  async function consult() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setStatus('loading');
    setResult(null);
    try {
      const response = await fetch(`/api/agro/satellite?farm=${encodeURIComponent(area)}`, {
        signal: current.signal,
      });
      if (!response.ok) throw new Error('Catalog temporarily unavailable');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('scenes' in body) ||
          !Array.isArray(body.scenes)) throw new TypeError('Invalid response');
      if (current.signal.aborted) return;
      setResult(body as SatelliteResult);
      setStatus('ready');
    } catch {
      if (!current.signal.aborted) setStatus('error');
    }
  }

  return <div className="rounded-lg bg-[#20383e] p-3 border border-emerald-900/80 space-y-2">
    <div className="text-xs font-semibold text-emerald-200">🛰️ Sentinel-2 — cenas reais</div>
    <p className="text-[11px] text-slate-300">
      Consulta manual de metadados do catálogo público Earth Search. Área demonstrativa, sem dados de clientes.
    </p>
    <button onClick={consult} type="button" disabled={status === 'loading'}
      className="w-full rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 px-3 py-2 text-xs font-medium">
      {status === 'loading' ? 'Consultando catálogo…' : 'Consultar imagens disponíveis'}
    </button>
    <div aria-live="polite" className="text-[11px] text-slate-200">
      {status === 'error' && <span className="text-amber-200">Fonte externa indisponível; a simulação continua funcionando.</span>}
      {status === 'ready' && !result?.scenes.length && <span>Sem cenas no período consultado. Tente novamente depois.</span>}
      {result?.scenes.map(scene => <div key={scene.id} className="py-2 border-b border-slate-600 last:border-0">
        <div className="font-medium">{new Date(scene.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</div>
        <div className="text-slate-300">Nuvens na cena: {scene.cloudCover === null ? 'não informado' : `${scene.cloudCover}%`}</div>
        <a href={scene.stacBrowserUrl} target="_blank" rel="noreferrer noopener"
          className="underline text-emerald-200">Explorar cena no STAC Browser ↗</a>
      </div>)}
      {status === 'ready' && <div className="text-slate-400 mt-2">Fonte: {result?.source}. Índice de nuvens refere-se à cena, não exclusivamente ao talhão.</div>}
      {status === 'idle' && <span>Consulta opcional. Nenhuma API externa é acionada até clicar.</span>}
    </div>
    <p className="text-[10px] text-amber-100">Metadados reais não comprovam altura da vegetação ou risco elétrico. Validação espacial necessária.</p>
  </div>;
}
