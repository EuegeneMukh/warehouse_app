FROM node:20-alpine AS frontend
WORKDIR /build
COPY package*.json ./
RUN npm install
COPY public ./public
COPY src ./src
RUN npm run build

FROM python:3.12-alpine
WORKDIR /app
COPY --from=frontend /build/build ./build
COPY addon/warehouse/server.py ./server.py
RUN mkdir -p /data /share/warehouse-backups
EXPOSE 8099
CMD ["python", "/app/server.py"]
