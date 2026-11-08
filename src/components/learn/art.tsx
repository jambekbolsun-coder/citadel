import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Набор для иллюстраций раздела «Обучение»: животные и предметы, из которых собраны сцены (scenes.tsx).
 * Это векторная графика без файлов и без текста: шерсть животных постоянная, а одежда, предметы и фон берут цвета
 * темы (var(--brand), var(--accent), var(--surface)…), поэтому каждая картинка сама подстраивается под тему.
 * Сцены — чистая разметка: без состояния, без id в <defs>, поэтому их можно повторять на странице сколько угодно раз.
 */

const LINE = "#2a2140";
/** Контур предметов: тёмный на светлых темах и светлый на тёмных, иначе предметы сливаются с фоном */
const PROP = "var(--muted)";
const outline = { stroke: LINE, strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

export type Kind = "leopard" | "bear" | "deer" | "tiger" | "fox" | "rabbit" | "wolf" | "panda";
export type Mood = "smile" | "joy" | "wink" | "think" | "worry";
type Pt = [number, number];

const FUR: Record<Kind, { fur: string; light: string; inner: string }> = {
  leopard: { fur: "#efe7da", light: "#fdfaf4", inner: "#e9b9ad" },
  bear: { fur: "#a9744a", light: "#e8cda9", inner: "#7d5233" },
  deer: { fur: "#c9915a", light: "#f6e7cf", inner: "#eab7a2" },
  tiger: { fur: "#f39a33", light: "#fff4e4", inner: "#c96f1c" },
  fox: { fur: "#ea6f2d", light: "#fff1e4", inner: "#3b2a33" },
  rabbit: { fur: "#e9e4f0", light: "#ffffff", inner: "#f2b3c4" },
  wolf: { fur: "#8e98ab", light: "#e6e9ef", inner: "#5c6578" },
  panda: { fur: "#f7f5f2", light: "#ffffff", inner: "#2b2733" },
};

function Ears({ kind }: { kind: Kind }) {
  const c = FUR[kind];
  if (kind === "rabbit") {
    return (
      <>
        {[-14, 14].map((x) => (
          <g key={x} transform={`rotate(${x > 0 ? 7 : -7} ${x} -100)`}>
            <ellipse cx={x} cy={-124} rx={9.5} ry={25} fill={c.fur} {...outline} />
            <ellipse cx={x} cy={-122} rx={4.8} ry={18} fill={c.inner} />
          </g>
        ))}
      </>
    );
  }
  if (kind === "fox" || kind === "wolf") {
    return (
      <>
        {[1, -1].map((m) => (
          <g key={m} transform={`scale(${m} 1)`}>
            <path d="M32 -84 L33 -122 L8 -103 Z" fill={c.fur} {...outline} />
            <path d="M28 -92 L29 -112 L15 -102 Z" fill={c.inner} />
          </g>
        ))}
      </>
    );
  }
  if (kind === "deer") {
    return (
      <>
        {[1, -1].map((m) => (
          <g key={m} transform={`scale(${m} 1)`}>
            <path d="M12 -103 C14 -116 20 -122 22 -134 M17 -118 C24 -120 29 -124 33 -131" fill="none" stroke={LINE} strokeWidth={6.5} strokeLinecap="round" />
            <path d="M12 -103 C14 -116 20 -122 22 -134 M17 -118 C24 -120 29 -124 33 -131" fill="none" stroke="#a9794a" strokeWidth={3.8} strokeLinecap="round" />
            <ellipse cx={42} cy={-90} rx={14} ry={7.5} fill={c.fur} transform="rotate(-18 42 -90)" {...outline} />
            <ellipse cx={42} cy={-90} rx={8} ry={3.8} fill={c.inner} transform="rotate(-18 42 -90)" />
          </g>
        ))}
      </>
    );
  }
  const big = kind === "bear" ? 13 : 11.5;
  const earFur = kind === "panda" ? "#2b2733" : c.fur;
  return (
    <>
      {[1, -1].map((m) => (
        <g key={m}>
          <circle cx={m * 26} cy={-102} r={big} fill={earFur} {...outline} />
          {kind !== "panda" && <circle cx={m * 26} cy={-101} r={big - 5.5} fill={c.inner} />}
        </g>
      ))}
    </>
  );
}

function Marks({ kind }: { kind: Kind }) {
  if (kind === "leopard") {
    const spots: Pt[] = [[-17, -99], [0, -102], [17, -99], [-27, -86], [27, -86], [-9, -94], [9, -94]];
    return (
      <>
        {spots.map(([x, y]) => (
          <g key={`${x}${y}`}>
            <circle cx={x} cy={y} r={3.5} fill="#544c5c" />
            <circle cx={x} cy={y} r={1.5} fill="#c9b79f" />
          </g>
        ))}
      </>
    );
  }
  if (kind === "tiger") {
    return (
      <g fill="none" stroke="#2b2233" strokeWidth={3.4} strokeLinecap="round">
        <path d="M0 -106 V-96 M-10 -105 L-8 -97 M10 -105 L8 -97" />
        <path d="M-32 -82 L-23 -80 M-31 -72 L-23 -73 M32 -82 L23 -80 M31 -72 L23 -73" />
      </g>
    );
  }
  if (kind === "deer") {
    return <g fill="#fff6e6">{([[-14, -99], [0, -103], [14, -99]] as Pt[]).map(([x, y]) => <circle key={x} cx={x} cy={y} r={2.6} />)}</g>;
  }
  return null;
}

function Face({ kind, mood, look }: { kind: Kind; mood: Mood; look: number }) {
  const c = FUR[kind];
  const eye = "#1f1a2e";
  const dark = kind === "panda";
  const ex = 13.5;
  const ey = -83;
  const arc = (x: number) => <path key={x} d={`M${x - 6} ${ey + 1} Q${x} ${ey - 7} ${x + 6} ${ey + 1}`} fill="none" stroke={dark ? "#fff" : eye} strokeWidth={2.8} strokeLinecap="round" />;
  const open = (x: number) => (
    <g key={x}>
      <circle cx={x} cy={ey} r={6} fill={dark ? "#fff" : eye} />
      {dark && <circle cx={x} cy={ey} r={4.2} fill={eye} />}
      <circle cx={x + 1.9} cy={ey - 2.2} r={2} fill="#fff" />
      <circle cx={x - 1.8} cy={ey + 2} r={0.9} fill="#fff" opacity={0.85} />
    </g>
  );
  return (
    <g transform={`translate(${look} 0)`}>
      {kind === "fox" || kind === "wolf" ? (
        <path d="M-30 -74 Q-18 -90 0 -74 Q18 -90 30 -74 Q22 -54 0 -52 Q-22 -54 -30 -74 Z" fill={c.light} />
      ) : (
        <ellipse cx={0} cy={-67} rx={kind === "tiger" ? 20 : 17} ry={12.5} fill={c.light} />
      )}
      {dark && ([-1, 1] as const).map((m) => <ellipse key={m} cx={m * ex} cy={ey} rx={9.5} ry={11} fill="#2b2733" transform={`rotate(${m * 18} ${m * ex} ${ey})`} />)}
      {mood === "joy" ? [arc(-ex), arc(ex)] : mood === "wink" ? [open(-ex), arc(ex)] : [open(-ex), open(ex)]}
      {mood === "worry" && <path d={`M${-ex - 8} ${ey - 9} L${-ex + 5} ${ey - 13} M${ex + 8} ${ey - 9} L${ex - 5} ${ey - 13}`} fill="none" stroke={dark ? "#fff" : eye} strokeWidth={2.6} strokeLinecap="round" />}
      {mood === "think" && <path d={`M${ex - 7} ${ey - 11} Q${ex} ${ey - 16} ${ex + 7} ${ey - 11}`} fill="none" stroke={dark ? "#fff" : eye} strokeWidth={2.6} strokeLinecap="round" />}
      {!dark && ([-1, 1] as const).map((m) => <ellipse key={m} cx={m * 24} cy={-71} rx={6} ry={3.8} fill="#ff7d92" opacity={0.42} />)}
      <path d="M-4.6 -75 Q0 -77.5 4.6 -75 Q3.4 -70.6 0 -69.6 Q-3.4 -70.6 -4.6 -75 Z" fill={kind === "rabbit" ? "#f28aa6" : "#2b2233"} />
      {mood === "joy" || mood === "smile" || mood === "wink" ? (
        <>
          <path d="M-9 -66 Q-8.4 -55.5 0 -55.5 Q8.4 -55.5 9 -66 Q0 -62.5 -9 -66 Z" fill="#a22f47" stroke={eye} strokeWidth={1.3} strokeLinejoin="round" />
          <path d="M-5 -58.5 Q0 -62 5 -58.5 Q2.5 -55.7 0 -55.7 Q-2.5 -55.7 -5 -58.5 Z" fill="#ff8fa0" />
          {kind === "rabbit" && <rect x={-3.6} y={-65} width={7.2} height={5} rx={1.2} fill="#fff" stroke={eye} strokeWidth={0.9} />}
        </>
      ) : mood === "think" ? (
        <path d="M-4 -61.5 Q2 -64 6 -61" fill="none" stroke={eye} strokeWidth={2.4} strokeLinecap="round" />
      ) : (
        <path d="M-6 -59 Q0 -65 6 -59" fill="none" stroke={eye} strokeWidth={2.4} strokeLinecap="round" />
      )}
    </g>
  );
}

function Tail({ kind }: { kind: Kind }) {
  if (kind === "leopard") {
    return (
      <>
        <path d="M18 -18 C50 -14 58 -40 46 -62" fill="none" stroke={LINE} strokeWidth={15} strokeLinecap="round" />
        <path d="M18 -18 C50 -14 58 -40 46 -62" fill="none" stroke={FUR.leopard.fur} strokeWidth={12} strokeLinecap="round" />
        <path d="M40 -19 l4 8 M51 -33 l9 2 M50 -49 l9 -3" fill="none" stroke="#544c5c" strokeWidth={4} strokeLinecap="round" />
      </>
    );
  }
  if (kind === "fox") {
    return (
      <g>
        <path d="M16 -18 C44 -8 66 -24 60 -60 C50 -48 30 -44 18 -40 Z" fill={FUR.fox.fur} {...outline} />
        <path d="M60 -60 C58 -48 54 -40 47 -34 C45 -43 50 -53 60 -60 Z" fill={FUR.fox.light} {...outline} />
      </g>
    );
  }
  if (kind === "tiger") {
    return (
      <>
        <path d="M18 -16 C44 -12 52 -30 44 -50" fill="none" stroke={LINE} strokeWidth={12} strokeLinecap="round" />
        <path d="M18 -16 C44 -12 52 -30 44 -50" fill="none" stroke={FUR.tiger.fur} strokeWidth={9} strokeLinecap="round" />
        <path d="M36 -16 l3 7 M46 -29 l8 1 M45 -42 l7 -3" fill="none" stroke="#2b2233" strokeWidth={3.4} strokeLinecap="round" />
      </>
    );
  }
  if (kind === "wolf") {
    return <path d="M16 -18 C40 -12 54 -26 52 -50 C44 -42 30 -38 18 -36 Z" fill={FUR.wolf.fur} {...outline} />;
  }
  return null;
}

function Arm({ from, to, bend }: { from: Pt; to: Pt; bend: number }) {
  const mx = (from[0] + to[0]) / 2 + bend;
  const my = (from[1] + to[1]) / 2 + 4;
  const d = `M${from[0]} ${from[1]} Q${mx} ${my} ${to[0]} ${to[1]}`;
  return (
    <>
      <path d={d} fill="none" stroke={LINE} strokeWidth={14} strokeLinecap="round" />
      <path d={d} fill="none" stroke="var(--brand)" strokeWidth={10.8} strokeLinecap="round" />
    </>
  );
}

export type AnimalProps = {
  kind: Kind;
  x: number;
  y?: number;
  s?: number;
  mood?: Mood;
  /** Куда смотрит: сдвиг мордочки влево (−) или вправо (+) */
  look?: number;
  /** Куда тянутся лапы — в координатах героя (0,0 — под ногами) */
  l?: Pt;
  r?: Pt;
  /** То, что герой держит: рисуется поверх рукавов, но под подушечками лап */
  children?: ReactNode;
};

/** Герой обучения: животное в худи цвета темы. */
export function Animal({ kind, x, y = 172, s = 1, mood = "smile", look = 0, l = [-29, -22], r = [29, -22], children }: AnimalProps) {
  const c = FUR[kind];
  const pandaLimb = kind === "panda" ? "#2b2733" : c.fur;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={0} cy={1} rx={36} ry={5.5} fill="#000" opacity={0.14} />
      <Tail kind={kind} />
      <ellipse cx={-12} cy={-4} rx={12} ry={6.5} fill={pandaLimb} {...outline} />
      <ellipse cx={12} cy={-4} rx={12} ry={6.5} fill={pandaLimb} {...outline} />
      <path d="M-18 -56 Q-27 -52 -27 -38 L-28 -16 Q-28 -9 -21 -9 L21 -9 Q28 -9 28 -16 L27 -38 Q27 -52 18 -56 Z" fill="var(--brand)" {...outline} />
      <path d="M-14 -22 H14 V-14 H-14 Z" fill="#000" opacity={0.12} />
      <path d="M-8 -36 L0 -44 L8 -36 M-8 -29 L0 -37 L8 -29" fill="none" stroke="var(--brand-ink)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <Arm from={[-21, -48]} to={l} bend={-8} />
      <Arm from={[21, -48]} to={r} bend={8} />
      <Ears kind={kind} />
      <ellipse cx={0} cy={-79} rx={35} ry={30} fill={c.fur} {...outline} />
      <Marks kind={kind} />
      <Face kind={kind} mood={mood} look={look} />
      {children}
      <circle cx={l[0]} cy={l[1]} r={7.5} fill={pandaLimb} {...outline} />
      <circle cx={r[0]} cy={r[1]} r={7.5} fill={pandaLimb} {...outline} />
    </g>
  );
}

