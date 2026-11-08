import type { ReactNode } from "react";
import {
  AlarmClock, Bell, BellRing, Camera, Check, CircleAlert, Clapperboard, Clock, Download, Film, Hourglass, IdCard, KeyRound, Link2, ListChecks,
  Megaphone, MessageCircle, Pause, Pencil, Play, Plus, RotateCcw, Search, Tag, ThumbsUp, Upload, UserPlus, UserRound, Wallet,
} from "lucide-react";
import {
  Animal, Arrow, Badge, Bars, Bubble, CalendarCard, Canvas, Checklist, Coins, Envelope, Folder, Laptop, Lines, Paper, Phone, Plane, PlusButton, QrCard, Receipt, Spark, Tile, TripodCamera,
} from "./art";

/** Экран телефона: список строк, верхняя — выделена. */
function PhoneRows({ x, y, n = 3 }: { x: number; y: number; n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <rect x={x} y={y + i * 17} width={32} height={13} rx={3.5} fill={i === 0 ? "var(--brand-soft)" : "var(--surface-2)"} />
          <circle cx={x + 6} cy={y + i * 17 + 6.5} r={3} fill={i === 0 ? "var(--primary)" : "var(--muted)"} opacity={i === 0 ? 1 : 0.55} />
          <rect x={x + 12} y={y + i * 17 + 5} width={16} height={3} rx={1.5} fill="var(--muted)" opacity={0.6} />
        </g>
      ))}
    </>
  );
}

