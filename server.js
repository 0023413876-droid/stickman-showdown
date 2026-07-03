const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ĐỔI ỔN ĐỊNH CỔNG ĐỂ CHẠY ĐƯỢC CẢ TRÊN CLOUD RENDER VÀ LOCALHOST
const PORT = process.env.PORT || 3000;

// Cấu hình thư mục chứa file game giao diện công khai
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {}; // Lưu trữ danh sách phòng đấu

io.on('connection', (socket) => {
    console.log(`🔌 Người chơi kết nối: ${socket.id}`);

    // Khi người chơi ấn nút "Tìm Trận"
    socket.on('findMatch', () => {
        let joinedRoom = null;

        // Tìm phòng xem có phòng nào đang thiếu 1 người không
        for (let roomId in rooms) {
            if (rooms[roomId].length === 1) {
                joinedRoom = roomId;
                break;
            }
        }

        if (joinedRoom) {
            // Vào phòng đã có sẵn người chờ
            rooms[joinedRoom].push(socket.id);
            socket.join(joinedRoom);
            
            // Thông báo trận đấu bắt đầu cho cả 2 người
            io.to(joinedRoom).emit('matchFound', {
                roomId: joinedRoom,
                players: rooms[joinedRoom]
            });
            console.log(`🎮 Trận đấu bắt đầu tại phòng: ${joinedRoom}`);
        } else {
            // Tạo phòng mới và đứng đợi
            const newRoomId = 'room_' + Date.now();
            rooms[newRoomId] = [socket.id];
            socket.join(newRoomId);
            socket.emit('waitingForPlayer');
            console.log(`⏳ Người chơi ${socket.id} đang đợi ở phòng mới: ${newRoomId}`);
        }
    });

    // XỬ LÝ KHI NGƯỜI CHƠI BẤM NÚT "HỦY TÌM TRẬN"
    socket.on('cancelMatchmaking', () => {
        for (let roomId in rooms) {
            // Tìm phòng mà người chơi này đang đứng đợi một mình (mảng chỉ có 1 phần tử)
            if (rooms[roomId].includes(socket.id) && rooms[roomId].length === 1) {
                console.log(`❌ Người chơi ${socket.id} đã hủy tìm trận. Xóa phòng: ${roomId}`);
                socket.leave(roomId);     // Rời khỏi phòng Socket
                delete rooms[roomId];      // Xóa phòng đó khỏi danh sách hệ thống
                break;
            }
        }
    });

    // Đồng bộ hành động di chuyển/đấm nhau giữa 2 bên
    socket.on('playerAction', (data) => {
        // Gửi lại dữ liệu hành động cho đối thủ trong cùng phòng
        socket.to(data.roomId).emit('opponentAction', data);
    });

    // Xử lý khi ngắt kết nối đột ngột (tắt tab trình duyệt)
    socket.on('disconnect', () => {
        console.log(`❌ Người chơi ngắt kết nối: ${socket.id}`);
        for (let roomId in rooms) {
            if (rooms[roomId].includes(socket.id)) {
                socket.to(roomId).emit('opponentLeft');
                delete rooms[roomId];
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(`📡 SERVER GAME ĐANG CHẠY THÀNH CÔNG!`);
    console.log(`🌐 Nếu chạy ở máy nhà, vào: http://localhost:${PORT}`);
    console.log(`💰 Nếu chạy trên Render, cổng tự động sẽ là: ${PORT}`);
    console.log(`=============================================`);
});