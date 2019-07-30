'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 3;

module.exports = {
    obs: {
        address: 'localhost',
        port: 4444,
        password: '',
        sourceName: 'Music'
    },
    twitch: {
        user: {
            name: '',
            token: 'oauth:XXXXXXXXXXX',
        },
        channel: {
            name: 'myfuriouschannel',
        },
        server: {
            host: 'irc-ws.chat.twitch.tv',
            port: 80
        },
    },
};
