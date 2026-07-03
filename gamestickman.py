<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stickman 2 Player Fighting Game</title>
    <style>
        body {
            margin: 0;
            background-color: #222;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            color: white;
            font-family: sans-serif;
            flex-direction: column;
        }
        canvas {
            background-color: #111;
            border: 4px solid #fff;
            box-shadow: 0 0 20px rgba(255,255,255,0.2);
        }
        .controls {
            margin-top: 15px;
            display: flex;
            gap: 40px;
            font-size: 14px;
        }
    </style>
</head>
<body>

    <h1 style="margin-bottom: 10px;">STICKMAN SHOWDOWN</h1>
    <canvas id="gameCanvas" width="800" height="400"></canvas>

    <div class="controls">
        <div>
            <h3 style="color: #3498db;">Player 1 (Xanh)</h3>
            <p>Di chuyển: A, D | Nhảy: W | Đấm: F</p>
        </div>
        <div>
            <h3 style="color: #e74c3c;">Player 2 (Đỏ)</h3>
            <p>Di chuyển: ⬅ ➡ | Nhảy: ⬆ | Đấm: L</p>
        </div>
    </div>

<script>
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const GRAVITY = 0.6;
const GROUND_Y = 350;

// Đối tượng phím bấm
const keys = {
    a: false, d: false, w: false, f: false,
    ArrowLeft: false, ArrowRight: false, ArrowUp: false, l: false
};

class Stickman {
    constructor(x, y, color, controls) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.controls = controls;
        
        this.width = 30;
        this.height = 80;
        this.vx = 0;
        this.vy = 0;
        this.speed = 5;
        this.jumpForce = 12;
        this.isGrounded = false;
        
        this.hp = 100;
        this.isAttacking = false;
        this.attackCooldown = 0;
        this.facing = (x < canvas.width / 2) ? 1 : -1; // 1: phải, -1: trái
    }

    update() {
        // Trọng lực
        this.vy += GRAVITY;
        this.y += this.vy;

        // Chạm đất
        if (this.y + this.height >= GROUND_Y) {
            this.y = GROUND_Y - this.height;
            this.vy = 0;
            this.isGrounded = true;
        } else {
            this.isGrounded = false;
        }

        // Di chuyển dựa trên phím bấm
        this.vx = 0;
        if (keys[this.controls.left]) { this.vx = -this.speed; this.facing = -1; }
        if (keys[this.controls.right]) { this.vx = this.speed; this.facing = 1; }
        this.x += this.vx;

        // Giới hạn biên màn hình
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > canvas.width) this.x = canvas.width - this.width;

        // Nhảy
        if (keys[this.controls.up] && this.isGrounded) {
            this.vy = -this.jumpForce;
            this.isGrounded = false;
        }

        // Xử lý tấn công (Đấm)
        if (this.attackCooldown > 0) this.attackCooldown--;
        
        if (keys[this.controls.attack] && this.attackCooldown === 0) {
            this.isAttacking = true;
            this.attackCooldown = 20; // tốc độ ra đòn
            setTimeout(() => this.isAttacking = false, 100); // thời gian đưa tay ra
        }
    }

    draw() {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 4;
        ctx.fillStyle = this.color;

        // Tính toán tâm của Stickman để vẽ các bộ phận
        let headX = this.x + this.width / 2;
        let headY = this.y + 15;
        let spineBottomY = this.y + 50;

        // 1. Vẽ đầu (Vòng tròn)
        ctx.beginPath();
        ctx.arc(headX, headY, 12, 0, Math.PI * 2);
        ctx.stroke();

        // 2. Vẽ thân (Xương sống)
        ctx.beginPath();
        ctx.moveTo(headX, headY + 12);
        ctx.lineTo(headX, spineBottomY);
        ctx.stroke();

        // 3. Vẽ chân
        ctx.beginPath();
        // Chân trái
        ctx.moveTo(headX, spineBottomY);
        ctx.lineTo(headX - 15, this.y + this.height);
        // Chân phải
        ctx.moveTo(headX, spineBottomY);
        ctx.lineTo(headX + 15, this.y + this.height);
        ctx.stroke();

        // 4. Vẽ tay (Trạng thái bình thường hoặc đang đấm)
        ctx.beginPath();
        if (this.isAttacking) {
            // Tay đấm thẳng ra theo hướng nhìn
            ctx.moveTo(headX, headY + 20);
            ctx.lineTo(headX + (35 * this.facing), headY + 20);
        } else {
            // Tay buông thõng tự nhiên
            ctx.moveTo(headX, headY + 20);
            ctx.lineTo(headX - 10, headY + 45);
            ctx.moveTo(headX, headY + 20);
            ctx.lineTo(headX + 10, headY + 45);
        }
        ctx.stroke();
    }

    // Lấy vùng va chạm của cú đấm
    getAttackBox() {
        return {
            x: this.facing === 1 ? this.x + this.width : this.x - 35,
            y: this.y + 15,
            width: 35,
            height: 15
        };
    }
}