// ───────── фон и мелкие детали ─────────

/** Холст сцены: мягкое пятно цвета темы и пол. */
export function Canvas({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "brand" }) {
  return (
    <svg viewBox="0 0 320 190" className="block h-auto w-full" aria-hidden="true" focusable="false">
      <ellipse cx={160} cy={100} rx={142} ry={82} fill={`var(--${tone})`} opacity={0.16} />
      <circle cx={34} cy={40} r={7} fill="var(--accent)" opacity={0.55} />
      <circle cx={292} cy={34} r={4.5} fill="var(--primary)" opacity={0.45} />
      <circle cx={298} cy={146} r={6} fill="var(--accent)" opacity={0.35} />
      {children}
    </svg>
  );
}

type Tone = "good" | "bad" | "warn" | "info" | "brand" | "accent";

/** Круглый значок с иконкой. */
export function Badge({ x, y, r = 14, icon: Icon, tone = "good", solid = false }: { x: number; y: number; r?: number; icon: LucideIcon; tone?: Tone; solid?: boolean }) {
  const ink = solid ? (tone === "accent" ? "var(--accent-ink)" : tone === "bad" ? "var(--bad-ink)" : "var(--brand-ink)") : `var(--${tone})`;
  const size = r * 1.25;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={solid ? `var(--${tone})` : "var(--surface)"} stroke={solid ? PROP : `var(--${tone})`} strokeWidth={solid ? 1.6 : 2.6} />
      <Icon x={x - size / 2} y={y - size / 2} width={size} height={size} color={ink} strokeWidth={2.8} />
    </g>
  );
}