/** Все картинки обучения. Ключ — поле scene шага в src/lib/learn.ts; у каждого шага своя сцена. */
export const SCENES: Record<string, () => ReactNode> = {
  // ───── первые шаги ─────
  "start-install": () => (
    <Canvas>
      <Animal kind="leopard" x={118} mood="joy" l={[-30, -60]} r={[30, -30]} look={4} />
      <Phone x={190} y={62} rot={6}><Tile x={202} y={92} s={24} icon={Download} tone="brand" /></Phone>
      <Arrow d="M150 96 Q172 72 190 88" />
      <Spark x={258} y={60} />
      <Spark x={72} y={72} s={0.7} />
    </Canvas>
  ),
  "start-profile": () => (
    <Canvas>
      <Animal kind="rabbit" x={104} mood="wink" r={[46, -74]} l={[-28, -24]} look={5} />
      <Phone x={158} y={52} w={84} h={110} rot={4}>
        <circle cx={200} cy={96} r={22} fill="var(--brand-soft)" stroke="var(--primary)" strokeWidth={2.4} />
        <UserRound x={186} y={82} width={28} height={28} color="var(--primary)" strokeWidth={2.2} />
        <Lines x={176} y={126} w={48} n={2} gap={9} />
      </Phone>
      <Badge x={236} y={62} icon={Camera} tone="accent" solid />
    </Canvas>
  ),
  "start-push": () => (
    <Canvas>
      <Animal kind="deer" x={106} mood="smile" r={[42, -62]} look={5} />
      <Tile x={168} y={58} s={78} icon={BellRing} tone="brand" rot={-7} />
      <Badge x={246} y={62} r={15} icon={Check} tone="good" />
      <path d="M262 92 q10 12 2 26 M272 84 q16 20 4 42" fill="none" stroke="var(--accent)" strokeWidth={3.6} strokeLinecap="round" />
    </Canvas>
  ),

  // ───── мои задачи ─────
  "tasks-where": () => (
    <Canvas>
      <Animal kind="bear" x={108} mood="smile" r={[42, -58]} look={5} />
      <Phone x={164} y={60} w={60} h={104} rot={5}>
        <g transform="translate(6 2)"><PhoneRows x={177} y={78} n={4} /></g>
      </Phone>
      <Badge x={232} y={72} icon={ListChecks} tone="brand" solid />
    </Canvas>
  ),
  "tasks-bell": () => (
    <Canvas>
      <Animal kind="fox" x={198} mood="joy" l={[-44, -64]} look={-5} />
      <Tile x={76} y={54} s={76} icon={Bell} tone="brand" rot={7} />
      <circle cx={146} cy={58} r={13} fill="var(--bad)" stroke="var(--muted)" strokeWidth={1.6} />
      <circle cx={146} cy={58} r={4} fill="var(--bad-ink)" />
      <Spark x={62} y={146} s={0.8} />
    </Canvas>
  ),
  "tasks-calendar": () => (
    <Canvas>
      <Animal kind="tiger" x={92} mood="smile" r={[44, -66]} look={5} />
      <CalendarCard x={152} y={56} w={124} h={106} tones={{ 2: "brand", 6: "accent", 8: "good", 12: "warn" }} />
    </Canvas>
  ),

  // ───── как выполнять ─────
  "do-read": () => (
    <Canvas>
      <Animal kind="panda" x={96} mood="think" r={[46, -50]} look={5} />
      <Checklist x={148} y={58} w={82} h={100} done={0} rows={4} />
      <Tile x={214} y={108} s={52} icon={Search} tone="brand" rot={8} />
    </Canvas>
  ),
  "do-start": () => (
    <Canvas>
      <Animal kind="wolf" x={92} mood="smile" r={[40, -34]} look={6} />
      <Laptop x={146} y={84}><Lines x={160} y={100} w={64} n={3} gap={9} /></Laptop>
      <Badge x={246} y={72} r={18} icon={Play} tone="good" solid={false} />
    </Canvas>
  ),
  "do-blocked": () => (
    <Canvas>
      <Animal kind="rabbit" x={104} mood="worry" r={[30, -30]} look={5} />
      <Bubble x={158} y={46} w={106} h={58}>
        <Badge x={184} y={75} r={15} icon={Pause} tone="warn" />
        <Lines x={206} y={66} w={46} n={3} gap={8} />
      </Bubble>
    </Canvas>
  ),

  // ───── как сдать ─────
  "submit-plus": () => (
    <Canvas>
      <Animal kind="deer" x={108} mood="joy" r={[58, -56]} look={6} />
      <PlusButton x={210} y={104} r={36} icon={Plus} />
      <Spark x={262} y={56} />
    </Canvas>
  ),
  "submit-pick": () => (
    <Canvas>
      <Animal kind="bear" x={232} mood="think" l={[-46, -56]} look={-5} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={58} y={48 + i * 40} width={124} height={32} rx={9} fill={i === 1 ? "var(--brand-soft)" : "var(--surface)"} stroke={i === 1 ? "var(--primary)" : "var(--muted)"} strokeWidth={i === 1 ? 2.6 : 1.6} />
          <Lines x={70} y={58 + i * 40} w={68} n={2} gap={8} />
          {i === 1 && <Badge x={164} y={104} r={11} icon={Check} tone="good" />}
        </g>
      ))}
    </Canvas>
  ),
  "submit-link": () => (
    <Canvas>
      <Animal kind="fox" x={94} mood="smile" r={[42, -50]} look={6} />
      <Tile x={146} y={72} s={56} icon={Link2} tone="brand" rot={-6} />
      <Arrow d="M208 96 Q232 78 250 76" />
      <Plane x={268} y={66} s={1.15} />
    </Canvas>
  ),
  "submit-wait": () => (
    <Canvas>
      <Animal kind="tiger" x={108} mood="smile" l={[-28, -26]} r={[28, -26]} look={4} />
      <Bubble x={160} y={46} w={92} h={62}>
        <Hourglass x={190} y={59} width={36} height={36} color="var(--primary)" strokeWidth={2.2} />
      </Bubble>
      <Badge x={258} y={140} r={15} icon={Clock} tone="info" />
    </Canvas>
  ),

  // ───── доработка ─────
  "redo-notice": () => (
    <Canvas>
      <Animal kind="panda" x={112} mood="worry" r={[40, -60]} look={5} />
      <Tile x={166} y={58} s={70} icon={Bell} tone="warn" rot={-6} />
      <Badge x={240} y={118} r={18} icon={RotateCcw} tone="warn" />
    </Canvas>
  ),
  "redo-read": () => (
    <Canvas>
      <Animal kind="leopard" x={82} mood="smile" r={[34, -60]} look={5} s={0.92} />
      <Animal kind="wolf" x={240} mood="think" l={[-30, -40]} look={-5} s={0.92} />
      <Bubble x={108} y={30} w={108} h={56}>
        <Badge x={131} y={58} r={12} icon={Pencil} tone="warn" />
        <Lines x={150} y={46} w={56} n={3} gap={9} />
      </Bubble>
    </Canvas>
  ),
  "redo-fix": () => (
    <Canvas>
      <Animal kind="rabbit" x={100} mood="think" r={[46, -44]} look={5} />
      <Paper x={150} y={60} w={92} h={102} rot={3}>
        <Lines x={162} y={78} w={68} n={2} gap={11} />
        <rect x={162} y={104} width={68} height={12} rx={3} fill="var(--warn-soft)" />
        <Lines x={162} y={126} w={68} n={2} gap={11} />
      </Paper>
      <Tile x={226} y={126} s={42} icon={Pencil} tone="brand" rot={8} />
    </Canvas>
  ),
  "redo-again": () => (
    <Canvas>
      <Animal kind="wolf" x={104} mood="joy" r={[36, -88]} look={4} />
      <Arrow d="M150 84 Q196 40 244 62" tone="good" />
      <Plane x={258} y={66} s={1.3} />
      <Badge x={210} y={128} r={18} icon={Check} tone="good" />
    </Canvas>
  ),

  // ───── съёмки ─────
  "shoot-confirm": () => (
    <Canvas>
      <Animal kind="tiger" x={96} mood="joy" r={[38, -86]} look={4} />
      <CalendarCard x={160} y={62} w={104} h={92} tones={{ 7: "good" }} />
      <Badge x={262} y={62} r={16} icon={ThumbsUp} tone="good" />
    </Canvas>
  ),
  "shoot-film": () => (
    <Canvas>
      <Animal kind="bear" x={82} mood="think" r={[40, -60]} look={5} s={0.95} />
      <TripodCamera x={156} y={168} />
      <Animal kind="fox" x={246} mood="joy" l={[-30, -86]} look={-4} s={0.92} />
      <Spark x={204} y={60} s={0.8} />
    </Canvas>
  ),
  "shoot-upload": () => (
    <Canvas>
      <Animal kind="deer" x={106} mood="smile" r={[42, -54]} look={5} />
      <Tile x={160} y={82} s={56} icon={Clapperboard} tone="brand" rot={-6} />
      <Arrow d="M224 88 Q246 66 250 56" />
      <Badge x={254} y={40} r={18} icon={Upload} tone="accent" solid />
    </Canvas>
  ),

  // ───── сторис ─────
  "story-count": () => (
    <Canvas>
      <Animal kind="fox" x={90} mood="smile" r={[40, -56]} look={5} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={146 + i * 32} y={66 + (i % 2) * 8} width={28} height={50} rx={6} fill={i < 3 ? "var(--primary)" : "var(--surface-2)"} stroke="var(--muted)" strokeWidth={1.6} />
      ))}
      <Badge x={224} y={146} r={15} icon={Check} tone="good" />
    </Canvas>
  ),
  "story-reason": () => (
    <Canvas>
      <Animal kind="deer" x={104} mood="worry" r={[30, -32]} look={5} />
      <Bubble x={158} y={48} w={104} h={56}>
        <Badge x={181} y={76} r={13} icon={MessageCircle} tone="brand" />
        <Lines x={202} y={66} w={50} n={3} gap={8} />
      </Bubble>
    </Canvas>
  ),

  // ───── реклама ─────
  "ads-project": () => (
    <Canvas>
      <Animal kind="wolf" x={92} mood="joy" r={[40, -62]} look={5} />
      <Tile x={140} y={46} s={58} icon={Megaphone} tone="brand" rot={-8} />
      <Bars x={208} y={160} values={[34, 56, 44, 78]} w={14} gap={5} />
    </Canvas>
  ),
  "ads-spend": () => (
    <Canvas>
      <Animal kind="tiger" x={92} mood="smile" r={[46, -46]} look={5} />
      <Coins x={166} y={160} n={4} />
      <Checklist x={200} y={70} w={70} h={86} done={1} />
    </Canvas>
  ),
  "ads-check": () => (
    <Canvas>
      <Animal kind="panda" x={98} mood="think" r={[40, -56]} look={5} />
      <Paper x={150} y={56} w={112} h={100}>
        <Bars x={164} y={144} values={[26, 54, 36, 66]} w={15} gap={7} tone="accent" />
      </Paper>
      <Badge x={262} y={60} r={17} icon={Search} tone="brand" solid />
    </Canvas>
  ),

  // ───── заявки ─────
  "lead-new": () => (
    <Canvas>
      <Animal kind="fox" x={214} mood="joy" l={[-48, -56]} look={-5} />
      <Envelope x={84} y={72} w={82} rot={-6} />
      <Arrow d="M64 44 Q84 46 98 64" />
      <Badge x={66} y={132} r={15} icon={BellRing} tone="brand" />
    </Canvas>
  ),
  "lead-stage": () => (
    <Canvas>
      <Animal kind="bear" x={66} mood="smile" r={[38, -44]} s={0.9} look={6} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={124 + i * 52} y={108 - i * 22} width={46} height={54 + i * 22} rx={8} fill={i === 2 ? "var(--good)" : i === 1 ? "var(--accent)" : "var(--surface-2)"} stroke="var(--muted)" strokeWidth={1.6} />
      ))}
      <Arrow d="M130 92 Q170 40 228 54" />
      <Badge x={252} y={50} r={15} icon={Check} tone="good" />
    </Canvas>
  ),
  "lead-client": () => (
    <Canvas>
      <Animal kind="leopard" x={100} mood="joy" r={[58, -40]} look={6} />
      <Animal kind="deer" x={226} mood="joy" l={[-58, -40]} look={-6} />
      <Folder x={132} y={34} w={58} />
      <Spark x={118} y={40} s={0.7} />
    </Canvas>
  ),

  // ───── сотрудники ─────
  "team-open": () => (
    <Canvas>
      <Animal kind="leopard" x={106} mood="smile" r={[44, -62]} look={5} />
      <Tile x={166} y={56} s={84} icon={IdCard} tone="brand" rot={-5} />
      <Badge x={252} y={138} r={18} icon={UserPlus} tone="accent" solid />
    </Canvas>
  ),
  "team-form": () => (
    <Canvas>
      <Animal kind="bear" x={98} mood="think" r={[52, -40]} look={6} />
      <Checklist x={158} y={52} w={90} h={108} done={3} rows={4} />
      <Tile x={232} y={118} s={42} icon={Pencil} tone="brand" rot={9} />
    </Canvas>
  ),
  "team-qr": () => (
    <Canvas>
      <Animal kind="tiger" x={72} mood="joy" r={[40, -60]} look={5} s={0.92} />
      <QrCard x={118} y={60} s={78} />
      <Arrow d="M202 100 Q214 88 222 88" />
      <Animal kind="rabbit" x={258} mood="smile" l={[-30, -56]} look={-5} s={0.9}>
        <Phone x={-52} y={-90} w={36} h={62} rot={-6} />
      </Animal>
    </Canvas>
  ),
  "team-approve": () => (
    <Canvas>
      <Animal kind="leopard" x={84} mood="smile" r={[42, -66]} look={5} s={0.95} />
      <Tile x={124} y={50} s={52} icon={KeyRound} tone="accent" rot={-8} />
      <Animal kind="rabbit" x={238} mood="joy" r={[32, -84]} l={[-32, -84]} s={0.9} />
      <Badge x={176} y={134} r={21} icon={Check} tone="good" />
    </Canvas>
  ),
  "team-ask-owner": () => (
    <Canvas>
      <Animal kind="bear" x={80} mood="smile" r={[38, -48]} look={5} s={0.95} />
      <Animal kind="leopard" x={240} mood="think" l={[-30, -34]} look={-5} s={0.95} />
      <Bubble x={104} y={36} w={96} h={54}>
        <Badge x={152} y={63} r={16} icon={KeyRound} tone="accent" solid />
      </Bubble>
    </Canvas>
  ),

  // ───── проект ─────
  "project-plus": () => (
    <Canvas>
      <Animal kind="leopard" x={94} mood="joy" r={[52, -56]} look={6} />
      <PlusButton x={186} y={108} r={30} icon={Plus} />
      <Folder x={222} y={58} w={64} rot={6} />
    </Canvas>
  ),
  "project-client": () => (
    <Canvas>
      <Animal kind="deer" x={94} mood="smile" r={[46, -52]} look={5} />
      <Paper x={152} y={52} w={112} h={108}>
        <circle cx={208} cy={82} r={18} fill="var(--brand-soft)" stroke="var(--primary)" strokeWidth={2.2} />
        <UserRound x={196} y={70} width={24} height={24} color="var(--primary)" strokeWidth={2.2} />
        <Lines x={170} y={112} w={76} n={3} gap={11} />
      </Paper>
    </Canvas>
  ),
  "project-tariff": () => (
    <Canvas>
      <Animal kind="fox" x={72} mood="think" r={[42, -50]} s={0.92} look={6} />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`rotate(${(i - 1) * 6} ${172 + i * 42} 110)`}>
          <rect x={146 + i * 42} y={i === 1 ? 54 : 70} width={52} height={92} rx={9} fill={i === 1 ? "var(--brand-soft)" : "var(--surface)"} stroke={i === 1 ? "var(--primary)" : "var(--muted)"} strokeWidth={i === 1 ? 2.6 : 1.6} />
          <Tag x={160 + i * 42} y={i === 1 ? 66 : 82} width={24} height={24} color="var(--primary)" strokeWidth={2.2} />
          <Lines x={156 + i * 42} y={i === 1 ? 102 : 118} w={32} n={2} gap={9} />
        </g>
      ))}
    </Canvas>
  ),
  "project-team": () => (
    <Canvas>
      <Animal kind="bear" x={78} mood="joy" s={0.82} r={[28, -80]} />
      <Animal kind="rabbit" x={158} mood="smile" s={0.82} />
      <Animal kind="tiger" x={238} mood="joy" s={0.82} l={[-28, -80]} />
      <Coins x={284} y={172} n={2} />
    </Canvas>
  ),
  "project-launch": () => (
    <Canvas>
      <Animal kind="leopard" x={100} mood="joy" r={[34, -92]} l={[-32, -92]} look={3} />
      <Coins x={186} y={168} n={3} />
      <Checklist x={214} y={66} w={66} h={92} done={3} />
      <Badge x={190} y={94} r={17} icon={Check} tone="good" />
    </Canvas>
  ),
  "project-plan": () => (
    <Canvas>
      <Animal kind="panda" x={88} mood="smile" r={[44, -54]} look={5} />
      <CalendarCard x={146} y={52} w={130} h={110} filled={[0, 2, 4, 6, 8, 10, 12, 14]} />
      <Badge x={276} y={146} r={15} icon={Film} tone="brand" solid />
    </Canvas>
  ),

  // ───── поручения ─────
  "give-task": () => (
    <Canvas>
      <Animal kind="leopard" x={92} mood="smile" r={[50, -48]} look={6} />
      <Animal kind="bear" x={232} mood="joy" l={[-50, -48]} look={-6} />
      <Folder x={132} y={88} w={56} rot={-4} />
      <Badge x={160} y={58} r={15} icon={Check} tone="good" />
    </Canvas>
  ),
  "give-content": () => (
    <Canvas>
      <Animal kind="tiger" x={86} mood="smile" r={[46, -56]} look={6} />
      <Tile x={136} y={70} s={54} icon={Clapperboard} tone="brand" rot={-6} />
      <Arrow d="M196 96 Q206 92 214 94" />
      <Animal kind="rabbit" x={258} mood="joy" l={[-32, -56]} look={-5} s={0.9} />
    </Canvas>
  ),
  "give-shoot": () => (
    <Canvas>
      <Animal kind="wolf" x={84} mood="smile" r={[42, -60]} look={5} />
      <CalendarCard x={134} y={70} w={84} h={80} tones={{ 8: "accent" }} />
      <TripodCamera x={262} y={168} />
    </Canvas>
  ),

  // ───── день команды ─────
  "plan-calendar": () => (
    <Canvas>
      <Animal kind="leopard" x={82} mood="think" r={[44, -66]} look={5} />
      <CalendarCard x={140} y={48} w={140} h={116} tones={{ 0: "brand", 1: "accent", 5: "good", 6: "brand", 11: "warn", 12: "accent" }} />
    </Canvas>
  ),
  "plan-load": () => (
    <Canvas>
      <Animal kind="bear" x={84} mood="think" r={[44, -52]} look={5} />
      <Paper x={142} y={52} w={132} h={108}>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle cx={160} cy={74 + i * 32} r={9} fill="var(--brand-soft)" stroke="var(--primary)" strokeWidth={1.8} />
            <rect x={176} y={69 + i * 32} width={86} height={10} rx={5} fill="var(--surface-2)" />
            <rect x={176} y={69 + i * 32} width={[74, 34, 56][i]} height={10} rx={5} fill={i === 0 ? "var(--warn)" : i === 1 ? "var(--good)" : "var(--primary)"} />
          </g>
        ))}
      </Paper>
    </Canvas>
  ),
  "plan-move": () => (
    <Canvas>
      <Animal kind="fox" x={78} mood="smile" r={[44, -60]} look={5} s={0.95} />
      <rect x={132} y={60} width={60} height={88} rx={10} fill="var(--surface-2)" stroke="var(--muted)" strokeWidth={1.6} />
      <rect x={212} y={60} width={60} height={88} rx={10} fill="var(--surface-2)" stroke="var(--muted)" strokeWidth={1.6} />
      <rect x={220} y={72} width={44} height={30} rx={7} fill="var(--accent)" stroke="var(--muted)" strokeWidth={1.6} />
      <rect x={140} y={72} width={44} height={30} rx={7} fill="none" stroke="var(--muted)" strokeWidth={1.8} strokeDasharray="4 4" />
      <Arrow d="M170 118 Q200 138 236 112" />
    </Canvas>
  ),
  "plan-late": () => (
    <Canvas>
      <Animal kind="tiger" x={100} mood="worry" r={[40, -60]} look={5} />
      <Tile x={160} y={56} s={84} icon={AlarmClock} tone="bad" rot={-5} />
      <Badge x={252} y={136} r={18} icon={CircleAlert} tone="bad" />
    </Canvas>
  ),

  // ───── проверка ─────
  "review-where": () => (
    <Canvas>
      <Animal kind="leopard" x={92} mood="smile" r={[44, -50]} look={5} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={158 + i * 7} y={118 - i * 24} width={92} height={34} rx={8} fill={i === 2 ? "var(--brand-soft)" : "var(--surface)"} stroke="var(--muted)" strokeWidth={1.6} />
      ))}
      <Badge x={266} y={72} r={15} icon={Clock} tone="info" />
    </Canvas>
  ),
  "review-open": () => (
    <Canvas>
      <Animal kind="panda" x={90} mood="think" r={[46, -54]} look={5} />
      <Laptop x={150} y={74} w={112}>
        <Film x={188} y={90} width={36} height={36} color="var(--primary)" strokeWidth={2.2} />
      </Laptop>
      <Badge x={262} y={62} r={16} icon={Search} tone="brand" solid />
    </Canvas>
  ),
  "review-accept": () => (
    <Canvas>
      <Animal kind="leopard" x={82} mood="joy" r={[34, -88]} look={5} s={0.95} />
      <Animal kind="bear" x={240} mood="joy" l={[-34, -88]} r={[34, -88]} look={-3} s={0.95} />
      <Badge x={160} y={92} r={30} icon={ThumbsUp} tone="good" />
      <Spark x={160} y={44} />
    </Canvas>
  ),
  "review-return": () => (
    <Canvas>
      <Animal kind="leopard" x={82} mood="think" r={[40, -54]} look={5} s={0.95} />
      <Animal kind="wolf" x={244} mood="worry" look={-5} s={0.95} />
      <Paper x={130} y={84} w={54} h={68} rot={-4}><Lines x={140} y={100} w={34} n={3} gap={11} /></Paper>
      <Arrow d="M186 76 Q210 58 226 74" tone="warn" />
      <Badge x={166} y={62} r={17} icon={RotateCcw} tone="warn" />
    </Canvas>
  ),

  // ───── бухгалтерия ─────
  "money-overview": () => (
    <Canvas>
      <Animal kind="bear" x={84} mood="smile" r={[44, -52]} look={5} />
      <Tile x={144} y={58} s={66} icon={Wallet} tone="brand" rot={-6} />
      <Coins x={240} y={166} n={5} />
    </Canvas>
  ),
  "money-income": () => (
    <Canvas>
      <Animal kind="fox" x={88} mood="joy" r={[46, -46]} look={6} />
      <Coins x={160} y={168} n={3} />
      <Arrow d="M178 110 Q196 90 208 90" />
      <Checklist x={212} y={60} w={68} h={92} done={1} />
    </Canvas>
  ),
  "money-confirm": () => (
    <Canvas>
      <Animal kind="tiger" x={92} mood="think" r={[46, -44]} look={5} />
      <Paper x={150} y={62} w={92} h={98}><Lines x={162} y={78} w={68} n={3} gap={11} /></Paper>
      <circle cx={214} cy={128} r={27} fill="var(--good)" opacity={0.18} />
      <Badge x={214} y={128} r={22} icon={Check} tone="good" />
    </Canvas>
  ),
  "money-expense": () => (
    <Canvas>
      <Animal kind="rabbit" x={98} mood="smile" r={[46, -52]} look={5} />
      <Receipt x={156} y={58} w={64} h={92} rot={-5} />
      <Phone x={232} y={80} w={38} h={70} rot={6}><Tile x={239} y={102} s={24} icon={Camera} tone="brand" /></Phone>
    </Canvas>
  ),
  "money-payroll": () => (
    <Canvas>
      <Animal kind="leopard" x={84} mood="smile" r={[54, -50]} look={6} />
      <Envelope x={130} y={84} w={58} rot={-5} />
      <Animal kind="deer" x={246} mood="joy" l={[-40, -50]} look={-6} s={0.95} />
      <Spark x={160} y={60} s={0.8} />
    </Canvas>
  ),
};

export function Scene({ name }: { name: string }) {
  const render = SCENES[name];
  return render ? <>{render()}</> : null;
}
