import React from "react";
import DeviceNode from "./Device/DeviceNode";

const ACTIVE_SENSOR_IDS = [
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:010",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:014",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:015",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:012",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:011",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:003",
  "urn:ngsi-ld:AirQualitySensor:GMW87:002",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:002",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:001",
  "urn:ngsi-ld:AirQualitySensor:GMW87:001",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:004",
];

const SENSOR_POS_2D = {
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:010": { top: "10%", left: "15%" },
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:014": { top: "15%", left: "10%" },
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:015": { top: "10%", left: "10%" },
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:012": { top: "15%", left: "5%" },
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:011": { top: "10%", left: "25%" },
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:003": { top: "73%", left: "34%" },
  "urn:ngsi-ld:AirQualitySensor:GMW87:002": { top: "68%", left: "51%" },
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:002": { top: "88%", left: "58%" },
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:001": { top: "10%", left: "20%" },
  "urn:ngsi-ld:AirQualitySensor:GMW87:001": { top: "26%", left: "90%" },
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:004": { top: "10%", left: "5%" },
};

const SENSOR_ICON_MAP = {
  "urn:ngsi-ld:AirQualitySensor:GMW87:001": "/robot.png",
  "urn:ngsi-ld:AirQualitySensor:GMW87:002": "/welding-mask.png",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:002": "/3d-printer.png",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:003": "/machine.png",
};

const Map2D = ({
  devices,
  selectedDevice,
  onDeviceClick,
  onNavigateToViewpoint,
  isDeviceDisabled,
}) => {
  const devicesWithCoords = devices.filter(
    (device) =>
      ACTIVE_SENSOR_IDS.includes(device?.id) &&
      Boolean(SENSOR_POS_2D[device?.id])
  );

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden shadow-inner bg-black/60">
      <img
        src="/LabOverview.png"
        alt="Lab floorplan overview"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        draggable="false"
      />
      <div className="absolute inset-0 pointer-events-none">
        {devicesWithCoords.map((device, index) => {
          const coords = SENSOR_POS_2D[device?.id];
          const isSelected = selectedDevice?.id === device.id;
          const handleSelect = () => {
            if (onDeviceClick) {
              onDeviceClick(device);
            }
            if (onNavigateToViewpoint) {
              onNavigateToViewpoint(device.id);
            }
          };
          return (
            <DeviceNode
              key={device.id}
              device={device}
              index={index}
              onClick={handleSelect}
              selected={isSelected}
              iconSrc={SENSOR_ICON_MAP[device?.id]}
              isDisabled={isDeviceDisabled ? isDeviceDisabled(device.id) : false}
              style={{
                top: coords.top,
                left: coords.left,
                transform: "translate(-50%, -50%)",
                borderWidth: isSelected ? "0px" : "4px",
                pointerEvents: "auto",
                transition: "opacity 0.1s ease",
              }}
            />
          );
        })}
        {devicesWithCoords.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/80 px-6">
            No live sensors with defined coordinates. Update `MANUAL_SENSOR_POS_2D`
            to place active devices on the map.
          </div>
        )}
      </div>
    </div>
  );
};

export default Map2D;
