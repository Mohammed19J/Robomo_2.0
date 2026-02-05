import React from "react";
import CountUp from "react-countup";

const ActiveDevicesWidget = ({ devices }) => {
  return (
    <div className="bg-gradient-to-r from-cyan-200 to-indigo-200 p-4 w-full md:w-[15%] flex items-center shadow rounded h-[70px]">
      <p className="p-3 whitespace-nowrap font-mono rounded-full w-7 h-7 font-bold bg-[#304463] text-cyan-200 flex items-center justify-center mr-2">
        <CountUp end={devices.length} duration={3} />
      </p>
      <p className="opacity-75 color-[#304463] font-bold">ACTIVE DEVICES</p>
    </div>
  );
};

export default ActiveDevicesWidget;
