const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Đảm bảo không bị chặn CORS khi chạy trên các cloud nền tảng như Render
        methods: ["GET", "POST"]
    }
});

// Cấu hình cổng linh hoạt cho Localhost và Cloud (Render, Heroku,...)
const PORT = process.env.PORT || 3000;

// Cấu hình thư mục chứa file game tĩnh (HTML, CSS, JS công khai)
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {}; // Lưu trữ danh sách phòng đấu chủ động

io.on('connection', (socket) => {
    console.log(`🔌 Người chơi kết nối thành công: ${socket.id}`);

    // 1. Xử lý khi người chơi ấn nút "Tìm Trận"
    socket.on('findMatch', () => {
        let joinedRoom = null;

        // Tìm phòng xem có phòng nào đang có đúng 1 người đang đợi không
        for (let roomId in rooms) {
            if (rooms[roomId] && rooms[roomId].length === 1) {
                joinedRoom = roomId;
                break;
            }
        }

        if (joinedRoom) {
            // Vào phòng đã có sẵn người chờ
            rooms[joinedRoom].push(socket.id);
            socket.join(joinedRoom);
            
            // Thông báo trận đấu bắt đầu cho cả 2 người cùng phòng
            io.to(joinedRoom).emit('matchFound', {
                roomId: joinedRoom,
                players: rooms[joinedRoom]
            });
            console.log(`🎮 Trận đấu CHÍNH THỨC BẮT ĐẦU tại phòng: ${joinedRoom} [${rooms[joinedRoom].join(' VS ')}]`);
        } else {
            // Tạo một mã phòng ngẫu nhiên duy nhất và đứng đợi
            const newRoomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            rooms[newRoomId] = [socket.id];
            socket.join(newRoomId);
            socket.emit('waitingForPlayer');
            console.log(`⏳ Người chơi ${socket.id} đang xếp hàng tại phòng chờ: ${newRoomId}`);
        }
    });

    // 2. Xử lý khi người chơi chủ động bấm nút "Hủy Tìm Trận"
    socket.on('cancelFindMatch', () => {
        for (let roomId in rooms) {
            // Chỉ cho phép hủy phòng nếu chính người đó đang ở trong phòng chờ ĐƠN ĐỘC (length === 1)
            if (rooms[roomId] && rooms[roomId].includes(socket.id) && rooms[roomId].length === 1) {
                console.log(`❌ Người chơi ${socket.id} đã hủy tìm trận. Hệ thống xóa phòng chờ trống: ${roomId}`);
                socket.leave(roomId);
                delete rooms[roomId]; // Giải phóng bộ nhớ RAM cho server
                break;
            }
        }
    });

    // 3. Đồng bộ hành động di chuyển/đấm nhau giữa 2 bên
    socket.on('playerAction', (data) => {
        // Kiểm tra tính hợp lệ của dữ liệu đầu vào để tránh crash server
        if (data && data.roomId && rooms[data.roomId]) {
            // Phát sóng (Broadcast) hành động sang cho đối thủ trong cùng phòng nhận diện
            socket.to(data.roomId).emit('opponentAction', data);
        }
    });

    // 4. Xử lý an toàn khi người chơi ngắt kết nối đột ngột (Mất mạng, F5, Tắt tab)
    socket.on('disconnect', () => {
        console.log(`❌ Người chơi ngắt kết nối: ${socket.id}`);
        
        for (let roomId in rooms) {
            if (rooms[roomId] && rooms[roomId].includes(socket.id)) {
                // Gửi thông báo tới đối thủ cùng phòng trước khi dọn dẹp dữ liệu
                socket.to(roomId).emit('opponentLeft');
                
                // Loại bỏ người chơi đã thoát ra khỏi mảng của phòng đó
                rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
                
                // Nếu phòng không còn ai, hoặc chỉ còn 1 người sau khi trận đấu đã chạy -> Hủy hoàn toàn phòng
                if (rooms[roomId].length === 0 || rooms[roomId].length === 1) {
                    console.log(`🧹 Hệ thống tự động giải phóng và đóng phòng đấu: ${roomId}`);
                    delete rooms[roomId];
                }
                break;
            }
        }
    });
});

// Khởi chạy Server lắng nghe kết nối
server.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`📡 SERVER GAME STICKMAN ĐANG CHẠY ỔN ĐỊNH!`);
    console.log(`🌐 Chạy cục bộ (Localhost): http://localhost:${PORT}`);
    console.log(`💰 Chạy trên môi trường Cloud (Render): Port ${PORT}`);
    console.log(`=================================================`);
});