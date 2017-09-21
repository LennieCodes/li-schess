/* eslint-disable no-console */
// import SChess from "schess.js";
const SChess = require("schess.js").SChess;

// const gameState = new SChess();

const seekers = [];

const rooms = [];

const sockets = {};

let nextRoomid = 0;

let numConnections = 0;

const printState = event => {
	console.log();
	console.log(event, "-".repeat(50 - event.length - 1));
	console.log(`# connections: ${numConnections}`);
	console.log(`# seeks: ${seekers.length}`);
	console.log(`# rooms: ${rooms.length}`);
	console.log("rooms:");
	rooms
		.map(
			r => `[${r.id}: ${r.white.id} vs ${r.black.id}, inPlay:${r.inPlay}]`
		)
		.forEach(r => console.log(r));
	console.log("-".repeat(50));
	console.log();
};

const handleConnect = (io, socket) => {
	console.log("A client just joined on", socket.id);
	numConnections += 1;
	io.emit("updateNumConnections", numConnections);
};

const handleMove = (io, socket, move) => {
	console.log("got move:", move);
	const game = sockets[socket.id].game;
	game.move(
		Object.assign({}, move, {
			promotion: move.promotion ? move.promotion.charAt(0) : undefined
		})
	);
	socket.broadcast.emit("opponentMove", move);
	const roomName = sockets[socket.id].id.toString();
	if (game.in_checkmate()) {
		if (game.turn() === "b") io.in(roomName).emit("whiteWinsMate");
		else io.in(roomName).emit("blackWinsMate");
		sockets[socket.id].inPlay = false;
		emitUpdateNumGames(io);
	}
};

const handleDisconnect = (io, socket) => {
	numConnections -= 1;
	cancelSeek(socket.id);
	const room = sockets[socket.id];
	if (room) {
		room.inPlay = false;
		socket.to(room.id.toString()).emit("opponentDisconnected");
	}
	io.emit("updateNumConnections", numConnections);
	emitUpdateNumGames(io);
};

const handleNewSeek = (io, socket) => {
	if (seekers.length > 0) {
		const players =
			Math.random() > 0.5
				? [socket, seekers.pop()]
				: [seekers.pop(), socket];
		const white = players[0];
		const black = players[1];
		const newRoom = {
			id: nextRoomid++,
			white,
			black,
			players,
			game: new SChess(),
			inPlay: true
		};
		rooms.push(newRoom);
		sockets[white.id] = newRoom;
		sockets[black.id] = newRoom;
		const roomName = newRoom.id.toString();
		white.join(roomName);
		black.join(roomName);
		io.in(roomName).emit("seekAccepted");
		white.emit("setColor", "white");
		black.emit("setColor", "black");
		io.in(roomName).emit("startGame");
		emitUpdateNumGames(io);
	} else {
		seekers.push(socket);
	}
};

const handleResign = (io, socket) => {
	const room = sockets[socket.id];
	const roomName = room.id.toString();
	if (socket.id === room.white.id) {
		io.in(roomName).emit("whiteResigned");
	} else if (socket.id === room.black.id) {
		io.in(roomName).emit("blackResigned");
	}
	room.inPlay = false;
	emitUpdateNumGames(io);
};

const cancelSeek = socketId => {
	const index = seekers.findIndex(seeker => seeker.id === socketId);
	if (index !== -1) seekers.splice(index, 1);
};

const emitUpdateNumGames = io => {
	io.emit("updateNumGames", rooms.filter(r => r.inPlay === true).length);
};

module.exports.socketServer = io => {
	io.on("connection", socket => {
		handleConnect(io, socket);
		printState("connection");

		socket.on("move", move => {
			handleMove(io, socket, move);
			printState("move");
		});

		socket.on("disconnect", () => {
			handleDisconnect(io, socket);
			printState("disconnect");
		});

		socket.on("newSeek", () => {
			handleNewSeek(io, socket);
			printState("newSeek");
		});

		socket.on("cancelSeek", () => {
			cancelSeek(socket.id);
			printState("cancelSeek");
		});

		socket.on("resign", () => {
			handleResign(io, socket);
			printState("resign");
		});
	});
};
