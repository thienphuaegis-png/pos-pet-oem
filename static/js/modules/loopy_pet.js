/**
 * loopy_pet.js - Mascot Loopy dành riêng cho nhân viên Hoàng Phi Phụng
 * Sử dụng CSS Hardware-Accelerated Sprite Sheet Strip (1920x208)
 * 100% không chớp, không lag, không phụ thuộc loop video/canvas.
 * (Tính năng tạm thời - sau này xóa bỏ bằng cách xóa file này)
 */
(function() {
    // Danh sách câu thoại khịa ba gai, xéo xắt chuẩn meme Loopy dành riêng cho chị Phi Phụng
    const LOOPY_SASSY_QUOTES = [
        "Nhìn cái giề? Lo làm việc đi má! 💅✨",
        "Rảnh quá rê chuột vô tui hoài, KPI tháng này xong chưa? 😒📊",
        "Chọt chọt cái gì, có tin tui cắn một phát rách tay hông? 🐹💥",
        "Chị Phụng ơi, bớt ngắm tui lại, phiếu nhập kho đang đợi kìa! 📦👀",
        "Tính me tui sơ hở đặng chọc đúng hông? Không có cửa đâu cưng! 😏🚫",
        "Đừng có đụng vào vẻ đẹp quý phái này, tốn tiền bảo dưỡng lắm! ✨👑",
        "Tui là Loopy chứ hông phải thú cưng để chị xoa đầu nha! 😤🔥",
        "Ủa alo? Rê chuột chi zạ? Thèm trà sữa thì nói một tiếng! 🧋😏",
        "Lương tháng này có chia cho tui hông mà bấm bấm quài? 💸🤨",
        "Đang ngồi thiền tịnh tâm, đừng có làm phiền nha bà già! 🧘‍♀️⚡",
        "Thấy tui dễ thương quá chịu hông nổi chớ giề? Biết mà! 😌💖"
    ];

    // Lúc không ai đụng: ngoan hiền (hợp việc hành chính + kho của chị Phụng)
    const LOOPY_SWEET_QUOTES = [
        "Chị Phụng làm việc vui vẻ nha, Loopy ngồi đây cổ vũ nè 🌸",
        "Nhớ uống nước nha chị, Loopy lo lắm á 💧🥺",
        "Sổ sách gọn gàng ghê, chị giỏi quá trời 📒✨",
        "Kho mình ngăn nắp vậy là nhờ chị hết á 📦💕",
        "Loopy ngoan lắm, ngồi im hông phá chị đâu 🤍",
        "Kiểm kho mỏi lưng thì nghỉ xíu nha chị 🐾",
        "Giấy tờ nhiều quá, Loopy thương chị ghê 🥺📑",
        "Chúc chị hôm nay số liệu khớp hết trơn nha 🧮💖"
    ];
    // Câu dụ rê chuột vào -> vào rồi thì bị khịa
    const LOOPY_BAIT_QUOTES = [
        "Chị ơi... đưa chuột vô đây xíu, em nói cái này nè 🤭",
        "Psst... lại gần đây em kể bí mật cho nghe 👉👈",
        "Chị rê chuột vô em đi, em có quà cho chị á 🎁🥰"
    ];
    const CHATTER_MIN_MS = 15000, CHATTER_MAX_MS = 30000;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    const IMG_VER = '?v=2'; // tăng khi đổi file strip để trình duyệt bỏ cache
    const IDLE_STRIP_URL = '/static/images/loopy_idle_strip.webp' + IMG_VER;
    const WAVE_STRIP_URL = '/static/images/loopy_wave_strip.webp' + IMG_VER;

    // Preload ảnh vào RAM để chuyển trạng thái tức thì
    const imgIdle = new Image();
    imgIdle.src = IDLE_STRIP_URL;
    const imgWave = new Image();
    imgWave.src = WAVE_STRIP_URL;

    let bubbleTimer = null;
    let hoverCooldownTimer = null;
    let isHovering = false;

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

    function setLoopyState(isWave) {
        const sprite = document.getElementById('loopy-sprite');
        if (!sprite) return;
        sprite.style.backgroundImage = `url('${isWave ? WAVE_STRIP_URL : IDLE_STRIP_URL}')`;
        sprite.classList.toggle('is-wave', isWave);
    }

    let chatterTimer = null;
    function scheduleChatter() {
        if (chatterTimer) clearTimeout(chatterTimer);
        chatterTimer = setTimeout(() => {
            const loopy = document.getElementById('loopy-pet-container');
            const bubble = document.getElementById('loopy-speech-bubble');
            const visible = loopy && !loopy.classList.contains('hidden');
            const bubbleBusy = bubble && !bubble.classList.contains('hidden');
            if (visible && !isHovering && !bubbleBusy && !document.hidden) {
                showLoopySpeech(pick(Math.random() < 0.3 ? LOOPY_BAIT_QUOTES : LOOPY_SWEET_QUOTES), 4000);
            }
            scheduleChatter();
        }, CHATTER_MIN_MS + Math.random() * (CHATTER_MAX_MS - CHATTER_MIN_MS));
    }

    function updateLoopyVisibility() {
        const loopy = document.getElementById('loopy-pet-container');
        if (!loopy) return;
        const tabAI = document.getElementById('tab-ai-agent');
        const isTabAIActive = tabAI && !tabAI.classList.contains('hidden');

        if (isPhiPhung() && isTabAIActive) {
            loopy.classList.remove('hidden');
            setLoopyState(false);
        } else {
            loopy.classList.add('hidden');
        }
    }

    window.hoverLoopyPet = function(isHover) {
        if (isHover) {
            if (isHovering) return;
            isHovering = true;
            setLoopyState(true);

            // Chọn ngẫu nhiên 1 câu khịa ba gai
            const quote = LOOPY_SASSY_QUOTES[Math.floor(Math.random() * LOOPY_SASSY_QUOTES.length)];
            showLoopySpeech(quote, 3200);

            if (hoverCooldownTimer) clearTimeout(hoverCooldownTimer);
        } else {
            // Khi rời chuột, giữ tư thế vẫy tay thêm 800ms rồi mới trở về idle
            if (hoverCooldownTimer) clearTimeout(hoverCooldownTimer);
            hoverCooldownTimer = setTimeout(() => {
                isHovering = false;
                setLoopyState(false);
                hoverCooldownTimer = null;
            }, 800);
        }
    };

    window.interactWithLoopyPet = function() {
        isHovering = true;
        setLoopyState(true);
        const quote = LOOPY_SASSY_QUOTES[Math.floor(Math.random() * LOOPY_SASSY_QUOTES.length)];
        showLoopySpeech(quote, 3500);

        if (hoverCooldownTimer) clearTimeout(hoverCooldownTimer);
        hoverCooldownTimer = setTimeout(() => {
            isHovering = false;
            setLoopyState(false);
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
        scheduleChatter();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLoopyObserver);
    } else {
        initLoopyObserver();
    }
})();
