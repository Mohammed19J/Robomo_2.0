import React, { useCallback, useEffect, useRef, useState } from "react";
import Map2D from "./Map2D";
import Map3D from "./Map3D";

const SENSOR_3D_VIEWS = {
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:002":
    "https://my.matterport.com/show/?m=3xjvFJjhsu1&ss=30&sr=-.27",
  "urn:ngsi-ld:AirQualitySensor:GMW87:001":
    "https://my.matterport.com/show/?m=3xjvFJjhsu1&ss=44&sr=-2.13,.9",
  "urn:ngsi-ld:AirQualitySensor:GMW87:002":
    "https://my.matterport.com/show/?m=3xjvFJjhsu1&ss=25&sr=-2.88,-.31",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:003":
    "https://my.matterport.com/show/?m=3xjvFJjhsu1&play=1&qs=1&portal=0&nozoom=1&help=0&brand=0&hr=1&disable=1&ss=19&sr=-.5,.57",
};

const DEFAULT_3D_BASE_URL =
  "https://my.matterport.com/show/?m=3xjvFJjhsu1";

const FIXED_PARAMS = {
  play: "1",
  qs: "1",
  portal: "0",
  nozoom: "1",
  help: "0",
  brand: "0",
  hr: "1",
  disable: "1",
};

const buildMatterportUrl = (baseUrl = DEFAULT_3D_BASE_URL) => {
  try {
    const url = new URL(baseUrl);
    Object.entries(FIXED_PARAMS).forEach(([key, value]) => {
      if (key === "disable") {
        url.searchParams.set(key, value);
      } else if (!url.searchParams.has(key)) {
        url.searchParams.append(key, value);
      }
    });
    return url.toString();
  } catch {
    return baseUrl;
  }
};

const viewerPath = (sensorId) =>
  sensorId ? `/viewer/${encodeURIComponent(sensorId)}` : "/viewer";

const fadeDuration = 400;

