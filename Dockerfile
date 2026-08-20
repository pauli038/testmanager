FROM node:22-slim AS base
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV AUTH_TRUST_HOST=true

EXPOSE 3000

# Tables are created/migrated automatically on startup from DATABASE_URL —
# no manual migration step needed.
CMD ["npm", "run", "start", "--", "-p", "3000"]
