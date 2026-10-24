/**
 * loopy_pet.js - Mascot Loopy dành riêng cho nhân viên Hoàng Phi Phụng
 * Sử dụng HTML5 Canvas Double-Buffering + requestAnimationFrame
 * Đảm bảo 60fps mượt mà, triệt tiêu hoàn toàn hiện tượng chớp/nháy (flash) khi loop lại.
 * (Tính năng tạm thời - sau này xóa bỏ bằng cách xóa file này)
 */
(function() {
    // Danh sách câu thoại khịa ba gai, xéo xắt chuẩn meme Loopy dành riêng cho chị Phi Phụng
    const LOOPY_SASSY_QUOTES = [
        "Rà chuột quài mậy, tính trừ lương tui hay gì? 🙄💅",
        "Nhìn cái giề? Lo làm việc đi má! 💅✨",
        "Rảnh quá rê chuột vô tui hoài, KPI tháng này xong chưa? 😒📊",
        "Chọt chọt cái gì, có tin tui cắn một phát rách tay hông? 🐹💥",
        "Chị Phụng ơi, bớt ngắm tui lại, khách đang đợi bill kìa! 🧾👀",
        "Tính me tui sơ hở đặng chọc đúng hông? Không có cửa đâu cưng! 😏🚫",
        "Đừng có đụng vào vẻ đẹp quý phái này, tốn tiền bảo dưỡng lắm! ✨👑",
        "Tui là Loopy chứ hông phải thú cưng để chị xoa đầu nha! 😤🔥",
        "Ủa alo? Rê chuột chi zạ? Thèm trà sữa thì nói một tiếng! 🧋😏",
        "Lương tháng này có chia cho tui hông mà bấm bấm quài? 💸🤨",
        "Đang ngồi thiền tịnh tâm, đừng có làm phiền nha bà già! 🧘‍♀️⚡",
        "Thấy tui dễ thương quá chịu hông nổi chớ giề? Biết mà! 😌💖"
    ];

    const FRAME_W = 192;
    const FRAME_H = 208;
    const TOTAL_FRAMES = 10;
    const FRAME_DURATION = 100; // ms per frame

    let canvas = null;
    let ctx = null;
    let idleStrip = new Image();
    let waveStrip = new Image();
    let currentStrip = idleStrip;
    let isLoaded = false;
    let currentFrame = 0;
    let lastFrameTime = 0;
    let animReqId = null;
    let bubbleTimer = null;
    let waveTimeout = null;

    idleStrip.src = '/static/images/loopy_idle_strip.webp';
    waveStrip.src = '/static/images/loopy_wave_strip.webp';

    let loadedCount = 0;
    function onImgLoad() {
        loadedCount++;
        if (loadedCount >= 2) {
            isLoaded = true;
            if (canvas && !animReqId) {
                startCanvasLoop();
            }
        }
    }
    idleStrip.onload = onImgLoad;
    waveStrip.onload = onImgLoad;

    function isPhiPhung() {
        try {
            const user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
            if (!user) return false;
            const name = (user.name || '').toLowerCase();
            const username = (user.username || '').toLowerCase();
            return username.includes('phiphung') || name.includes('phụng') || user.id === 3 || user.id === 20;
        } catch (_) {
            return false;
        }
    }

    function renderFrame() {
        if (!ctx || !isLoaded) return;
        ctx.clearRect(0, 0, FRAME_W, FRAME_H);
        ctx.drawImage(
            currentStrip,
            currentFrame * FRAME_W, 0, FRAME_W, FRAME_H,
            0, 0, FRAME_W, FRAME_H
        );
    }

    function loopAnim(timestamp) {
        if (!lastFrameTime) lastFrameTime = timestamp;
        const delta = timestamp - lastFrameTime;

        if (delta >= FRAME_DURATION) {
            currentFrame = (currentFrame + 1) % TOTAL_FRAMES;
            lastFrameTime = timestamp - (delta % FRAME_DURATION);
            renderFrame();
        }

        animReqId = requestAnimationFrame(loopAnim);
    }

    function startCanvasLoop() {
        if (animReqId) return;
        lastFrameTime = 0;
        animReqId = requestAnimationFrame(loopAnim);
    }

    function stopCanvasLoop() {
        if (animReqId) {
            cancelAnimationFrame(animReqId);
            animReqId = null;
        }
    }

    function updateLoopyVisibility() {
        const loopy = document.getElementById('loopy-pet-container');
        if (!loopy) return;
        const tabAI = document.getElementById('tab-ai-agent');
        const isTabAIActive = tabAI && !tabAI.classList.contains('hidden');

        if (isPhiPhung() && isTabAIActive) {
            loopy.classList.remove('hidden');
            if (!canvas) {
                canvas = document.getElementById('loopy-canvas');
                if (canvas) {
                    ctx = canvas.getContext('2d');
                    if (isLoaded) renderFrame();
                }
            }
            startCanvasLoop();
        } else {
            loopy.classList.add('hidden');
            stopCanvasLoop();
        }
    }

    let isHovering = false;
    let hoverCooldownTimer = null;

    window.hoverLoopyPet = function(isHover) {
        if (isHover) {
            if (isHovering) return; // Tránh re-trigger liên tục
            isHovering = true;
            currentStrip = waveStrip;

            // Chọn ngẫu nhiên 1 câu khịa ba gai
            const quote = LOOPY_SASSY_QUOTES[Math.floor(Math.random() * LOOPY_SASSY_QUOTES.length)];
            showLoopySpeech(quote, 3000);

            if (hoverCooldownTimer) clearTimeout(hoverCooldownTimer);
        } else {
            // Khi chuột rời đi, giữ tư thế vẫy tay thêm một chút rồi mới về idle nhẹ nhàng
            if (hoverCooldownTimer) clearTimeout(hoverCooldownTimer);
            hoverCooldownTimer = setTimeout(() => {
                isHovering = false;
                currentStrip = idleStrip;
                hoverCooldownTimer = null;
            }, 600);
        }
    };

    window.interactWithLoopyPet = function() {
        isHovering = true;
        currentStrip = waveStrip;
        const quote = LOOPY_SASSY_QUOTES[Math.floor(Math.random() * LOOPY_SASSY_QUOTES.length)];
        showLoopySpeech(quote, 3500);

        if (hoverCooldownTimer) clearTimeout(hoverCooldownTimer);
        hoverCooldownTimer = setTimeout(() => {
            isHovering = false;
            currentStrip = idleStrip;
            hoverCooldownTimer = null;
        }, 3000);
    };

    function showLoopySpeech(text, duration = 3000) {
        const bubble = document.getElementById('loopy-speech-bubble');
        const textEl = document.getElementById('loopy-speech-text');
        if (!bubble || !textEl) return;

        textEl.textContent = text;
        bubble.classList.remove('hidden');

        if (bubbleTimer) clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => {
            bubble.classList.add('hidden');
        }, duration);
    }

    function initLoopyObserver() {
        const tabAI = document.getElementById('tab-ai-agent');
        if (tabAI) {
            const observer = new MutationObserver(() => updateLoopyVisibility());
            observer.observe(tabAI, { attributes: true, attributeFilter: ['class'] });
        }
        updateLoopyVisibility();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLoopyObserver);
    } else {
        initLoopyObserver();
    }
})();