/** Искра-украшение. */
export function Spark({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -10 Q1.6 -1.6 10 0 Q1.6 1.6 0 10 Q-1.6 1.6 -10 0 Q-1.6 -1.6 0 -10 Z" fill="var(--accent)" stroke={PROP} strokeWidth={1.2} strokeLinejoin="round" />;
}

/** Стрелка-движение. */
export function Arrow({ d, tone = "primary" }: { d: string; tone?: "primary" | "good" | "warn" | "bad" }) {
  return <path d={d} fill="none" stroke={`var(--${tone})`} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 8" />;
}

/** Облачко реплики; содержимое — в координатах сцены. */
export function Bubble({ x, y, w, h, tail = "left", children }: { x: number; y: number; w: number; h: number; tail?: "left" | "right"; children?: ReactNode }) {
  const tx = tail === "left" ? x + 14 : x + w - 14;
  const dir = tail === "left" ? -1 : 1;
  return (
    <g>
      <path d={`M${tx - 7} ${y + h - 1} L${tx + dir * 12} ${y + h + 13} L${tx + 8} ${y + h - 1} Z`} fill="var(--surface)" stroke={PROP} strokeWidth={1.6} strokeLinejoin="round" />
      <rect x={x} y={y} width={w} height={h} rx={12} fill="var(--surface)" stroke={PROP} strokeWidth={1.6} />
      <rect x={tx - 6} y={y + h - 3} width={13} height={4.4} fill="var(--surface)" />
      {children}
    </g>
  );
}

/** Линии «текста» — настоящих букв на картинках нет. */
export function Lines({ x, y, w, n = 3, gap = 8 }: { x: number; y: number; w: number; n?: number; gap?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x} y={y + i * gap} width={i === n - 1 && n > 1 ? w * 0.62 : w} height={3.6} rx={1.8} fill="var(--muted)" opacity={0.6} />
      ))}
    </>
  );
}

