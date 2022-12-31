FROM node:lts-alpine

RUN apk add --no-cache tzdata ffmpeg git

WORKDIR /app

ADD package.json package-lock.json ./
RUN npm i
ADD index.js ./

#USER nobody

CMD node index.js
#CMD ls -la node_modules
