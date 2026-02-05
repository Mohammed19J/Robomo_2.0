import React, { useState, useEffect } from "react";
import CountUp from "react-countup";

const ConnectedClientsWidget = ({ socket }) => {
  const [connectedClients, setConnectedClients] = useState([]);
  // Listen for the filtered data from the server
  useEffect(() => {
    socket.on("clientConnected", (data) => {
      console.log("Client connected, total clients:", data);
      setConnectedClients(data);
    });

    socket.on("clientDisconnected", (data) => {
      console.log("Client disconnected, total clients:", data);
      setConnectedClients(data);
    });


    // Cleanup listeners on unmount
    return () => {
      socket.off("clientConnected");
      socket.off("clientDisconnected");
    };
  }, [socket]);

  return (
    <div className="bg-gradient-to-r from-indigo-100 to-cyan-100 p-4 w-full md:w-[16%] flex items-center shadow rounded h-[70px]">
      <p className="p-3 whitespace-nowrap font-mono rounded-full w-fit h-7 font-bold bg-[#304463] text-indigo-200 flex items-center justify-center mr-2">
        <CountUp decimals={0} end={connectedClients} duration={3} />
      </p>
      <p className="opacity-75 color-[#304463] font-bold">CONNECTED USERS</p>
    </div>
  );
};

export default ConnectedClientsWidget;
