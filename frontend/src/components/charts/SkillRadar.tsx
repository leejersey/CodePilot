"use client";

import { Target } from "lucide-react";
import { Card } from "@/components/common/Card";

/**
 * 技能分布柱状图 — 按主题显示掌握度
 * 纯 SVG + CSS 动画
 */
interface Skill { topic: string; total: number; completed: number; mastery: number; attempts?: number }

export function SkillRadar({ data }: { data: Skill[] }) {
  if (!data || data.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-purple-500 dark:text-purple-400" />
          技能图谱与掌握度
        </h3>
        <p className="text-xs text-slate-500 text-center py-8">暂无学习数据，完成章节后将自动汇聚</p>
      </Card>
    );
  }

  const COLORS = [
    { bar: "from-cyan-500 to-cyan-400", bg: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400" },
    { bar: "from-purple-500 to-purple-400", bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400" },
    { bar: "from-amber-500 to-amber-400", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
    { bar: "from-emerald-500 to-emerald-400", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
    { bar: "from-pink-500 to-pink-400", bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400" },
    { bar: "from-blue-500 to-blue-400", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  ];

  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-5">
        <Target className="w-4 h-4 text-purple-500 dark:text-purple-400" />
        技能图谱与掌握度
      </h3>

      <div className="space-y-3">
        {data.map((skill, i) => {
          const color = COLORS[i % COLORS.length];
          const isMastered = skill.mastery >= 100;
          return (
            <div
              key={skill.topic}
              className="group p-2 -mx-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-primary transition-colors">
                    {skill.topic}
                  </span>
                  {isMastered && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold">
                      已精通
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {skill.attempts !== undefined
                      ? `${skill.attempts} 次作答`
                      : `${skill.completed}/${skill.total} 章节`}
                  </span>
                  <span className={`text-xs font-bold ${color.text}`}>{skill.mastery}%</span>
                </div>
              </div>
              <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden border border-slate-200/80 dark:border-white/5 shadow-inner">
                <div
                  className={`h-full bg-gradient-to-r ${color.bar} rounded-full transition-all duration-1000 ease-out shadow-xs`}
                  style={{
                    width: `${skill.mastery}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
