FROM balenalib/raspberrypi3:bullseye-run

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
	&& apt-get install -y nodejs libcamera-apps-lite ffmpeg git

RUN apt-get install RPi.GPIO

#FROM node:lts-alpine

#RUN apk add --no-cache tzdata ffmpeg git

WORKDIR /app

ADD package.json package-lock.json ./

RUN npm i

ADD index.js shutter.py ./
ADD ui ui

#USER nobody

CMD ["node", "index.js"]
#CMD ls -la node_modules
