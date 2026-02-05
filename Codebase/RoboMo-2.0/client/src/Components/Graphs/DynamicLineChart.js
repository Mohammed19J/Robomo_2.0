import React, { memo, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  YAxis,
  XAxis,
  Area,
  Tooltip,
} from "recharts";
import { parseAttributeKey } from "../../Utils/StringParser";

// Custom tooltip component - simple and clean
const CustomTooltip = memo(({ active, payload }) => {
  if (active && payload && payload.length) {
    const { value, timestamp } = payload[0].payload;
    const date = new Date(timestamp);
    const formattedDate = date.toLocaleDateString("en-GB");
    const formattedTime = date.toLocaleTimeString("en-GB", { hour12: false });

    return (
      <div className="bg-white border border-gray-300 px-3 py-2 rounded shadow-md z-50">
        <p className="text-sm text-gray-600">{`${formattedDate} ${formattedTime}`}</p>
        <p className="text-base font-semibold text-gray-900">{value}</p>
      </div>
    );
  }
  return null;
});

// Helper function to downsample data for smoother tooltip interaction
const downsampleData = (data, maxPoints = 200) => {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, index) => index % step === 0);
};

const DynamicLineChart = ({
  graphID,
  lastX,
  attributeKey,
  deviceID,
  created,
  values,
  color,
}) => {
  // Memoize the displayed data to prevent recalculation on every render
  const dataToDisplay = useMemo(() => {
    const sliced = values.slice(-lastX);
    // Downsample for smoother tooltip (original data is kept for export)
    return downsampleData(sliced, 200);
  }, [values, lastX]);

  if (!values || values.length === 0) {
    return null;
  }

  // Calculate min/max from original values for accuracy
  const minValue = Math.min(...values.map((d) => d.value));
  const maxValue = Math.max(...values.map((d) => d.value));
  const adjustedMin = minValue === maxValue ? minValue - 1 : minValue;
  const adjustedMax = minValue === maxValue ? maxValue + 1 : maxValue;

  const gradientId = `colorValue-${deviceID}-${graphID}`;
  const areaFillId = `areaFill-${deviceID}-${graphID}`;

  return (
    <div>
      <span className="font-mono rounded-full w-7 h-fit font-bold text-[#304463] items-center justify-center mr-2">
        {graphID + 1})
      </span>
      <span className="font-light mr-2">{deviceID}</span>
      <span className="color-[#304463] mr-2 whitespace-nowrap font-semibold">
        {parseAttributeKey(attributeKey).toUpperCase()} <br />
      </span>
      <span className="text-xs text-gray-500 mr-2 whitespace-nowrap">
        Minium: {minValue}, Maximum: {maxValue}, {lastX} Values
      </span>
      <ResponsiveContainer width="100%" height={100} className="mt-3">
        <AreaChart data={dataToDisplay} margin={{ left: 0, right: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="1%" stopColor={color} stopOpacity={0} />
              <stop offset="30%" stopColor={color} stopOpacity={1} />
              <stop offset="70%" stopColor={color} stopOpacity={1} />
              <stop offset="99%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={areaFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={1} />
              <stop offset="100%" stopColor={color} stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            tickSize={2}
            tick={{ stroke: "#e3e9ee", strokeWidth: 0.5, dy: 0 }}
            tickFormatter={() => "|"}
            interval="preserveStartEnd"
          />
          <YAxis domain={[adjustedMin, adjustedMax]} hide={true} />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: "#304463", strokeWidth: 1, strokeDasharray: "3 3" }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={`url(#${gradientId})`}
            fill={`url(#${areaFillId})`}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-500 mt-3">
        {created} {color}
      </p>
    </div>
  );
};

export default DynamicLineChart;
