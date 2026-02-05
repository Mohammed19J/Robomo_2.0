import React, {
  useEffect,
  useState,
  useContext,
  useRef,
  useMemo,
} from "react";
import socket from "../../socket";
import Device from "./Device/Device.js";
import { AppDarkMode } from "../../App";

import ServerSpeedWidget from "../Widgets/ServerSpeedWidget.js";
import ActiveDevicesWidget from "../Widgets/ActiveDevicesWidget.js";
import PinnedAttributeWidget from "../Widgets/PinnedAttributeWidget.js";
import ConnectedClientsWidget from "../Widgets/ConnectedClientsWidget.js";
import UserInfoWidget from "../Widgets/UserInfoWidget.js";
import DeviceCompareScreen from "./DeviceCompare.js";
import Config from "./Config.js";
import MapViewSwitcher from "./MapViewSwitcher";

const TIMESTAMP_KEYS = [
  "observedAt",
  "timestamp",
  "time",
  "dateObserved",
  "dateTime",
  "datetime",
  "ts",
  "lastUpdated",
  "lastUpdate",
  "receivedAt",
  "sampledAt",
];

const LIVE_WINDOW_MINUTES = 45;
const LIVE_WINDOW_MS = LIVE_WINDOW_MINUTES * 60 * 1000;

const toMillis = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") {
    return value > 1e12 ? value : value * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const attributeHasRecentSample = (attr) => {
  if (!attr || typeof attr !== "object") return false;
  for (const key of TIMESTAMP_KEYS) {
    if (!attr[key]) continue;
    const millis = toMillis(attr[key]);
    if (millis && Date.now() - millis <= LIVE_WINDOW_MS) {
      return true;
    }
  }
  return false;
};

const attributeHasValue = (attr) => {
  if (!attr || typeof attr !== "object" || !("value" in attr)) {
    return false;
  }
  const value = attr.value;
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      Boolean(normalized) &&
      !["", "unknown", "n/a", "na", "null"].includes(normalized)
    );
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return false;
};

const deviceHasLiveData = (device) => {
  if (!device || typeof device !== "object") return false;
  const type = (device.type || "").toLowerCase();
  if (!type.includes("sensor")) {
    return false;
  }
  return Object.entries(device).some(([key, attr]) => {
    if (
      ["id", "type", "image", "useCases", "name", "description", "useCaseEvaluations"].includes(
        key
      )
    ) {
      return false;
    }
    if (!attr || typeof attr !== "object") {
      return false;
    }
    if (!attributeHasValue(attr)) {
      return false;
    }
    return attributeHasRecentSample(attr) || typeof attr.value === "number";
  });
};



