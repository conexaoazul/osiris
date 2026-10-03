'use client';
/**
 * OSIRIS OI: the run as lists: the simulation as it happened, period by
 * period and world by world, the actors who play it, the world model and the
 * sources it read, and a way to question the actors afterwards.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Loader2, Send, Trash2, Zap } from 'lucide-react';
import type { Engine, OiClient } from '@/lib/oi/client';
import { castOf, worldName, type RunState } from '@/lib/oi/state';
import { formatAmount, leader } from '@/lib/oi/forecast';
import { nodeName } from '@/lib/oi/research';
import type { Actor, ContextItem, Link, Move, Period, RoundStat, SimEvent } from '@/lib/oi/types';
import { FIELD, LABEL, T, ago, cyan, gold, pct, toneColor } from './theme';
import { Avatar, Empty, Mentions, PointTag, STANCE, SectionTitle, Segmented, StanceTag, TypeIcon } from './atoms';
import { ReportBody } from './report';
import { PushTag, Quotes, SOURCE_KIND, SourceLink, sourceLabel } from './quotes';

export type Tab = 'report' | 'sim' | 'actors' | 'world' | 'ask';

export function RunTabs(p: {
  s: RunState; tab: Tab; setTab: (t: Tab) => void; oi: OiClient; engine: Engine; keyValue: string; ready: boolean;
  selected: string | null; onSelect: (k: string | null) => void; askTarget: string; setAskTarget: (t: string) => void; theater: boolean;
}) {
  const { s, tab, setTab } = p;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    ...(!p.theater && s.report ? [{ id: 'report' as Tab, label: 'Prediction' }] : []),
    { id: 'sim', label: 'Simulation', count: s.events.length || undefined },
    { id: 'actors', label: 'Actors', count: castOf(s).length || undefined },
    { id: 'world', label: 'World', count: s.actors.length || undefined },
    { id: 'ask', label: 'Q&A' },
  ];
  const current = tabs.some(t => t.id === tab) ? tab : 'sim';
  return (
    <div className={`flex flex-col ${p.theater ? 'h-full min-h-0' : ''}`}>
      <div role="tablist" className="flex items-stretch px-1.5 border-b border-[var(--border-secondary)] flex-shrink-0 overflow-x-auto [scrollbar-width:none]">
        {tabs.map(t => {
          const on = current === t.id;
          return (
            <button key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)}
              className={`relative px-2 h-10 text-[9.5px] font-mono tracking-[0.16em] uppercase whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${on ? 'text-[var(--gold-light)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
              {t.label}{t.count ? <span className={`ml-1.5 tabular-nums ${on ? 'text-[var(--cyan-primary)]' : ''}`}>{t.count}</span> : null}
              {on && <motion.span layoutId={p.theater ? 'oi-tab-theater' : 'oi-tab'} className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full" style={{ background: T.gold, boxShadow: `0 0 10px ${gold(0.7)}` }} transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            </button>
          );
        })}
      </div>
      <div className={`px-4 py-4 ${p.theater ? 'flex-1 min-h-0 overflow-y-auto styled-scrollbar' : ''}`}>
        {current === 'report' && s.report && <ReportBody s={s} runId={p.oi.runId} selected={p.selected} onSelect={p.onSelect} />}
        {current === 'sim' && <SimFeed s={s} selected={p.selected} onSelect={p.onSelect} />}
        {current === 'actors' && <ActorsList s={s} selected={p.selected} onSelect={p.onSelect} />}
        {current === 'world' && <WorldList s={s} selected={p.selected} onSelect={p.onSelect} />}
        {current === 'ask' && <AskBox s={s} oi={p.oi} engine={p.engine} keyValue={p.keyValue} ready={p.ready} target={p.askTarget} setTarget={p.setAskTarget} onSelect={p.onSelect} />}
      </div>
    </div>
  );
}

/** The latest period the simulation has reached: the highest anyone has moved, decided or stood in. */
export function periodReached(s: RunState): number {
  return Math.max(0, ...s.moves.map(m => m.period), ...s.events.map(e => e.period), ...s.points.map(p => p.period), ...Object.values(s.thinking));
}

