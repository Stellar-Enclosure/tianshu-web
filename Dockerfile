FROM node:24-alpine

ENV PORT=8080
ENV TIANSHU_EDGE_BASE_URL=http://edge:18180

WORKDIR /app
COPY --chown=node:node dist /app/dist
COPY --chown=node:node static-server.mjs /app/static-server.mjs
RUN test -f /app/dist/permission-build.json

USER node
EXPOSE 8080

ENTRYPOINT ["node", "/app/static-server.mjs"]
