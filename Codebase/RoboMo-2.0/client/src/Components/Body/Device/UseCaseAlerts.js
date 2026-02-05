import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

const statusStyles = [
  {
    match: (status) =>
      ["critical", "alarm", "poor", "warning", "suspicious"].some((keyword) =>
        status.toLowerCase().includes(keyword)
      ),
    dot: "bg-red-500 animate-pulse",
    chip: "bg-red-100 text-red-700",
  },
  {
    match: (status) =>
      ["moderate", "likely", "caution", "possibly"].some((keyword) =>
        status.toLowerCase().includes(keyword)
      ),
    dot: "bg-yellow-400",
    chip: "bg-yellow-100 text-yellow-700",
  },
  {
    match: (status) =>
      ["unknown", "uncertain"].some((keyword) =>
        status.toLowerCase().includes(keyword)
      ),
    dot: "bg-slate-400",
    chip: "bg-slate-200 text-slate-700",
  },
  {
    match: (status) =>
      ["excellent", "good", "normal", "vacant", "healthy", "idle"].some((keyword) =>
        status.toLowerCase().includes(keyword)
      ),
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-700",
  },
  {
    match: () => true,
    dot: "bg-blue-500",
    chip: "bg-blue-100 text-blue-700",
  },
];

const resolveStyle = (status) => {
  for (const style of statusStyles) {
    if (style.match(status)) {
      return style;
    }
  }
  return statusStyles[statusStyles.length - 1];
};

const Tooltip = ({ item, style, triggerRef }) => {
  const [position, setPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!triggerRef?.current) return;

    const updatePosition = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      // Position tooltip to the left of the trigger
      setPosition({
        top: rect.top + rect.height / 2,
        right: window.innerWidth - rect.left + 16,
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [triggerRef]);

  if (!item) return null;

  const { inputs, details, status, score, countRange } = item;
  const issues = details?.issues || [];
  const recommendation = details?.recommendation;

  // Filter relevant inputs based on featuresUsed if available, otherwise show all non-null numeric inputs
  const relevantInputs = Object.entries(inputs || {}).filter(([key, value]) => {
    if (key === "timestamp" || key === "device_id") return false;
    if (item.featuresUsed && item.featuresUsed.length > 0) {
      return item.featuresUsed.includes(key);
    }
    return typeof value === "number";
  });

  const formatValue = (key, value) => {
    if (typeof value !== "number") return value;
    if (key === "co2") return `${Math.round(value)} ppm`;
    if (key === "voc") return `${Math.round(value)} ppb`;
    if (key === "rh") return `${value.toFixed(1)}%`;
    if (key === "temp_c") return `${value.toFixed(1)}°C`;
    if (key.startsWith("pm")) return `${value.toFixed(1)} µg/m³`;
    return value.toFixed(2);
  };

  const formatKey = (key) => {
    if (key === "co2") return "CO₂";
    if (key === "voc") return "VOC";
    if (key === "rh") return "Humidity";
    if (key === "temp_c") return "Temp";
    if (key === "pm25") return "PM2.5";
    if (key === "pm10") return "PM10";
    if (key === "pm1") return "PM1.0";
    return key.charAt(0).toUpperCase() + key.slice(1);
  };

  const tooltipContent = (
    <div
      className="fixed z-[9999] w-96 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border-2 border-slate-300 dark:border-slate-600 p-5 text-left pointer-events-none"
      style={{
        top: `${position.top}px`,
        right: `${position.right}px`,
        transform: "translateY(-50%)",
      }}
    >
      <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">
        <span className={`font-bold text-base ${style.chip.replace("bg-", "text-").split(" ")[1]}`}>
          {status}
        </span>
        <span className="text-sm font-mono text-slate-500">
          {item.key === "occupancy" && countRange
            ? `Count: ${countRange}`
            : score !== null
              ? `Score: ${score}`
              : ""}
        </span>
      </div>

      {relevantInputs.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Current Readings
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {relevantInputs.map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">{formatKey(key)}:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {formatValue(key, value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">
            Issues Detected
          </h4>
          <ul className="list-disc list-inside text-sm text-slate-700 dark:text-slate-300 space-y-0.5">
            {issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {recommendation && (
        <div>
          <h4 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">
            Action Required
          </h4>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {recommendation}
          </p>
        </div>
      )}
    </div>
  );

  return createPortal(tooltipContent, document.body);
};

const UseCaseAlerts = ({ evaluations }) => {
  const [hoveredItem, setHoveredItem] = useState(null);
  const triggerRefs = useRef({});

  if (!evaluations || !Array.isArray(evaluations.evaluations)) {
    return null;
  }

  return (
    <div className="mb-4 border border-slate-200 dark:border-slate-600 rounded-md p-3 bg-white/70 dark:bg-slate-700/40 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Use Case Status
        </h3>
        <span className="text-[11px] text-slate-400">
          {evaluations.generatedAt
            ? new Date(evaluations.generatedAt).toLocaleTimeString()
            : "--:--"}
        </span>
      </div>
      <div className="space-y-2">
        {evaluations.evaluations.map((item) => {
          const styles = resolveStyle(item.status || "");
          return (
            <div
              key={item.key}
              className="flex items-center justify-between gap-3 text-sm relative"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${styles.dot}`}
                />
                <span className="text-slate-600 dark:text-slate-100 truncate">
                  {item.title}
                </span>
              </div>
              <div className="flex items-center gap-2 relative flex-shrink-0">
                {item.score !== undefined && item.score !== null && (
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                    {item.key === "occupancy" && item.countRange
                      ? `Count ${item.countRange}`
                      : `Score ${item.score}`}
                  </span>
                )}
                <div
                  ref={(el) => {
                    triggerRefs.current[item.key] = { current: el };
                  }}
                  className="relative"
                  onMouseEnter={() => setHoveredItem(item.key)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <span
                    className={`text-xs px-2 py-1 rounded ${styles.chip} whitespace-nowrap cursor-help`}
                  >
                    {item.status}
                  </span>
                  {hoveredItem === item.key && (
                    <Tooltip item={item} style={styles} triggerRef={triggerRefs.current[item.key]} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UseCaseAlerts;