/** The pooled figure after a period, as the period's header says it. */
export function pooledLabel(s: RunState, stat: RoundStat): string {
  if (s.frame?.kind === 'number' && stat.value) return `median ${formatAmount(stat.value.median)}`;
  if (s.frame?.kind === 'choice' && stat.shares) return `${s.frame.outcomes[leader(stat.shares)]} ${pct(Math.max(...stat.shares))}`;
  return pct(stat.consensus);
}

/**
 * The simulation as it happened: newest period first, and within it each
 * world's events (what happened), where the question stood after them, and
 * the moves the actors made. Earlier periods fold their moves away.
 */
export function SimFeed({ s, selected, onSelect }: { s: RunState; selected: string | null; onSelect: (k: string | null) => void }) {
  const [world, setWorld] = useState('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const cast = castOf(s);
  if (!cast.length) {
    return <Empty>{s.status === 'running' ? 'The actors who decide this are being cast. On the globe, the world model is drawing in.' : 'No simulation in this run.'}</Empty>;
  }
  const reached = periodReached(s);
  if (!reached) return <Empty>The actors are cast. The first period of simulated time is about to start.</Empty>;
  const worlds = world !== 'all' && s.worlds.includes(world) ? [world] : s.worlds;
  const periods = s.periods.filter(p => p.index <= reached).reverse();
  const toggle = (k: string) => setOpen(o => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="flex flex-col gap-5">
      {s.worlds.length > 1 && (
        <div className="flex items-center gap-2.5">
          <span className={`${LABEL} text-[var(--text-muted)]`}>World</span>
          <div className="flex-1"><Segmented id="sim-world" size="sm" accent="cyan" value={worlds.length === 1 ? worlds[0] : 'all'} onChange={setWorld}
            options={[{ value: 'all', label: 'All' }, ...s.worlds.map(w => ({ value: w, label: w, title: worldName(w) }))]} /></div>
        </div>
      )}
      {periods.map(p => {
        const stat = s.rounds.find(r => r.round === p.index);
        const injects = s.injects.filter(x => x.round === p.index);
        return (
          <section key={p.index} className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex-1 h-px bg-[var(--border-secondary)]" />
              <span className="text-[9px] font-mono tracking-[0.14em] uppercase whitespace-nowrap text-[var(--text-muted)]">
                {p.label}{stat && <> · <span className="text-[var(--gold-light)]" title="The worlds pooled after this period">{pooledLabel(s, stat)}</span></>}
              </span>
              <span className="flex-1 h-px bg-[var(--border-secondary)]" />
            </div>
            {injects.map((inj, i) => (
              <div key={i} className="rounded-md px-3 py-2 flex items-start gap-2 border" style={{ background: 'rgba(255,149,0,0.06)', borderColor: 'rgba(255,149,0,0.25)' }}>
                <Zap className="w-3.5 h-3.5 mt-px flex-shrink-0 text-[var(--alert-orange)]" />
                <p className="text-[11px] leading-snug text-[var(--text-primary)]"><span className="text-[var(--text-muted)]">Injected into every world · </span>{inj.text}</p>
              </div>
            ))}
            {worlds.map(w => {
              const k = `${w}:${p.index}`;
              // The newest period, or a single world, shows its moves; older periods across every world fold them away.
              const showMoves = p.index === reached || worlds.length === 1 || open.has(k);
              return <WorldPeriod key={w} s={s} world={w} period={p} cast={cast} showMoves={showMoves} onToggle={p.index === reached || worlds.length === 1 ? undefined : () => toggle(k)} selected={selected} onSelect={onSelect} />;
            })}
          </section>
        );
      })}
    </div>
  );
}

/** One world in one period: what happened, where it left the question, and what each actor did. */
function WorldPeriod({ s, world, period, cast, showMoves, onToggle, selected, onSelect }: {
  s: RunState; world: string; period: Period; cast: Actor[]; showMoves: boolean; onToggle?: () => void; selected: string | null; onSelect: (k: string | null) => void;
}) {
  const point = s.points.find(x => x.world === world && x.period === period.index);
  const resolvedBefore = s.points.find(x => x.world === world && x.period < period.index && x.resolved);
  const events = s.events.filter(e => e.world === world && e.period === period.index && e.kind !== 'injected');
  const moves = cast.map(a => s.moves.find(m => m.world === world && m.period === period.index && m.actor === a.id)).filter((m): m is Move => !!m);
  const deciding = cast.filter(a => s.thinking[`${world}:${a.id}`] === period.index);
  const key = `w:${world}`;
  const pick = (k: string) => onSelect(selected === k ? null : k);

  if (resolvedBefore) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
        <WorldChip world={world} on={selected === key} onClick={() => pick(key)} />
        Settled in period {resolvedBefore.period}: <span className="text-[var(--text-secondary)]">{resolvedBefore.resolved}</span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-[var(--border-secondary)] bg-white/[0.015] px-3 py-2.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <WorldChip world={world} on={selected === key} onClick={() => pick(key)} />
        {point ? <span className="ml-auto"><PointTag point={point} frame={s.frame} /></span>
          : deciding.length ? <span className="ml-auto inline-flex items-center gap-1.5 text-[9.5px] text-[var(--cyan-primary)]"><Loader2 className="w-3 h-3 animate-spin" />{deciding.length} deciding</span> : null}
      </div>
      {point?.note && <p className="text-[11px] leading-snug text-[var(--text-secondary)]"><Mentions text={point.note} s={s} onSelect={onSelect} /></p>}
      {events.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {events.map(e => <EventRow key={e.id} s={s} event={e} on={selected === `e:${e.id}`} onSelect={onSelect} />)}
        </div>
      )}
      {moves.length > 0 && (showMoves ? (
        <div className="flex flex-col gap-2.5 pt-1 border-t border-[var(--border-secondary)]">
          {onToggle && <button onClick={onToggle} className={`self-start ${LABEL} !text-[8px] text-[var(--text-muted)] hover:text-[var(--text-primary)]`}>Hide the moves</button>}
          {moves.map(m => <MoveRow key={m.id} s={s} move={m} on={selected === `a:${m.actor}`} onSelect={onSelect} />)}
        </div>
      ) : (
        <button onClick={onToggle} className={`self-start inline-flex items-center gap-1 ${LABEL} !text-[8px] text-[var(--text-muted)] hover:text-[var(--text-primary)]`}>
          <ChevronDown className="w-3 h-3" />{moves.length} move{moves.length === 1 ? '' : 's'}
        </button>
      ))}
      {showMoves && deciding.length > 0 && (
        <p className="inline-flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <Loader2 className="w-3 h-3 animate-spin text-[var(--cyan-primary)]" />Deciding: {deciding.map(a => a.name).join(', ')}
        </p>
      )}
    </div>
  );
}

