FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app

# install dependencies without running package lifecycle scripts, so a
# compromised dependency cannot execute code at build time (OWASP A08)
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --chown=node:node . .

# never run the server as root
USER node

EXPOSE 8080

CMD ["node", "server.js"]