// ───────── предметы ─────────

export function Paper({ x, y, w = 58, h = 72, rot = 0, clip = false, children }: { x: number; y: number; w?: number; h?: number; rot?: number; clip?: boolean; children?: ReactNode }) {
  return (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y} width={w} height={h} rx={7} fill="var(--surface)" stroke={PROP} strokeWidth={1.6} />
      {clip && <rect x={x + w / 2 - 11} y={y - 5} width={22} height={10} rx={3.5} fill="var(--primary)" stroke={PROP} strokeWidth={1.4} />}
      {children}
    </g>
  );
}

/** Лист-чек-лист: строки с галочками. */
export function Checklist({ x, y, w = 58, h = 74, rot = 0, done = 2, rows = 3 }: { x: number; y: number; w?: number; h?: number; rot?: number; done?: number; rows?: number }) {
  return (
    <Paper x={x} y={y} w={w} h={h} rot={rot} clip>
      {Array.from({ length: rows }, (_, i) => {
        const ry = y + 14 + i * ((h - 18) / rows);
        return (
          <g key={i}>
            <rect x={x + 7} y={ry} width={11} height={11} rx={3} fill={i < done ? "var(--good)" : "var(--surface-2)"} stroke={PROP} strokeWidth={1.1} />
            {i < done && <path d={`M${x + 9.5} ${ry + 5.5} l2.4 2.6 l4 -5`} fill="none" stroke="var(--surface)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
            <rect x={x + 23} y={ry + 3.5} width={w - 31} height={4} rx={2} fill="var(--muted)" opacity={0.6} />
          </g>
        );
      })}
    </Paper>
  );
}

export function Phone({ x, y, w = 46, h = 84, rot = 0, children }: { x: number; y: number; w?: number; h?: number; rot?: number; children?: ReactNode }) {
  return (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y} width={w} height={h} rx={9} fill="#231d36" stroke={PROP} strokeWidth={1.6} />
      <rect x={x + 3.4} y={y + 3.4} width={w - 6.8} height={h - 6.8} rx={6} fill="var(--surface)" />
      <rect x={x + w / 2 - 7} y={y + 5.5} width={14} height={3} rx={1.5} fill="#231d36" />
      {children}
    </g>
  );
}

