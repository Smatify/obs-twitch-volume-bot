'use strict';

const config = require('./config');
const TMI = require('./tmi');
const chalk = require('chalk');
const OBSWebSocket = require('obs-websocket-js');

const obs = new OBSWebSocket();
obs.connect({
    address: `${config.obs.address}:${config.obs.port}`,
    password: config.obs.password,
});

class Twitchbot {

    connections = [];
    connectionQueue = [];
    joinQueue = [];
    incomingMessageQueue = [];
    messageQueue = [];

    constructor() {
        console.log('Welcome to nebbish Twitch');
        console.log(`It is ${new Date()}`);
        console.log('');

        this.setupIntervals();
        this.setup();
    }

    setupIntervals = () => {
        setInterval(() => {
            if (!this.connectionQueue.length) return;

            this.connectionQueue.shift().connect();
        }, 500);


        setInterval(() => {
            if (!this.incomingMessageQueue.length) return;

            const msg = this.incomingMessageQueue.shift();

            this.parsePrivMSG(msg);
        }, 2);

        setInterval(() => {
            if (!this.messageQueue.length) return;

            const msg = this.messageQueue.shift();

            let channel = msg.channel;

            if (channel.indexOf('#') !== 0) {
                channel = `#${channel}`;
            }

            let tmi = this.connections[Math.floor(Math.random() * this.connections.length)];

            if (!tmi._connected) {
                return;
            }

            tmi.privmsg(channel, msg.message);
        }, 300);

        setInterval(() => {
            if (!this.joinQueue.length) return;

            let tmi = this.connections[Math.floor(Math.random() * this.connections.length)];

            if (!tmi._connected) {
                return;
            }

            let channel = this.joinQueue.shift();

            if (channel.indexOf('#') !== 0) {
                channel = `#${channel}`;
            }

            tmi.join(channel);
        }, 250);
    };

    setup = () => {
        this.createIRCConnection(config.twitch.user.name, config.twitch.user.token);
    };

    createIRCConnection = (username, accessToken) => {
        const _self = this;

        const connection = new TMI({
            host: config.twitch.server.host,
            port: config.twitch.server.port,
            nick: username,
            pass: (accessToken.indexOf('oauth:') === -1 ? `oauth:${accessToken}` : accessToken),
            protocol: 'ws_irc',
            secure: false,
        });

        this.connections.push(connection);
        this.connectionQueue.push(connection);

        connection.on('disconnected', () => {
            if (process.env.LOG_LEVEL >= 1) {
                console.log(chalk.keyword('orange')(`${config.twitch.server.host} disconnected on port ${config.twitch.server.port} over ws_irc`));
            }

            _self.createIRCConnection(username, accessToken)
        });

        connection.on('connected', () => {
            if (process.env.LOG_LEVEL >= 2) {
                console.log(chalk.cyan(`${config.twitch.server.host} connected with ${username} on port ${config.twitch.server.port} over ws_irc`));
            }

            this.joinQueue.push(config.twitch.channel.name);
        });


        connection.on('privmsg', data => {
            this.incomingMessageQueue.push(data);
        });
    };

    parsePrivMSG(data) {
        if (['twitchnoify', 'jtv'].indexOf(data.nick) !== -1) {
            return;
        }

        if (process.env.LOG_LEVEL >= 2) {
            const date = getDateTime();
            const color = (typeof data.tags.color === 'boolean') ? '#ffffff' : data.tags.color;
            const userStatusBadges = getChatBadge(data.tags.badges);
            console.log(`${date.hour}:${date.minute}:${date.second} - [${chalk.blueBright(data.target)}] <${userStatusBadges}${chalk.hex(color)(data.tags['display-name'] || data.nick)}> ${data.message}`);
        }

        let command = data.message.split(' ')[0].toLowerCase();

        if (command !== '!volume') {
            return;
        }

        const args = data.message.replace(command, '').trim().split(' ');

        const volume = parseInt(args[0]) / 100;

        obs.send('SetVolume', {
            source: config.obs.sourceName,
            volume: volume,
        }).then(() => {

            console.log(chalk.green(`${data.nick} successfully changed the volume to ${volume}`));

            this.messageQueue.push({
                channel: data.target,
                twitch_message: data.tags.id,
                message: `@${data.nick} -> Successfully changed the volume to ${(volume * 100)}`,
            })
        }).catch(err => {
            console.log('Error changing the volume', err);
        })
    }
}

new Twitchbot();

function getDateTime() {
    let date = new Date();
    let hour = date.getHours();
    let min = date.getMinutes();
    let sec = date.getSeconds();
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();

    hour = (hour < 10 ? "0" : "") + hour;
    min = (min < 10 ? "0" : "") + min;
    sec = (sec < 10 ? "0" : "") + sec;
    month = (month < 10 ? "0" : "") + month;
    day = (day < 10 ? "0" : "") + day;

    return {
        year: year,
        month: month,
        day: day,
        hour: hour,
        minute: min,
        second: sec
    };
}

function getChatBadge(badges) {
    const statusbadges = {
        'broadcaster': '~',
        'admin': '!',
        'global_mod': '*',
        'moderator': '@',
        'subscriber': '%',
        'staff': '&',
        'turbo': '+'
    };

    let data = [];

    if (typeof badges === 'boolean') {
        return '';
    }

    badges = badges.split(',');

    for (let i = 0; i < badges.length; i++) {
        badges[i] = badges[i].replace(/\/\d+/g, '');
        if (badges[i] in statusbadges) {
            data.push(statusbadges[badges[i]]);
        }
    }

    return data.join('');
}
