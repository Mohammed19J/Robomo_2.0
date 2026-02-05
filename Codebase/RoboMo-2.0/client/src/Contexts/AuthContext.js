import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Helper to resolve API URL
    const getApiUrl = (endpoint) => {
        const { protocol, hostname } = window.location;
        // If we are on HTTPS, assume Nginx proxies /api/ requests on the same port (443)
        if (protocol === 'https:') {
            return `${protocol}//${hostname}/api/auth/${endpoint}`;
        }

        // Fallback for local development or HTTP
        const port = process.env.REACT_APP_API_PORT || '5000';
        return `${protocol}//${hostname}:${port}/api/auth/${endpoint}`;
    };

    useEffect(() => {
        // Check for stored token on load
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        if (token && storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (e) {
                console.error("Failed to parse stored user", e);
                localStorage.removeItem('user');
                localStorage.removeItem('token');
            }
        }
        setLoading(false);
    }, []);

    const login = async (email, password) => {
        try {
            const url = getApiUrl('login');
            const res = await axios.post(url, { email, password });

            const { token, user } = res.data;

            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            setUser(user);
            return { success: true };
        } catch (error) {
            console.error("Login error", error);
            const message = error.response?.data?.message || 'Login failed';
            return { success: false, message };
        }
    };

    const signup = async (username, email, password) => {
        try {
            const url = getApiUrl('signup');
            const res = await axios.post(url, { username, email, password });

            const { token, user } = res.data;

            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            setUser(user);
            return { success: true };
        } catch (error) {
            console.error("Signup error", error);
            const message = error.response?.data?.message || 'Signup failed';
            return { success: false, message };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        window.location.reload();
    };

    return (
        <AuthContext.Provider value={{ user, login, signup, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
