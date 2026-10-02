# The pond API: short links, the leaderboard and rare finds. Node's built-in
# SQLite keeps everything in one file under /data (mount a volume there).
FROM node:24-alpine

WORKDIR /app
COPY server.js words.js namefilter.js slug.js minds.js flybrain.js fishbrain.js ./

ENV NODE_ENV=production PORT=8080 DB_PATH=/data/pond.db
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
