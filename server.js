const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

const gameRooms = {};
const scores = {};

io.on("connection", (socket) => {
  console.log("Bağlantı sağlandı:", socket.id);

  // Oda oluştur ve oluşturanı otomatik ekle
  socket.on("create_room", () => {
    const roomId = generateRoomId();
    
    // Odayı ve oluşturanı ekle
    gameRooms[roomId] = {
      board: Array(9).fill(""),
      players: { [socket.id]: "X" }, // Oluşturan X olsun
      currentPlayer: socket.id,      // İlk sıra oluşturanda
      winner: null
    };
    scores[roomId] = { X: 0, O: 0 };

    socket.join(roomId);
    socket.emit("room_created", roomId);
    
    // Oluşturan kişiye oyun durumunu gönder
    io.to(roomId).emit("game_state", gameRooms[roomId]);
  });

  // Odaya katıl (İkinci oyuncu)
  socket.on("join_room", (roomId) => {
    const room = gameRooms[roomId];
    if (!room) return socket.emit("error", "Oda bulunamadı!");
    if (Object.keys(room.players).length >= 2) return socket.emit("error", "Oda dolu!");

    socket.join(roomId);
    room.players[socket.id] = "O"; // İkinci oyuncu O olsun
    
    // Tüm oyunculara güncel durumu gönder
    io.to(roomId).emit("game_state", room);
    io.to(roomId).emit("update_scores", scores[roomId]);
  });

  socket.on("make_move", (data) => {
    const { roomId, index } = data;
    const room = gameRooms[roomId];
    const playerSymbol = room.players[socket.id];

    if (room.winner || room.currentPlayer !== socket.id || room.board[index] !== "") return;

    room.board[index] = playerSymbol;
    checkWinner(roomId);
    room.currentPlayer = Object.keys(room.players).find(id => id !== socket.id);
    io.to(roomId).emit("game_state", room);
  });

  socket.on("disconnect", () => {
    Object.keys(gameRooms).forEach(roomId => {
      if (gameRooms[roomId].players[socket.id]) {
        delete gameRooms[roomId].players[socket.id];
        resetGame(roomId);
        io.to(roomId).emit("game_state", gameRooms[roomId]);
      }
    });
  });
});

function checkWinner(roomId) {
  const room = gameRooms[roomId];
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (room.board[a] && room.board[a] === room.board[b] && room.board[a] === room.board[c]) {
      room.winner = room.board[a];
      scores[roomId][room.winner]++;
      startNewGameCountdown(roomId);
      break;
    }
  }

  if (!room.board.includes("") && !room.winner) {
    room.winner = "draw";
    startNewGameCountdown(roomId);
  }
}

function startNewGameCountdown(roomId) {
  io.to(roomId).emit("countdown_start");
  setTimeout(() => resetGame(roomId), 5000);
  io.to(roomId).emit("update_scores", scores[roomId]);
}

function resetGame(roomId) {
  const room = gameRooms[roomId];
  room.board = Array(9).fill("");
  room.winner = null;
  room.currentPlayer = Object.keys(room.players)[0] || null;
  io.to(roomId).emit("game_state", room);
}

function generateRoomId() {
  return Math.random().toString(36).substr(2, 5).toUpperCase();
}

const port = process.env.PORT || 3000; // Heroku portunu dinle

http.listen(port, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${port}`);
});