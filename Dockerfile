FROM node:boron

RUN mkdir -p /src
WORKDIR /src

# Install app dependencies
RUN npm install --global gulp-cli

# Bundle app source
COPY . /src
WORKDIR /src
RUN npm install fsevents@latest -f --save-optional
RUN npm install

EXPOSE 3000
CMD [ "npm", "start" ]
