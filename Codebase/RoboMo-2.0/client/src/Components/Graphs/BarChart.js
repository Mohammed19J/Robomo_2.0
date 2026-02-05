import React from "react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  defs,
  linearGradient,
  stop,
} from "recharts";

const BarChart = ({ data, darkMode }) => {
  const maxValue = Math.round(1.2 * Math.ceil(data.value));
  const gradientId = `gradient-${data.name.replace(/\s+/g, '')}`;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RechartsBarChart data={[data]}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={darkMode ? "#ffffff" : "#304463"} stopOpacity={1} />
            <stop offset="100%" stopColor={darkMode ? "#ffffff" : "#304463"} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="name" fontSize={14} stroke={darkMode ? "#ffffff" : "gray"} />
        <YAxis domain={[maxValue / 2, maxValue]} fontSize={12} stroke={darkMode ? "#ffffff" : "gray"} />
        <Bar
          dataKey="value"
          fill={`url(#${gradientId})`}
          radius={[5, 5, 0, 0]} // This makes the top corners rounded
        />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
};

export default BarChart;
