import React, { useState, useEffect } from "react";
import SimplifiedLineChart from "../Graphs/SimplifiedLineChart";

const ServerSpeedWidget = ({ socket }) => {
  const [transferSpeeds, setTransferSpeeds] = useState([]);

  useEffect(() => {
    const handleTransferSpeed = (speed) => {
      setTransferSpeeds((prevSpeeds) => {
        const updatedSpeeds = [
          ...prevSpeeds,
          { time: new Date().toLocaleTimeString(), speed },
        ];
        return updatedSpeeds.length > 50
          ? updatedSpeeds.slice(-50)
          : updatedSpeeds; // Keep only the last 50 values
      });
    };

    socket.on("transferSpeed", handleTransferSpeed);

    // Cleanup listener on unmount
    return () => {
      socket.off("transferSpeed", handleTransferSpeed);
    };
  }, [socket]);

  return (
    <div className="bg-gradient-to-r from-indigo-100 to-cyan-100 p-4 w-full md:w-[40%] flex items-center shadow rounded h-[70px] relative">
      <p className="absolute top-0 left-0 p-2 opacity-75 color-[#304463] font-bold">
        Amount of data transferred
      </p>
      
      <p className="p-3 whitespace-nowrap font-mono rounded-full w-[190px] h-7 font-bold bg-[#304463] text-indigo-200 flex items-center justify-center mr-2 mt-8">
        {transferSpeeds.length > 0
          ? `${transferSpeeds[transferSpeeds.length - 1].speed} Bytes/s`
          : "No data"}
      </p>
      <div className="flex-1 min-w-0">
        <SimplifiedLineChart transferSpeeds={transferSpeeds} />
      </div>
    </div>
  );
};

export default ServerSpeedWidget;