export function Laptop({ x, y, w = 92, children }: { x: number; y: number; w?: number; children?: ReactNode }) {
  const h = w * 0.62;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={7} fill="#231d36" stroke={PROP} strokeWidth={1.6} />
      <rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} rx={3.5} fill="var(--surface)" />
      <path d={`M${x - 10} ${y + h} H${x + w + 10} L${x + w + 4} ${y + h + 8} H${x - 4} Z`} fill="#3a3352" stroke={PROP} strokeWidth={1.6} strokeLinejoin="round" />
      {children}
    </g>
  );
}

export function Folder({ x, y, w = 62, rot = 0 }: { x: number; y: number; w?: number; rot?: number }) {
  const h = w * 0.74;
  return (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <path d={`M${x} ${y + 7} Q${x} ${y} ${x + 7} ${y} H${x + w * 0.36} L${x + w * 0.46} ${y + 9} H${x + w - 6} Q${x + w} ${y + 9} ${x + w} ${y + 15} V${y + h - 6} Q${x + w} ${y + h} ${x + w - 6} ${y + h} H${x + 6} Q${x} ${y + h} ${x} ${y + h - 6} Z`} fill="var(--accent)" stroke={PROP} strokeWidth={1.6} strokeLinejoin="round" />
      <rect x={x + w * 0.18} y={y + h * 0.48} width={w * 0.64} height={4} rx={2} fill="var(--accent-ink)" opacity={0.55} />
      <rect x={x + w * 0.18} y={y + h * 0.68} width={w * 0.4} height={4} rx={2} fill="var(--accent-ink)" opacity={0.55} />
    </g>
  );
}

