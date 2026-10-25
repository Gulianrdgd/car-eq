# Build the static SPA, then serve it with nginx.
# The mic only works over https: put this behind a TLS-terminating proxy.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json yarn.lock .npmrc ./
RUN yarn install --frozen-lockfile --non-interactive
COPY . .
RUN yarn build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
