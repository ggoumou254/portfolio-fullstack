# backend/Dockerfile
FROM node:20-slim
WORKDIR /app

# Installa solo prod deps
COPY package*.json ./
RUN npm install --omit=dev


# Copia il resto del codice
COPY . .

ENV NODE_ENV=production
# Railway setta PORT a runtime → il tuo server deve usare process.env.PORT
EXPOSE 3000

CMD ["node", "server.js"]