function WorldChip({ world, on, onClick }: { world: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={`Open ${worldName(world)}`}
      className={`inline-flex items-center gap-1.5 h-5 px-1.5 rounded border ${LABEL} !text-[8.5px] transition-colors`}
      style={{ color: T.cyan, borderColor: on ? T.cyan : cyan(0.3), background: on ? cyan(0.12) : cyan(0.05) }}>
      <TypeIcon k={`w:${world}`} className="w-3 h-3" />{worldName(world)}
    </button>
  );
}

/** Something that happened in a world, dated, with which way it pushed the question. */
export function EventRow({ s, event, on, onSelect }: { s: RunState; event: SimEvent; on: boolean; onSelect: (k: string | null) => void }) {
  const key = `e:${event.id}`;
  const surprise = event.kind === 'shock';
  return (
    <button onClick={() => onSelect(on ? null : key)}
      className={`flex items-start gap-2 -mx-1.5 px-1.5 py-1 rounded text-left transition-colors hover:bg-[var(--hover-accent)] ${on ? 'bg-[var(--hover-accent)]' : ''}`}>
      <TypeIcon k={key} subtype={event.kind} className="w-3.5 h-3.5 mt-[2px] flex-shrink-0" style={{ color: surprise ? T.orange : T.cyan }} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[9px] font-mono tracking-[0.08em] text-[var(--text-muted)]">
          {event.date}{surprise && <span style={{ color: T.orange }}>· SURPRISE</span>}{event.place && <span className="truncate">· {event.place}</span>}
          <span className="ml-auto flex-shrink-0"><PushTag c={event} frame={s.frame} /></span>
        </span>
        <span className="block text-[11.5px] font-medium leading-snug text-[var(--text-heading)]"><Mentions text={event.title} s={s} onSelect={onSelect} /></span>
        {event.detail && <span className="block mt-0.5 text-[10.5px] leading-snug text-[var(--text-secondary)]"><Mentions text={event.detail} s={s} onSelect={onSelect} /></span>}
      </span>
    </button>
  );
}

