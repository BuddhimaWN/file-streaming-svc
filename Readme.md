# Docker compose 

docker-compose up --build

http://localhost:3001/

# Kubernetes

docker build -t backend-image:latest ./backend
docker build -t frontend-image:latest ./frontend

kubectl apply -f backend-deployment.yaml
kubectl apply -f frontend-deployment.yaml

kubectl port-forward svc/backend-service 3000:3000
kubectl port-forward svc/frontend-service 3001:3001

http://localhost:3001/

check pipeline