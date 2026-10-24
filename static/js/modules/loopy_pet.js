/**
 * loopy_pet.js - Mascot Loopy dành riêng cho nhân viên Hoàng Phi Phụng
 * Hiển thị ở góc dưới bên phải màn hình Tác Nhân AI Copilot
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

    let bubbleTimer = null;

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

    function updateLoopyVisibility() {
        const loopy = document.getElementById('loopy-pet-container');
        if (!loopy) return;
        const tabAI = document.getElementById('tab-ai-agent');
        const isTabAIActive = tabAI && !tabAI.classList.contains('hidden');

        if (isPhiPhung() && isTabAIActive) {
            loopy.classList.remove('hidden');
        } else {
            loopy.classList.add('hidden');
        }
    }

    window.hoverLoopyPet = function(isHover) {
        const img = document.getElementById('loopy-pet-img');
        if (!img) return;
        img.src = isHover ? '/static/images/loopy_wave.gif' : '/static/images/loopy_pet.gif';
        if (isHover) {
            showLoopySpeech(LOOPY_GREETINGS[Math.floor(Math.random() * LOOPY_GREETINGS.length)], 2500);
        }
    };

    window.interactWithLoopyPet = function() {
        const img = document.getElementById('loopy-pet-img');
        if (img) img.src = '/static/images/loopy_wave.gif';
        const msg = LOOPY_GREETINGS[Math.floor(Math.random() * LOOPY_GREETINGS.length)];
        showLoopySpeech(msg, 3500);
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
