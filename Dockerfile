FROM node:lts-alpine

RUN apk add --no-cache tzdata libcamera ffmpeg
RUN apk add --no-cache git

WORKDIR /app

#ADD package.json package-lock.json ./
#RUN npm i
RUN npm i https://github.com/gallofeliz/js-libs
ADD index.js ./

#USER nobody


CMD node index.js
#CMD ls -la node_modules
