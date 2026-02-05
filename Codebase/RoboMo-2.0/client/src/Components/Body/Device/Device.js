import React, { useContext, useState, useRef } from "react";
import DeviceAttribute from "./DeviceAttribute";
import UseCaseAlerts from "./UseCaseAlerts";
import BarChart from "../../Graphs/BarChart";
import { AppDarkMode } from "../../../App";
import { parseAttributeID } from "../../../Utils/StringParser";
import { isInt, isFloat } from "../../../Utils/NumParser";

const Device = ({ socket, onExpandCompare, device, isDisabled, onToggleEnabled }) => {
  const [openMenuKey, setOpenMenuKey] = useState(null); // Track the open menu
  const scrollableRef = useRef(null); // Ref to the scrollable container
  const darkMode = useContext(AppDarkMode);

  const handleMenuToggle = (key) => {
    setOpenMenuKey(openMenuKey === key ? null : key); // Toggle the menu
  };

  // Prepare data for the chart
  const chartData = Object.keys(device)
    .filter((key) => key.toLowerCase().includes("value"))

    .map((key) => {
      return {
        name: key,
        value: JSON.parse(JSON.stringify(device[key])).value,
      };
    })
    .filter((item) => item !== null);
  const chartRowWidth = Math.max(chartData.length * 140, 420);

  return (
    <div className="z-20 flex flex-col gap-2 h-[82vh]">
      {/* Device Enable/Disable Toggle */}
      <div
        className={`flex items-center justify-between p-3 rounded-lg mb-2 ${darkMode ? "bg-[#50698f]/50" : "bg-white border border-gray-200"
          }`}
      >
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className={`w-5 h-5 ${isDisabled ? "text-gray-400" : "text-emerald-500"}`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9"
            />
          </svg>
          <span className={`text-sm font-medium ${darkMode ? "text-white" : "text-gray-700"}`}>
            {isDisabled ? "Device Disabled" : "Device Enabled"}
          </span>
        </div>
        <button
          onClick={onToggleEnabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${isDisabled
              ? darkMode ? "bg-gray-600" : "bg-gray-300"
              : "bg-emerald-500"
            }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${isDisabled ? "translate-x-1" : "translate-x-6"
              }`}
          />
        </button>
      </div>

      <UseCaseAlerts evaluations={device.useCaseEvaluations} />
      {/* Attributes Section */}
      <div
        ref={scrollableRef}
        className="overflow-auto rounded flex-1 relative"
      >
        <div className="grid grid-cols-2 gap-1 auto-rows-auto">
          <DeviceAttribute
            key={"type"}
            socket={socket} // Pass the socket to the attribute
            attributeKey={"Device"}
            attributeValue={[parseAttributeID(device.id), " ", device.type]}
            isMenuOpen={openMenuKey === "type"}
            onToggleMenu={() => handleMenuToggle("type")}
            onCloseMenu={() => setOpenMenuKey(null)}
          />
          {Object.keys(device)
            .sort((a, b) => {
              // Ensure 'image' is always last in the sorted order
              if (a === "image") return 1; // Put 'a' after 'b'
              if (b === "image") return -1; // Put 'b' after 'a'
              return a.localeCompare(b); // Otherwise, compare normally
            })
            .map((key) => {
              const value = JSON.parse(JSON.stringify(device[key])).value;
              const isValidValue = isInt(value) || isFloat(value);
              ////////
              if (key === "type" || key === "id" || key === "image") return null; // Skip the type and id attribute
              ////////
              return (
                <DeviceAttribute
                  key={key}
                  socket={socket} // Pass the socket to each attribute
                  deviceID={parseAttributeID(device.id)}
                  fullDeviceID={device.id}
                  deviceType={device.type}
                  attributeKey={key}
                  attributeType={JSON.parse(JSON.stringify(device[key])).type}
                  attributeValue={
                    (() => {
                      const attr = JSON.parse(JSON.stringify(device[key]));
                      if (attr.object) {
                        return Array.isArray(attr.object) ? attr.object.join(', ') : String(attr.object);
                      }
                      return attr.value;
                    })()
                  }
                  isMenuOpen={openMenuKey === key}
                  onToggleMenu={() => handleMenuToggle(key)}
                  onCloseMenu={() => setOpenMenuKey(null)}
                  onExpandCompare={onExpandCompare}
                  isValidValue={isValidValue}
                />
              );
            })}
        </div>
      </div>
      {/* Charts Section */}
      {device.type.includes("Sensor") && chartData.length > 0 && (
        <div
          className="w-full mt-4 rounded-lg p-3 overflow-x-auto overflow-y-hidden shrink-0 custom-scrollbar"
          style={{
            backgroundColor: darkMode ? "rgba(34, 50, 71, 0.4)" : "rgba(255,255,255,0.8)",
            scrollbarWidth: "auto",
          }}
        >
          <div
            className="flex gap-6"
            style={{ minWidth: `${chartRowWidth}px` }}
          >
            {chartData.map((data, index) => (
              <div key={index} className="w-32 min-w-[8rem]">
                <BarChart data={data} darkMode={darkMode} />
              </div>
            ))}
          </div>
          <style>{`
            .custom-scrollbar {
              scrollbar-width: thin;
              scrollbar-color: ${darkMode ? '#50698f #304463' : '#ccc #f5f5f5'};
            }
            .custom-scrollbar::-webkit-scrollbar {
              height: 8px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: ${darkMode ? '#304463' : '#f5f5f5'};
              border-radius: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: ${darkMode ? '#50698f' : '#ccc'};
              border-radius: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: ${darkMode ? '#6b7fa6' : '#999'};
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default Device;
