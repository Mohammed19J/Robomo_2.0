import React from "react";

const severityRank = (status = "") => {
  const normalized = status.toLowerCase();
  if (
    normalized.includes("critical") ||
    normalized.includes("poor") ||
    normalized.includes("warning") ||
    normalized.includes("suspicious")
  ) {
    return { level: 2, color: "bg-red-500" };
  }
  if (
    normalized.includes("moderate") ||
    normalized.includes("likely") ||
    normalized.includes("possibly") ||
    normalized.includes("caution")
  ) {
    return { level: 1, color: "bg-yellow-400" };
  }
  if (normalized.includes("unknown") || normalized.includes("uncertain")) {
    return { level: 0, color: "bg-slate-400" };
  }
  return { level: 0, color: "bg-emerald-500" };
};

const DeviceNode = ({ device, index, onClick, style, iconSrc, selected, isDisabled }) => {
  const evaluations = device?.useCaseEvaluations?.evaluations || [];
  const worstEvaluation = evaluations.reduce(
    (acc, item) => {
      const rank = severityRank(item.status);
      return rank.level > acc.level ? rank : acc;
    },
    { level: -1, color: "bg-emerald-500" }
  );

  return (
    <div
      onClick={() => onClick(device)}
      className="cursor-pointer"
      style={{
        position: "absolute",
        width: "46px",
        height: "46px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: "white",
        transition: "transform 0.15s ease, box-shadow 0.15s ease, filter 0.2s ease",
        transform: selected ? "scale(1.3)" : "scale(1)",
        boxShadow: selected ? "0 0 12px rgba(59,130,246,0.7)" : "none",
        borderRadius: "50%",
        backgroundColor: "transparent",
        filter: isDisabled ? "grayscale(100%) opacity(0.5)" : "none",
        ...style,
      }}
    >
      <div
        className={`relative flex items-center justify-center rounded-full border-4 shadow-lg ring-2 ${isDisabled
            ? "bg-gray-500 border-gray-400 ring-gray-400/80"
            : "bg-[#304463] border-white ring-white/80"
          }`}
        style={{ width: selected ? 46 : 40, height: selected ? 46 : 40 }}
      >
        {!isDisabled && (
          <span
            className={`absolute top-[-6px] right-[-6px] w-3 h-3 rounded-full shadow ${worstEvaluation.color}`}
          ></span>
        )}
        {isDisabled && (
          <span
            className="absolute top-[-6px] right-[-6px] w-3 h-3 rounded-full shadow bg-gray-400"
          ></span>
        )}
        {iconSrc ? (
          <div className="w-full h-full rounded-full overflow-hidden bg-transparent">
            <img
              src={iconSrc}
              alt="Sensor marker"
              className={`w-full h-full object-contain pointer-events-none select-none mix-blend-normal ${isDisabled ? "opacity-50" : ""
                }`}
              draggable="false"
            />
          </div>
        ) : (
          index + 1
        )}
      </div>
    </div>
  );
};

export default DeviceNode;
