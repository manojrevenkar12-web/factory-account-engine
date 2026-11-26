FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY config ./config
COPY data ./data
RUN mkdir -p var && chown node:node var
USER node
EXPOSE 8790
CMD ["node", "--no-warnings", "src/server/main.ts"]
