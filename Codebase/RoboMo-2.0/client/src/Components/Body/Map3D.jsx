import React, { useEffect, useRef, useState } from "react";

const Map3D = ({ src, onIframeLoad, onBack, lockControls = true }) => {
  const [controlsLocked, setControlsLocked] = useState(lockControls);
  const [overlaySuspended, setOverlaySuspended] = useState(false);
  const [showTapPrompt, setShowTapPrompt] = useState(lockControls);
  const iframeRef = useRef(null);
  const resumeTimerRef = useRef(null);

  useEffect(() => {
    setControlsLocked(lockControls);
    setOverlaySuspended(false);
    setShowTapPrompt(lockControls);
    return () => {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
      }
    };
  }, [src, lockControls]);

  const temporarilyReleaseOverlay = (duration = 600) => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
    }
    setOverlaySuspended(true);
    iframeRef.current?.focus();
    resumeTimerRef.current = setTimeout(() => {
      setOverlaySuspended(false);
    }, duration);
  };

  const handleTapToStart = () => {
    setShowTapPrompt(false);
    temporarilyReleaseOverlay(800);
  };

  const handleUnlock = () => {
    setControlsLocked(false);
    setOverlaySuspended(false);
    setShowTapPrompt(false);
  };

  const handleRelock = () => {
    setControlsLocked(true);
    setShowTapPrompt(false);
  };

  const lockFeatureEnabled = lockControls;
  const overlayActive = lockFeatureEnabled && controlsLocked;

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden shadow-inner bg-black">
      <iframe
        ref={iframeRef}
        key={src}
        title="Matterport 3D View"
        src={src}
        className="w-full h-full"
        style={{ border: "none" }}
        allow="xr-spatial-tracking"
        allowFullScreen
        tabIndex={-1}
        onLoad={onIframeLoad}
      />

      <button
        type="button"
        onClick={onBack}
        className="absolute top-4 left-4 z-30 px-4 py-2 text-sm font-bold rounded bg-white text-[#304463] border-2 border-[#304463]/10 shadow-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#304463] transition-all"
      >
        Back to Map
      </button>

      {lockFeatureEnabled && !controlsLocked && (
        <button
          type="button"
          onClick={handleRelock}
          className="absolute top-4 right-4 z-30 px-4 py-2 text-sm font-semibold rounded bg-white/90 text-[#304463] shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#304463]"
        >
          Lock controls
        </button>
      )}

      {overlayActive && (
        <div
          className="absolute inset-0 z-20 flex flex-col justify-between bg-gradient-to-b from-black/25 via-transparent to-black/25"
          style={{
            pointerEvents: overlaySuspended ? "none" : "auto",
            touchAction: overlaySuspended ? "auto" : "none",
          }}
        >
          <div className="flex items-start justify-between p-4">
            <div className="text-xs text-white/90 bg-black/60 px-3 py-1 rounded-full shadow">
              Controls locked: look-only mode. Click “Unlock” to explore.
            </div>
            <button
              type="button"
              onClick={handleUnlock}
              className="px-4 py-2 text-sm font-semibold rounded bg-white/90 text-[#304463] shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#304463]"
            >
              Unlock controls
            </button>
          </div>

          {showTapPrompt && (
            <div className="flex justify-center pb-8">
              <button
                type="button"
                onClick={handleTapToStart}
                className="px-4 py-2 text-sm font-semibold rounded-full bg-white/90 text-[#304463] shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#304463]"
              >
                Tap to start
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Map3D;