const Body = () => {
  const [devices, setDevices] = useState([]);
  const [deviceUseCases, setDeviceUseCases] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [panelHidden, setPanelHidden] = useState(true);
  const [disabledDevices, setDisabledDevices] = useState(new Set());

  const darkMode = useContext(AppDarkMode);
  const modelSourceLogRef = useRef(new Map());

  const liveDevices = useMemo(
    () => devices.filter((device) => deviceHasLiveData(device)),
    [devices]
  );

  useEffect(() => {
    // Listen for 'devices' events from the server
    socket.on("devices", (data) => {
      setDevices(data);
      data.forEach((device) => {
        const evaluation = device?.useCaseEvaluations;
        if (!evaluation || !evaluation.model) {
          return;
        }
        const sourceKey =
          evaluation.model === "ml_service" && !evaluation.fallback
            ? "ml"
            : "heuristic";
        const lastSource = modelSourceLogRef.current.get(device.id);
        if (lastSource === sourceKey) {
          return;
        }
        modelSourceLogRef.current.set(device.id, sourceKey);
        const sourceLabel =
          sourceKey === "ml" ? "ML models" : "heuristic evaluation";
        const fallbackNote = evaluation.fallback
          ? " (ML service unavailable, using heuristics)"
          : "";
        console.info(
          `[UseCaseEngine] Device ${device.id} is using ${sourceLabel}${fallbackNote}.`
        );
      });
      // Automatically update the selected device data if it is still in the list
      if (selectedDevice) {
        const updatedDevice = data.find(
          (device) => device.id === selectedDevice.id
        );
        if (updatedDevice) {
          setSelectedDevice(updatedDevice);
        }
      }
    });

    // Listen for 'useCaseValues' events from the server
    socket.on("useCaseValues", (data) => {
      setDeviceUseCases(data);
    });

    // Listen for disabled devices list from server
    socket.on("disabledDevices", (deviceIds) => {
      setDisabledDevices(new Set(deviceIds));
    });

    // Request current disabled devices list on mount
    socket.emit("getDisabledDevices");

    // Cleanup on component unmount
    return () => {
      socket.off("devices");
      socket.off("disabledDevices");
    };
  }, [selectedDevice]);

  useEffect(() => {
    if (
      selectedDevice &&
      !liveDevices.some((device) => device.id === selectedDevice.id)
    ) {
      setSelectedDevice(null);
    }
  }, [selectedDevice, liveDevices]);


  const handleDeviceClick = (device) => {
    setPanelHidden(false);
    setSelectedDevice(device);
  };

  const handleToggleDeviceEnabled = (deviceId) => {
    socket.emit("toggleDeviceEnabled", deviceId);
  };

  const isDeviceDisabled = (deviceId) => disabledDevices.has(deviceId);

  const onExpandCompare = () => {
    setExpanded(true);
  };

  const onToggleExpandCompare = () => {
    if (expanded) {
      console.log("Collapsing");
      // Trigger slide-out animation first
      setAnimate(true);
      setTimeout(() => {
        setExpanded(false);
        setAnimate(false);
      }, 200);
    } else {
      console.log("Expanding");
      setExpanded(true);
    }
  };

  const legendItems = [
    {
      label: "Normal / Information",
      description: "Latest evaluations indicate no issues.",
      colorClass: "bg-emerald-500",
    },
    {
      label: "Caution",
      description: "Monitoring recommended; potential issue detected.",
      colorClass: "bg-yellow-400",
    },
    {
      label: "Alert",
      description: "Immediate attention required for this device.",
      colorClass: "bg-red-500",
    },
    {
      label: "Unknown",
      description: "No recent evaluation data available.",
      colorClass: "bg-slate-400",
    },
  ];


  return (
    <div>
      <div className="flex flex-col md:flex-row gap-4 p-4">
        <UserInfoWidget socket={socket} />
        <PinnedAttributeWidget socket={socket} devices={devices} />

        <ActiveDevicesWidget devices={devices} />
        <ServerSpeedWidget socket={socket} />
      </div>

      <div className="flex flex-col md:flex-row h-[900px] gap-4 p-4">
        <div className="md:w-[18%]">
          <div
            className={`shadow-inner p-4 h-full ${darkMode ? "bg-[#304463] rounded" : "bg-gray-100 rounded"
              }`}
          >
            <div className="flex items-center mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1"
                stroke="currentColor"
                className="size-7 mr-2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 5h12l6 12H9l-6-12Zm3 6h12"
                />
              </svg>
              <h1
                className={`text-lg font-bold tracking-wide ${darkMode ? "text-white" : "text-[#304463]"
                  }`}
              >
                STATUS INDICATOR
              </h1>
            </div>

            <div
              className={`rounded w-full p-5 mb-4 ${darkMode ? "bg-[#50698f]" : "bg-white"
                } shadow-md`}
            >
              <ul
                className={`flex flex-col gap-3 ${darkMode ? "text-gray-100" : "text-gray-700"
                  }`}
              >
                {legendItems.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-start gap-3 text-sm"
                  >
                    <span
                      className={`mt-1 w-3 h-3 rounded-full shadow ${item.colorClass}`}
                    />
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs opacity-80">{item.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <Config socket={socket} deviceUseCases={deviceUseCases} />
          </div>
        </div>

        <div className="flex-1 min-w-[320px] transition-all duration-300">
          {expanded && (
            <div
              className={`absolute shadow-sm md:w-[930px] ${darkMode ? "bg-[#445672]" : "bg-gray-100"
                } h-[868px] p-4 rounded overflow-auto z-50`}
              style={{
                animation: animate
                  ? "slideOut 0.2s ease-out forwards"
                  : "slideIn 0.2s ease-out forwards",
              }}
            >
              <DeviceCompareScreen
                socket={socket}
                onToggleExpand={onToggleExpandCompare}
                devices={devices}
              />
            </div>
          )}
          <MapViewSwitcher
            devices={liveDevices}
            selectedDevice={selectedDevice}
            onDeviceClick={handleDeviceClick}
            darkMode={darkMode}
            isDeviceDisabled={isDeviceDisabled}
          />
        </div>

        <div
          className="relative h-full flex-shrink-0 overflow-visible"
          style={{
            width: panelHidden ? "0px" : "440px",
            transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {panelHidden && (
            <button
              onClick={() => setPanelHidden(false)}
              className={`absolute top-1/2 -translate-y-1/2 z-20 px-4 py-10 rounded-l-xl shadow-2xl transition-all duration-200 hover:px-5 ${darkMode
                ? "bg-[#304463] text-white hover:bg-[#50698f] border-2 border-[#50698f]"
                : "bg-[#304463] text-white hover:bg-[#50698f] border-2 border-[#50698f]"
                }`}
              style={{
                left: '-60px'
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="3"
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </button>
          )}

          <div
            className={`shadow-lg z-10 p-4 h-full overflow-y-auto ${darkMode ? "bg-[#304463] rounded" : "bg-gray-100 rounded"
              }`}
            style={{
              transform: panelHidden ? "translateX(100%)" : "translateX(0)",
              opacity: panelHidden ? 0 : 1,
              transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              pointerEvents: panelHidden ? "none" : "auto",
            }}
          >
            <div className="flex justify-between mb-3 items-center">
              <div className="flex items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1"
                  stroke="currentColor"
                  className="size-7 mr-2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"
                  />
                </svg>
                <h1
                  className={`text-lg text-${darkMode ? "[#ffffff]" : "[#304463]"
                    } font-bold`}
                >
                  DEVICE ATTRIBUTES
                </h1>
              </div>
              <button
                onClick={() => setPanelHidden(true)}
                className={`rounded-lg text-sm px-4 py-2 transition-all duration-200 ${darkMode
                  ? "bg-[#50698f] text-white hover:bg-[#3d5270]"
                  : "text-gray-900 bg-white border border-gray-200 hover:bg-gray-50"
                  }`}
                style={{
                  opacity: selectedDevice ? 1 : 0.35,
                  pointerEvents: selectedDevice === null ? "none" : "auto",
                }}
              >
                Close
              </button>
            </div>
            {selectedDevice ? (
              <Device
                socket={socket}
                onExpandCompare={onExpandCompare}
                device={selectedDevice}
                isDisabled={isDeviceDisabled(selectedDevice.id)}
                onToggleEnabled={() => handleToggleDeviceEnabled(selectedDevice.id)}
              />
            ) : (
              <div className={`w-full p-4 rounded-lg shadow-inner flex gap-3 items-center ${darkMode ? "bg-[#50698f]/30 text-gray-300" : "bg-gray-300 text-gray-700"
                }`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  className="size-6 flex-shrink-0"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
                  />
                </svg>
                Select a device from the map to inspect its attributes.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Body;
