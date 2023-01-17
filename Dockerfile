FROM balenalib/raspberrypi3:bullseye-run

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
	&& apt-get install -y nodejs libcamera-apps-lite ffmpeg git

RUN apt-get install RPi.GPIO

#FROM node:lts-alpine

#RUN apk add --no-cache tzdata ffmpeg git

WORKDIR /app

ADD package.json package-lock.json ./

RUN npm i

RUN curl -L -o - https://github.com/aler9/rtsp-simple-server/releases/download/v0.21.1/rtsp-simple-server_v0.21.1_linux_armv7.tar.gz | tar -xz

ADD index.js shutter.py rtsp-simple-server.yml ./
ADD ui ui

VOLUME /var/lib/cam

#USER nobody

CMD ["node", "index.js"]
#CMD ls -la node_modules
