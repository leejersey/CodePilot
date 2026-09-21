"use client";

export type ConceptMapTone = "active" | "completed" | "locked";

export interface ConceptMapSkill {
  id: string;
  title: string;
  goal?: string | null;
}

interface Props {
  hubLabel: string;
  skills: ConceptMapSkill[];
  tone?: ConceptMapTone;
  className?: string;
}

const TONE = {
  active: {
    hubBg: "bg-sky-500/15 dark:bg-sky-400/15",
    hubBorder: "border-sky-400/70 dark:border-sky-300/60",
    hubText: "text-sky-800 dark:text-sky-100",
    nodeBg: "bg-violet-500/10 dark:bg-violet-400/12",
    nodeBorder: "border-violet-400/50 dark:border-violet-300/40",
    nodeText: "text-violet-900 dark:text-violet-100",
    line: "stroke-violet-400/45 dark:stroke-violet-300/35",
  },
  completed: {
    hubBg: "bg-emerald-500/15 dark:bg-emerald-400/15",
    hubBorder: "border-emerald-400/70 dark:border-emerald-300/55",
    hubText: "text-emerald-800 dark:text-emerald-100",
    nodeBg: "bg-emerald-500/10 dark:bg-emerald-400/10",
    nodeBorder: "border-emerald-400/45 dark:border-emerald-300/35",
    nodeText: "text-emerald-900 dark:text-emerald-100",
    line: "stroke-emerald-400/40 dark:stroke-emerald-300/30",
  },
  locked: {
    hubBg: "bg-slate-400/10 dark:bg-slate-500/15",
    hubBorder: "border-slate-400/40 dark:border-slate-500/40",
    hubText: "text-slate-600 dark:text-slate-400",
    nodeBg: "bg-slate-400/8 dark:bg-slate-500/10",
    nodeBorder: "border-slate-400/30 dark:border-slate-500/30",
    nodeText: "text-slate-500 dark:text-slate-500",
    line: "stroke-slate-400/35 dark:stroke-slate-500/30",
  },
} as const;

function cleanTitle(text: string): string {
  return text.replace(/\*+/g, "").trim();
}

const MAX_SKILLS = 6;
const BRANCH_H = 36;
const BRANCH_GAP = 8;
const HUB_W = 52;
const RAIL_X = 28;
const LABEL_X = 56;

export function ChapterConceptMap({
  hubLabel,
  skills,
  tone = "active",
  className = "",
}: Props) {
  const palette = TONE[tone];
  const nodes = skills.slice(0, MAX_SKILLS).map((s) => ({
    ...s,
    title: cleanTitle(s.title),
  }));

  if (nodes.length === 0) {
    return (
      <div
        className={`rounded-xl border border-dashed border-slate-300/60 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] px-3 py-4 text-center text-[11px] text-slate-500 ${className}`}
      >
        暂无技能拆分
      </div>
    );
  }

  const mapH =
    nodes.length * BRANCH_H + Math.max(0, nodes.length - 1) * BRANCH_GAP;
  const svgW = LABEL_X + 8;
  const centers = nodes.map((_, i) => i * (BRANCH_H + BRANCH_GAP) + BRANCH_H / 2);
  const spineTop = centers[0]!;
  const spineBottom = centers[centers.length - 1]!;

  return (
    <div
      className={`pointer-events-none select-none ${className}`}
      role="img"
      aria-label={`本章知识导图：${hubLabel}，含 ${nodes.length} 个技能`}
    >
      <div className="flex items-center gap-1">
        <div
          className={`flex h-11 shrink-0 items-center justify-center rounded-xl border text-[11px] font-bold ${palette.hubBg} ${palette.hubBorder} ${palette.hubText}`}
          style={{ width: HUB_W }}
        >
          {cleanTitle(hubLabel).slice(0, 4) || "本章"}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: mapH }}>
            <svg
              className={`absolute inset-y-0 left-0 h-full ${palette.line}`}
              width={svgW}
              height={mapH}
              aria-hidden
            >
              <line
                x1={0}
                y1={mapH / 2}
                x2={RAIL_X}
                y2={mapH / 2}
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              {nodes.length > 1 && (
                <line
                  x1={RAIL_X}
                  y1={spineTop}
                  x2={RAIL_X}
                  y2={spineBottom}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              )}
              {centers.map((cy, i) => (
                <line
                  key={nodes[i]!.id}
                  x1={RAIL_X}
                  y1={cy}
                  x2={LABEL_X}
                  y2={cy}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              ))}
            </svg>

            <ul className="absolute inset-y-0 right-0 left-[56px] flex flex-col" style={{ gap: BRANCH_GAP }}>
              {nodes.map((skill) => (
                <li
                  key={skill.id}
                  className={`flex h-9 items-center rounded-lg border px-2.5 ${palette.nodeBg} ${palette.nodeBorder}`}
                  style={{ height: BRANCH_H }}
                  title={skill.goal ? `${skill.title} — ${skill.goal}` : skill.title}
                >
                  <span
                    className={`line-clamp-2 text-left text-[11px] font-semibold leading-tight ${palette.nodeText}`}
                  >
                    {skill.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {skills.length > MAX_SKILLS && (
        <p className="mt-1.5 pl-[60px] text-[10px] text-slate-500">
          另有 {skills.length - MAX_SKILLS} 项技能进入章节后可见
        </p>
      )}
    </div>
  );
}