/** Календарь: закрашенные ячейки — занятые дни. */
export function CalendarCard({ x, y, w = 96, h = 86, filled = [], tones = {} }: { x: number; y: number; w?: number; h?: number; filled?: number[]; tones?: Record<number, Tone> }) {
  const cols = 5;
  const rows = 3;
  const cw = (w - 16) / cols;
  const ch = (h - 30) / rows;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={9} fill="var(--surface)" stroke={PROP} strokeWidth={1.6} />
      <path d={`M${x} ${y + 20} V${y + 9} Q${x} ${y} ${x + 9} ${y} H${x + w - 9} Q${x + w} ${y} ${x + w} ${y + 9} V${y + 20} Z`} fill="var(--brand)" stroke={PROP} strokeWidth={1.6} strokeLinejoin="round" />
      <rect x={x + 20} y={y - 5} width={6} height={13} rx={3} fill="var(--surface)" stroke={PROP} strokeWidth={1.3} />
      <rect x={x + w - 26} y={y - 5} width={6} height={13} rx={3} fill="var(--surface)" stroke={PROP} strokeWidth={1.3} />
      {Array.from({ length: cols * rows }, (_, i) => {
        const tone = tones[i];
        const on = filled.includes(i) || !!tone;
        return <rect key={i} x={x + 8 + (i % cols) * cw + 1.2} y={y + 25 + Math.floor(i / cols) * ch + 1.2} width={cw - 2.4} height={ch - 2.4} rx={2.6} fill={tone ? `var(--${tone})` : on ? "var(--accent)" : "var(--surface-2)"} />;
      })}
    </g>
  );
}

/** Большая кнопка «+» приложения. */
export function PlusButton({ x, y, r = 26, icon: Icon }: { x: number; y: number; r?: number; icon: LucideIcon }) {
  const size = r * 1.2;
  return (
    <g>
      <circle cx={x} cy={y} r={r + 6} fill="var(--accent)" opacity={0.28} />
      <circle cx={x} cy={y} r={r} fill="var(--accent)" stroke={PROP} strokeWidth={1.8} />
      <Icon x={x - size / 2} y={y - size / 2} width={size} height={size} color="var(--accent-ink)" strokeWidth={3} />
    </g>
  );
}

/** Плитка с крупной иконкой. */
export function Tile({ x, y, s = 44, icon: Icon, tone = "brand", rot = 0 }: { x: number; y: number; s?: number; icon: LucideIcon; tone?: Tone; rot?: number }) {
  const size = s * 0.58;
  return (
    <g transform={`rotate(${rot} ${x + s / 2} ${y + s / 2})`}>
      <rect x={x} y={y} width={s} height={s} rx={s * 0.24} fill="var(--surface)" stroke={PROP} strokeWidth={1.6} />
      <Icon x={x + (s - size) / 2} y={y + (s - size) / 2} width={size} height={size} color={`var(--${tone})`} strokeWidth={2.4} />
    </g>
  );
}

export function Coins({ x, y, n = 3 }: { x: number; y: number; n?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <rect x={x - 15} y={y - i * 8 - 8} width={30} height={8} fill="#f5b92e" />
          <path d={`M${x - 15} ${y - i * 8 - 8} v8 a15 5 0 0 0 30 0 v-8`} fill="#f0a818" stroke={PROP} strokeWidth={1.4} />
          <ellipse cx={x} cy={y - i * 8 - 8} rx={15} ry={5} fill="#ffd257" stroke={PROP} strokeWidth={1.4} />
        </g>
      ))}
    </g>
  );
}

