var mongojs = require("mongojs");
var db = mongojs('localhost:27017/myGame', ['account','progress']);

var express = require('express');
var app = express();
var serv = require('http').Server(app);

app.get('/',function(req, res) {
	res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

serv.listen(2000);
console.log("Server started.");

var SOCKET_LIST = {};

var mapMaxHeight = 480;
var mapMaxWidth = 1920;
//var playerHeight = 200;
//var playerWidth = 200;

var Entity = function(height, width){
	var self = {
		x:250,
		y:250,
		spdX:0,
		spdY:0,
		height:height,
		width:width,
		//float:0,
		//jumpSpeed:0,
		id:"",
	}
	self.update = function(){
		self.updatePosition();
	}
	self.updatePosition = function(){
		self.x += self.spdX;
		self.y += self.spdY;
	}
	self.getDistance = function(pt){
		return Math.sqrt(Math.pow(self.x-pt.x,2) + Math.pow(self.y-pt.y,2));
	}
	self.isHit = function(pt){
		// If one rectangle is on left side of other 
		if (self.x > (pt.x + pt.width/2) || pt.x > (self.x + self.width/2)) 
			return false; 
		// If one rectangle is above other 
		if (self.y > (pt.y + pt.height/2) || pt.y > (self.y + self.height/2)) 
			return false;   
    	return true; 
	}
	
	return self;
}

var Player = function(id){
	var self = Entity(200,200);
	self.id = id;
	self.number = "" + Math.floor(10 * Math.random());
	self.pressingRight = false;
	self.pressingLeft = false;
	self.pressingUp = false;
	self.pressingDown = false;
	self.pressingAttack = false;
	self.mouseAngle = 0;
	self.maxSpd = 10;
	self.hp = 10;
	self.hpMax = 10;
	self.score = 0;
	self.state = 'idle';
	self.direction = 'right';
	self.frame = 1;//may delete
	self.jumping = false; //is player jumping
	self.float = 0; //how much he is above ground
	self.jumpSpeed = 0; //how strong the jump
	
	var super_update = self.update;
	var shootAngle=0;
	self.update = function(){
		self.updateSpd();
		self.frame++;
		super_update();
		
		if(self.pressingAttack){
			if(self.direction === 'right')
				shootAngle = 0;
			else
				shootAngle = 180;
			self.shootBullet(shootAngle);
		}
	}
	self.shootBullet = function(shootAngle=0){
		var b = Bullet(self.id,shootAngle);
		b.x = self.x;
		b.y = self.y;
	}
	
	self.updateSpd = function(){
		if(self.pressingRight){
			if(self.x + self.width/2 < mapMaxWidth)//right wall
				if(self.jumping === false)
					self.spdX = self.maxSpd;
				else//if player jump, change directions, dont add speed 
					self.direction = 'right';
			else
				self.spdX = 0;
		}
		else if(self.pressingLeft){
			if(self.x - self.width/2 > 0)
				if(self.jumping === false)
					self.spdX = -self.maxSpd;
				else
					self.direction = 'left';
			else
				self.spdX = 0;
		}
		else{
			self.spdX = 0;
		}
		
		if(!self.pressingJump && self.jumping === false){//dont allow movements in jump
			if(self.pressingUp){
				if(self.y > 0)
					self.spdY = -self.maxSpd;
				else
					self.spdY = 0;
			}
			else if(self.pressingDown){
				if(self.y + self.height < mapMaxHeight)
					self.spdY = self.maxSpd;
				else
					self.spdY = 0;
			}
			else{
				self.spdY = 0;	
			}
		}else{//jumping
			if(self.y < 0 || self.y + self.height > mapMaxHeight)//dont allow to go over wall in jumping
				self.spdY = 0;
		}
		
		if(self.pressingJump || self.jumping === true){
			self.pressingJump = false;
			if(self.float == 0 && self.jumpSpeed == 0){//start jump
				self.jumping = true;
				self.jumpSpeed = 15;
			}else if(self.float <= 0 && self.jumpSpeed < 0){//landed
				self.jumping = false;
				self.float = 0;//may prevent going underground
				self.jumpSpeed = 0;
			}else{//mid jump, float>0
				self.float += self.jumpSpeed;
				self.jumpSpeed -= 2;
			}
		}else{//may prevent bugs
				self.float = 0;
				self.jumpSpeed = 0;
		}
		

		if(self.spdX > 0)
			self.direction = 'right';
		else if(self.spdX < 0)
			self.direction = 'left';
		
		if(self.jumping){//change
			if(self.pressingAttack || self.state === 'jump_attack')
				self.state = 'jump_attack';
			else
				self.state = 'jump';	
		}
		else if(self.spdX !== 0 || self.spdY !== 0)
			self.state = 'run';	
		else
			self.state = 'idle';
		/*
		if(self.pressingAttack){
			if(self.jumping === true){ //attack in air
				self.state = 'jump_attack';
			}
		}
		*/
	}
	
	self.getInitPack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,	
			float:self.float,
			number:self.number,	
			hp:self.hp,
			hpMax:self.hpMax,
			score:self.score,
			state:self.state,
			direction:self.direction,
			frame:self.frame,
		};		
	}
	self.getUpdatePack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,
			float:self.float,
			hp:self.hp,
			score:self.score,
			state:self.state,
			direction:self.direction,
			frame:self.frame,
		}	
	}
	/*
	self.setState = function(state){
		self.state = state;
	}
	*/
	
	Player.list[id] = self;
	
	initPack.player.push(self.getInitPack());
	return self;
}
Player.list = {};
Player.onConnect = function(socket){
	var player = Player(socket.id);
	socket.on('keyPress',function(data){
		if(data.inputId === 'left')
			player.pressingLeft = data.state;
		else if(data.inputId === 'right')
			player.pressingRight = data.state;
		else if(data.inputId === 'up')
			player.pressingUp = data.state;
		else if(data.inputId === 'down')
			player.pressingDown = data.state;
		else if(data.inputId === 'attack')
			player.pressingAttack = data.state;
		else if(data.inputId === 'jump')
			player.pressingJump = data.state;
		else if(data.inputId === 'defence')
			player.pressingDefence = data.state;
		else if(data.inputId === 'mouseAngle')
			player.mouseAngle = data.state;
	});
	
	socket.emit('init',{
		selfId:socket.id,
		player:Player.getAllInitPack(),
		bullet:Bullet.getAllInitPack(),
	})
}
Player.getAllInitPack = function(){
	var players = [];
	for(var i in Player.list)
		players.push(Player.list[i].getInitPack());
	return players;
}

