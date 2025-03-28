# Use the custom image from ACR
FROM filestreamingcontainerregistry.azurecr.io/filestreamingapp:latest

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Expose the port the app will run on
EXPOSE 3000

# Command to start the server
CMD ["node", "server.js"]
