const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Cấu hình CORS và Ping/Pong để tránh ngắt kết nối khi nâng cấp transport
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    },
    pingTimeout: 30000,
    pingInterval: 10000
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

// --- CẤU HÌNH HỆ THỐNG VŨ KHÍ & SÁT THƯƠNG ĐÃ GIẢM ---
const WEAPON_TYPES = [
    { id: 'ak47', name: 'AK47', color: '#ff4757', type: 'gun', damage: 4 },      // 4 sát thương / viên đạn
    { id: 'pistol', name: 'Súng Lục', color: '#ffa502', type: 'gun', damage: 3 },  // 3 sát thương / viên đạn
    { id: 'shotgun', name: 'Súng Săn M3', color: '#a29bfe', type: 'gun', damage: 4 }, // Súng săn bắn chùm 5 viên đạn
    { id: 'sniper', name: 'AWP Sniper', color: '#ff7675', type: 'gun', damage: 20 }, // Súng ngắm sát thương lớn
    { id: 'nade', name: 'Lựu Đạn', color: '#2ed573', type: 'grenade', damage: 25 }, // Sát thương nổ lan diện rộng
    { id: 'spear', name: 'Giáo', color: '#747d8c', type: 'melee', damage: 6 },     // 6 sát thương
    { id: 'sword', name: 'Kiếm', color: '#1e90ff', type: 'melee', damage: 8 }      // 8 sát thương
];

// Quản lý trạng thái theo từng phòng
let roomPlayers = {};  // Lưu trữ vị trí/máu/trang bị của người chơi: { [roomId]: { [playerId]: { x, y, hp, width, height, weapon } } }
let roomWeapons = {}; 
let roomBullets = {};  // Quản lý đạn bay: { [roomId]: [ { x, y, vx, vy, color, damage, attackerId } ] }
let roomGrenades = {}; // Quản lý lựu đạn: { [roomId]: [ { x, y, vx, vy, timer, color, damage, attackerId } ] }
let disconnectTimers = {}; // Quản lý grace period 15s cho người chơi tạm mất kết nối