Player.onDisconnect = function(socket){
	delete Player.list[socket.id];
	removePack.player.push(socket.id);
}
Player.update = function(){
	var pack = [];
	for(var i in Player.list){
		var player = Player.list[i];
		player.update();
		pack.push(player.getUpdatePack());		
	}
	return pack;
}
/*
var isHit = function(p1_x, p1_y, p1_width, p1_height, p2_x, p2_y, p2_width, p2_height){
	
}
*/
var Bullet = function(parent,angle){
	var self = Entity(5,5);
	self.id = Math.random();
	//self.spdX = Math.cos(angle/180*Math.PI) * 10;
	self.spdX = 20;	
	if(angle !== 0)
		self.spdX *= -1;
	self.spdY = Math.sin(angle/180*Math.PI) * 10;
	self.parent = parent;
	self.timer = 0;
	self.toRemove = false;
	var super_update = self.update;
	self.update = function(){
		if(self.timer++ > 50 || self.x < 0 || self.x > mapMaxWidth)
			self.toRemove = true;
		super_update();
		
		for(var i in Player.list){
			var p = Player.list[i];
			//if(self.getDistance(p) < 32 && self.parent !== p.id){
			if(self.parent !== p.id){
				if(self.isHit(p)){
					p.hp -= 1; //bullet hit

					if(p.hp <= 0){ //player dead
						var shooter = Player.list[self.parent];
						if(shooter)
							shooter.score += 1;
						p.hp = p.hpMax;
						p.x = Math.random() * 1300 + 100;//start user at random position
						p.y = Math.random() * 150 + 100;
					}
					self.toRemove = true; //remove bullet on hit
				}
			}
		}
	}
	self.getInitPack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,		
		};
	}
	self.getUpdatePack = function(){
		return {
			id:self.id,
			x:self.x,
			y:self.y,		
		};
	}
	
	Bullet.list[self.id] = self;
	initPack.bullet.push(self.getInitPack());
	return self;
}
Bullet.list = {};

Bullet.update = function(){
	var pack = [];
	for(var i in Bullet.list){
		var bullet = Bullet.list[i];
		bullet.update();
		if(bullet.toRemove){
			delete Bullet.list[i];
			removePack.bullet.push(bullet.id);
		} else
			pack.push(bullet.getUpdatePack());		
	}
	return pack;
}

Bullet.getAllInitPack = function(){
	var bullets = [];
	for(var i in Bullet.list)
		bullets.push(Bullet.list[i].getInitPack());
	return bullets;
}

var DEBUG = true;

var isValidPassword = function(data,cb){
	db.account.find({username:data.username,password:data.password},function(err,res){
		if(res.length > 0)
			cb(true);
		else
			cb(false);
	});
}
var isUsernameTaken = function(data,cb){
	db.account.find({username:data.username},function(err,res){
		if(res.length > 0)
			cb(true);
		else
			cb(false);
	});
}
var addUser = function(data,cb){
	db.account.insert({username:data.username,password:data.password},function(err){
		cb();
	});
}

var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket){
	socket.id = Math.random();
	SOCKET_LIST[socket.id] = socket;
	
	socket.on('signIn',function(data){
		isValidPassword(data,function(res){
			if(res){
				Player.onConnect(socket);
				socket.emit('signInResponse',{success:true});
			} else {
				socket.emit('signInResponse',{success:false});			
			}
		});
	});
	socket.on('signUp',function(data){
		isUsernameTaken(data,function(res){
			if(res){
				socket.emit('signUpResponse',{success:false});		
			} else {
				addUser(data,function(){
					socket.emit('signUpResponse',{success:true});					
				});
			}
		});		
	});
	
	
	socket.on('disconnect',function(){
		delete SOCKET_LIST[socket.id];
		Player.onDisconnect(socket);
	});
	socket.on('sendMsgToServer',function(data){
		var playerName = ("" + socket.id).slice(2,7);
		for(var i in SOCKET_LIST){
			SOCKET_LIST[i].emit('addToChat',playerName + ': ' + data);
		}
	});
	
	socket.on('evalServer',function(data){
		if(!DEBUG)
			return;
		var res = eval(data);
		socket.emit('evalAnswer',res);		
	});
	
	
	
});

var initPack = {player:[],bullet:[]};
var removePack = {player:[],bullet:[]};


setInterval(function(){
	var pack = {
		player:Player.update(),
		bullet:Bullet.update(),
	}
	
	for(var i in SOCKET_LIST){
		var socket = SOCKET_LIST[i];
		socket.emit('init',initPack);
		socket.emit('update',pack);
		socket.emit('remove',removePack);
	}
	initPack.player = [];
	initPack.bullet = [];
	removePack.player = [];
	removePack.bullet = [];
	
},1000/25);










