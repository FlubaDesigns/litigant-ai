FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production --legacy-peer-deps
COPY lib/ ./lib/
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "lib/server.mjs"]