io.on('connection', (socket) => {
    console.log(`🔌 [Server Log] Người chơi kết nối thành công: ${socket.id} (Thời điểm: ${new Date().toLocaleTimeString()})`);

    const updateQueueStatus = (maxPlayers) => {
        const queue = matchQueues[maxPlayers];
        if (!queue) return;
        queue.forEach(playerSocket => {
            playerSocket.emit('queueUpdate', {
                count: queue.length,
                target: maxPlayers
            });
        });
    };

    const removeFromQueue = (socket) => {
        if (socket.waitingMode) {
            const mode = socket.waitingMode;
            if (matchQueues[mode]) {
                const index = matchQueues[mode].indexOf(socket);
                if (index !== -1) {
                    matchQueues[mode].splice(index, 1);
                    updateQueueStatus(mode);
                    console.log(`❌ [Server Log] Người chơi ${socket.id} đã hủy tìm trận. Rời hàng đợi chế độ ${mode} người.`);
                }
            }
            socket.waitingMode = null;
        }
    };

    // TÌM TRẬN
    socket.on('findMatch', (data) => {
        const maxPlayers = (data && data.maxPlayers) ? data.maxPlayers : 2; 
        socket.clientPlayerId = data ? data.clientPlayerId : null;
        
        removeFromQueue(socket);

        if (matchQueues[maxPlayers]) {
            matchQueues[maxPlayers].push(socket);
            socket.waitingMode = maxPlayers; 
            
            console.log(`⏳ [Server Log] Người chơi ${socket.id} (ClientPlayerID: ${socket.clientPlayerId || 'N/A'}) xếp hàng (Chế độ ${maxPlayers} người) - (${matchQueues[maxPlayers].length}/${maxPlayers})`);
            
            updateQueueStatus(maxPlayers);

            // Gom đủ người thì tạo phòng
            if (matchQueues[maxPlayers].length === maxPlayers) {
                const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5); 
                
                const playersInRoom = matchQueues[maxPlayers].splice(0, maxPlayers);
                const playersConfig = {};

                // Khởi tạo bộ nhớ riêng cho phòng này trên Server
                roomPlayers[roomId] = {};
                roomWeapons[roomId] = {};
                roomBullets[roomId] = [];
                roomGrenades[roomId] = [];

                playersInRoom.forEach((p, index) => {
                    p.join(roomId);
                    p.currentRoom = roomId;
                    p.waitingMode = null;

                    const startX = 150 + index * 200;
                    const startY = 270;

                    // Khởi tạo thông số người chơi trên server
                    roomPlayers[roomId][p.id] = {
                        id: p.id,
                        clientPlayerId: p.clientPlayerId || p.id,
                        x: startX,
                        y: startY,
                        hp: 100,
                        width: 30,
                        height: 80,
                        facing: 1,
                        weapon: null, // Lưu trang bị/vũ khí để không bị reset
                        shootCooldown: 0
                    };

                    playersConfig[p.id] = {
                        x: startX,
                        y: startY,
                        hp: 100,
                        color: `hsl(${(index * 360 / maxPlayers)}, 70%, 50%)`,
                        facing: 1,
                        weapon: null
                    };
                });

                // Báo cho tất cả Client trong phòng biết trận đấu bắt đầu
                playersInRoom.forEach(p => {
                    p.emit('matchFound', {
                        roomId: roomId,
                        myId: p.id,
                        players: playersConfig
                    });
                });
                
                console.log(`🎬 [Server Log] Trận đấu bắt đầu tại phòng: ${roomId} (Gồm ${maxPlayers} người)`);
            }
        }
    });

    // REJOIN MATCH (KHÔI PHỤC KHI RECONNECT)
    socket.on('rejoinMatch', (data) => {
        const { roomId, oldMyId, clientPlayerId } = data || {};
        console.log(`🔄 [Server Log] Người chơi yêu cầu Rejoin: Socket mới=${socket.id}, Socket cũ=${oldMyId}, ClientPlayerID=${clientPlayerId}, Phòng=${roomId}`);

        if (roomId && roomPlayers[roomId]) {
            let foundOldId = null;
            if (oldMyId && roomPlayers[roomId][oldMyId]) {
                foundOldId = oldMyId;
            } else {
                for (let pid in roomPlayers[roomId]) {
                    if (roomPlayers[roomId][pid].clientPlayerId === clientPlayerId) {
                        foundOldId = pid;
                        break;
                    }
                }
            }

            if (foundOldId) {
                // Hủy timer dọn dẹp nếu người chơi quay lại trong 15s grace period
                if (disconnectTimers[foundOldId]) {
                    clearTimeout(disconnectTimers[foundOldId]);
                    delete disconnectTimers[foundOldId];
                    console.log(`✅ [Server Log] Đã hủy Disconnect Timer cho ${foundOldId}`);
                }

                // Chuyển dữ liệu người chơi sang Socket ID mới
                let pState = roomPlayers[roomId][foundOldId];
                delete roomPlayers[roomId][foundOldId];

                pState.id = socket.id;
                delete pState.disconnected;
                delete pState.disconnectTime;
                roomPlayers[roomId][socket.id] = pState;

                socket.join(roomId);
                socket.currentRoom = roomId;
                socket.clientPlayerId = clientPlayerId;

                const playersConfig = {};
                for (let pid in roomPlayers[roomId]) {
                    let p = roomPlayers[roomId][pid];
                    playersConfig[pid] = {
                        x: p.x,
                        y: p.y,
                        hp: p.hp,
                        color: p.color || "#3498db",
                        facing: p.facing || 1,
                        weapon: p.weapon || null
                    };
                }

                socket.emit('rejoinedMatch', {
                    roomId: roomId,
                    myId: socket.id,
                    players: playersConfig,
                    weapons: roomWeapons[roomId] || {}
                });

                socket.to(roomId).emit('playerReconnected', { oldId: foundOldId, newId: socket.id });
                console.log(`🎉 [Server Log] Rejoin thành công phòng ${roomId}! Giữ nguyên Trang bị/Vũ khí: ${pState.weapon ? pState.weapon.name : 'Không'}`);
                return;
            }
        }

        console.log(`⚠️ [Server Log] Rejoin thất bại cho ${socket.id} (Phòng hoặc thông tin không còn).`);
        socket.emit('rejoinFailed');
    });

    // HỦY TÌM TRẬN
    socket.on('cancelFindMatch', () => {
        removeFromQueue(socket);
    });

    // CHỦ ĐỘNG THOÁT TRẬN (TỪ NÚT 3 VẠCH HOẶC NÚT THOÁT)
    socket.on('leaveMatch', () => {
        if (socket.currentRoom) {
            console.log(`🏃 [Server Log] Người chơi ${socket.id} đã chủ động thoát khỏi trận!`);
            socket.to(socket.currentRoom).emit('playerLeft', { id: socket.id });
            
            if (roomPlayers[socket.currentRoom]) {
                delete roomPlayers[socket.currentRoom][socket.id];
                checkMatchOver(socket.currentRoom);
                
                // Nếu phòng không còn ai, dọn dẹp bộ nhớ phòng đó luôn
                if (Object.keys(roomPlayers[socket.currentRoom]).length === 0) {
                    delete roomPlayers[socket.currentRoom];
                    delete roomWeapons[socket.currentRoom];
                    delete roomBullets[socket.currentRoom];
                    delete roomGrenades[socket.currentRoom];
                }
            }

            socket.leave(socket.currentRoom);
            socket.currentRoom = null; 
        }
    });

    // TÍNH NĂNG MÁU THỜI GIAN THỰC KHI ĐÁNH TRÚNG / ĐẤM CHAY (CHO CẬN CHIẾN)
    socket.on('playerHit', (data) => {
        if (data.roomId && data.targetId) {
            let finalDamage = 3; // Sát thương đấm tay gốc giảm xuống 3
            if (data.weapon && data.weapon.damage) {
                finalDamage = data.weapon.damage;
            }
            
            // Đồng bộ cập nhật trừ máu trên Server
            if (roomPlayers[data.roomId] && roomPlayers[data.roomId][data.targetId]) {
                let target = roomPlayers[data.roomId][data.targetId];
                if (target.hp <= 0) return;

                target.hp -= finalDamage;
                if (target.hp < 0) target.hp = 0;

                io.to(data.roomId).emit('playerHit', {
                    targetId: data.targetId,
                    hp: target.hp,
                    x: target.x,
                    y: target.y,
                    damageText: `-${finalDamage} HP`
                });

                // Kiểm tra kết thúc trận đấu nếu chỉ còn 1 người sống sót
                checkMatchOver(data.roomId);
            }
        }
    });

    // ĐỒNG BỘ THAO TÁC TRONG GAME & TỰ ĐỘNG KÍCH HOẠT BẮN ĐẠN TRÊN SERVER
    socket.on('playerAction', (data) => {
        const roomId = data.roomId;
        if (roomId && roomPlayers[roomId] && roomPlayers[roomId][socket.id]) {
            let p = roomPlayers[roomId][socket.id];
            
            // Cập nhật tọa độ real-time & vũ khí từ client lên bộ dữ liệu server
            p.x = data.x;
            p.y = data.y;
            if (data.weapon !== undefined) {
                p.weapon = data.weapon;
            }
            
            if (p.shootCooldown > 0) p.shootCooldown--;

            // --- BẮN SÚNG / NÉM LỰU ĐẠN XỬ LÝ TRỰC TIẾP TRÊN SERVER ---
            if (data.isAttacking && p.shootCooldown === 0 && p.hp > 0) {
                const weapon = data.weapon;
                let cd = 15;
                if (weapon) {
                    if (weapon.id === 'ak47') cd = 10;
                    else if (weapon.id === 'pistol') cd = 16;
                    else if (weapon.id === 'shotgun') cd = 35;
                    else if (weapon.id === 'sniper') cd = 55;
                    else if (weapon.type === 'melee') cd = 18;
                    else if (weapon.type === 'grenade') cd = 30;
                }
                p.shootCooldown = cd;
                if (weapon) {
                    if (weapon.type === 'gun') {
                        if (!roomBullets[roomId]) roomBullets[roomId] = [];
                        
                        let aimAngle = data.aimAngle || (data.facing === 1 ? 0 : Math.PI);
                        if (weapon.id === 'shotgun') {
                            for (let i = -2; i <= 2; i++) {
                                let spreadAngle = aimAngle + (i * 0.08);
                                roomBullets[roomId].push({
                                    x: data.facing === 1 ? data.x + 35 : data.x - 10,
                                    y: data.y + 25, 
                                    vx: Math.cos(spreadAngle) * 16,
                                    vy: Math.sin(spreadAngle) * 16,
                                    color: weapon.color,
                                    damage: weapon.damage || 4,
                                    attackerId: socket.id
                                });
                            }
                        } else {
                            let bulletSpeed = weapon.id === 'sniper' ? 24 : 16;
                            roomBullets[roomId].push({
                                x: data.facing === 1 ? data.x + 35 : data.x - 10,
                                y: data.y + 25, 
                                vx: Math.cos(aimAngle) * bulletSpeed,
                                vy: Math.sin(aimAngle) * bulletSpeed,
                                color: weapon.color,
                                damage: weapon.damage || 4,
                                attackerId: socket.id
                            });
                        }
                    } else if (weapon.type === 'grenade') {
                        if (!roomGrenades[roomId]) roomGrenades[roomId] = [];
                        
                        let aimAngle = data.aimAngle || (data.facing === 1 ? 0 : Math.PI);
                        roomGrenades[roomId].push({
                            x: data.facing === 1 ? data.x + 30 : data.x - 10,
                            y: data.y + 20,
                            vx: Math.cos(aimAngle) * 8,
                            vy: Math.sin(aimAngle) * 8 - 2,
                            timer: 5000,
                            color: weapon.color,
                            damage: weapon.damage,
                            attackerId: socket.id
                        });

                        p.weapon = null;
                        socket.emit('weaponUsedUp');
                    }
                }
            }

            // Gửi dữ liệu đồng bộ góc nhìn, hành động sang cho các đối thủ khác trong phòng
            socket.to(roomId).emit('opponentAction', {
                id: socket.id,
                x: data.x,
                y: data.y,
                vx: data.vx,
                vy: data.vy,
                facing: data.facing,
                isAttacking: data.isAttacking,
                hp: p.hp,
                weapon: p.weapon || data.weapon 
            });
        }
    });

    // XỬ LÝ KHI NGƯỜI CHƠI NHẶT VŨ KHÍ RƠI TRÊN SÀN ĐẤU
    socket.on('pickupWeapon', (data) => {
        const { roomId, weaponId } = data || {};
        if (roomId && roomWeapons[roomId] && roomWeapons[roomId][weaponId]) {
            const pickedWeapon = roomWeapons[roomId][weaponId].info;
            
            // Xóa vũ khí khỏi sàn đấu
            delete roomWeapons[roomId][weaponId];
            
            // Lưu vũ khí vào trạng thái player trên Server để không bị reset khi sync
            if (roomPlayers[roomId] && roomPlayers[roomId][socket.id]) {
                roomPlayers[roomId][socket.id].weapon = pickedWeapon;
            }

            console.log(`🎒 [Server Log] Người chơi ${socket.id} nhặt được vũ khí: ${pickedWeapon ? pickedWeapon.name : 'Unknown'} (Phòng: ${roomId})`);
            
            // Báo cho cả phòng biết
            io.to(roomId).emit('weaponPickedUp', {
                weaponId: weaponId,
                playerId: socket.id,
                weaponInfo: pickedWeapon
            });
        }
    });

    // MẤT KẾT NỐI (VỚI GRACE PERIOD 15 GIÂY)
    socket.on('disconnect', (reason) => {
        console.warn(`❌ [Server Log] Người chơi ngắt kết nối: ${socket.id} (Lý do: ${reason || 'N/A'}) - Thời điểm: ${new Date().toLocaleTimeString()}`);
        removeFromQueue(socket);

        const roomId = socket.currentRoom;
        if (roomId && roomPlayers[roomId] && roomPlayers[roomId][socket.id]) {
            console.log(`⏳ [Server Log] Giữ nguyên phòng ${roomId} cho ${socket.id} trong 15s cho phép reconnect...`);
            
            // Đánh dấu tạm ngắt kết nối
            roomPlayers[roomId][socket.id].disconnected = true;

            // Đặt timer 15 giây grace period trước khi thực sự dọn dẹp
            disconnectTimers[socket.id] = setTimeout(() => {
                console.log(`⏰ [Server Log] Hết 15s Grace Period cho ${socket.id} trong phòng ${roomId}. Thực hiện dọn dẹp...`);
                delete disconnectTimers[socket.id];
                
                if (roomPlayers[roomId] && roomPlayers[roomId][socket.id]) {
                    delete roomPlayers[roomId][socket.id];
                    socket.to(roomId).emit('playerLeft', { id: socket.id });
                    checkMatchOver(roomId);

                    if (Object.keys(roomPlayers[roomId]).length === 0) {
                        delete roomPlayers[roomId];
                        delete roomWeapons[roomId];
                        delete roomBullets[roomId];
                        delete roomGrenades[roomId];
                        console.log(`🧹 [Server Log] Phòng ${roomId} đã dọn dẹp hoàn toàn.`);
                    }
                }
            }, 15000);
        }
    });
});

