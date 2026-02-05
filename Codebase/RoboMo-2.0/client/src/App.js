import React, { createContext, useState, useEffect, useContext } from "react";
import { AuthProvider, AuthContext } from "./Contexts/AuthContext";
import Header from "./Components/Header/Header";
import Body from "./Components/Body/Body";
import Footer from "./Components/Footer/Footer";
import Login from "./Components/Login/Login";
import "./App.css";
import "./index.css";

export const AppDarkMode = createContext();

function AppContent() {
  const [darkMode, setDarkMode] = useState(false);
  const [scale, setScale] = useState(1);
  const { user } = useContext(AuthContext);

  // Function to toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Function to calculate and set the scale factor
  const calculateScale = () => {
    const baseWidth = 1920;
    const baseHeight = 1080;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const widthRatio = screenWidth / baseWidth;
    const heightRatio = screenHeight / baseHeight;
    const newScale = Math.min(widthRatio, heightRatio);
    setScale(newScale);
  };

  useEffect(() => {
    // Calculate scale on mount and resize
    calculateScale();
    window.addEventListener("resize", calculateScale);

    // Cleanup event listener
    return () => {
      window.removeEventListener("resize", calculateScale);
    };
  }, []);

  return (
    <AppDarkMode.Provider value={darkMode}>
      <div
        className={`min-h-screen ${darkMode ? "bg-gray-900 text-white" : "bg-white text-black"
          }`}
        style={{
          zoom: scale,
          transformOrigin: "top left",
        }}
      >
        {user ? (
          <>
            <Header toggleDarkMode={toggleDarkMode} />
            <Body />
            <Footer />
          </>
        ) : (
          <Login />
        )}
      </div>
    </AppDarkMode.Provider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
