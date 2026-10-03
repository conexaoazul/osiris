'use client';
/**
 * OSIRIS OI: the prediction. The report agent's headline and the story under
 * it: how it most likely unfolds, date by date, what each actor does, how
 * each simulated world ended, the drivers and the evidence behind them,
 * scenarios, signposts and dissent. Every part is a way into the research.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Check, Copy, Download } from 'lucide-react';
import { toMarkdown } from '@/lib/oi/client';
import { directionWord } from '@/lib/oi/forecast';
import { latestPoints, worldName, type RunState } from '@/lib/oi/state';
import { LABEL, T, cyan, gold, leanTo, pct } from './theme';
import { Avatar, Mentions, Overline, PointTag, SectionTitle, TextButton, TypeIcon } from './atoms';
import { PushTag, SourceLink, sourceLabel } from './quotes';
import { Anchors } from './anchors';
import { evidenceLedger } from '@/lib/oi/sources';

export function ReportBody({ s, runId, selected, onSelect }: { s: RunState; runId: string | null; selected: string | null; onSelect: (k: string | null) => void }) {
  const r = s.report!;
  const frame = s.frame;
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // The evidence behind the actors' moves, source by source.
  const ledger = evidenceLedger(s.moves);
  const standing = latestPoints(s);
  const name = (id: string) => s.actors.find(a => a.id === id)?.name ?? id;
  const url = typeof window !== 'undefined' && runId ? `${window.location.origin}/?oi=${runId}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const download = () => {
    const blob = new Blob([toMarkdown(s, url)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `osiris-oi-${(runId ?? 'prediction').slice(0, 8)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const conf = { low: 'gotham-tag--high', medium: 'gotham-tag--medium', high: 'gotham-tag--low' }[r.confidence];

  return (
    <section className="flex flex-col gap-5" aria-label="Prediction">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Overline color={T.gold}>Prediction</Overline>
          <div className="ml-auto flex items-center -mr-2">
            <TextButton onClick={copy} title="Copy a link that replays this run">{copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Link</TextButton>
            <TextButton onClick={download} title="Download the prediction as Markdown"><Download className="w-3 h-3" /> Export</TextButton>
          </div>
        </div>
        <h3 className="text-[14px] font-semibold leading-snug text-[var(--text-heading)]">{r.headline}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`gotham-tag ${conf}`}>{r.confidence} confidence</span>
          {frame?.kind === 'binary' && <span className="text-[9.5px] font-mono tracking-[0.1em] text-[var(--text-muted)]" title="The simulated worlds pooled, and the report's calibrated figure">WORLDS {pct(r.swarm)} · REPORT {pct(r.probability)}</span>}
        </div>
        {r.deviation && <p className="mt-2 text-[11px] italic leading-relaxed text-[var(--text-muted)]">{r.deviation}</p>}
        <p className="mt-2.5 text-[11.5px] leading-[1.65] text-[var(--text-secondary)]"><Mentions text={r.summary} s={s} onSelect={onSelect} /></p>
      </div>

      <Anchors s={s} selected={selected} onSelect={onSelect} />

      {r.path.length > 0 && (
        <div>
          <SectionTitle count={r.path.length}>How it unfolds</SectionTitle>
          <ol className="relative flex flex-col gap-3.5 pl-4">
            <span aria-hidden className="absolute left-[3px] top-1.5 bottom-1.5 w-px" style={{ background: `linear-gradient(${gold(0.6)}, ${gold(0.08)})` }} />
            {r.path.map((p, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: i * 0.06 }} className="relative">
                <span aria-hidden className="absolute -left-4 top-[5px] w-[7px] h-[7px] rounded-full" style={{ background: i === r.path.length - 1 ? T.goldLight : 'var(--bg-tertiary)', boxShadow: `inset 0 0 0 1.5px ${T.gold}` }} />
                <span className="block text-[9px] font-mono tracking-[0.1em] text-[var(--gold-light)]">{p.date}</span>
                <span className="block mt-0.5 text-[11.5px] font-medium leading-snug text-[var(--text-heading)]"><Mentions text={p.title} s={s} onSelect={onSelect} /></span>
                {p.detail && <span className="block mt-0.5 text-[11px] leading-snug text-[var(--text-secondary)]"><Mentions text={p.detail} s={s} onSelect={onSelect} /></span>}
                {p.actors.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {p.actors.map(id => (
                      <button key={id} onClick={() => onSelect(selected === `a:${id}` ? null : `a:${id}`)}
                        className={`h-[18px] px-1.5 rounded border text-[9.5px] transition-colors ${selected === `a:${id}` ? 'border-[var(--border-active)] text-[var(--gold-light)]' : 'border-[var(--border-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>{name(id)}</button>
                    ))}
                  </span>
                )}
              </motion.li>
            ))}
          </ol>
        </div>
      )}

      {r.actorMoves.length > 0 && (
        <div>
          <SectionTitle count={r.actorMoves.length}>What each actor does</SectionTitle>
          <div className="flex flex-col divide-y divide-[var(--border-secondary)]">
            {r.actorMoves.map(m => {
              const key = `a:${m.actor}`;
              const on = selected === key;
              return (
                <button key={m.actor} onClick={() => onSelect(on ? null : key)} className="group flex items-start gap-2.5 py-2 text-left">
                  <Avatar name={name(m.actor)} size={22} ring={on ? 'selected' : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold text-[var(--text-heading)] group-hover:text-[var(--gold-light)] transition-colors">{name(m.actor)}</span>
                    <span className="block mt-0.5 text-[11px] leading-snug text-[var(--text-secondary)]">{m.prediction}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {r.worlds.length > 0 && (
        <div>
          <SectionTitle count={r.worlds.length}>The simulated worlds</SectionTitle>
          <div className="flex flex-col gap-2">
            {r.worlds.map(w => {
              const key = `w:${w.world}`;
              const on = selected === key;
              const point = standing.get(w.world);
              return (
                <button key={w.world} onClick={() => onSelect(on ? null : key)}
                  className="group rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-[var(--hover-accent)]" style={{ borderColor: on ? T.cyan : 'var(--border-secondary)', background: on ? cyan(0.06) : undefined }}>
                  <span className="flex items-center gap-2">
                    <TypeIcon k={key} className="w-3 h-3 flex-shrink-0" style={{ color: T.cyan }} />
                    <span className={`${LABEL} !text-[8.5px] flex-shrink-0`} style={{ color: T.cyan }}>{worldName(w.world)}</span>
                    <span className="text-[11px] font-medium truncate text-[var(--text-primary)]">{w.outcome}</span>
                    {point && <span className="ml-auto flex-shrink-0"><PointTag point={point} frame={frame} /></span>}
                  </span>
                  {w.summary && <span className="block mt-1 text-[10.5px] leading-snug text-[var(--text-secondary)]">{w.summary}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {r.drivers.length > 0 && (
        <div>
          <SectionTitle count={r.drivers.length}>Drivers</SectionTitle>
          <div className="flex flex-col divide-y divide-[var(--border-secondary)]">
            {r.drivers.map((d, i) => {
              const color = leanTo(frame, d.push, d.favors);
              const actorKey = d.actor ? `a:${d.actor}` : null;
              return (
                <div key={i} className="py-2">
                  <button disabled={!actorKey} onClick={() => actorKey && onSelect(actorKey === selected ? null : actorKey)}
                    className="group w-full flex items-start gap-2.5 text-left disabled:cursor-default">
                    {d.push === 'yes' ? <ArrowUpRight className="w-3.5 h-3.5 mt-px flex-shrink-0" style={{ color }} /> : <ArrowDownRight className="w-3.5 h-3.5 mt-px flex-shrink-0" style={{ color }} />}
                    <span className="flex-1 text-[11.5px] leading-snug text-[var(--text-secondary)] transition-colors group-enabled:group-hover:text-[var(--text-primary)]">{d.text}</span>
                    <span className="mt-px text-[9px] font-mono tracking-[0.12em] uppercase whitespace-nowrap" style={{ color }}>{directionWord(frame, d.push, d.favors)}</span>
                  </button>
                  {/* The sources it rests on: each a step back along the thread. */}
                  {(d.sources?.length ?? 0) > 0 && (
                    <div className="mt-1.5 ml-6 flex flex-wrap gap-1">
                      {d.sources!.map(id => {
                        const c = s.context.find(x => x.id === id);
                        const key = `c:${id}`;
                        return (
                          <button key={id} onClick={() => onSelect(key === selected ? null : key)} title={c?.title ?? id}
                            className={`inline-flex items-center gap-1 max-w-[220px] h-[20px] px-1.5 rounded border text-[9.5px] transition-colors ${key === selected ? 'border-[var(--border-active)] text-[var(--gold-light)]' : 'border-[var(--border-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-primary)]'}`}>
                            <TypeIcon k={key} subtype={c?.kind} className="w-2.5 h-2.5 flex-shrink-0" />
                            <span className="truncate">{sourceLabel(c, id)}</span>
                            <span className="font-mono opacity-70">[{id}]</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ledger.length > 0 && (
        <div>
          <SectionTitle count={ledger.length}>Evidence · what moved the actors</SectionTitle>
          <div className="flex flex-col divide-y divide-[var(--border-secondary)]">
            {ledger.slice(0, showAll ? undefined : 6).map(row => {
              const c = s.context.find(x => x.id === row.source);
              const key = `c:${row.source}`;
              const on = selected === key;
              // The way it pushed most of the actors who quoted it; context when it pushed none.
              const lead = row.yes >= row.no && row.yes > 0 ? 'yes' : row.no > 0 ? 'no' : 'neutral';
              const favors = Object.entries(row.favors).sort((a, b) => b[1] - a[1])[0]?.[0];
              return (
                <div key={row.source} className="flex items-start gap-2 py-2">
                  <button onClick={() => onSelect(on ? null : key)} className="group flex-1 min-w-0 text-left">
                    <span className={`block text-[11.5px] leading-snug line-clamp-2 transition-colors group-hover:text-[var(--text-primary)] ${on ? 'text-[var(--text-heading)]' : 'text-[var(--text-secondary)]'}`}>{c?.kind === 'data' && c.id !== 'data' ? `“${c.title}”` : c?.title ?? row.source}</span>
                    <span className="mt-1 flex items-center gap-2 text-[9px] font-mono tracking-[0.06em] text-[var(--text-muted)]">
                      <TypeIcon k={key} subtype={c?.kind} className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="truncate">{sourceLabel(c, row.source)}</span>
                      <span className="opacity-70">[{row.source}]</span>
                      <span className="flex-shrink-0">· {row.quoted}× by {row.actors.length}</span>
                    </span>
                  </button>
                  <span className="mt-0.5 flex items-center gap-1.5 flex-shrink-0">
                    <PushTag c={{ push: lead, favors }} frame={frame} />
                    <SourceLink url={c?.url} />
                  </span>
                </div>
              );
            })}
          </div>
          {ledger.length > 6 && (
            <button onClick={() => setShowAll(v => !v)} className="mt-1 text-[9.5px] font-mono tracking-[0.12em] uppercase text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              {showAll ? 'Show fewer' : `Show all ${ledger.length}`}
            </button>
          )}
        </div>
      )}

      {r.scenarios.length > 0 && (
        <div>
          <SectionTitle count={r.scenarios.length}>Scenarios</SectionTitle>
          <div className="flex flex-col gap-2.5">
            {r.scenarios.map((sc, i) => {
              const key = `s:${i}`;
              const on = selected === key;
              return (
                <button key={i} onClick={() => onSelect(on ? null : key)} className="group text-left">
                  <div className="flex items-baseline gap-2">
                    <span className={`flex-1 text-[11.5px] truncate transition-colors group-hover:text-[var(--text-primary)] ${on ? 'text-[var(--text-heading)]' : 'text-[var(--text-secondary)]'}`}>{sc.name}</span>
                    <span className="text-[11px] font-mono tabular-nums text-[var(--gold-light)]">{pct(sc.probability)}</span>
                  </div>
                  <div className="mt-1 h-[3px] rounded-full overflow-hidden bg-white/[0.06]">
                    <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${sc.probability * 100}%` }} transition={{ duration: 0.8, delay: i * 0.08 }}
                      style={{ background: on ? T.goldLight : `linear-gradient(90deg, var(--gold-dim), ${T.gold})` }} />
                  </div>
                  <p className="mt-1 text-[10.5px] leading-snug text-[var(--text-muted)]">{sc.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {r.signposts.length > 0 && (
        <div>
          <SectionTitle count={r.signposts.length}>Signposts to watch</SectionTitle>
          <div className="flex flex-col divide-y divide-[var(--border-secondary)]">
            {r.signposts.map((sp, i) => {
              const key = `p:${i}`;
              const color = leanTo(frame, sp.means, sp.favors);
              return (
                <button key={i} onClick={() => onSelect(selected === key ? null : key)} className="group flex items-start gap-2.5 py-2 text-left">
                  <span className="mt-[5px] w-1.5 h-1.5 rotate-45 flex-shrink-0" style={{ background: color }} />
                  <span className={`flex-1 text-[11.5px] leading-snug transition-colors group-hover:text-[var(--text-primary)] ${selected === key ? 'text-[var(--text-heading)]' : 'text-[var(--text-secondary)]'}`}>
                    {sp.text}{sp.place && <span className="text-[var(--text-muted)]"> · {sp.place}</span>}
                  </span>
                  <span className="mt-px text-[9px] font-mono tracking-[0.12em] uppercase whitespace-nowrap" style={{ color }}>→ {directionWord(frame, sp.means, sp.favors)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {r.dissent && (
        <blockquote className="pl-3 py-0.5 border-l-2 border-[var(--cyan-primary)]">
          <Overline color={T.cyan}>Dissent</Overline>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-secondary)]"><Mentions text={r.dissent} s={s} onSelect={onSelect} /></p>
        </blockquote>
      )}
      {r.caveats.length > 0 && (
        <ul className="flex flex-col gap-1">
          {r.caveats.map((c, i) => <li key={i} className="text-[10.5px] leading-snug text-[var(--text-muted)]">· {c}</li>)}
        </ul>
      )}
    </section>
  );
}
