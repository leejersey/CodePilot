"use client";

/**
 * 学习趋势折线图 — 基于活动数据的 SVG 折线图
 * 纯 SVG，零依赖
 */
interface ActivityItem { date: string; count: number }

export function TrendChart({ data }: { data: ActivityItem[] }) {
  if (!data || data.length === 0) return null;

  const width = 600;
  const height = 160;
  const padding = { top: 10, right: 10, bottom: 28, left: 35 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map(d => d.count), 1);

  // 生成点坐标
  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1 || 1)) * chartW,
    y: padding.top + chartH - (d.count / maxVal) * chartH,
    ...d,
  }));

  // SVG path
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  // 填充区域
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  // Y 轴刻度
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <div className="glass-panel bg-surface-container/50 rounded-2xl p-5 border border-white/5">
      <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-green-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
        学习趋势
      </h3>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* 网格线 */}
        {yTicks.map(val => {
          const y = padding.top + chartH - (val / maxVal) * chartH;
          return (
            <g key={val}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="rgba(100,116,139,0.15)" strokeDasharray="4 4" />
              <text x={padding.left - 8} y={y + 3} textAnchor="end" fontSize={10} fill="#64748b">{val}</text>
            </g>
          );
        })}

        {/* X 轴标签 */}
        {points.filter((_, i) => i % 7 === 0).map(p => (
          <text key={p.date} x={p.x} y={height - 4} textAnchor="middle" fontSize={9} fill="#64748b">
            {p.date.slice(5)}
          </text>
        ))}

        {/* 渐变定义 */}
        <defs>
          <linearGradient id="trendGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(34,211,238,0.3)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </linearGradient>
        </defs>

        {/* 填充区域 */}
        <path d={areaPath} fill="url(#trendGrad)" />

        {/* 折线 */}
        <path d={linePath} fill="none" stroke="#22d3ee" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* 数据点 */}
        {points.map((p, i) => (
          p.count > 0 && (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3} fill="#0a0f1e" stroke="#22d3ee" strokeWidth={2}>
                <title>{`${p.date}: ${p.count} 次`}</title>
              </circle>
            </g>
          )
        ))}
      </svg>

      <div className="flex items-center justify-between mt-2 text-xs text-slate-600">
        <span>最近 30 天趋势</span>
        <span className="text-green-400 font-medium">
          日均 {(data.reduce((s, d) => s + d.count, 0) / data.length).toFixed(1)} 次
        </span>
      </div>
    </div>
  );
}