// HÀM KIỂM TRA PHÂN ĐỊNH THẮNG THUA CHẾ ĐỘ ONLINE TRÊN SERVER
function checkMatchOver(roomId) {
    if (!roomPlayers[roomId]) return;
    const players = roomPlayers[roomId];
    const playerIds = Object.keys(players);
    
    // Đếm số người chơi còn sống (máu > 0)
    const alivePlayers = playerIds.filter(id => players[id].hp > 0);

    if (playerIds.length > 1 && alivePlayers.length <= 1) {
        let winnerText = "TRẬN ĐẤU HOÀ!";
        let winnerColor = "#ffffff";

        if (alivePlayers.length === 1) {
            winnerText = `NGƯỜI CHƠI SỐNG SÓT CHIẾN THẮNG!`;
            winnerColor = "#2ecc71";
        }

        io.to(roomId).emit('matchOver', {
            winnerText: winnerText,
            color: winnerColor
        });

        // Giải tán dữ liệu phòng sau khi trận đấu kết thúc
        setTimeout(() => {
            delete roomPlayers[roomId];
            delete roomWeapons[roomId];
            delete roomBullets[roomId];
            delete roomGrenades[roomId];
        }, 3000);
    }
}

// --- VÒNG LẶP TỰ ĐỘNG THẢ VŨ KHÍ KHÔNG GIAN (MỖI 8 GIÂY) & TỰ HỦY SAU 5 GIÂY NẾU NẰM ĐẤT ---
setInterval(() => {
    Object.keys(roomPlayers).forEach(roomId => {
        const roomExists = io.sockets.adapter.rooms.get(roomId);
        if (roomExists && roomExists.size > 0) {
            
            if (!roomWeapons[roomId]) roomWeapons[roomId] = {};

            const weaponId = 'wp_' + Math.random().toString(36).substr(2, 9);
            const randomType = WEAPON_TYPES[Math.floor(Math.random() * WEAPON_TYPES.length)];
            
            roomWeapons[roomId][weaponId] = {
                id: weaponId,
                info: randomType,
                x: 100 + Math.random() * 1400, // Thả ngẫu nhiên trải rộng theo bản đồ rộng 1600px
                y: -30,                      
                isGrounded: false
            };

            // Báo cho phòng biết có vũ khí mới từ trên trời rơi xuống
            io.to(roomId).emit('weaponSpawned', roomWeapons[roomId][weaponId]);

            // CƠ CHẾ TỰ HỦY: Sau đúng 5 giây (5000ms), nếu vũ khí vẫn còn nằm đất (chưa bị nhặt) -> Xóa đi
            setTimeout(() => {
                if (roomWeapons[roomId] && roomWeapons[roomId][weaponId]) {
                    delete roomWeapons[roomId][weaponId];
                    // Phát lệnh xuống tất cả client để đồng bộ xóa vật phẩm khỏi màn hình
                    io.to(roomId).emit('weaponExpired', { weaponId: weaponId });
                }
            }, 5000);

        } else {
            delete roomWeapons[roomId];
        }
    });
}, 8000);