// Khởi tạo 2 người chơi
const p1 = new Stickman(150, 200, "#3498db", { left: 'a', right: 'd', up: 'w', attack: 'f' });
const p2 = new Stickman(600, 200, "#e74c3c", { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', attack: 'l' });

// Kiểm tra va chạm đấm trúng đối thủ
function checkHit(attacker, defender) {
    if (!attacker.isAttacking) return false;
    
    let box = attacker.getAttackBox();
    return (
        box.x < defender.x + defender.width &&
        box.x + box.width > defender.x &&
        box.y < defender.y + defender.height &&
        box.y + box.height > defender.y
    );
}

// Vẽ Thanh HP (Máu)
function drawUI() {
    // Thanh HP P1
    ctx.fillStyle = "#555";
    ctx.fillRect(20, 20, 200, 20);
    ctx.fillStyle = "#3498db";
    ctx.fillRect(20, 20, Math.max(0, p1.hp * 2), 20);
    ctx.fillStyle = "#fff";
    ctx.fillText("P1 HP: " + p1.hp, 25, 34);

    // Thanh HP P2
    ctx.fillStyle = "#555";
    ctx.fillRect(canvas.width - 220, 20, 200, 20);
    ctx.fillStyle = "#e74c3c";
    ctx.fillRect(canvas.width - 220, 20, Math.max(0, p2.hp * 2), 20);
    ctx.fillStyle = "#fff";
    ctx.fillText("P2 HP: " + p2.hp, canvas.width - 215, 34);
}

// Vòng lặp Game chính (Game Loop)
function gameLoop() {
    // Xóa màn hình cũ
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Vẽ mặt đất
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(canvas.width, GROUND_Y);
    ctx.stroke();

    // Cập nhật nhân vật
    p1.update();
    p2.update();

    // Xử lý logic đấm nhau mất máu
    if (checkHit(p1, p2)) {
        p2.hp -= 1; // Giảm máu P2
        p2.x += 5 * p1.facing; // Đẩy lùi P2 ra sau khi trúng đòn (Knockback)
        p1.isAttacking = false; // Tránh việc tính dame liên tục trong 1 frame
    }
    if (checkHit(p2, p1)) {
        p1.hp -= 1; // Giảm máu P1
        p1.x += 5 * p2.facing; // Đẩy lùi P1
        p2.isAttacking = false;
    }

    // Vẽ nhân vật và UI lên màn hình
    p1.draw();
    p2.draw();
    drawUI();

    // Kiểm tra kết thúc game
    if (p1.hp <= 0 || p2.hp <= 0) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fff";
        ctx.font = "30px Arial";
        ctx.textAlign = "center";
        let winner = p1.hp <= 0 ? "PLAYER 2 (ĐỎ) CHIẾN THẮNG!" : "PLAYER 1 (XANH) CHIẾN THẮNG!";
        ctx.fillText(winner, canvas.width / 2, canvas.height / 2);
        return; // Dừng game
    }

    requestAnimationFrame(gameLoop);
}

// Lắng nghe sự kiện bàn phím
window.addEventListener("keydown", (e) => {
    let key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
    if (e.key in keys) keys[e.key] = true; // Hỗ trợ các phím Arrow viết hoa
});

window.addEventListener("keyup", (e) => {
    let key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
    if (e.key in keys) keys[e.key] = false;
});

// Bắt đầu chạy game
gameLoop();
</script>

</body>
</html>