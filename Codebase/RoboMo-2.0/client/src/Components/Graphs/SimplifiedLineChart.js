import React from 'react';
import { ResponsiveContainer, AreaChart, YAxis, Area } from 'recharts';

const SimplifiedLineChart = ({ transferSpeeds }) => {
  if (transferSpeeds.length === 0) {
    return null; // Return null if there is no data
  }

  // Calculate the minimum and maximum speed
  const minSpeed = Math.min(...transferSpeeds.map((d) => d.speed));
  const maxSpeed = Math.max(...transferSpeeds.map((d) => d.speed));

  // Ensure there is a slight difference if minSpeed and maxSpeed are the same
  const adjustedMin = minSpeed === maxSpeed ? minSpeed - 1 : minSpeed;
  const adjustedMax = minSpeed === maxSpeed ? maxSpeed + 1 : maxSpeed;

  return (
    <ResponsiveContainer width="100%" height={45}>
      <AreaChart data={transferSpeeds} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorSpeed" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#304463" stopOpacity={1} />
            <stop offset="100%" stopColor="#304463" stopOpacity={1} />
          </linearGradient>
          {/* <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#304463" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#304463" stopOpacity={0.2} />
          </linearGradient> */}
        </defs>
        <YAxis domain={[adjustedMin, adjustedMax]} hide={true} />
        {/* <Tooltip 
          formatter={(value) => `${value}`} 
          labelStyle={{ display: 'none' }} 
        /> */}
        <Area
          type="monotone"
          dataKey="speed"
          stroke="url(#colorSpeed)" // Apply gradient to the stroke
          strokeWidth={2}
          fillOpacity={0}
          fill="none"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default SimplifiedLineChart;
