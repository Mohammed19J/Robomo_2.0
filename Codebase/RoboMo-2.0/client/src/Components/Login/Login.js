import React, { useState, useContext } from "react";
import { AuthContext } from "../../Contexts/AuthContext";
import { AppDarkMode } from "../../App";

const Login = () => {
  const darkMode = useContext(AppDarkMode);
  const { login, signup } = useContext(AuthContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const handleEmailLogin = async () => {
    setFeedbackMessage("");
    const result = await login(email, password);
    if (result.success) {
      console.log("User signed in");
      // App.js will auto-rerender due to user state change
    } else {
      console.error("Login failed:", result.message);
      setFeedbackMessage(result.message);
    }
  };

  const handleEmailSignUp = async () => {
    setFeedbackMessage("");
    const result = await signup(username, email, password);
    if (result.success) {
      console.log("User signed up");
    } else {
      console.error("Sign-up failed:", result.message);
      setFeedbackMessage(result.message);
    }
  };

  return (
    <div className={`fixed inset-0 w-full h-full flex items-center justify-center overflow-hidden ${darkMode ? "bg-slate-900" : "bg-slate-50"
      }`}>
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[100px] opacity-40 animate-pulse ${darkMode ? "bg-purple-600" : "bg-blue-400"
          }`}></div>
        <div className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[100px] opacity-40 animate-pulse delay-1000 ${darkMode ? "bg-blue-600" : "bg-purple-400"
          }`}></div>
      </div>

      {/* Glassmorphism Card */}
      <div className={`relative z-10 w-full max-w-md p-8 rounded-2xl shadow-2xl backdrop-blur-xl border transition-all duration-300 ${darkMode
        ? "bg-slate-800/40 border-slate-700/50 text-white"
        : "bg-white/70 border-white/50 text-slate-800"
        }`}>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            {isNewUser ? "Create Account" : "Welcome Back"}
          </h1>
          <p className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            {isNewUser ? "Join us to monitor your environment" : "Enter your credentials to access your dashboard"}
          </p>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className={`w-full border-t ${darkMode ? "border-slate-600" : "border-slate-300"}`}></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className={`px-2 ${darkMode ? "bg-slate-800 text-slate-400" : "bg-white/50 text-slate-500"}`}>
              {isNewUser ? "Sign up with email" : "Sign in with email"}
            </span>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            isNewUser ? handleEmailSignUp() : handleEmailLogin();
          }}
          className="flex flex-col gap-4"
        >
          {isNewUser && (
            <div className="space-y-1">
              <label className={`text-xs font-medium ml-1 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className={`w-full py-3 px-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${darkMode
                  ? "bg-slate-900/50 border-slate-600 text-white placeholder-slate-500"
                  : "bg-white border-slate-200 text-slate-800 placeholder-slate-400"
                  }`}
                placeholder="johndoe"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className={`text-xs font-medium ml-1 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={`w-full py-3 px-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${darkMode
                ? "bg-slate-900/50 border-slate-600 text-white placeholder-slate-500"
                : "bg-white border-slate-200 text-slate-800 placeholder-slate-400"
                }`}
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-medium ml-1 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`w-full py-3 px-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${darkMode
                ? "bg-slate-900/50 border-slate-600 text-white placeholder-slate-500"
                : "bg-white border-slate-200 text-slate-800 placeholder-slate-400"
                }`}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl text-white font-bold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transform hover:scale-[1.02] transition-all duration-200 shadow-lg shadow-blue-500/30 mt-2"
          >
            {isNewUser ? "Create Account" : "Sign In"}
          </button>
        </form>

        {feedbackMessage && (
          <div className={`mt-4 p-3 rounded-lg text-sm text-center ${feedbackMessage.includes("success") || !feedbackMessage.toLowerCase().includes("fail") && !feedbackMessage.toLowerCase().includes("invalid") && !feedbackMessage.toLowerCase().includes("exists")
            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" // Broad success matching
            : "bg-red-500/10 text-red-500 border border-red-500/20"
            }`}>
            {feedbackMessage}
          </div>
        )}

        <p className={`mt-6 text-sm text-center ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
          {isNewUser ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => {
              setIsNewUser(!isNewUser);
              setFeedbackMessage("");
            }}
            className="font-semibold text-blue-500 hover:text-blue-400 transition-colors"
          >
            {isNewUser ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;
