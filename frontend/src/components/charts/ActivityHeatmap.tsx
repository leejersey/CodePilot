"use client";

import { Calendar } from "lucide-react";
import { Card } from "@/components/common/Card";

/**
 * 30 天学习活动热力图 — 类 GitHub 贡献图
 * 纯 SVG，零依赖
 */
interface ActivityItem { date: string; count: number }

export function ActivityHeatmap({ data }: { data: ActivityItem[] }) {
  if (!data || data.length === 0) return null;

  const maxCount = Math.max(...data.map(d => d.count), 1);

  const getColor = (count: number) => {
    if (count === 0) return "rgba(100, 116, 139, 0.15)";
    const intensity = Math.min(count / maxCount, 1);
    if (intensity < 0.25) return "rgba(6, 182, 212, 0.25)";
    if (intensity < 0.5)  return "rgba(6, 182, 212, 0.45)";
    if (intensity < 0.75) return "rgba(6, 182, 212, 0.7)";
    return "rgba(6, 182, 212, 1)";
  };

  const cellSize = 18;
  const gap = 3;
  const cols = Math.min(data.length, 30);
  const rows = 1;
  const svgWidth = cols * (cellSize + gap) - gap;
  const svgHeight = rows * (cellSize + gap) - gap + 24; // extra for labels

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
          学习活动热力图
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
          <span>少</span>
          {[0.15, 0.25, 0.45, 0.7, 1].map((op, i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: i === 0 ? "rgba(100,116,139,0.15)" : `rgba(6,182,212,${op})` }}
            />
          ))}
          <span>多</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg width={svgWidth} height={svgHeight} className="mx-auto">
          {data.map((item, i) => {
            const x = i * (cellSize + gap);
            return (
              <g key={item.date}>
                <rect
                  x={x}
                  y={0}
                  width={cellSize}
                  height={cellSize}
                  rx={4}
                  fill={getColor(item.count)}
                  className="transition-all duration-200 hover:stroke-cyan-400 hover:stroke-1"
                >
                  <title>{`${item.date}: ${item.count} 分钟有效学习`}</title>
                </rect>
                {/* 每 7 天显示一个日期标签 */}
                {i % 7 === 0 && (
                  <text x={x + cellSize / 2} y={cellSize + 16} textAnchor="middle" fontSize={9} fill="#64748b">
                    {item.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
        <span>最近 30 天</span>
        <span className="text-cyan-400 font-mono font-medium">
          {data.reduce((s, d) => s + d.count, 0)} 分钟
        </span>
      </div>
    </Card>
  );
}
