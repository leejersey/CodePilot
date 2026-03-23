"use client";

/**
 * 技能分布柱状图 — 按主题显示掌握度
 * 纯 SVG + CSS 动画
 */
interface Skill { topic: string; total: number; completed: number; mastery: number }

export function SkillRadar({ data }: { data: Skill[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="glass-panel bg-surface-container/50 rounded-2xl p-5 border border-white/5">
        <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-purple-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>radar</span>
          技能分布
        </h3>
        <p className="text-xs text-slate-600 text-center py-6">暂无学习数据</p>
      </div>
    );
  }

  const COLORS = [
    { bar: "from-cyan-500 to-cyan-400", bg: "bg-cyan-500/10", text: "text-cyan-400" },
    { bar: "from-purple-500 to-purple-400", bg: "bg-purple-500/10", text: "text-purple-400" },
    { bar: "from-amber-500 to-amber-400", bg: "bg-amber-500/10", text: "text-amber-400" },
    { bar: "from-green-500 to-green-400", bg: "bg-green-500/10", text: "text-green-400" },
    { bar: "from-pink-500 to-pink-400", bg: "bg-pink-500/10", text: "text-pink-400" },
    { bar: "from-blue-500 to-blue-400", bg: "bg-blue-500/10", text: "text-blue-400" },
  ];

  return (
    <div className="glass-panel bg-surface-container/50 rounded-2xl p-5 border border-white/5">
      <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-5">
        <span className="material-symbols-outlined text-purple-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>radar</span>
        技能分布
      </h3>

      <div className="space-y-4">
        {data.map((skill, i) => {
          const color = COLORS[i % COLORS.length];
          return (
            <div key={skill.topic}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-on-surface-variant">{skill.topic}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-600">
                    {skill.completed}/{skill.total} 章节
                  </span>
                  <span className={`text-xs font-bold ${color.text}`}>{skill.mastery}%</span>
                </div>
              </div>
              <div className="w-full h-2.5 bg-surface-container-low rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${color.bar} rounded-full transition-all duration-1000 ease-out`}
                  style={{
                    width: `${skill.mastery}%`,
                    animation: "grow-bar 1s ease-out",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes grow-bar {
          from { width: 0%; }
        }
      `}</style>
    </div>
  );
}