/** What an actor did in a period: the act, what it said, who it was aimed at, and what it quoted. */
export function MoveRow({ s, move, on, onSelect, showWorld = false }: { s: RunState; move: Move; on: boolean; onSelect: (k: string | null) => void; showWorld?: boolean }) {
  const actor = s.actors.find(a => a.id === move.actor);
  const key = `a:${move.actor}`;
  const pick = () => onSelect(on ? null : key);
  const targets = move.targets.map(t => s.actors.find(a => a.id === t)).filter((a): a is Actor => !!a);
  return (
    <motion.article initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className={`flex gap-2.5 rounded-md -mx-1.5 px-1.5 py-1 transition-colors ${on ? 'bg-[var(--hover-accent)]' : ''}`}>
      <button onClick={pick} aria-label={`Open ${actor?.name ?? move.actor}`} className="self-start"><Avatar name={actor?.name ?? '?'} size={24} ring={on ? 'selected' : undefined} /></button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={pick} className="text-[11px] font-semibold truncate text-[var(--text-heading)] hover:text-[var(--gold-light)]">{actor?.name ?? move.actor}</button>
          <StanceTag stance={move.stance} />
          {targets.length > 0 && <span className="text-[9.5px] truncate text-[var(--text-muted)]">→ {targets.map(t => t.name).join(', ')}</span>}
          {showWorld && <span className={`ml-auto flex-shrink-0 ${LABEL} !text-[7.5px] text-[var(--cyan-primary)]`}>{worldName(move.world)} · P{move.period}</span>}
        </div>
        <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[var(--text-primary)]"><Mentions text={move.action} s={s} onSelect={onSelect} /></p>
        {move.statement && <p className="mt-0.5 text-[11px] leading-snug italic text-[var(--text-secondary)]">“{move.statement}”</p>}
        <Quotes s={s} cites={move.cites} onSelect={onSelect} />
      </div>
    </motion.article>
  );
}

