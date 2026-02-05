import React, { useContext, useState, useEffect } from "react";
import { AppDarkMode } from "../../App";
import { AuthContext } from "../../Contexts/AuthContext";
import DynamicLineChart from "../Graphs/DynamicLineChart";
import { parseAttributeKey } from "../../Utils/StringParser";
import { ColorPicker } from "antd";

import * as XLSX from "xlsx";

const DeviceCompareScreen = ({ socket, onToggleExpand, devices = [] }) => {
  const darkMode = useContext(AppDarkMode);
  const { user } = useContext(AuthContext);

  // State for filtering options
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState(
    new Date().toISOString().slice(11, 16)
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [lastXValues, setLastXValues] = useState(1000);
  const [selectedGraphColor, setSelectedGraphColor] = useState("#304463");

  const [deviceID, setDeviceID] = useState("");
  const [fullDeviceID, setFullDeviceID] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [attributeKey, setAttributeKey] = useState("");
  const [attributeValue, setAttributeValue] = useState("");

  const [errorMessage, setErrorMessage] = useState("");

  // State to store the graphs
  const [graphs, setGraphs] = useState([]);

  // Loading state to handle spinner visibility
  const [loading, setLoading] = useState(false);

  // Compare mode states
  const [showCompareSelector, setShowCompareSelector] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);

  // Icon map for sensors with custom icons (same as Map2D.jsx)
  const SENSOR_ICON_MAP = {
    "urn:ngsi-ld:AirQualitySensor:GMW87:001": "/robot.png",
    "urn:ngsi-ld:AirQualitySensor:GMW87:002": "/welding-mask.png",
    "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:002": "/3d-printer.png",
    "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:003": "/machine.png",
  };

  // Attribute equivalence groups - attributes that measure the same thing but have different names
  const ATTRIBUTE_EQUIVALENCE = {
    // CO2 measurements
    co2_value: ["co2_value", "SCD41_CO2_value"],
    SCD41_CO2_value: ["co2_value", "SCD41_CO2_value"],
    // Humidity measurements
    humidity_value: ["humidity_value", "SCD41_humidity_value"],
    SCD41_humidity_value: ["humidity_value", "SCD41_humidity_value"],
    // Temperature measurements
    temperature_value: ["temperature_value", "SCD41_temperature_value"],
    SCD41_temperature_value: ["temperature_value", "SCD41_temperature_value"],
    // PM measurements (only on some sensors)
    Sen5X_pm1p0_value: ["Sen5X_pm1p0_value"],
    Sen5X_pm2p5_value: ["Sen5X_pm2p5_value"],
    Sen5X_pm4p0_value: ["Sen5X_pm4p0_value"],
    Sen5X_pm10p0_value: ["Sen5X_pm10p0_value"],
    // VOC/NOx (only on some sensors)
    Sen5X_voc_index_value: ["Sen5X_voc_index_value"],
    Sen5X_nox_index_value: ["Sen5X_nox_index_value"],
  };

  // Get equivalent attributes for current attribute
  const getEquivalentAttributes = (attrKey) => {
    return ATTRIBUTE_EQUIVALENCE[attrKey] || [attrKey];
  };

  // Check if device has any equivalent attribute
  const deviceHasEquivalentAttribute = (device, attrKey) => {
    const equivalents = getEquivalentAttributes(attrKey);
    return equivalents.some((eqAttr) => device[eqAttr] !== undefined);
  };

  // Get the matching attribute key for a device
  const getMatchingAttributeKey = (device, attrKey) => {
    const equivalents = getEquivalentAttributes(attrKey);
    return equivalents.find((eqAttr) => device[eqAttr] !== undefined) || attrKey;
  };

  // Get comparable devices (has icon in SENSOR_ICON_MAP, same type, not current device, has equivalent attribute, not already in graphs)
  const comparableDevices = devices.filter((d) => {
    // Must have an icon in the icon map
    const hasIcon = SENSOR_ICON_MAP[d.id] !== undefined;
    // Must be same device type
    const sameType = d.type === deviceType;
    // Must not be current device
    const notCurrent = d.id !== fullDeviceID;
    // Must have an equivalent attribute (not exact match required)
    const hasEquivalentAttribute = deviceHasEquivalentAttribute(d, attributeKey);
    // Must not already be in the graphs (prevent duplicates)
    const notAlreadyInGraphs = !graphs.some(
      (g) => g.fullDeviceID === d.id || d.id.endsWith(`:${g.deviceID}`)
    );
    return hasIcon && sameType && notCurrent && hasEquivalentAttribute && notAlreadyInGraphs;
  });

  // Helper to get device name from ID
  const getDeviceDisplayName = (deviceId) => {
    // Extract the meaningful part like "GMW87:001"
    const parts = deviceId.split(":");
    return parts.length >= 2 ? `${parts[parts.length - 2]}:${parts[parts.length - 1]}` : parts.pop();
  };

  // Function to fetch comparison graph for a selected device
  const fetchComparisonGraph = (compareDevice) => {
    if (!startDate || !startTime || !endDate || !endTime) {
      setErrorMessage("Generate a graph first to set the time range.");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    // Check if already in graphs (extra safety)
    const alreadyExists = graphs.some(
      (g) => g.fullDeviceID === compareDevice.id || compareDevice.id.endsWith(`:${g.deviceID}`)
    );
    if (alreadyExists) {
      setErrorMessage("This sensor is already in the comparison.");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    setCompareLoading(true);
    setShowCompareSelector(false);

    const startDateTime = new Date(`${startDate}T${startTime}`);
    const endDateTime = new Date(`${endDate}T${endTime}`);
    const lastX = parseInt(lastXValues);

    // Get the matching attribute key for this device (may be different name but equivalent)
    const compareAttributeKey = getMatchingAttributeKey(compareDevice, attributeKey);

    // Generate a random color for the comparison graph
    const colors = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#f39c12", "#1abc9c"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    socket.emit("graphFilterData", {
      deviceID: compareDevice.id,
      deviceType: compareDevice.type,
      attributeKey: compareAttributeKey, // Use the matching attribute key for this device
      startDateTime,
      endDateTime,
      lastX,
      color: randomColor,
    });

    socket.once("graphFilteredData", (data) => {
      if (!data.values || data.values.length === 0) {
        setErrorMessage(`No data for ${getDeviceDisplayName(compareDevice.id)}`);
        setTimeout(() => setErrorMessage(""), 3000);
        setCompareLoading(false);
        return;
      }

      const graphData = {
        deviceID: getDeviceDisplayName(compareDevice.id),
        fullDeviceID: compareDevice.id,
        deviceType: compareDevice.type,
        attributeKey: compareAttributeKey, // Use the actual attribute key from this device
        createdAt: new Date(),
        startDateTime,
        endDateTime,
        lastX,
        color: randomColor,
        values: data.values,
      };

      setGraphs((prevGraphs) => [
        { id: `temp-${Date.now()}`, ...graphData },
        ...prevGraphs,
      ]);
      setCompareLoading(false);
    });

    socket.once("error", () => {
      setErrorMessage("Failed to fetch comparison data.");
      setTimeout(() => setErrorMessage(""), 3000);
      setCompareLoading(false);
    });
  };

  const submitGraphFilter = async () => {
    const startDateTime = new Date(`${startDate}T${startTime}`);
    const endDateTime = new Date(`${endDate}T${endTime}`);
    const lastX = parseInt(lastXValues);

    // Validation
    const missingFields = [];
    if (!deviceID) missingFields.push("deviceID");
    if (!deviceType) missingFields.push("deviceType");
    if (!attributeKey) missingFields.push("attributeKey");
    if (!startDate) missingFields.push("startDate");
    if (!startTime) missingFields.push("startTime");
    if (!endDate) missingFields.push("endDate");
    if (!endTime) missingFields.push("endTime");
    if (!lastXValues) missingFields.push("lastXValues");

    // Highlight missing fields
    if (missingFields.length > 0) {
      // Display error message
      setErrorMessage(`You must fill in all fields to generate a graph`);

      // Clear the error message after 2 seconds
      setTimeout(() => {
        setErrorMessage("");
      }, 2000);

      // Highlight missing fields by adding a red border dynamically
      missingFields.forEach((field) => {
        const input = document.querySelector(`#${field}`); // Correct template string usage
        if (input) input.classList.add("border-red-500", "animate-shake");
      });

      // Remove the red border after 400ms
      setTimeout(() => {
        missingFields.forEach((field) => {
          const input = document.querySelector(`#${field}`);
          if (input) input.classList.remove("border-red-500", "animate-shake");
        });
      }, 1000);

      return; // Stop execution
    }

    setLoading(true);
    // Note: userId is obtained when saving (in exportToExcel), not here

    // Emit the filter data to the server via Socket.io
    socket.emit("graphFilterData", {
      deviceID: fullDeviceID || deviceID,
      deviceType,
      attributeKey,
      startDateTime,
      endDateTime,
      lastX,
      color: selectedGraphColor,
    });

    // Use `socket.once` to ensure the listener is executed only once per emit
    socket.once("graphFilteredData", async (data) => {
      // Check if data values are empty
      if (!data.values || data.values.length === 0) {
        setErrorMessage("No data available for the selected range/device.");
        setTimeout(() => setErrorMessage(""), 3000);
        setLoading(false);
        return;
      }

      const graphData = {
        deviceID,
        deviceType,
        attributeKey,
        createdAt: new Date(),
        startDateTime,
        endDateTime,
        lastX,
        color: selectedGraphColor,
        values: data.values, // Graph values received from the server
      };

      // Add graph to local state immediately (not saved to DB yet - user must click Export)
      setGraphs((prevGraphs) => [
        { id: `temp-${Date.now()}`, ...graphData },
        ...prevGraphs,
      ]);
      setLoading(false);
    });

    // Handle errors from the server
    socket.once("error", (error) => {
      console.error("Error received from server:", error.message);
      setErrorMessage("Failed to generate graph. Please try again.");
      setLoading(false); // Stop the loading spinner
    });
  };

  const loadUserGraphs = async () => {
    const userId = user ? user.id : null;
    if (!userId) {
      setErrorMessage("You must be logged in to load graphs");
      return;
    }
    // Load graphs for the currently selected device and attribute (use short deviceID as saved)
    socket.emit("getUserGraphs", { userId, deviceID, attributeKey });
  };

  // Listen for the filtered data from the server
  useEffect(() => {
    socket.on("selectedDeviceData", (data) => {
      // Handle received data here
      console.log("Selected Device Data:", data);
      setDeviceID(data.deviceID);
      setFullDeviceID(data.fullDeviceID || data.deviceID);
      setDeviceType(data.deviceType);
      setAttributeKey(data.attributeKey);
      setAttributeValue(data.attributeValue);
    });

    socket.on("error", (error) => {
      console.error("Error received from server:", error.message);
      // Only show error if loading (context specific)
      if (loading) {
        setErrorMessage(`Error: ${error.message}`);
        setTimeout(() => {
          setErrorMessage("");
        }, 2000);
        setLoading(false);
      }
    });

    // Listen for graphSaved confirmation - update temp ID with real ID
    socket.on("graphSaved", (savedGraph) => {
      console.log("Graph saved successfully:", savedGraph);
      // Update the temp ID with the real MongoDB ID instead of adding a duplicate
      setGraphs((prevGraphs) =>
        prevGraphs.map((g) =>
          g.id && g.id.startsWith("temp-") && g.deviceID === savedGraph.deviceID && g.attributeKey === savedGraph.attributeKey
            ? { ...g, id: savedGraph.id, _id: savedGraph.id }
            : g
        )
      );
    });

    // Listen for userGraphsRetrieved
    socket.on("userGraphsRetrieved", (loadedGraphs) => {
      if (!loadedGraphs || loadedGraphs.length === 0) {
        setErrorMessage(`You have no saved graphs`);
        setTimeout(() => {
          setErrorMessage("");
        }, 2000);
      } else {
        console.log("Loaded user graphs:", loadedGraphs);
        setGraphs(loadedGraphs);
      }
    });

    // Listen for userGraphDeleted
    socket.on("userGraphDeleted", ({ graphId }) => {
      setGraphs((prevGraphs) =>
        prevGraphs.filter((g) => g._id !== graphId && g.id !== graphId)
      );
    });

    // Cleanup the socket listener when the component unmounts
    // Note: Do NOT clean up "graphFilteredData" here - it's handled by socket.once in submitGraphFilter
    return () => {
      socket.off("error");
      socket.off("selectedDeviceData");
      socket.off("graphSaved");
      socket.off("userGraphsRetrieved");
      socket.off("userGraphDeleted");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, selectedGraphColor]);

  const removeGraph = async (indexToRemove) => {
    const userId = user ? user.id : null;
    const graphToRemove = graphs[indexToRemove];

    // Support both _id (mongoose) and id (legacy/optimistic)
    const graphId = graphToRemove._id || graphToRemove.id;

    if (graphId && userId) {
      socket.emit("deleteUserGraph", { graphId, userId });
      // Optimistic removal happens in the listener 'userGraphDeleted'
      // But we can also hide it immediately if we trust the server.
      // The listener handles it robustly.
    }
  };

  // setEndDate(new Date().toISOString().slice(0, 10));
  // setEndTime(new Date().toISOString().slice(11, 16));
  // setLastXValues("1000");

  const hideGraph = (indexToHide) => {
    setGraphs((prevGraphs) =>
      prevGraphs.filter((_, index) => index !== indexToHide)
    );
  };

  // Function to move the graph up in the list view
  const moveGraphUp = (index) => {
    if (index === 0) return; // Can't move the first graph up
    const newGraphs = [...graphs];
    const [movedGraph] = newGraphs.splice(index, 1);
    newGraphs.splice(index - 1, 0, movedGraph);
    setGraphs(newGraphs);
  };

  // Function to move the graph down in the list view
  const moveGraphDown = (index) => {
    if (index === graphs.length - 1) return; // Can't move the last graph down
    const newGraphs = [...graphs];
    const [movedGraph] = newGraphs.splice(index, 1);
    newGraphs.splice(index + 1, 0, movedGraph);
    setGraphs(newGraphs);
  };

  // Function fo export the graph's data to Excel file
  const exportToExcel = () => {
    // Guard against empty graphs
    if (!graphs || graphs.length === 0) {
      setErrorMessage("No graphs to export. Generate a graph first.");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    const wb = XLSX.utils.book_new(); // Create a new workbook
    const userId = user ? user.id : "anonymous";

    graphs.forEach((graphData, index) => {
      const { deviceID: graphDeviceID, attributeKey: graphAttrKey, values } = graphData;
      const data = [["Timestamp", "Value"]]; // Define headers for each graph sheet

      // Populate the data array with values
      if (values && values.length > 0) {
        values.forEach(({ timestamp, value }) => {
          data.push([new Date(timestamp).toLocaleString(), value]);
        });
      }

      // Create a new row for the header with device ID and attribute name
      const headerRow = [
        [
          `Device ID: ${graphDeviceID}`,
          `Attribute: ${parseAttributeKey(graphAttrKey)}`,
        ],
      ];

      // Create a worksheet for the current graph
      const ws = XLSX.utils.aoa_to_sheet(data);

      XLSX.utils.sheet_add_aoa(ws, headerRow, { origin: "C1" });

      // Set the column widths for better visibility
      ws["!cols"] = [
        { wch: 20 }, // Width for Timestamp
        { wch: 15 }, // Width for Value
        { wch: 20 }, // Width for Device ID
        { wch: 20 }, // Width for Attribute
      ];

      // Append the worksheet to the workbook with a unique name
      XLSX.utils.book_append_sheet(wb, ws, `Graph ${index + 1}`);

      // Save unsaved graphs to MongoDB (those with temp IDs)
      if (graphData.id && graphData.id.startsWith("temp-")) {
        socket.emit("saveUserGraph", { ...graphData, userId });
      }
    });

    // Get the current date and time
    const now = new Date();
    const formattedDate = now
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", " ")
      .slice(0, 19); // Replace colons and dots

    // Create the filename with the formatted date and time
    const filename = `${formattedDate}.xlsx`;

    // Export the workbook
    XLSX.writeFile(wb, filename);
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-top">
          {attributeKey ? (
            <div
              className={`flex items-center rounded ${darkMode ? "bg-[#50698f]" : "bg-white"
                } pr-4 pl-3 shadow-md`}
            >
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
                  d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
                />
              </svg>

              <span className="font-light mr-3">{deviceID}</span>
              <span className="color-[#304463] whitespace-nowrap font-bold">
                {parseAttributeKey(attributeKey).toUpperCase()}
              </span>
            </div>
          ) : (
            <t></t>
          )}

          <div className="grid grid-flow-col auto-cols-max gap-3">
            <button
              onClick={exportToExcel}
              style={{
                opacity: deviceID ? 1 : 0.35,
                pointerEvents: deviceID ? "auto" : "none",
                transition: "opacity 0.3s ease-in-out",
              }}
              className={`flex items-center gap-2 align-right h-fit ${darkMode
                ? "bg-[#50698f] text-white border-white/20 hover:bg-[#3d5270]"
                : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50 focus:ring-gray-100"
                } border rounded shadow-sm text-sm font-semibold px-4 py-2 transition-all duration-200`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="size-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                />
              </svg>
              Export
            </button>
            <button
              onClick={loadUserGraphs}
              // style={{
              //   opacity: deviceID ? 1 : 0.35,
              //   pointerEvents: deviceID ? "auto" : "none",
              //   transition: "opacity 0.3s ease-in-out",
              // }}
              className={`flex items-center gap-2 align-right h-fit ${darkMode
                ? "bg-[#50698f] text-white border-white/20 hover:bg-[#3d5270]"
                : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50 focus:ring-gray-100"
                } border rounded shadow-sm text-sm font-semibold px-4 py-2 transition-all duration-200`}
            >
              Load Graphs
            </button>

            {/* Compare Button - only show if we have a graph and comparable devices */}
            {graphs.length > 0 && comparableDevices.length > 0 && (
              <button
                onClick={() => setShowCompareSelector(!showCompareSelector)}
                disabled={compareLoading}
                className={`flex items-center gap-2 align-right h-fit ${darkMode
                  ? "bg-[#304463] text-white border-white/20 hover:bg-[#3d5270]"
                  : "bg-blue-600 text-white border-blue-700 hover:bg-blue-700"
                  } border rounded shadow-sm text-sm font-semibold px-4 py-2 transition-all duration-200`}
              >
                {compareLoading ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                )}
                Compare
              </button>
            )}

            <button
              onClick={onToggleExpand}
              className={`flex items-center gap-2 align-right h-fit ${darkMode
                ? "bg-[#50698f] text-white border-white/20 hover:bg-[#3d5270]"
                : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50 focus:ring-gray-100"
                } border rounded shadow-sm text-sm font-semibold px-4 py-2 transition-all duration-200`}
            >
              Close
            </button>
          </div>
        </div>

        {/* Compare Device Selector */}
        {showCompareSelector && (
          <div className={`mt-4 p-4 rounded-lg shadow-lg ${darkMode ? "bg-[#3d5270]" : "bg-white"} border ${darkMode ? "border-white/10" : "border-gray-200"}`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm">Select a sensor to compare {parseAttributeKey(attributeKey)}</h3>
              <button
                onClick={() => setShowCompareSelector(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="flex flex-wrap gap-4">
              {comparableDevices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => fetchComparisonGraph(device)}
                  className={`flex flex-col items-center p-3 rounded-lg border transition-all hover:scale-105 ${darkMode ? "bg-[#50698f] border-white/10 hover:border-white/30" : "bg-gray-50 border-gray-200 hover:border-blue-400"}`}
                >
                  <img
                    src={SENSOR_ICON_MAP[device.id]}
                    alt={getDeviceDisplayName(device.id)}
                    className="w-14 h-14 object-contain"
                  />
                  <span className="text-xs mt-2 font-semibold text-center">
                    {getDeviceDisplayName(device.id)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {parseAttributeKey(attributeKey)}
                  </span>
                </button>
              ))}
              {comparableDevices.length === 0 && (
                <p className="text-sm text-gray-500">No comparable sensors available. Either all sensors with icons are already added, or no other sensors have this attribute.</p>
              )}
            </div>
          </div>
        )}

        {/* Graph Filter Form - Date */}

        {deviceID ? (
          <div
            className={`h-fit rounded p-4 ${darkMode ? "bg-[#50698f]" : "bg-white"
              } shadow-md flex`}
          >
            <div className="grid grid-rows-4 gap-4 grid-cols-3 w-[50%] h-fit">
              {/* Start Date and Time */}
              <div className="col-span-3 flex items-center space-x-3 rounded">
                <label>From</label>
                <input
                  type="date"
                  id="startDate"
                  className="border p-1 rounded focus:outline-none text-black"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <input
                  type="time"
                  id="startTime"
                  className="border p-1 rounded focus:outline-none text-black"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              {/* End Date and Time */}
              <div className="col-span-3 flex items-center space-x-3 rounded">
                <label>Until</label>
                <input
                  type="date"
                  id="endDate"
                  className="border p-1 rounded focus:outline-none text-black"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <input
                  type="time"
                  id="endTime"
                  className="border p-1 rounded focus:outline-none text-black"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
              {/* Color Picker, Amount Selection, and Generate Button */}
              <div className="col-span-3 flex items-center space-x-5 rounded ">
                <div className="flex items-center">
                  <label>Range</label>
                  <input
                    type="number"
                    id="lastXValues"
                    className="border p-1 ml-3 rounded w-[100px] focus:outline-none text-black"
                    placeholder="1000"
                    value={lastXValues}
                    defaultValue={1000}
                    onChange={(e) => setLastXValues(e.target.value)}
                  />
                </div>
                <ColorPicker
                  defaultValue={selectedGraphColor}
                  onChangeComplete={(color) =>
                    setSelectedGraphColor(color.toHexString())
                  }
                  showText
                  disabledAlpha
                />
              </div>
              <div className="col-span-3 flex items-center justify-start">
                <button
                  onClick={submitGraphFilter}
                  className={
                    "w-fit h-fit rounded text-sm px-4 py-1.5 border border-gray-200 hover:bg-gray-100 transition duration-75 ease-in-out"
                  }
                >
                  Generate
                </button>
              </div>
            </div>
            <div className="w-[50%] p-4 bg-gray-100 rounded shadow-inner">
              <div className="flex flex-col gap-4">
                <div className="flex items-center space-x-2">
                  <label className="">Device ID</label>
                  <span className="font-semibold">{deviceID}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <label className="">Device Type</label>
                  <span className="font-semibold">{deviceType}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <label className="">Attribute Name</label>
                  <span className="font-semibold">
                    {parseAttributeKey(attributeKey)}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <label className="">Attribute Value</label>
                  <span className="font-semibold">{attributeValue}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full bg-gray-300 p-4 rounded shadow-inner opacity-80 flex gap-3">
            {" "}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
              />
            </svg>
            Please choose an attribute from 'Device Attributes' to analyze and
            compare
          </div>
        )}
        {loading && (
          <div className="flex justify-center items-center">
            <div className="m-4 w-10 h-10 border-4 border-gray-500 border-t-transparent border-solid rounded-full animate-spin"></div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {/* Error Message */}
          {errorMessage && (
            <div
              className={`p-4 rounded-md animate-shake flex gap-3 ${darkMode ? "bg-red-800 text-white" : "bg-red-200 text-red-800"
                }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>

              {errorMessage}
            </div>
          )}

          {/* Rest of your content */}
        </div>

        {/* Graph Display */}
        {graphs.map((graphData, index) => {
          return (
            <div
              key={index}
              className={`group h-fit rounded p-4 ${darkMode ? "bg-[#50698f]" : "bg-white"
                } shadow-md`}
            >
              <div className="flex flex-row-reverse opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {/* Hide graph button */}
                <button
                  className="relative z-10"
                  onClick={() => hideGraph(index)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="size-5 absolute right-[26px] top-[2px]"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                    />
                  </svg>
                </button>
                {/* Remove graph button */}
                <button
                  className="relative z-10"
                  onClick={() => removeGraph(index)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="#b91c1c"
                    className="size-5 absolute right-[0px] top-[2px]"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                </button>

                {/* Move up button */}
                <button
                  className={`relative z-10 ${index === 0 ? "opacity-40" : ""}`}
                  onClick={() => moveGraphUp(index)}
                  disabled={index === 0}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1"
                    stroke="currentColor"
                    className="size-6 absolute right-[50px]"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18V6m0 0l-4 4m4-4l4 4"
                    />
                  </svg>
                </button>

                {/* Move down button */}
                <button
                  className={`relative z-10 ${index === graphs.length - 1 ? "opacity-40" : ""
                    }`}
                  onClick={() => moveGraphDown(index)}
                  disabled={index === graphs.length - 1}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1"
                    stroke="currentColor"
                    className="size-6 absolute right-[70px]"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v12m0 0l-4-4m4 4l4-4"
                    />
                  </svg>
                </button>
              </div>
              <DynamicLineChart
                graphID={index}
                lastX={graphData.lastX}
                attributeKey={graphData.attributeKey}
                deviceID={graphData.deviceID}
                created={graphData.created}
                values={graphData.values}
                color={graphData.color}
              />
            </div>
          );
        })}
      </div>
    </>
  );
};

export default DeviceCompareScreen;
