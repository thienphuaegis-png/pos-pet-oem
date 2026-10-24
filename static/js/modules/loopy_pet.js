/**
 * loopy_pet.js - Mascot Loopy dành riêng cho nhân viên Hoàng Phi Phụng
 * Sử dụng HTML5 Canvas Double-Buffering + requestAnimationFrame
 * Đảm bảo 60fps mượt mà, triệt tiêu hoàn toàn hiện tượng chớp/nháy (flash) khi loop lại.
 * (Tính năng tạm thời - sau này xóa bỏ bằng cách xóa file này)
 */
(function() {
    const LOOPY_GREETINGS = [
        "Chào chị Phụng nha! 🌸",
        "Hôm nay chị Phụng làm việc vui vẻ nhé! ✨",
        "Chị Phụng cố lên nha, Loopy luôn cổ vũ chị! 💖",
        "Có bill nào cần AI đọc không chị Phụng ơi? 📑",
        "Loopy thương chị Phụng nhất nè! 🥰"
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

    window.hoverLoopyPet = function(isHover) {
        if (waveTimeout) {
            clearTimeout(waveTimeout);
            waveTimeout = null;
        }
        currentStrip = isHover ? waveStrip : idleStrip;
        renderFrame();
        if (isHover) {
            showLoopySpeech(LOOPY_GREETINGS[Math.floor(Math.random() * LOOPY_GREETINGS.length)], 2500);
        }
    };

    window.interactWithLoopyPet = function() {
        currentStrip = waveStrip;
        renderFrame();
        const msg = LOOPY_GREETINGS[Math.floor(Math.random() * LOOPY_GREETINGS.length)];
        showLoopySpeech(msg, 3500);

        if (waveTimeout) clearTimeout(waveTimeout);
        waveTimeout = setTimeout(() => {
            currentStrip = idleStrip;
            renderFrame();
            waveTimeout = null;
        }, 3500);
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
