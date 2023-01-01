FROM balenalib/raspberrypi3:bullseye-run

RUN apt-get update
RUN apt-get install -y libcamera-apps-lite 
RUN apt-get install -y ffmpeg
RUN apt-get install -y git
RUN apt-get install -y npm
#FROM node:lts-alpine

#RUN apk add --no-cache tzdata ffmpeg git

WORKDIR /app

ADD package.json package-lock.json ./
RUN npm i
ADD index.js ./

#USER nobody

CMD node index.js
#CMD ls -la node_modules
