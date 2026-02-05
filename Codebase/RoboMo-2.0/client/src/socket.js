import io from "socket.io-client";

const resolveSocketUrl = () => {
    const envUrl = process.env.REACT_APP_SOCKET_URL;
    if (envUrl) {
        return envUrl;
    }

    const { protocol, hostname } = window.location;
    const envPort = process.env.REACT_APP_SOCKET_PORT;
    const defaultPort = protocol === "https:" ? "" : "5000";
    const port = envPort !== undefined ? envPort : defaultPort;

    return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
};

// Initialize the WebSocket connection
const socket = io(resolveSocketUrl(), {
    transports: ["websocket"],
});

export default socket;
