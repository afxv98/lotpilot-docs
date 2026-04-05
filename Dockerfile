FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

COPY package*.json ./

# Skip browser download — browsers are pre-installed in this image
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
