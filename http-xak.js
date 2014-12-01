
if (!/v0\.(10|9|8|7|6)(\.|$)/.test(process.version) ) {
	return;
};

var debug = false;

var util = require('util');

var HTTPS = require('https');
var HTTP = require('http');
var Agent = HTTP.Agent;

HTTP.globalAgent.maxSockets = Math.max(8, HTTP.globalAgent.maxSockets);

var _requests_https = {};
var _requests_http = {};
var _sockets_https = {};
var _sockets_http = {};

if (false) {
	setInterval(sInf, 1000 * 60 * 10);
	setTimeout(sInf, 2000);
};
	
function sInf() {
	socInfo('https', _sockets_https);
	socInfo('http', _sockets_http);
};

var uix = Math.random().toString(36).substr(2,3);

function socInfo(name, ss) {
	var i = 0, s, x, v;

	//if (debug) console.log('- sockets info - ' + name);
	
	for(x in ss) {
		a = ss[x];

		for(i = 0; i < a.length ; i++) {
			s = a[i];
			if (!v) {
				v = true;
				if (debug) console.log('----------------------------------');
			}

			if (debug) console.log('> '+ uix +' - sockets '+name+' - ' + i + ' - ' + !!s.destroyed + ' -- ' + !!s.busyWork + ' -- '+ String(new Date() - s._tmCreate).replace(/(\d{1,3})$/, '.$1') + ' > ' + x );
			if ( (new Date() - s._tmCreate) > 1087000 ) {
				if (debug) console.log('<<< finish sockets - ' + name);
				s.destroy();
			};
		};
	};
}


function init_vflashFix(agent) {
	if (agent._init_vflashFix) return;
	agent._init_vflashFix = true;

	if (agent.createConnection == HTTP.globalAgent.createConnection ) {
		agent.requests = _requests_http;
		agent.sockets = _sockets_http;

	} else if (agent.createConnection == HTTPS.globalAgent.createConnection) {
		agent.requests = _requests_https;
		agent.sockets = _sockets_https;
	};
};

function getFreeSocket(sockets) {
	var i = sockets.length, s;

	while(s = sockets[--i]) {
		if (!s.busyWork && !s.destroyed && (+new Date() - s._tmCreate) < 721000 ) {
			s._tmCreate = +new Date();
			return s;
		};
	};
};

Agent.prototype.addRequest = function(req, host, port, localAddress) {
	init_vflashFix(this);
	
	var self = this;
	var name = host + ':' + port;
	if (localAddress) {
		name += ':' + localAddress;
	};

	if (!this.sockets[name]) this.sockets[name] = [];
	//if (debug) console.log('-- addRequest - '+ (this.sockets[name].length) +' --');

	var s;
	if (s = getFreeSocket(this.sockets[name])) {
		s.tmmrFree = clearTimeout(s.tmmrFree);
		s.busyWork = true;

		req.onSocket(s);
		return;

	};

	if (!this.requests[name]) this.requests[name] = [];
	this.requests[name].push(req);

	if (this.sockets[name].length < this.maxSockets) {
		// If we are under maxSockets create a new one.
		var s = this.createSocket(name, host, port, localAddress, req);
		s.busyWork = true; 

		/*
		var tmcn = setTimeout(function() {
			if (debug) console.log('-- timmeout connect -- 12000 --- ' + name )
		}, 12000)
		*/
		
		s.on(s.getPeerCertificate ? 'secureConnect' : 'connect', function() {
			//clearTimeout(tmcn);

			s.busyWork = false;
			s.emit('free');
		});

		s.on('error', function x_error() {
			//clearTimeout(tmcn);
			s.busyWork = 'x-error';

			if ( !(self.requests[name]||false).length || (self.sockets[name]||false).length ) {
				// if (debug) console.log('-- error connect --');
				return;
			};

			if (debug) console.log('-- !! error req connect !! --');
		});
	};
};




Agent.prototype.createSocket = function(name, host, port, localAddress, req) {
  init_vflashFix(this);

  var self = this;
  var options = util._extend({}, self.options);
  options.port = port;
  options.host = host;
  options.localAddress = localAddress;

  options.servername = host;
  if (req) {
    var hostHeader = req.getHeader('host');
    if (hostHeader) {
      options.servername = hostHeader.replace(/:.*$/, '');
    }
  }

  var s = self.createConnection(options);
  
  s._tmCreate = +new Date();
  
  if (!self.sockets[name]) self.sockets[name] = [];
  this.sockets[name].push(s);

  var onFree = function() {
	s.busyWork = true;

	if (s.destroyed) {
		//self.emit('free', s, host, port, localAddress);
		s.destroy();
		return;
	};

	if (self.requests[name] && self.requests[name].length) {
		self.emit('free', s, host, port, localAddress);
		return;

		self.requests[name].shift().onSocket(s);
		if (self.requests[name].length === 0) {
			// don't leak
			delete self.requests[name];
		};
		return;
	};

	s.busyWork = false;
	s.tmmrFree = setTimeout(function() {
		//s.busyWork = true;
		//self.emit('free', s, host, port, localAddress);
		s.destroy();
	}, 1200);
  };
  var onClose = function(err) {
    // This is the only place where sockets get removed from the Agent.
    // If you want to remove a socket from the pool, just close it.
    // All socket errors end in a close event anyway.
    self.removeSocket(s, name, host, port, localAddress);
  };
  var onRemove = function() {
    // We need this function for cases like HTTP 'upgrade'
    // (defined by WebSockets) where we need to remove a socket from the pool
    //  because it'll be locked up indefinitely
    self.removeSocket(s, name, host, port, localAddress);
    s.removeListener('close', onClose);
    s.removeListener('free', onFree);
    s.removeListener('agentRemove', onRemove);
  };

  s.on('agentRemove', onRemove);
  s.on('free', onFree);
  s.on('close', onClose);

  return s;
};

