import React, { useState, useEffect, useRef, useContext } from "react";
import { AppDarkMode } from "../../../App";
import { parseAttributeKey } from "../../../Utils/StringParser";

const DeviceAttribute = ({
  socket,
  deviceID,
  fullDeviceID,
  deviceType,
  attributeKey,
  attributeType,
  attributeValue,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
  onExpandCompare,
  isValidValue,
}) => {
  const menuRef = useRef(null);
  const darkMode = useContext(AppDarkMode);

  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [copySuccess, setCopySuccess] = useState("");
  const [highlightedAttribute, setHighlightedAttribute] = useState(null);
  const [isHidden, setIsHidden] = useState(false); // State to manage visibility

  useEffect(() => {
    if (attributeValue === undefined) return;

    const newEntry = { value: attributeValue, timestamp: Date.now() };
    setLastUpdated(newEntry.timestamp);
  }, [attributeValue]);

  const handleCopyAttribute = () => {
    const copyText = `${deviceID} \n ${deviceType} \n ${attributeKey} \n ${attributeValue}`;

    navigator.clipboard
      .writeText(copyText)
      .then(() => {
        setCopySuccess("Copied to clipboard!");
        setHighlightedAttribute(attributeKey);
        setTimeout(() => {
          setCopySuccess("");
          setHighlightedAttribute(null);
        }, 1000);
      })
      .catch((err) => {
        setCopySuccess("Failed to copy!");
      });
    onCloseMenu();
  };

  const handleCompare = () => {
    const data = {
      deviceID: deviceID,
      fullDeviceID: fullDeviceID,
      deviceType: deviceType,
      attributeKey: attributeKey,
      attributeValue: attributeValue,
    };
    socket.emit("selectedDeviceData", data);
    onExpandCompare();
  };

  const handleAttributePin = () => {
    const data = {
      deviceID: deviceID,
      attributeKey: attributeKey,
      attributeValue: attributeValue,
    };
    socket.emit("pinAttribute", data);
    onCloseMenu();
  };

  const handleHideAttribute = () => {
    setIsHidden(true); // Hide the attribute
    onCloseMenu();
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onCloseMenu();
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen, onCloseMenu]);

  return (
    <>
      <div
        className={`m-1 p-4 shadow-md hover:shadow-lg transition-shadow duration-100 flex flex-col relative group
          ${darkMode ? "bg-[#50698f]" : "bg-white"} 
          ${highlightedAttribute === attributeKey ? "outline rounded outline-green-200 opacity-90" : ""}
          ${isHidden ? "opacity-50" : "opacity-100"}
          `}
      >
        {!isHidden && (
          <>
            <div className="flex justify-between">
              <span className="font-semibold break-words overflow-hidden text-ellipsis">
                {parseAttributeKey(attributeKey)}
              </span>
              <div
                className={`z-10 opacity-0 flex group-hover:opacity-100 transition-opacity duration-100`}
              >
                {isValidValue && (
                  <button onClick={handleCompare} className="relative z-10">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="h-4 w-4 text-gray-700"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m19.5 19.5-15-15m0 0v11.25m0-11.25h11.25"
                      />
                    </svg>
                  </button>
                )}

                <button onClick={onToggleMenu} className="relative z-10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="h-5 w-5 text-gray-700"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                    />
                  </svg>
                </button>
              </div>
              {isMenuOpen && (
                <div
                  ref={menuRef}
                  className="absolute right-6 top-9 bg-white border border-gray-200 rounded shadow-lg z-20 w-24"
                >
                  <ul className="py-1">
                    {isValidValue && (
                      <li
                        onClick={handleAttributePin}
                        className="px-2 py-1 hover:bg-gray-100 cursor-pointer text-gray-600 text-sm"
                      >
                        Pin
                      </li>
                    )}

                    {/* <li
                      onClick={handleHideAttribute}
                      className="px-2 py-1 hover:bg-gray-100 cursor-pointer text-gray-600 text-sm"
                    >
                      Hide
                    </li> */}
                    <li
                      onClick={handleCopyAttribute}
                      className="px-2 py-1 hover:bg-gray-100 cursor-pointer text-gray-600 text-sm"
                    >
                      Copy
                    </li>
                  </ul>
                </div>
              )}
            </div>
            <div className="break-words flex-grow">
              {/* Check if the attribute key is 'image' and display the image */}
              {attributeKey.toLowerCase() === "image" ? (
                <img src={attributeValue} alt="Device" className="w-full h-auto" />
              ) : (
                attributeValue
              )}
            </div>
            {attributeKey.includes("value") && (
              <span
                className={`text-xs ${darkMode ? "text-black" : "text-gray-500"
                  } h-4`}
              >
                {new Date(lastUpdated).toLocaleTimeString()}
              </span>
            )}
            <span
              className={`text-xs ${darkMode ? "text-black" : "text-gray-500"
                } h-4`}
            >
              {attributeType}
            </span>
          </>
        )}
      </div>
    </>
  );
};

export default DeviceAttribute;
