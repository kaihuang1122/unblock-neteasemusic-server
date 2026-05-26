FROM node:lts-alpine

RUN set -ex && mkdir /app
RUN apk add --no-cache python3 youtube-dl ffmpeg wget openssl \
    && wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && printf '--cache-dir /var/cache/yt-dlp\n--js-runtimes node:/usr/local/bin/node\n' | tee /etc/yt-dlp.conf

COPY ./precompiled/* /app/
COPY ./entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh

ENV SIGN_CERT /app/cert/server.crt
ENV SIGN_KEY /app/cert/server.key
ENV NODE_ENV production

WORKDIR /app

EXPOSE 8080 8081 8888

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "app.js", "-p", "8080:8081", "-o", "ytdlp", "bilibili"]
