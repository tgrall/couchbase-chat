var express = require('express');
var app = express();
var http = require('http');
var server = http.createServer(app);
var io = require('socket.io').listen(server);
var driver = require('couchbase');
var baseview = require('baseview')('http://127.0.0.1:8092');

var cb = new driver.Couchbase("127.0.0.1:8091", null, null, "default");

server.listen(8080);

/**
 * Insert the view in the database if not already present
 */
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

start();


app.get('/', function(req, res) {
	res.sendfile(__dirname + '/index.html');
});

var usernames = {}; // contains the list of connected users


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
		var messages = [message];
		io.sockets.emit('updateChatWindow', messages);		

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

	});

	socket.on('addUser', function(username) {
		socket.username = username; 
		usernames[username] = username; 
		
		// create a new message
		var message = {
			type: "message",
			user: "SERVER",
			message: "you have connected",
			timestamp: Date.now()
		}
		var messages = [message];
		socket.emit('updateChatWindow', messages); 
		
		console.log( message );
		
		message = {
			type: "message",
			user: "SERVER",
			message: username + " has connected",
			timestamp: Date.now()
		}
		messages = [message];
		socket.broadcast.emit('updateChatWindow', messages ); 
		io.sockets.emit('updateUserWindow', usernames);


	});

	socket.on('disconnect', function() {
		delete usernames[socket.username];
		var message = {
			type: "message",
			user: "SERVER",
			message: socket.username + " has disconnected",
			timestamp: Date.now()
		}
		var messages = [message];
		socket.broadcast.emit('updateChatWindow', messages ); 
		io.sockets.emit('updateUserWindow', usernames);
	});
	
	/**
	 * Call the view to get the older messages
	 *  - startkey : the timestamp used as starting point to read the result 
	 *  - limit : number of document/messages to retrieve
	 */
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
						socket.emit('updateStartkey', message.timestamp - 1); // remove 1ms to the key
					}
				}	
				socket.emit('updateChatWindow', messages, true); // show history
			});			
	  	});
});


