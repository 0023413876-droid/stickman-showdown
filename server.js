const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Cấu hình CORS để chạy trên các môi trường Cloud (Render,...)
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Phục vụ file tĩnh trong thư mục public
app.use(express.static('public'));

// Các hàng đợi cho chế độ 2, 3, 4, 5 người
const matchQueues = {
    2: [],
    3: [],
    4: [],
    5: []
};

io.on('connection', (socket) => {
    console.log(`🦇 Người chơi kết nối thành công: ${socket.id}`);

    const updateQueueStatus = (maxPlayers) => {
        const queue = matchQueues[maxPlayers];
        queue.forEach(playerSocket => {
            playerSocket.emit('roomUpdate', {
                currentPlayers: queue.length,
                maxPlayers: maxPlayers
            });
        });
    };

    const removeFromQueue = (socket) => {
        if (socket.waitingMode) {
            const mode = socket.waitingMode;
            const index = matchQueues[mode].indexOf(socket);
            if (index !== -1) {
                matchQueues[mode].splice(index, 1);
                updateQueueStatus(mode);
                console.log(`❌ Người chơi ${socket.id} đã hủy tìm trận. Rời hàng đợi chế độ ${mode} người.`);
            }
            socket.waitingMode = null;
        }
    };

    // TÌM TRẬN
    socket.on('findMatch', (data) => {
        const maxPlayers = (data && data.maxPlayers) ? data.maxPlayers : 5; 
        
        removeFromQueue(socket);

        if (matchQueues[maxPlayers]) {
            matchQueues[maxPlayers].push(socket);
            socket.waitingMode = maxPlayers; 
            
            console.log(`⏳ Người chơi ${socket.id} đang xếp hàng tại phòng chờ (Chế độ ${maxPlayers} người) - (${matchQueues[maxPlayers].length}/${maxPlayers})`);
            
            updateQueueStatus(maxPlayers);

            // Gom đủ người thì tạo phòng
            if (matchQueues[maxPlayers].length === maxPlayers) {
                const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5); 
                
                const playersInRoom = matchQueues[maxPlayers].splice(0, maxPlayers);
                const playerIds = playersInRoom.map(p => p.id);

                playersInRoom.forEach(p => {
                    p.join(roomId);
                    p.currentRoom = roomId;
                    p.waitingMode = null;
                });

                io.to(roomId).emit('matchFound', {
                    roomId: roomId,
                    players: playerIds
                });
                
                console.log(`🎮 Trận đấu bắt đầu tại phòng: ${roomId} (Gồm ${maxPlayers} người)`);
            }
        }
    });

    // HỦY TÌM TRẬN
    socket.on('cancelFindMatch', () => {
        removeFromQueue(socket);
    });

    // CHỦ ĐỘNG THOÁT TRẬN (TỪ NÚT 3 VẠCH)
    socket.on('leaveMatch', () => {
        if (socket.currentRoom) {
            console.log(`running Người chơi ${socket.id} đã chủ động thoát khỏi trận!`);
            socket.to(socket.currentRoom).emit('opponentLeft', { id: socket.id });
            socket.leave(socket.currentRoom);
            socket.currentRoom = null; 
        }
    });

    // TÍNH NĂNG MÁU THỜI GIAN THỰC KHI ĐÁNH TRÚNG
    socket.on('playerHit', (data) => {
        if (data.roomId && data.targetId) {
            // Gửi thông báo cho toàn bộ phòng biết ai vừa bị đấm trúng và bị đánh bởi hướng nào để lùi lại
            io.to(data.roomId).emit('onPlayerHit', {
                targetId: data.targetId,
                attackerId: socket.id,
                facing: data.facing // Hướng quay mặt của người đấm để xử lý đẩy lùi (Knockback)
            });
        }
    });

    // ĐỒNG BỘ THAO TÁC TRONG GAME
    socket.on('playerAction', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('opponentAction', {
                id: socket.id,
                x: data.x,
                y: data.y,
                vx: data.vx,
                vy: data.vy,
                isGrounded: data.isGrounded,
                facing: data.facing,
                isAttacking: data.isAttacking,
                hp: data.hp
            });
        }
    });

    // MẤT KẾT NỐI (TẮT TRÌNH DUYỆT)
    socket.on('disconnect', () => {
        console.log(`❌ Người chơi ngắt kết nối: ${socket.id}`);
        removeFromQueue(socket);
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('opponentLeft', { id: socket.id });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 SERVER GAME STICKMAN ĐANG CHẠY ỔN ĐỊNH!`);
    console.log(`🌐 Chạy cục bộ (Localhost): http://localhost:${PORT}`);
    console.log(`💰 Chạy trên môi trường Cloud (Render): Port ${PORT}`);
    console.log(`==================================================`);
});