// --- VÒNG LẶP CẬP NHẬT TRẠNG THÁI VẬT LÝ ĐẠN / LỰU ĐẠN / VŨ KHÍ RƠI (60 FPS) ---
setInterval(() => {
    // 1. Cập nhật vị trí rơi tự do của vũ khí cho đến khi tiếp mặt đất
    Object.keys(roomWeapons).forEach(roomId => {
        Object.keys(roomWeapons[roomId]).forEach(weaponId => {
            let wp = roomWeapons[roomId][weaponId];
            if (!wp.isGrounded) {
                wp.y += 4; 
                if (wp.y >= 335) { // Khớp với GROUND_Y (350) trừ đi chiều cao hộp mô hình vũ khí (15)
                    wp.y = 335;
                    wp.isGrounded = true;
                }
            }
        });
    });

    // 2. Cập nhật chuyển động và Va chạm tính sát thương của Đạn thực tế (Bullets)
    Object.keys(roomBullets).forEach(roomId => {
        let bullets = roomBullets[roomId];
        if (!bullets) return;

        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            b.x += b.vx; // Cho đạn bay ngang tịnh tiến theo thời gian thực

            let hitRegistered = false;

            // Xử lý va chạm đạn thực tế giữa các người chơi trên Server bằng Hitbox hình chữ nhật
            if (roomPlayers[roomId]) {
                const players = roomPlayers[roomId];
                for (let pId in players) {
                    if (pId === b.attackerId) continue; // Tuyệt đối không tự bắn trúng bản thân
                    
                    let target = players[pId];
                    if (target.hp <= 0) continue;

                    // Kiểm tra vùng trúng đạn (Hitbox của Stickman)
                    if (b.x >= target.x && b.x <= target.x + target.width && b.y >= target.y && b.y <= target.y + target.height) {
                        target.hp -= b.damage;
                        if (target.hp < 0) target.hp = 0;

                        // Phát thông báo trừ máu đồng bộ tới mọi client trong phòng hiển thị hiệu ứng chữ nổi
                        io.to(roomId).emit('playerHit', {
                            targetId: target.id,
                            hp: target.hp,
                            x: target.x,
                            y: target.y,
                            damageText: `-${b.damage} HP`
                        });

                        hitRegistered = true;
                        break;
                    }
                }
            }

            // Nếu đạn bay ra khỏi giới hạn bản đồ rộng 1600px hoặc đã trúng mục tiêu -> Xóa đạn khỏi bộ nhớ
            if (b.x < 0 || b.x > 1600 || hitRegistered) {
                bullets.splice(i, 1);
            }
        }
    });

    // 3. Cập nhật vật lý, nảy nền và tính sát thương nổ lan của Lựu Đạn (Grenades)
    Object.keys(roomGrenades).forEach(roomId => {
        let grenades = roomGrenades[roomId];
        if (!grenades) return;

        for (let i = grenades.length - 1; i >= 0; i--) {
            let g = grenades[i];
            
            // Áp dụng gia tốc trọng lực rơi tự do cho quả lựu đạn
            g.vy += 0.35; 
            g.x += g.vx;
            g.y += g.vy;
            g.vx *= 0.98; // Lực cản không khí làm chậm tốc độ lăn

            // Giả lập va chạm mặt đất (GROUND_Y = 350 trừ đi bán kính lựu đạn)
            if (g.y >= 344) { 
                g.y = 344;
                g.vy = -g.vy * 0.4; // Đập nền nảy nhẹ lên trên bản đồ
                g.vx *= 0.7;        // Ma sát mạnh làm chậm khi tiếp đất lăn
            }

            // Trừ thời gian đếm ngược (Mỗi vòng lặp chạy mất ~16.67ms ở tần số 60 FPS)
            g.timer -= (1000 / 60);

            // CƠ CHẾ NỔ DIỆN RỘNG: Khi hết 5 giây (timer <= 0) -> Kích nổ phát ra sát thương lan toán học
            if (g.timer <= 0) {
                const explosionRadius = 90; // Bán kính vòng tròn vụ nổ lan rộng

                if (roomPlayers[roomId]) {
                    const players = roomPlayers[roomId];
                    Object.keys(players).forEach(pId => {
                        let target = players[pId];
                        if (target.hp <= 0) return;

                        let targetCenterX = target.x + target.width / 2;
                        let targetCenterY = target.y + target.height / 2;

                        // Công thức toán học Pythagore tính khoảng cách từ tâm lựu đạn tới giữa thân người chơi
                        let dist = Math.sqrt(Math.pow(targetCenterX - g.x, 2) + Math.pow(targetCenterY - g.y, 2));
                        
                        if (dist <= explosionRadius) {
                            // Sát thương giảm dần đều nếu đứng càng xa tâm vụ nổ lựu đạn
                            let damageFalloff = Math.round(g.damage * (1 - dist / (explosionRadius + 20)));
                            if (damageFalloff > 0) {
                                target.hp -= damageFalloff;
                                if (target.hp < 0) target.hp = 0;

                                io.to(roomId).emit('playerHit', {
                                    targetId: target.id,
                                    hp: target.hp,
                                    x: target.x,
                                    y: target.y,
                                    damageText: `💥 -${damageFalloff} HP`
                                });
                            }
                        }
                    });
                }

                // Phát lệnh kích hoạt vụ nổ hiệu ứng xuống tất cả các máy khách trong phòng chơi
                io.to(roomId).emit('grenadeExplode', { x: g.x, y: g.y });

                grenades.splice(i, 1); // Xóa lựu đạn ra khỏi danh sách sau khi nổ tung
                checkMatchOver(roomId);
            }
        }
    });

    // Phát broadcast dọn dẹp và đóng gói trạng thái toàn phòng xuống Client render khung hình mượt mà
    Object.keys(roomPlayers).forEach(roomId => {
        io.to(roomId).emit('roomStateUpdate', {
            players: roomPlayers[roomId],
            weapons: roomWeapons[roomId] || {},
            bullets: roomBullets[roomId] || [],
            grenades: roomGrenades[roomId] || []
        });
    });

}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 SERVER GAME STICKMAN ĐANG CHẠY ỔN ĐỊNH!`);
    console.log(`🌐 Chạy cục bộ (Localhost): http://localhost:${PORT}`);
    console.log(`💰 Chạy trên môi trường Cloud (Render): Port ${PORT}`);
    console.log(`==================================================`);
});