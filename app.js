var express = require('express');
var app = express();
var http = require('http');
var server = http.createServer(app);
var io = require('socket.io').listen(server);
var driver = require('couchbase');
var baseview = require('baseview')('http://127.0.0.1:8092');

var cb = new driver.Couchbase("127.0.0.1:8091", null, null, "default");

server.listen(8080);


function start() {
	// check if the couchbase view exists 
 	// if not create it
	// check if the view exist if not create it	
	baseview.getDesign('chat_messages', function(err,res) {
		if (err != null && err.error == 'not_found') {
		  baseview.setDesign('chat_messages', {
		     'history': {
		        'map': "function(doc,meta){if(doc.type == 'message'){emit(meta.id, doc.timestamp);}}"
		   	  }
		    },
		    function(err, res){
		      console.log(err);
		    }
		  );	
		}
		
	});	
	
	

}
exports.start = start;
start();


app.get('/', function(req, res) {
	res.sendfile(__dirname + '/index.html');
});

// usernames which are currently connected to the chat
var usernames = {};

io.sockets.on('connection', function(socket) {
	
	socket.on('sendchat', function(data) {
		// create a new message
		var message = {
			type: "message",
			user: socket.username,
			message: data,
			timestamp: Date.now()
		}
		var messages = [message];
		io.sockets.emit('updatechat', messages);		
		persistData(message);
	});


	/*
	 * This function is used to 'connect' the user to the chat server
	 */
	socket.on('connectuser', function(username) {
		socket.username = username; // store the username in the socket session
		usernames[username] = username; // add the user to the list of user
		
		// create a new message
		var message = {
			type: "message",
			user: "SERVER",
			message: "you have connected",
			timestamp: Date.now()
		}
		var messages = [message];
		socket.emit('updatechat', messages); // send back a message to the suer
		
		// create a new message
		message = {
			type: "message",
			user: "SERVER",
			message: username + " has connected",
			timestamp: Date.now()
		}
		
		socket.broadcast.emit('updatechat', message ); // broadcast to everybody
		io.sockets.emit('updateusers', usernames); // update the userlist on the client


	});

	// when the user disconnects.. perform this
	socket.on('disconnect', function() {
		// remove the username from global usernames list
		delete usernames[socket.username];
		// update list of users in chat, client-side
		io.sockets.emit('updateusers', usernames);
		// echo globally that this client has left
		socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
	});
	
	
	socket.on('showhistory', function(limit,startkey) {
		if (limit == undefined) {
			limit = 5;
		}
		var params = 
			{ 'limit'		 : limit
			, 'descending'	 : 'true'
			, 'include_docs' : 'true'
			, 'stale'		 : 'false' 
			};
		
		if (startkey !== undefined && startkey !=null) {
			params.startkey = JSON.stringify(startkey) ;
		}
		
		baseview.view('chat_messages', 'history', params, function(error, data) {
				var messages = new Array();
		 		for( var i = data.rows.length-1,length = data.rows.length ; i >= 0; i-- ) {
					var message = data.rows[i].doc.json;				
					var messageDate = new Date(message.timestamp);
					messages[i] = message;
					// send the first key to the client
					if(i == data.rows.length-1){
						console.log(">>>> "+ message.message +" -- "+ message.timestamp);
						io.sockets.emit('updateStartkey', message.timestamp - 1); // remove 1ms to the key
					}
				}	
				io.sockets.emit('updatechat', messages, true); // show history
			});			
	  	});
});


/** NEED TO SEE WHAT IS THE BEST WAY TO CALL A METHOD **/
function persistData( message) {
	var messageKey = message.timestamp +"-"+ message.user;
	cb.set(messageKey,  JSON.stringify(message) , 0, undefined, function(data, error, key, cas) {
		if (error) {
			console.log("Failed to store object");
		} else {
			if (key != messageKey) {
				console.log("Callback called with wrong key!");
			}
		}
	});
}
