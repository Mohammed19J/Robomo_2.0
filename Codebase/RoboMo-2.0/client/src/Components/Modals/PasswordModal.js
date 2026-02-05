import React, { useState } from 'react';

const PasswordModal = ({ isOpen, onClose, onSubmit, error }) => {
    const [password, setPassword] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(password);
        setPassword(''); // Clear after submit attempt
    };

    const handleClose = () => {
        setPassword('');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm transform transition-all scale-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4 text-center">
                    Security Check
                </h3>
                <p className="text-sm text-gray-500 mb-6 text-center">
                    Please enter the password to change data collection status.
                </p>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter Password"
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#304463] focus:border-transparent transition-all"
                            autoFocus
                        />
                        {error && (
                            <p className="mt-2 text-sm text-red-600 animate-pulse">{error}</p>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium text-white bg-[#304463] rounded-md hover:bg-[#203046] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#304463] shadow-lg transition-all"
                        >
                            Confirm
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PasswordModal;