const MapViewSwitcher = ({
  devices,
  selectedDevice,
  onDeviceClick,
  darkMode,
  isDeviceDisabled,
}) => {
  const [viewMode, setViewMode] = useState("2d");
  const [currentSensorId, setCurrentSensorId] = useState(null);
  const [active3DUrl, setActive3DUrl] = useState(
    () => buildMatterportUrl(DEFAULT_3D_BASE_URL)
  );
  const [iframeKey, setIframeKey] = useState(0);
  const [overlayPhase, setOverlayPhase] = useState("hidden");
  const fadeTimeout = useRef(null);

  const clearFadeTimeout = useCallback(() => {
    if (fadeTimeout.current) {
      clearTimeout(fadeTimeout.current);
      fadeTimeout.current = null;
    }
  }, []);

  useEffect(() => clearFadeTimeout, [clearFadeTimeout]);

  const scheduleFadeReset = useCallback(() => {
    clearFadeTimeout();
    fadeTimeout.current = setTimeout(() => {
      setOverlayPhase("hidden");
    }, fadeDuration);
  }, [clearFadeTimeout]);

  const beginTransition = useCallback(
    ({ callback, waitForIframe }) => {
      setOverlayPhase("fadingOut");
      clearFadeTimeout();
      fadeTimeout.current = setTimeout(() => {
        callback();
        if (waitForIframe) {
          setOverlayPhase("loading");
        } else {
          setOverlayPhase("fadingIn");
          scheduleFadeReset();
        }
      }, fadeDuration);
    },
    [clearFadeTimeout, scheduleFadeReset]
  );

  const set3DView = useCallback(
    ({
      baseUrl = DEFAULT_3D_BASE_URL,
      sensorId = null,
      animate = true,
      pushHistory = true,
    }) => {
      const run = () => {
        setActive3DUrl(buildMatterportUrl(baseUrl));
        setIframeKey((prev) => prev + 1);
        setViewMode("3d");
        setCurrentSensorId(sensorId);
        if (pushHistory) {
          window.history.pushState(
            { view: "viewer", sensorId },
            "",
            viewerPath(sensorId)
          );
        }
      };

      if (animate) {
        beginTransition({ callback: run, waitForIframe: true });
      } else {
        run();
        setOverlayPhase("hidden");
      }
    },
    [beginTransition]
  );

  const set2DView = useCallback(
    ({ animate = true, pushHistory = true } = {}) => {
      const run = () => {
        setViewMode("2d");
        setCurrentSensorId(null);
        if (pushHistory) {
          window.history.pushState({ view: "map" }, "", "/");
        }
      };

      if (animate) {
        beginTransition({ callback: run, waitForIframe: false });
      } else {
        run();
        setOverlayPhase("hidden");
      }
    },
    [beginTransition]
  );

  useEffect(() => {
    const applyLocation = (animate) => {
      const { pathname } = window.location;
      const match = pathname.match(/^\/viewer(?:\/([^/]+))?/);
      if (match) {
        const sensorId = match[1] ? decodeURIComponent(match[1]) : null;
        const targetBase =
          sensorId && SENSOR_3D_VIEWS[sensorId]
            ? SENSOR_3D_VIEWS[sensorId]
            : DEFAULT_3D_BASE_URL;
        set3DView({
          baseUrl: targetBase,
          sensorId: sensorId && SENSOR_3D_VIEWS[sensorId] ? sensorId : null,
          animate,
          pushHistory: false,
        });
      } else {
        set2DView({ animate, pushHistory: false });
      }
    };

    applyLocation(false);
    const handlePop = () => applyLocation(true);
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [set3DView, set2DView]);

  const handleIframeLoaded = useCallback(() => {
    if (overlayPhase === "loading") {
      setOverlayPhase("fadingIn");
      scheduleFadeReset();
    }
  }, [overlayPhase, scheduleFadeReset]);

  const handleSensorNavigate = useCallback(
    (sensorId) => {
      const target = SENSOR_3D_VIEWS[sensorId];
      if (!target) {
        return;
      }
      set3DView({ baseUrl: target, sensorId });
    },
    [set3DView]
  );

  const handleSwitch = useCallback(
    (mode) => {
      if (mode === viewMode) {
        return;
      }
      if (mode === "3d") {
        set3DView({ baseUrl: DEFAULT_3D_BASE_URL, sensorId: null });
      } else {
        set2DView();
      }
    },
    [set2DView, set3DView, viewMode]
  );

  const handleBackToMap = useCallback(() => {
    if (viewMode === "2d") {
      return;
    }
    set2DView();
  }, [set2DView, viewMode]);

  const baseButtonClass =
    "px-4 py-2 text-sm font-semibold border rounded transition-colors duration-150";
  const activeClass = darkMode
    ? "bg-[#50698f] text-white border-[#394a63]"
    : "bg-[#304463] text-white border-[#304463]";
  const inactiveClass = darkMode
    ? "bg-transparent text-gray-200 border-[#50698f] hover:bg-[#394a63]"
    : "bg-white text-[#304463] border-gray-300 hover:bg-gray-100";

  const overlayOpacity =
    overlayPhase === "hidden"
      ? 0
      : overlayPhase === "fadingOut" || overlayPhase === "loading"
        ? 0.85
        : 0;

  return (
    <div
      className={`relative h-full max-w-screen-md min-w-[900px] mx-auto flex flex-col rounded ${darkMode ? "bg-[#304463]" : "bg-white"
        } overflow-hidden`}
    >
      <div className="flex justify-between items-center gap-2 p-4">
        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            className={`${baseButtonClass} ${viewMode === "2d" ? activeClass : inactiveClass
              }`}
            onClick={() => handleSwitch("2d")}
          >
            2D View
          </button>
          <button
            type="button"
            className={`${baseButtonClass} ${viewMode === "3d" ? activeClass : inactiveClass
              }`}
            onClick={() => handleSwitch("3d")}
          >
            3D View
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 pb-4 relative">
        {viewMode === "2d" ? (
          <Map2D
            devices={devices}
            selectedDevice={selectedDevice}
            onDeviceClick={onDeviceClick}
            onNavigateToViewpoint={handleSensorNavigate}
            isDeviceDisabled={isDeviceDisabled}
          />
        ) : (
          <Map3D
            key={`${iframeKey}-${currentSensorId || "default"}`}
            src={active3DUrl}
            onIframeLoad={handleIframeLoaded}
            onBack={handleBackToMap}
            lockControls={false}
          />
        )}
        <div
          className="absolute inset-0 bg-black pointer-events-none"
          style={{
            opacity: overlayOpacity,
            transition: `opacity ${fadeDuration}ms ease`,
            pointerEvents: overlayPhase === "hidden" ? "none" : "auto",
          }}
        />
      </div>
    </div>
  );
};

export default MapViewSwitcher;
