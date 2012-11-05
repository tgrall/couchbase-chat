var express = require('express');
var app = express();
var http = require('http');
var server = http.createServer(app);
var io = require('socket.io').listen(server);

var driver = require('couchbase');

driver.connect({
	"username": "",
	"password": "",
	"hostname": "localhost:8091",
	"bucket": "default"}, 
	function(err, couchbase) {
		if (err) {
			throw (err)
		}

		server.listen(8080);

		app.get('/', function(req, res) {
			res.sendfile(__dirname + '/index.html');
		});

		// usernames which are currently connected to the chat
		var usernames = {};

		io.sockets.on('connection', function(socket) {

			/**
			* When the user post a new message this even it called
			*/
			socket.on('postMessage', function(data) {
				// create a new message
				var message = {
					type: "message",
					user: socket.username,
					message: data,
					timestamp: Date.now()
				}

				couchbase.incr("chat:msg_count", function (data, error, key, cas, value ) { 
					var messageKey = "chat:"+ value;
					message.id = value;
					io.sockets.emit('updateChatWindow', message);
					couchbase.set(messageKey, JSON.stringify(message),function(err) {  });	
				});


			});



			/*
			* This function is used to 'connect' the user to the chat server
			*/
			socket.on('addUser', function(username) {
				socket.username = username; 
				usernames[username] = username; 

				var message = {
					type: "message",
					user: "SERVER",
					message: "you have connected",
					timestamp: Date.now()
				}
				socket.emit('updateChatWindow', message);

				// create a new message
				message = {
					type: "message",
					user: "SERVER",
					message: username + " has connected",
					timestamp: Date.now()
				}


				// get the current message sequence
				couchbase.get("chat:msg_count", function(err, value, meta) {
					if (!err) { // if the key is found push the new key
						socket.emit('updateStartKey', value);
					} else {
						console.log( "Error : "+ err );
					}
				});
				socket.broadcast.emit('updateChatWindow', message );
				io.sockets.emit('updateUserWindow', usernames); 
			});

			/**
			* Disconnect, send message to all users
			*/
			socket.on('disconnect', function() {
				delete usernames[socket.username];
				var message = {
					type: "message",
					user: "SERVER",
					message: socket.username + " has disconnected",
					timestamp: Date.now()
				}
				socket.broadcast.emit('updateChatWindow', message ); 
				io.sockets.emit('updateUserWindow', usernames);
			});


			/**
			* Return the message history
			*/
			socket.on('showhistory', function(limit,startkey) {
				var keys = new Array();
				for (i = startkey; i > (startkey-limit) || i ; i--) {
					keys.push("chat:"+i);
				}
				couchbase.get(keys,function(err, doc, meta) {
					socket.emit('updateChatWindow', doc, true);
				});

			});


		});

});