export function Envelope({ x, y, w = 58, rot = 0 }: { x: number; y: number; w?: number; rot?: number }) {
  const h = w * 0.68;
  return (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y} width={w} height={h} rx={6} fill="var(--surface)" stroke={PROP} strokeWidth={1.6} />
      <path d={`M${x + 2} ${y + 3} L${x + w / 2} ${y + h * 0.58} L${x + w - 2} ${y + 3}`} fill="none" stroke={PROP} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x + w / 2} cy={y + h * 0.58} r={5.5} fill="var(--bad)" stroke={PROP} strokeWidth={1.2} />
    </g>
  );
}

/** Бумажный самолётик — «отправлено». */
export function Plane({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-22 2 L24 -18 L8 20 L0 7 Z" fill="var(--surface)" stroke={PROP} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M24 -18 L0 7 L-1 16 L6 11" fill="var(--primary)" stroke={PROP} strokeWidth={1.4} strokeLinejoin="round" />
    </g>
  );
}

/** QR-код из квадратов (рисунок условный). */
export function QrCard({ x, y, s = 72 }: { x: number; y: number; s?: number }) {
  const n = 9;
  const pad = 8;
  const c = (s - pad * 2) / n;
  const on = (i: number, j: number) => {
    const corner = (a: number, b: number) => a < 3 && b < 3;
    if (corner(i, j) || corner(n - 1 - i, j) || corner(i, n - 1 - j)) return !(i % 2 === 1 && j % 2 === 1 && (i === 1 || i === n - 2) && (j === 1 || j === n - 2));
    return (i * 7 + j * 13 + i * j * 3 + (i ^ j)) % 5 < 2;
  };
  return (
    <g>
      <rect x={x} y={y} width={s} height={s} rx={9} fill="#ffffff" stroke={PROP} strokeWidth={1.6} />
      {Array.from({ length: n * n }, (_, k) => {
        const i = k % n;
        const j = Math.floor(k / n);
        return on(i, j) ? <rect key={k} x={x + pad + i * c} y={y + pad + j * c} width={c + 0.25} height={c + 0.25} fill="#231d36" /> : null;
      })}
    </g>
  );
}

/** Столбики графика. */
export function Bars({ x, y, values, w = 13, gap = 6, tone = "primary" }: { x: number; y: number; values: number[]; w?: number; gap?: number; tone?: "primary" | "accent" | "good" }) {
  return (
    <g>
      {values.map((v, i) => (
        <rect key={i} x={x + i * (w + gap)} y={y - v} width={w} height={v} rx={3.2} fill={`var(--${tone})`} stroke={PROP} strokeWidth={1.3} />
      ))}
    </g>
  );
}

/** Камера на штативе. */
export function TripodCamera({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M${x} ${y - 52} L${x - 22} ${y} M${x} ${y - 52} L${x + 22} ${y} M${x} ${y - 52} V${y}`} fill="none" stroke={PROP} strokeWidth={3.6} strokeLinecap="round" />
      <rect x={x - 27} y={y - 84} width={50} height={34} rx={7} fill="#3a3352" stroke={PROP} strokeWidth={1.6} />
      <circle cx={x - 2} cy={y - 67} r={11.5} fill="var(--surface)" stroke={PROP} strokeWidth={1.6} />
      <circle cx={x - 2} cy={y - 67} r={6} fill="var(--primary)" />
      <circle cx={x + 16} cy={y - 78} r={3} fill="var(--bad)" />
    </g>
  );
}

/** Чек с ровным нижним краем-«зубцами». */
export function Receipt({ x, y, w = 46, h = 66, rot = 0 }: { x: number; y: number; w?: number; h?: number; rot?: number }) {
  const t = w / 6;
  const teeth = Array.from({ length: 6 }, (_, i) => `L${x + w - t * i - t / 2} ${y + h - 6} L${x + w - t * (i + 1)} ${y + h}`).join(" ");
  return (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <path d={`M${x} ${y} H${x + w} V${y + h} ${teeth} Z`} fill="var(--surface)" stroke={PROP} strokeWidth={1.6} strokeLinejoin="round" />
      <Lines x={x + 7} y={y + 10} w={w - 14} n={3} gap={9} />
      <rect x={x + 7} y={y + 42} width={w - 14} height={6} rx={2} fill="var(--primary)" />
    </g>
  );
}
