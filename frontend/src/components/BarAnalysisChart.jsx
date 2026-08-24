import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];

  return (
    <div className="chart-tooltip">
      <strong>{item.payload.name}</strong>
      <span>{item.value}% signal strength</span>
    </div>
  );
}

function BarAnalysisChart({ title, description, data }) {
  return (
    <article className="dashboard-chart-card">
      <div className="dashboard-card-top">
        <div>
          <span className="result-label">Bar Analysis</span>
          <h4>{title}</h4>
        </div>
        <span className="chart-mini-pill">Realtime style</span>
      </div>
      <p className="dashboard-chart-copy">{description}</p>

      <div className="dashboard-chart-canvas">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7ef4da" stopOpacity={0.95}></stop>
                <stop offset="100%" stopColor="#57c8ff" stopOpacity={0.65}></stop>
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(183, 235, 255, 0.08)" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(206, 225, 235, 0.72)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(156, 180, 198, 0.8)", fontSize: 12 }}
              domain={[0, 100]}
            />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTooltip />} />
            <Bar dataKey="value" fill="url(#barFill)" radius={[10, 10, 4, 4]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export default BarAnalysisChart;

