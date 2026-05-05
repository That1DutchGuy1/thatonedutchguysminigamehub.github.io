const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const rickImg = document.getElementById('rickSprite');
const bgMusic = document.getElementById('bgMusic');

canvas.width = 800;
canvas.height = 400;

// Track key states for continuous movement/jumping
const keys = {
    ArrowUp: false,
    ArrowLeft: false,
    ArrowRight: false
};

const player = {
    x: 50,
    y: 300,
    width: 80,
    height: 60,
    speed: 5,
    dx: 0,
    dy: 0,
    jumpPower: -12,
    grounded: false
};

const gravity = 0.6;

const platforms = [
    { x: 0, y: 380, width: 800, height: 20 },
    { x: 200, y: 280, width: 150, height: 20 },
    { x: 450, y: 200, width: 150, height: 20 }
];

// Music activation logic
let musicStarted = false;
function startMusic() {
    if (!musicStarted) {
        bgMusic.play().catch(e => console.log("Audio waiting for interaction"));
        musicStarted = true;
    }
}

function update() {
    // Start music on first movement or interaction
    if ((keys.ArrowLeft || keys.ArrowRight || keys.ArrowUp) && !musicStarted) {
        startMusic();
    }

    // Apply horizontal movement
    if (keys.ArrowRight) player.dx = player.speed;
    else if (keys.ArrowLeft) player.dx = -player.speed;
    else player.dx = 0;

    // Apply Jumping (Continuous)
    if (keys.ArrowUp && player.grounded) {
        player.dy = player.jumpPower;
        player.grounded = false;
    }

    player.dy += gravity;
    player.y += player.dy;
    player.x += player.dx;

    // Collision Logic
    player.grounded = false;
    for (let plat of platforms) {
        // Check if player is overlapping with platform
        if (player.x < plat.x + plat.width &&
            player.x + player.width > plat.x &&
            player.y < plat.y + plat.height &&
            player.y + player.height > plat.y) {

            // Vertical Collision
            if (player.dy > 0 && player.y + player.height - player.dy <= plat.y) {
                // Landing on top
                player.dy = 0;
                player.y = plat.y - player.height;
                player.grounded = true;
            } else if (player.dy < 0 && player.y - player.dy >= plat.y + plat.height) {
                // Hitting the underside (head bonk)
                player.dy = 0;
                player.y = plat.y + plat.height;
            }
        }
    }

    // Boundary Checks
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
    
    // Fall Reset
    if (player.y > canvas.height) {
        player.x = 50;
        player.y = 300;
        player.dy = 0;
    }

    draw();
    requestAnimationFrame(update);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Platforms
    ctx.fillStyle = '#fff';
    platforms.forEach(plat => {
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
    });

    // Update GIF position
    rickImg.style.left = player.x + "px";
    rickImg.style.top = player.y + "px";
}

// Input listeners
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = true;
        startMusic(); // Also triggers on keydown
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = false;
    }
});

// Click interaction for music
window.addEventListener('mousedown', startMusic);

update();