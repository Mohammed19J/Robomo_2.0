# Use the official Node.js runtime as a base image
FROM node:16

# Install OpenVPN
RUN apt-get update && apt-get install -y openvpn

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the port your server will run on
EXPOSE 5000

# Verify that npm and openvpn are installed and accessible
RUN which npm && which openvpn

# Start OpenVPN and then your Node.js server
CMD ["sh", "-c", "/usr/sbin/openvpn --config ./vpn_config/Fiware_Brauden.ovpn & /usr/local/bin/npm start"]
#CMD ["/usr/local/bin/npm", "start"]
#CMD ["sh", "-c", "/usr/sbin/openvpn --config ./vpn_config/Fiware_Brauden.ovpn","/usr/local/bin/npm","start"]