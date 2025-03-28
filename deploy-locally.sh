#!/bin/bash

# Set environment variables
export ACR_NAME="filestreamingcontainerregistry"   # ACR name without .azurecr.io
export ACR_LOGIN_SERVER="filestreamingcontainerregistry.azurecr.io"
export IMAGE_NAME="filestreamingapp"
export BUILD_VERSION="local-test"  # Use a meaningful version if needed
export DOCKER_COMPOSE_FILE="docker-compose.yml"
export ACR_USERNAME="your-acr-username"
export ACR_PASSWORD="your-acr-password"
export VM_USER="your-vm-username"   # Change this to your remote VM user
export VM_HOST="your-vm-host"       # Change this to your remote VM IP/hostname
export DEPLOY_REMOTE=false          # Set to true if deploying to a remote VM

echo "🔄 Logging into ACR..."
docker login "$ACR_LOGIN_SERVER" -u "$ACR_USERNAME" -p "$ACR_PASSWORD"

echo "🐳 Building Docker image..."
docker build -t "$ACR_LOGIN_SERVER/$IMAGE_NAME:$BUILD_VERSION" -t "$ACR_LOGIN_SERVER/$IMAGE_NAME:latest" -f Dockerfile .

echo "📤 Pushing Docker image to ACR..."
docker push "$ACR_LOGIN_SERVER/$IMAGE_NAME:$BUILD_VERSION"
docker push "$ACR_LOGIN_SERVER/$IMAGE_NAME:latest"

echo "📝 Updating docker-compose.yml..."
sed -i "s|$ACR_LOGIN_SERVER/$IMAGE_NAME:latest|$ACR_LOGIN_SERVER/$IMAGE_NAME:$BUILD_VERSION|" "$DOCKER_COMPOSE_FILE"

if [ "$DEPLOY_REMOTE" = true ]; then
    echo "🚀 Deploying to remote VM..."
    
    # Copy docker-compose file to remote VM
    scp "$DOCKER_COMPOSE_FILE" "$VM_USER@$VM_HOST:/home/$VM_USER/"

    # SSH into VM and deploy
    ssh "$VM_USER@$VM_HOST" << EOF
    echo "🔄 Logging into ACR on remote VM..."
    docker login "$ACR_LOGIN_SERVER" -u "$ACR_USERNAME" -p "$ACR_PASSWORD"
    
    echo "📉 Stopping running containers..."
    docker-compose -f "/home/$VM_USER/$DOCKER_COMPOSE_FILE" down
    
    echo "📥 Pulling new images..."
    docker-compose -f "/home/$VM_USER/$DOCKER_COMPOSE_FILE" pull
    
    echo "🚀 Starting new containers..."
    docker-compose -f "/home/$VM_USER/$DOCKER_COMPOSE_FILE" up -d
EOF

    echo "✅ Deployment to remote VM completed!"
else
    echo "🚀 Running locally using Docker Compose..."
    
    # Stop existing containers
    docker-compose down

    # Pull latest image
    docker-compose pull

    # Start containers
    docker-compose up -d

    echo "✅ Local deployment completed!"
fi
