import React, { useContext, useState, useEffect } from "react";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import logo_image from "../../Assets/Logo/logo_blue.png";
import { AppDarkMode } from '../../App';
import socket from "../../socket";
import PasswordModal from "../Modals/PasswordModal";

const Header = ({ toggleDarkMode }) => {
  const [dataCollectionEnabled, setDataCollectionEnabled] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [targetCollectionState, setTargetCollectionState] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const darkMode = useContext(AppDarkMode)
  const dataCollectionPassword =
    process.env.REACT_APP_DATA_COLLECTION_PASSWORD || "change_me";

  useEffect(() => {
    socket.on("dataCollectionStatus", (status) => {
      setDataCollectionEnabled(status);
    });

    return () => {
      socket.off("dataCollectionStatus");
    };
  }, []);

  const handleToggleClick = (currentState) => {
    // We want to flip the state, so target is !currentState
    setTargetCollectionState(!currentState);
    setPasswordError(""); // Reset error
    setShowPasswordModal(true);
  };

  const handlePasswordSubmit = (password) => {
    if (password === dataCollectionPassword) {
      // Success
      setDataCollectionEnabled(targetCollectionState);
      socket.emit("toggleDataCollection", targetCollectionState);
      setShowPasswordModal(false);
      setPasswordError("");
    } else {
      // Fail
      setPasswordError("Incorrect password. Please try again.");
    }
  };

  return (
    <header className="flex justify-between items-center h-20 bg-white shadow-md relative z-40">
      <PasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSubmit={handlePasswordSubmit}
        error={passwordError}
      />
      <div className="relative flex justify-start items-center h-full p-2">
        <img src={logo_image} alt="logo" className="mt-5" />
      </div>

      <div className="flex items-center gap-4 mr-4">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
            Data Collection
          </span>
          <button
            type="button"
            onClick={() => handleToggleClick(dataCollectionEnabled)}
            className={`${dataCollectionEnabled ? "bg-[#304463]" : "bg-gray-200"
              } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#304463] focus:ring-offset-2`}
          >
            <span
              className={`${dataCollectionEnabled ? "translate-x-6" : "translate-x-1"
                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
            />
          </button>
        </div>

        {/* <button
        onClick={toggleDarkMode}
        className="p-4 rounded-full focus:outline-none"
      >
        {darkMode ? (
          <SunIcon className="h-6 w-6" />
        ) : (
          <MoonIcon className="h-6 w-6" />
        )}
      </button> */}

      </div>

      <button
        // onClick={toggleHelpScreen}
        className="p-4 rounded-full focus:outline-none"
      >
        {darkMode ? (
          <QuestionMarkCircleIcon className="h-6 w-6 text-white" />
        ) : (
          <QuestionMarkCircleIcon className="h-6 w-6 text-black" />
        )}
      </button>




    </header>
  );
};

export default Header;
