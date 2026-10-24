FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
RUN mkdir -p /app/data
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
