set -e

USER=pi
CAMERA=${1:-cam}
HOST=$USER@$CAMERA
APP=my-own-ip-camera

echo "deploying my-own-ip-camera on camera $CAMERA"

ssh $HOST "test -d $APP || exit 0 ; cd $APP ; sudo docker compose down"

rsync -avb --backup-dir=/tmp --exclude node_modules --exclude .git --del ./ $HOST:$APP

ssh $HOST "cd $APP ; sudo docker compose up -d --build"

ssh $HOST "cd $APP ; sudo docker compose logs -f -t"