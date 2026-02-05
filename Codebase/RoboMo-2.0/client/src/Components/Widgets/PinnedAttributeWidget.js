import React, { useState, useEffect } from "react";
import CountUp from "react-countup";
import { parseAttributeKey, parseAttributeID } from "../../Utils/StringParser";

const PinnedAttributeWidget = ({ socket, devices }) => {
  const [pinnedAttribute, setPinnedAttribute] = useState([]);
  const [attributeValue, setAttributeValue] = useState(0);
  // Listen for the filtered data from the server
  useEffect(() => {
    socket.on("pinnedAttribute", (data) => {
      console.log("Pinned Attribute Data:", data);
      setPinnedAttribute(data);
      setAttributeValue(data.attributeValue);
    });

    const device = devices.find(
      (device) =>
        parseAttributeID(device.id) === pinnedAttribute.deviceID
    );
    if (device) {
      const attribute = device[pinnedAttribute.attributeKey];
      // console.log("Pinned Attribute:", attribute);
      setAttributeValue(attribute.value);
    }

    // Cleanup the socket listener when the component unmounts
    return () => {
      socket.off("pinnedAttribute");
    };
  }, [socket, devices]);

  const unpitAttribute = () => {
    setPinnedAttribute({});
    setAttributeValue(0);
  };

  return (
    <div className="bg-gradient-to-r from-sky-100 to-blue-200 p-4 flex items-center shadow rounded h-[70px]">
      <p className="p-3 whitespace-nowrap font-mono rounded-full w-fit h-7 font-bold bg-[#304463] text-cyan-200 flex items-center justify-center mr-2">
        <CountUp decimals={2} end={attributeValue} duration={3} />
      </p>
      <p className="">
        <span className="flex color-[#304463] whitespace-nowrap font-bold opacity-75">
          {pinnedAttribute.attributeKey &&
            parseAttributeKey(pinnedAttribute.attributeKey)}
          <svg
            fill="#000000"
            viewBox="0 0 56 56"
            xmlns="http://www.w3.org/2000/svg"
            className="size-6 ml-2 cursor-pointer bg-white rounded-full p-1 opacity-75 hover:opacity-100"
            strokeWidth="1"
            onClick={unpitAttribute}
            alt="Unpin Attribute"
          >
            <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
            <g
              id="SVGRepo_tracerCarrier"
              strokeLinecap="round"
              strokeLinejoin="round"
            ></g>
            <g id="SVGRepo_iconCarrier">
              <path d="M 47.2561 44.3576 C 47.9779 45.0794 49.1191 45.0794 49.7943 44.3576 C 50.4924 43.6591 50.5158 42.5414 49.7943 41.8196 L 8.6498 .6985 C 7.9512 0 6.7870 0 6.0885 .6985 C 5.4132 1.3738 5.4132 2.5613 6.0885 3.2366 Z M 35.9629 24.2162 L 37.3134 14.4599 C 37.3833 13.9243 37.4531 13.6682 37.9421 13.3189 L 43.5770 9.2441 C 44.8577 8.3127 45.3932 7.1717 45.3932 6.1239 C 45.3932 4.5638 44.1591 3.1900 42.3429 3.1900 L 14.9367 3.1900 L 18.6622 6.9389 L 39.7350 6.9389 C 39.9446 6.9389 40.0843 7.0786 40.0843 7.2882 C 40.0843 7.4511 40.0610 7.5676 39.8980 7.6840 L 34.9384 10.9905 C 34.2398 11.4328 33.8673 12.1081 33.7509 13.0162 L 32.7263 21.0029 Z M 13.1670 37.5119 L 25.6011 37.5119 L 25.6011 49.4803 C 25.6011 53.0195 27.0914 56 27.6502 56 C 28.2323 56 29.7226 53.0195 29.7226 49.4803 L 29.7226 37.5119 L 36.2656 37.5119 L 32.5168 33.7630 L 16.1708 33.7630 C 15.9845 33.7630 15.8448 33.6233 15.8448 33.4137 C 15.8448 33.2740 15.9146 33.1343 16.0311 33.0179 L 22.0153 26.7775 C 22.4111 26.3584 22.7371 25.9626 22.7138 25.4503 C 22.6673 24.8915 22.5508 24.2861 22.4344 23.6807 L 18.7554 19.9784 L 19.1512 22.9588 C 19.2910 23.9135 18.9650 24.2861 18.4993 24.7983 L 11.3741 32.5289 C 10.6988 33.2507 10.3962 33.9493 10.3962 34.9273 C 10.3962 36.4873 11.5371 37.5119 13.1670 37.5119 Z"></path>
            </g>
          </svg>
        </span>
        <span className="font-light text-sm">{pinnedAttribute.deviceID}</span>
      </p>
    </div>
  );
};

export default PinnedAttributeWidget;
