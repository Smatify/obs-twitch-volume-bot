'use strict';

const EventEmitter = require('events').EventEmitter;
const net = require('net');
const tls = require('tls');
const parse = require('irc-message').parse;
const util = require('util');
const WebSocket = require('ws');

class IRC {
    constructor(options) {
        EventEmitter.call(this);

        this.options = options;
        this._socket = null;
        this._connected = false;
        this._buffer = null;
        this._pingTimer;

        if (!this.options.host) {
            throw new Error('No host configured');
        }

        if (!this.options.port) {
            throw new Error('No port configured');
        }

        if (!this.options.nick) {
            throw new Error('No nick configured');
        }

        if (!this.options.protocol) {
            throw new Error('No protocol configured');
        }
    }

    _wsConnect() {
        const _self = this;
        const protocol = this.options.secure ? 'wss:' : 'ws:';
        const socket = new WebSocket(protocol + '//' + this.options.host + ':' + this.options.port, 'irc', {
            localAddress: this.options.localAddress,
            rejectUnauthorized: false
        });

        socket.on('open', () => _self._onOpen());
        socket.on('message', data => _self._onData(data));
        socket.on('close', () => _self._onClose());
        socket.on('error', () => _self._onClose());

        this._socket = socket;
    }

    _ircConnect() {
        const _self = this;
        const protocol = this.options.secure ? tls : net;
        const socket = protocol.connect({
            host: this.options.host,
            port: this.options.port,
            localAddress: this.options.localAddress,
            rejectUnauthorized: false
        }, () => _self._onOpen());

        socket.on('data', data => _self._onData(data));
        socket.on('end', () => _self._onClose());
        socket.on('error', () => _self._onClose(e));
        socket.on('timeout', () => _self._onTimeout());

        this._socket = socket;
    }

    connect() {
        if (this._socket) return this.reconnect();
        return this.options.protocol === 'irc' ? this._ircConnect() : this._wsConnect();
    }

    disconnect() {
        if (this._socket) return this.reconnect();
        return this.options.protocol === 'irc' ? this._ircConnect() : this._wsConnect();
    }

    reconnect() {
        this._closeSocket();
        this.connect();
    }

    _closeSocket() {
        try {
            if (this.options.protocol === 'irc') {
                this._socket.destroy();
            } else {
                this._socket.close();
            }
        } catch (e) {
        }

        delete this._socket;
    }

    _onOpen() {
        this.started = new Date();
        this._connected = true;
        this._pingTimer = setInterval(() => this._send('PING'), 120000);
        if (this.options.pass) this._send('PASS', this.options.pass);
        this._send('NICK', this.options.nick);
        this._send('CAP', 'REQ', ':twitch.tv/commands twitch.tv/tags twitch.tv/membership');
        this.emit('connected');
    }

    _onData(data) {
        const lines = data.toString().split('\r\n');

        if (this._buffer) {
            lines[0] = this._buffer + lines[0];
            this._buffer = null;
        }

        if (lines[lines.length - 1] !== '') {
            this._buffer = lines.pop();
        }

        for (let i = 0; i < lines.length; i++) {
            this._parse(lines[i]);
        }
    }

    _parse(message) {
        message = parse(message);

        if (!message) return;

        if (message.command === 'PING') {
            this._send('PONG', message.params.join(' '));
            return;
        }

        const data = {
            target: message.params.shift(),
            nick: message.prefix ? message.prefix.split('@')[0].split('!')[0] : undefined,
            tags: message.tags,
            message: message.params.shift(),
            raw: message.raw
        };

        data.username = data.tags['display-name'] || data.nick;

        this.emit(message.command.toLowerCase(), data);
    }

    _onClose(e) {
        if (!this._connected) return;
        this._connected = false;
        clearInterval(this._pingTimer);
        this.emit('disconnected');
    }

    _onTimeout() {
        this._connected = false;
        clearInterval(this._pingTimer);
        this.emit('disconnected');
    }

    _send() {
        if (!this._connected || !this._socket) return;

        if (this.options.protocol === 'irc') {
            this._socket.write(Array.prototype.join.call(arguments, ' ') + '\r\n');
        } else {
            this._socket.send(Array.prototype.join.call(arguments, ' ') + '\r\n');
        }
    }

    join(channel) {
        this._send('JOIN', channel);
    }

    part(channel) {
        this._send('PART', channel);
    }

    privmsg(channel, message) {
        this._send('PRIVMSG', channel, ':' + message);
    }

    setSetting(setting, val) {
        this.options[setting] = val;
    }

    getSetting(setting) {
        return this.options[setting];
    }
}

util.inherits(IRC, EventEmitter);

module.exports = IRC;