/** The actors who play the simulation, each with what it wants and how it stands in every world. */
export function ActorsList({ s, selected, onSelect }: { s: RunState; selected: string | null; onSelect: (k: string | null) => void }) {
  const cast = castOf(s);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (selected?.startsWith('a:')) refs.current.get(selected.slice(2))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);
  if (!cast.length) return <Empty>{s.status === 'running' ? 'The actors who decide this are being cast.' : 'No actors were cast in this run.'}</Empty>;
  const thinking = new Set(Object.keys(s.thinking).map(k => k.slice(k.indexOf(':') + 1)));
  return (
    <div className="flex flex-col divide-y divide-[var(--border-secondary)]">
      {cast.map(a => {
        const key = `a:${a.id}`;
        const on = selected === key;
        const latest = s.worlds.map(w => ({ w, m: s.moves.filter(m => m.actor === a.id && m.world === w).pop() }));
        return (
          <button key={a.id} ref={el => { if (el) refs.current.set(a.id, el); }} onClick={() => onSelect(on ? null : key)}
            className={`flex items-center gap-2.5 -mx-2 px-2 py-2 text-left transition-colors hover:bg-[var(--hover-accent)] ${on ? 'bg-[var(--hover-accent)]' : ''}`}>
            <Avatar name={a.name} size={30} ring={on ? 'selected' : thinking.has(a.id) ? 'thinking' : undefined} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] font-semibold truncate text-[var(--text-heading)]">{a.name}</span>
              <span className="block text-[10px] truncate text-[var(--text-muted)]">{a.persona?.goal || a.role}</span>
            </span>
            {thinking.has(a.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 text-[var(--cyan-primary)]" /> : (
              <span className="flex items-center gap-1 flex-shrink-0" aria-label="Its latest move in each world">
                {latest.map(({ w, m }) => (
                  <span key={w} title={`${worldName(w)}: ${m ? `${STANCE[m.stance].word.toLowerCase()} · ${m.action}` : 'no move yet'}`}
                    className="w-2 h-2 rounded-full" style={{ background: m ? STANCE[m.stance].color : 'transparent', boxShadow: m ? undefined : 'inset 0 0 0 1px var(--border-primary)' }} />
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** What the arcs (and the graph's edges) mean, in their own Style Studio colours. */
export function Legend({ floating = false, compact = false }: { floating?: boolean; compact?: boolean }) {
  const rows: { label: string; color: string; dash?: string; opacity?: number }[] = [
    { label: compact ? 'Aligned' : 'Aligned · cooperates', color: T.support },
    { label: compact ? 'Opposed' : 'Opposed · presses', color: T.oppose },
    { label: compact ? 'Between' : 'Between · holds', color: T.neutral },
    { label: 'Evidence', color: T.neutral, opacity: 0.55 },
    // Quotes are threads in the graph only; the globe does not draw them.
    ...(floating ? [] : [{ label: 'Quote', color: T.body, dash: '0.5 3.5' }]),
  ];
  return (
    <div className={`flex flex-wrap ${floating ? 'glass-panel !rounded-full justify-center gap-x-5 gap-y-1.5 px-5 py-2.5' : 'gap-x-4 gap-y-1.5'}`}>
      {rows.map(r => (
        <span key={r.label} className="inline-flex items-center gap-2 text-[9px] font-mono tracking-[0.12em] uppercase text-[var(--text-secondary)]">
          <svg width="20" height="6" aria-hidden><line x1="1" x2="19" y1="3" y2="3" strokeWidth="2" strokeDasharray={r.dash} strokeLinecap="round" style={{ stroke: r.color, opacity: r.opacity ?? 1 }} /></svg>
          {r.label}
        </span>
      ))}
    </div>
  );
}

export function LineGlyph({ link }: { link: Link }) {
  return (
    <svg width="18" height="6" className="flex-shrink-0" aria-hidden>
      <line x1="1" x2="17" y1="3" y2="3" strokeWidth="2" strokeDasharray={link.kind === 'cite' ? '0.5 3.5' : undefined} strokeLinecap="round"
        style={{ stroke: link.kind === 'cite' ? T.body : toneColor(link.tone), opacity: link.kind === 'evidence' ? 0.55 : 1 }} />
    </svg>
  );
}

export function Row({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2.5 -mx-2 px-2 py-1.5 rounded text-left transition-colors hover:bg-[var(--hover-accent)] ${on ? 'bg-[var(--hover-accent)]' : ''}`} style={{ width: 'calc(100% + 16px)' }}>
      {children}
    </button>
  );
}

export function WorldList({ s, selected, onSelect }: { s: RunState; selected: string | null; onSelect: (k: string | null) => void }) {
  const relations = s.links.filter(l => l.kind === 'relation');
  if (!s.actors.length) return <Empty>The world model is being mapped.</Empty>;
  const pick = (key: string) => onSelect(selected === key ? null : key);
  return (
    <div className="flex flex-col gap-5">
      <Legend />
      <div>
        <SectionTitle count={s.actors.length}>Actors</SectionTitle>
        {s.actors.map(a => (
          <Row key={a.id} on={selected === `a:${a.id}`} onClick={() => pick(`a:${a.id}`)}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: gold(0.2), boxShadow: `inset 0 0 0 1.5px ${T.gold}` }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] font-semibold truncate text-[var(--text-heading)]">{a.name}</span>
              <span className="block text-[10px] truncate text-[var(--text-muted)]">{a.role}</span>
            </span>
            {a.persona && <span className={`${LABEL} !text-[7.5px] text-[var(--cyan-primary)]`} title="Plays in the simulation">Plays</span>}
            <span className="text-[8.5px] font-mono tracking-[0.14em] uppercase text-[var(--text-muted)]">{a.kind}</span>
          </Row>
        ))}
      </div>
      {relations.length > 0 && (
        <div>
          <SectionTitle count={relations.length}>Relations</SectionTitle>
          {relations.map(l => (
            <Row key={l.id} on={selected === `link:${l.id}`} onClick={() => pick(`link:${l.id}`)}>
              <LineGlyph link={l} />
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] truncate text-[var(--text-primary)]">{nodeName(s, l.from)} <span className="text-[var(--text-muted)]">⇄</span> {nodeName(s, l.to)}</span>
                <span className="block text-[10px] truncate text-[var(--text-muted)]">{l.label}</span>
              </span>
            </Row>
          ))}
        </div>
      )}
      <ContextList s={s} selected={selected} onSelect={onSelect} />
    </div>
  );
}

export function ContextList({ s, selected, onSelect }: { s: RunState; selected: string | null; onSelect: (k: string | null) => void }) {
  if (!s.context.length) return s.status === 'running' && !s.actors.length ? <Empty>Reading the live feeds.</Empty> : null;
  const cited = new Set(s.links.filter(l => l.kind === 'evidence').map(l => l.from.slice(2)));
  // How often the actors and the report quoted each source: the most quoted first, the unquoted after.
  const quoted = new Map<string, number>();
  for (const l of s.links) if (l.kind === 'cite') quoted.set(l.to.slice(2), (quoted.get(l.to.slice(2)) ?? 0) + 1);
  const order = s.context.map((c, i) => ({ c, i })).sort((a, b) => (quoted.get(b.c.id) ?? 0) - (quoted.get(a.c.id) ?? 0) || a.i - b.i).map(x => x.c);
  return (
    <div>
      <SectionTitle count={s.context.length}>Sources</SectionTitle>
      {order.map((c: ContextItem) => {
        const key = `c:${c.id}`;
        const n = quoted.get(c.id) ?? 0;
        const used = n > 0 || cited.has(c.id);
        return (
          <div key={c.id} className="flex items-start gap-1">
            <Row on={selected === key} onClick={() => onSelect(selected === key ? null : key)}>
              <span className="self-start mt-[6px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: used ? T.cyan : 'var(--text-muted)', boxShadow: used ? `0 0 6px ${cyan(0.8)}` : undefined }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] leading-snug text-[var(--text-primary)]">{c.kind === 'data' && c.id !== 'data' ? `“${c.title}”` : c.title}</span>
                <span className="block mt-0.5 text-[9px] font-mono tracking-[0.08em] truncate text-[var(--text-muted)]">{[`[${c.id}]`, SOURCE_KIND[c.kind], sourceLabel(c, c.id), ago(c.published)].filter(Boolean).join(' · ')}</span>
              </span>
              {n > 0 && <span className="self-start mt-px text-[9px] font-mono tabular-nums whitespace-nowrap" style={{ color: T.cyan }} title={`Quoted ${n} time${n === 1 ? '' : 's'}`}>{n}×</span>}
            </Row>
            <SourceLink url={c.url} className="mt-2 ml-1 flex-shrink-0" />
          </div>
        );
      })}
    </div>
  );
}

export function AskBox({ s, oi, engine, keyValue, ready, target, setTarget, onSelect }: {
  s: RunState; oi: OiClient; engine: Engine; keyValue: string; ready: boolean; target: string; setTarget: (t: string) => void; onSelect: (k: string | null) => void;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ who: string; text: string; you: boolean }[]>([]);
  const cast = castOf(s);
  const targetName = target === 'report' ? 'The report agent' : cast.find(a => a.id === target)?.name ?? target;
  const send = async () => {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setLog(l => [...l, { who: 'You', text: m, you: true }]);
    setMessage('');
    const out = await oi.ask(target, m, engine, keyValue);
    setLog(l => [...l, { who: targetName, text: out.reply ?? out.error ?? '…', you: false }]);
    setBusy(false);
  };
  if (!cast.length) return <Empty>The actors can be questioned once they have been cast.</Empty>;
  return (
    <div className="flex flex-col gap-3">
      <select value={target} onChange={e => setTarget(e.target.value)} aria-label="Who to ask" className={`${FIELD} h-8 px-2 text-[11px]`}>
        <option value="report" disabled={!s.report} style={{ background: '#0C0E1A' }}>The report agent{!s.report ? ' (once the prediction is written)' : ''}</option>
        {cast.map(a => <option key={a.id} value={a.id} style={{ background: '#0C0E1A' }}>{a.name} · {a.role}</option>)}
      </select>
      {log.length === 0 && <Empty>Ask the report agent why the prediction landed where it did, or ask an actor what it would do if things changed. Questions run on your key.</Empty>}
      <div aria-live="polite" className="flex flex-col gap-3">
        {log.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={`max-w-[88%] rounded-lg px-3 py-2 text-[11.5px] leading-relaxed border ${m.you ? 'self-end' : 'self-start'}`}
            style={m.you ? { color: T.text, background: gold(0.1), borderColor: gold(0.3) } : { color: T.body, background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border-secondary)' }}>
            {!m.you && <span className={`block mb-1 ${LABEL} !text-[8.5px] text-[var(--cyan-primary)]`}>{m.who}</span>}
            <span className="whitespace-pre-wrap">{m.you ? m.text : <Mentions text={m.text} s={s} onSelect={onSelect} />}</span>
          </motion.div>
        ))}
      </div>
      <div className="flex items-center gap-2 h-9 pl-3 pr-1 rounded-md border border-[var(--border-primary)] bg-black/40 focus-within:border-[var(--border-active)] transition-colors">
        <input value={message} onChange={e => setMessage(e.target.value.slice(0, 1000))} onKeyDown={e => e.key === 'Enter' && send()} disabled={!ready || (target === 'report' && !s.report)}
          placeholder={!ready ? 'Add your key to ask' : `Ask ${targetName.replace(/^The /, 'the ')}`} aria-label="Your question"
          className="flex-1 bg-transparent outline-none text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-50" />
        <button onClick={send} disabled={!ready || busy || !message.trim()} aria-label="Send"
          className="w-7 h-7 rounded flex items-center justify-center text-[var(--gold-light)] hover:bg-[var(--hover-accent)] disabled:opacity-30 transition-colors">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function HistoryList({ oi, onPick }: { oi: OiClient; onPick: (id: string) => void }) {
  return (
    <section className="px-4 py-4">
      <SectionTitle count={oi.history.length || undefined}>Your predictions</SectionTitle>
      {!oi.history.length && <Empty>Nothing yet. Predictions you run are listed here, in this browser only. The server keeps a run for a few hours.</Empty>}
      <div className="flex flex-col divide-y divide-[var(--border-secondary)]">
        {oi.history.map(h => (
          <div key={h.id} className="group flex items-center gap-3 py-2">
            <button onClick={() => onPick(h.id)} className="flex-1 min-w-0 text-left">
              <span className="block text-[11.5px] truncate text-[var(--text-primary)] transition-colors group-hover:text-[var(--gold-light)]">{h.question}</span>
              <span className="block mt-0.5 text-[9px] font-mono tracking-[0.08em] uppercase text-[var(--text-muted)]">{new Date(h.at).toLocaleString()} · {h.status}</span>
            </button>
            <span className="text-[10.5px] font-mono tabular-nums max-w-[130px] truncate text-[var(--gold-primary)]">{h.answer ?? pct(h.probability)}</span>
            <button onClick={() => oi.forget(h.id)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--alert-red)]" aria-label="Remove from history"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
