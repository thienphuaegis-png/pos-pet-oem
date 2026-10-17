/**
 * Module: Hotel Management (Khách Sạn Thú Cưng)
 * Quản lý 16 buồng phòng lưu trú, Check-in / Check-out, 3 chế độ xem (Grid, Table, Gantt)
 * và đồng bộ lịch sử vào Tab Hóa Đơn.
 */

(function () {
    const state = {
        rooms: [],
        activeBookings: [],
        historyBookings: [],
        currentView: 'grid', // 'grid' | 'table' | 'gantt'
        selectedRoomId: null,
        filterStatus: 'all', // 'all' | 'available' | 'occupied' | 'today'
        filterZone: 'all',   // 'all' | 'cat' | 'dog_small' | 'vip'
        ganttWeekOffset: 0
    };

    // Khởi tạo phân hệ Hotel khi mở Tab
    async function init() {
        await loadHotelRooms();
        updateKPI();
        renderCurrentView();
    }

    // Tải danh sách phòng từ API
    async function loadHotelRooms() {
        try {
            const res = await fetch('/api/hotel/rooms');
            if (!res.ok) throw new Error('Không thể tải danh sách buồng phòng');
            state.rooms = await res.json();
            
            // Mặc định chọn phòng có bé đầu tiên hoặc phòng đầu tiên cho Drawer
            if (!state.selectedRoomId && state.rooms.length > 0) {
                const occupiedRoom = state.rooms.find(r => r.status === 'occupied');
                state.selectedRoomId = occupiedRoom ? occupiedRoom.id : state.rooms[0].id;
            }
            updateKPI();
            renderCurrentView();
        } catch (err) {
            console.error('Lỗi nạp phòng Hotel:', err);
        }
    }

    // Cập nhật thanh 5 thẻ KPI
    function updateKPI() {
        const total = state.rooms.length;
        const occupied = state.rooms.filter(r => r.status === 'occupied').length;
        const available = state.rooms.filter(r => r.status === 'available').length;
        
        const todayStr = (typeof getLocalTodayDateStr === 'function') ? getLocalTodayDateStr() : new Intl.DateTimeFormat('en-CA').format(new Date());
        const returningToday = state.rooms.filter(r => 
            r.status === 'occupied' && 
            r.expected_checkout_time && 
            r.expected_checkout_time.startsWith(todayStr)
        ).length;

        const totalEstRevenue = state.rooms.reduce((acc, r) => acc + (r.current_total_amount || 0), 0);

        const elTotal = document.getElementById('hotel-kpi-total');
        const elOccupied = document.getElementById('hotel-kpi-occupied');
        const elOccupiedPct = document.getElementById('hotel-kpi-occupied-pct');
        const elAvail = document.getElementById('hotel-kpi-available');
        const elToday = document.getElementById('hotel-kpi-today');
        const elRevenue = document.getElementById('hotel-kpi-revenue');

        if (elTotal) elTotal.innerText = total;
        if (elOccupied) elOccupied.innerText = occupied;
        if (elOccupiedPct) elOccupiedPct.innerText = total > 0 ? `(${Math.round(occupied / total * 100)}%)` : '(0%)';
        if (elAvail) elAvail.innerText = available;
        if (elToday) elToday.innerText = returningToday;
        if (elRevenue) elRevenue.innerText = totalEstRevenue.toLocaleString('vi-VN') + ' đ';
    }

    // Chuyển đổi giữa 3 chế độ xem (Grid, Table, Gantt)
    function switchHotelView(viewType) {
        state.currentView = viewType;
        
        const viewGrid = document.getElementById('hotel-view-grid');
        const viewTable = document.getElementById('hotel-view-table');
        const viewGantt = document.getElementById('hotel-view-gantt');
        const viewRoomsConfig = document.getElementById('hotel-view-rooms-config');

        if (viewGrid) viewGrid.classList.toggle('hidden', viewType !== 'grid');
        if (viewTable) viewTable.classList.toggle('hidden', viewType !== 'table');
        if (viewGantt) viewGantt.classList.toggle('hidden', viewType !== 'gantt');
        if (viewRoomsConfig) viewRoomsConfig.classList.toggle('hidden', viewType !== 'rooms_config');

        // Cập nhật nút bấm
        ['grid', 'table', 'gantt', 'rooms_config'].forEach(vt => {
            const btn = document.getElementById(`btn-hotel-view-${vt}`);
            if (btn) {
                if (vt === viewType) {
                    btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm bg-white text-indigo-700 border border-slate-200";
                } else {
                    btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-600 hover:text-slate-900";
                }
            }
        });

        renderCurrentView();
    }

    // Điều phối render theo chế độ xem hiện tại
    function renderCurrentView() {
        if (state.currentView === 'grid') {
            renderRoomGrid();
            renderRoomDrawer();
        } else if (state.currentView === 'table') {
            renderActiveTable();
        } else if (state.currentView === 'gantt') {
            renderGanttTimeline();
        } else if (state.currentView === 'rooms_config') {
            renderRoomsConfigTable();
        }
    }

    // Lọc theo trạng thái
    function setFilterStatus(status) {
        state.filterStatus = status;
        document.querySelectorAll('.btn-hotel-filter-status').forEach(btn => {
            if (btn.dataset.status === status) {
                btn.className = "btn-hotel-filter-status px-3 py-1 bg-slate-900 text-white rounded-lg font-bold text-xs";
            } else {
                btn.className = "btn-hotel-filter-status px-3 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 border rounded-lg font-bold text-xs";
            }
        });
        renderCurrentView();
    }

    // Lọc theo khu vực
    function setFilterZone(zone) {
        state.filterZone = zone;
        renderCurrentView();
    }

    // Lọc danh sách phòng theo bộ lọc
    function getFilteredRooms() {
        const todayStr = (typeof getLocalTodayDateStr === 'function') ? getLocalTodayDateStr() : new Intl.DateTimeFormat('en-CA').format(new Date());
        return state.rooms.filter(r => {
            if (state.filterZone !== 'all' && r.zone !== state.filterZone) return false;
            if (state.filterStatus === 'available' && r.status !== 'available') return false;
            if (state.filterStatus === 'occupied' && r.status !== 'occupied') return false;
            if (state.filterStatus === 'today') {
                if (r.status !== 'occupied') return false;
                if (!r.expected_checkout_time || !r.expected_checkout_time.startsWith(todayStr)) return false;
            }
            return true;
        });
    }

    // ==========================================
    // VIEW 1: LƯỚI PHÒNG (GRID)
    // ==========================================
    function renderRoomGrid() {
        const container = document.getElementById('hotel-room-grid-cards');
        if (!container) return;

        const filtered = getFilteredRooms();
        if (filtered.length === 0) {
            container.innerHTML = '<div class="col-span-full py-12 text-center text-slate-400 italic">Không có buồng phòng nào phù hợp với bộ lọc.</div>';
            return;
        }

        const todayStr = (typeof getLocalTodayDateStr === 'function') ? getLocalTodayDateStr() : new Intl.DateTimeFormat('en-CA').format(new Date());

        container.innerHTML = filtered.map(room => {
            const isOccupied = room.status === 'occupied';
            const isReturningToday = isOccupied && room.expected_checkout_time && room.expected_checkout_time.startsWith(todayStr);
            const isSelected = room.id === state.selectedRoomId;

            let cardBorder = isSelected ? "ring-2 ring-indigo-500 border-indigo-400" : "border-slate-200";
            let bgClass = "bg-white";
            let badge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">✨ Trống</span>`;

            if (isOccupied) {
                if (isReturningToday) {
                    cardBorder += " border-amber-400 ring-2 ring-amber-300";
                    bgClass = "bg-amber-50/60";
                    badge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-200 text-amber-900">⏰ Trả hôm nay</span>`;
                } else if (room.zone === 'vip') {
                    cardBorder += " border-purple-300";
                    bgClass = "bg-purple-50/50";
                    badge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-200 text-purple-900">👑 VIP</span>`;
                } else {
                    cardBorder += " border-rose-300";
                    bgClass = "bg-rose-50/40";
                    badge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800">🐾 Đang ở</span>`;
                }
            } else {
                cardBorder += " border-dashed border-emerald-300";
                bgClass = "bg-emerald-50/20";
            }

            return `
                <div onclick="window.hotelManager.selectRoom(${room.id})" 
                     class="room-card border-2 ${cardBorder} ${bgClass} rounded-xl p-3.5 cursor-pointer relative shadow-xs transition select-none">
                    <div class="flex justify-between items-start mb-1.5">
                        <div>
                            <div class="text-xs font-black text-slate-900">${room.code}</div>
                            <div class="text-[10px] text-slate-500 truncate max-w-[130px]">${room.name}</div>
                        </div>
                        ${badge}
                    </div>

                    ${isOccupied ? `
                        <div class="mt-2 p-2 bg-white/90 rounded-lg border border-slate-200 space-y-1">
                            <div class="font-bold text-indigo-950 flex items-center gap-1 truncate">
                                ${room.pet_species === 'cat' ? '🐱' : '🐶'} ${room.pet_name || 'Bé cưng'} 
                                <span class="text-[10px] font-normal text-slate-500">(${room.pet_breed || 'Thú cưng'})</span>
                            </div>
                            <div class="text-[11px] text-slate-600 truncate">Chủ: ${room.contact_name || 'Khách'}</div>
                            <div class="text-[10px] text-slate-400 font-mono">Đã ở: <strong class="text-indigo-700">${room.calculated_days || 1} ngày</strong></div>
                        </div>
                        <div class="mt-2 flex justify-between items-center text-[11px]">
                            <span class="text-slate-500">Tạm tính:</span>
                            <span class="font-mono font-black text-rose-700">${(room.current_total_amount || 0).toLocaleString('vi-VN')} đ</span>
                        </div>
                    ` : `
                        <div class="flex flex-col items-center justify-center py-4 text-center">
                            <div class="text-[11px] text-emerald-700 font-bold">Phòng sẵn sàng</div>
                            <div class="text-[10px] text-slate-400 mt-0.5">${(room.price_per_day || 0).toLocaleString('vi-VN')} đ / ngày</div>
                            <button onclick="event.stopPropagation(); window.hotelManager.openHotelCheckinModal(${room.id})" 
                                    class="mt-2.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10px] shadow-xs">
                                + Check-in Vào Buồng
                            </button>
                        </div>
                    `}
                </div>
            `;
        }).join('');
    }

    // Chọn phòng để xem chi tiết bên Drawer
    function selectRoom(roomId) {
        state.selectedRoomId = roomId;
        renderRoomGrid();
        renderRoomDrawer();
    }

    // ==========================================
    // DRAWER CHI TIẾT PHÒNG BÊN PHẢI (MẪU 2)
    // ==========================================
    function renderRoomDrawer() {
        const drawer = document.getElementById('hotel-room-drawer');
        if (!drawer) return;

        const room = state.rooms.find(r => r.id === state.selectedRoomId);
        if (!room) {
            drawer.innerHTML = '<div class="text-center py-10 text-slate-400">Chọn một buồng phòng để xem chi tiết.</div>';
            return;
        }

        const isOccupied = room.status === 'occupied';

        drawer.innerHTML = `
            <div class="flex justify-between items-center pb-2.5 border-b">
                <div class="font-black text-slate-900 text-sm flex items-center gap-1.5">
                    <span>🏨</span> Buồng Phòng: <span class="text-indigo-600">${room.code} - ${room.name}</span>
                </div>
                ${isOccupied ? 
                    `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">Đang ở</span>` :
                    `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Phòng trống</span>`
                }
            </div>

            ${isOccupied ? `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                    <div class="flex justify-between">
                        <span class="text-slate-500">Bé cưng:</span>
                        <strong class="font-bold text-slate-900">${room.pet_species === 'cat' ? '🐱' : '🐶'} ${room.pet_name} (${room.pet_breed || 'Chưa rõ giống'})</strong>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Chủ nuôi:</span>
                        <span class="text-slate-800 font-medium">${room.contact_name} (${room.contact_phone || 'Không có SĐT'})</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Giờ vào:</span>
                        <span class="font-mono text-slate-700">${formatDateTime(room.check_in_time) || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Dự kiến đón:</span>
                        <span class="font-mono text-amber-700 font-bold">${formatDateTime(room.expected_checkout_time) || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between pt-1 border-t">
                        <span class="text-slate-500">Thời gian đã ở:</span>
                        <span class="font-mono font-bold text-indigo-700">${room.calculated_days} ngày</span>
                    </div>
                </div>

                <!-- Nhật ký cho ăn -->
                <div class="space-y-1.5 text-xs">
                    <div class="font-bold text-slate-700 flex justify-between items-center">
                        <span>🥣 Nhật Ký Cho Ăn Hôm Nay:</span>
                        <span class="text-[10px] text-emerald-600 font-bold">${new Date().toLocaleDateString('vi-VN')}</span>
                    </div>
                    <div class="space-y-1">
                        <label class="flex items-center gap-2 p-1.5 bg-slate-50 rounded border cursor-pointer hover:bg-slate-100">
                            <input type="checkbox" checked class="w-3.5 h-3.5 rounded text-indigo-600">
                            <span>Bữa sáng (08:30) - Đã ăn no</span>
                        </label>
                        <label class="flex items-center gap-2 p-1.5 bg-slate-50 rounded border cursor-pointer hover:bg-slate-100">
                            <input type="checkbox" class="w-3.5 h-3.5 rounded text-indigo-600">
                            <span>Bữa chiều (16:30) - Chưa đến giờ</span>
                        </label>
                    </div>
                </div>

                <!-- Ghi chú y tế & chế độ riêng -->
                <div class="text-xs">
                    <div class="font-bold text-slate-700 mb-1">📝 Ghi Chú Chăm Sóc & Đồ Mang Theo:</div>
                    <div class="p-2 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-950 text-[11px] leading-relaxed">
                        <div><strong>Ăn uống:</strong> ${room.feeding_notes || 'Ăn theo khẩu phần tiệm.'}</div>
                        <div class="mt-0.5"><strong>Đồ gửi kèm:</strong> ${room.items_brought || 'Không có.'}</div>
                    </div>
                </div>

                <!-- Tạm tính tiền -->
                <div class="pt-2 border-t flex justify-between items-center text-xs">
                    <span class="font-bold text-slate-700">TỔNG TIỀN PHÒNG HIỆN TẠI:</span>
                    <span class="font-black text-rose-700 text-sm font-mono">${(room.current_total_amount || 0).toLocaleString('vi-VN')} đ</span>
                </div>

                <!-- Nút thao tác nhanh -->
                <div class="space-y-1.5 pt-1 text-xs">
                    <button onclick="window.hotelManager.openBookSpaModal(${room.active_booking_id})" 
                            class="w-full p-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-bold text-center border border-purple-200 flex items-center justify-center gap-1.5">
                        <span>✂️</span> Đặt Lịch Dịch Vụ Spa Cho Bé
                    </button>
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="window.hotelManager.printHotelTicket(${room.active_booking_id})" 
                                class="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-center border">
                            🖨️ In Phiếu
                        </button>
                        <button onclick="window.hotelManager.openHotelCheckoutModal(${room.active_booking_id})" 
                                class="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-center shadow-xs">
                            💳 Check-out
                        </button>
                    </div>
                </div>
            ` : `
                <div class="p-4 bg-emerald-50/40 rounded-xl border border-emerald-200 text-center space-y-2 text-xs">
                    <div class="text-emerald-700 font-bold text-sm">✨ Phòng Này Đang Trống</div>
                    <p class="text-slate-500 text-[11px]">Phòng đã được dọn vệ sinh sạch sẽ và sẵn sàng đón thú cưng mới lưu trú.</p>
                    <div class="text-xs font-mono font-bold text-slate-800">Đơn giá: ${(room.price_per_day || 0).toLocaleString('vi-VN')} đ / ngày</div>
                    <div class="pt-2">
                        <button onclick="window.hotelManager.openHotelCheckinModal(${room.id})" 
                                class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs">
                            ➕ Nhận Bé Vào Buồng (Check-in)
                        </button>
                    </div>
                </div>
            `}
        `;
    }

    // ==========================================
    // VIEW 2: BẢNG DANH SÁCH PHIẾU ĐANG LƯU TRÚ (TABLE)
    // ==========================================
    async function renderActiveTable() {
        const tbody = document.getElementById('hotel-table-body');
        if (!tbody) return;

        try {
            const res = await fetch('/api/hotel/bookings/active');
            if (!res.ok) throw new Error('Không thể tải danh sách phiếu');
            state.activeBookings = await res.json();

            if (state.activeBookings.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-slate-400 italic">Hiện tại không có bé nào đang lưu trú.</td></tr>';
                return;
            }

            tbody.innerHTML = state.activeBookings.map((b, idx) => `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                    <td class="p-2.5 text-center font-mono">${idx + 1}</td>
                    <td class="p-2.5 font-bold font-mono text-indigo-700">${b.code}</td>
                    <td class="p-2.5 font-bold text-slate-800">${b.room_code} - ${b.room_name}</td>
                    <td class="p-2.5 font-bold text-slate-900">${b.pet_name} <span class="text-[10px] font-normal text-slate-400">(${b.pet_breed || ''})</span></td>
                    <td class="p-2.5 text-slate-700">${b.contact_name} <span class="text-[10px] text-slate-400">(${b.contact_phone || ''})</span></td>
                    <td class="p-2.5 font-mono text-slate-500">${b.check_in_time ? formatDateTime(b.check_in_time) : ''}</td>
                    <td class="p-2.5 font-mono text-amber-700 font-bold">${b.expected_checkout_time ? formatDateTime(b.expected_checkout_time) : ''}</td>
                    <td class="p-2.5 text-slate-700 text-xs font-medium whitespace-nowrap">${b.created_by || 'Lễ tân'}</td>
                    <td class="p-2.5 text-slate-500 text-xs whitespace-nowrap">${b.updated_by ? `${b.updated_by} <span class="text-[10px] text-gray-400 block">${formatDateTime(b.updated_at)}</span>` : '<span class="text-gray-300">---</span>'}</td>
                    <td class="p-2.5 text-right font-mono font-black text-rose-700">${(b.current_total_amount || 0).toLocaleString('vi-VN')} đ</td>
                    <td class="p-2.5 text-right space-x-1">
                        <button onclick="window.hotelManager.printHotelTicket(${b.id})" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-[11px]">🖨️ In</button>
                        <button onclick="window.hotelManager.openHotelCheckoutModal(${b.id})" class="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-[11px]">💳 Check-out</button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-rose-500">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
        }
    }

    // ==========================================
    // VIEW 3: LỊCH DÒNG THỜI GIAN (GANTT)
    // ==========================================
    function renderGanttTimeline() {
        const container = document.getElementById('hotel-gantt-container');
        if (!container) return;

        // Tính 7 ngày trong tuần
        const now = new Date();
        now.setDate(now.getDate() + (state.ganttWeekOffset * 7));
        const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayOffset);

        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            days.push(d);
        }

        const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
        const todayStr = getLocalTodayDateStr();

        let html = `
            <div class="overflow-x-auto">
                <table class="w-full border-collapse text-xs">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-bold border-b text-[11px]">
                            <th class="p-2.5 w-44 text-left border-r bg-slate-200/60 sticky left-0 z-10">Buồng Phòng</th>
                            ${days.map((d, i) => {
                                const dStr = getLocalTodayDateStr(d);
                                const isToday = dStr === todayStr;
                                return `
                                    <th class="p-2 text-center border-r w-32 ${isToday ? 'bg-amber-100/70 text-amber-900 border-amber-300' : ''}">
                                        ${dayNames[i]} (${d.getDate()}/${d.getMonth() + 1})
                                        ${isToday ? '<br><span class="text-[9px] font-normal text-amber-700">Hôm nay</span>' : ''}
                                    </th>
                                `;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${state.rooms.map(room => {
                            const isOccupied = room.status === 'occupied';
                            const checkinDate = room.check_in_time ? room.check_in_time.slice(0, 10) : null;
                            const checkoutDate = room.expected_checkout_time ? room.expected_checkout_time.slice(0, 10) : null;

                            return `
                                <tr class="hover:bg-slate-50/50">
                                    <td class="p-2.5 font-bold border-r bg-slate-50 sticky left-0 z-10 text-slate-800">
                                        ${room.code}
                                        <div class="text-[10px] text-slate-400 font-normal truncate">${room.name}</div>
                                    </td>
                                    ${days.map(d => {
                                        const dStr = getLocalTodayDateStr(d);
                                        const isInStay = isOccupied && checkinDate && checkoutDate && (dStr >= checkinDate && dStr <= checkoutDate);

                                        if (isInStay) {
                                            const isLastDay = dStr === checkoutDate;
                                            return `
                                                <td class="p-1 border-r bg-rose-50/50">
                                                    <div onclick="window.hotelManager.selectRoom(${room.id})" 
                                                         class="p-1.5 ${isLastDay ? 'bg-amber-500' : 'bg-rose-500'} text-white rounded font-bold text-[10px] shadow-2xs cursor-pointer truncate hover:opacity-90">
                                                        ${room.pet_name || 'Bé cưng'} ${isLastDay ? '(Trả)' : ''}
                                                    </div>
                                                </td>
                                            `;
                                        } else {
                                            return `
                                                <td onclick="window.hotelManager.openHotelCheckinModal(${room.id}, '${dStr}')" 
                                                    class="p-1 border-r text-center text-slate-300 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer text-[10px]">
                                                    + Trống
                                                </td>
                                            `;
                                        }
                                    }).join('')}
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
        const weekLabel = document.getElementById('hotel-gantt-week-label');
        if (weekLabel) {
            weekLabel.innerText = `${days[0].getDate()}/${days[0].getMonth() + 1} - ${days[6].getDate()}/${days[6].getMonth() + 1}/${days[6].getFullYear()}`;
        }
    }

    function changeGanttWeek(offset) {
        state.ganttWeekOffset += offset;
        renderGanttTimeline();
    }

    // ==========================================
    // POPUP CHECK-IN (HỖ TRỢ ĐỢT HÀNG LOẠT & DROPLIST THÔNG MINH)
    // ==========================================
    let currentCustPets = [];
    let initialSelectedRoomId = null;

    async function openHotelCheckinModal(roomId, defaultDate) {
        initialSelectedRoomId = roomId || null;
        const modal = document.getElementById('modal-hotel-checkin');
        if (!modal) return;

        // Reset ô tìm khách
        const searchInput = document.getElementById('hotel-cust-search');
        const custIdInput = document.getElementById('hotel-cust-id');
        const flagBadge = document.getElementById('hotel-cust-flag-badge');
        const depositInput = document.getElementById('hotel-deposit-amount');
        if (searchInput) searchInput.value = '';
        if (custIdInput) custIdInput.value = '';
        if (flagBadge) flagBadge.classList.add('hidden');
        if (depositInput) depositInput.value = 0;

        currentCustPets = [];

        // Thời gian check-in và dự kiến đón
        const now = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(now.getDate() + 2);

        const checkinInput = document.getElementById('hotel-batch-checkin-time');
        const checkoutInput = document.getElementById('hotel-batch-expected-time');
        if (checkinInput) checkinInput.value = getLocalNowDateTimeLocalStr(now);
        if (checkoutInput) checkoutInput.value = getLocalNowDateTimeLocalStr(tomorrow);

        // Khởi tạo dòng đầu tiên
        const tbody = document.getElementById('tbody-hotel-batch-pets');
        if (tbody) tbody.innerHTML = '';
        addHotelBatchPetRow(roomId);

        modal.classList.remove('hidden');
    }

    // Dropdown popup tìm khách hàng theo tên + SĐT, lọc fuzzy đa từ
    function onHotelCustSearchInput(rawQuery) {
        const dropdown = document.getElementById('hotel-cust-dropdown');
        if (!dropdown) return;

        const custs = (window.allContacts || []).filter(c => c.type === 'customer' || !c.type);
        const tokens = (rawQuery || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
        const norm = s => (s || '').toString().toLowerCase();

        const matched = tokens.length === 0 ? custs : custs.filter(c => {
            const haystack = norm(c.name) + ' ' + norm(c.phone);
            return tokens.every(tok => haystack.includes(tok));
        });

        if (matched.length === 0) {
            dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-slate-400">Không tìm thấy khách hàng phù hợp</div>';
        } else {
            dropdown.innerHTML = matched.slice(0, 25).map(c => `
                <div class="px-3 py-2 text-xs hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center transition"
                     onmousedown="window.hotelManager.selectHotelCust(${c.id})">
                    <div>
                        <div class="font-bold text-slate-800 flex items-center gap-1.5">
                            <span>${c.name}</span>
                            ${c.is_flagged ? '<span class="text-[9px] bg-rose-600 text-white font-bold px-1.5 py-0.5 rounded-full">Lưu ý</span>' : ''}
                        </div>
                        <div class="text-slate-400 text-[11px]">${c.phone || 'Chưa có SĐT'}</div>
                    </div>
                    <div class="text-right text-[11px] text-slate-500 font-mono">
                        ${c.pets_count ? `🐾 ${c.pets_count} bé` : ''}
                    </div>
                </div>
            `).join('');
        }
        dropdown.classList.remove('hidden');
    }

    async function selectHotelCust(contactId) {
        const cust = (window.allContacts || []).find(c => c.id == contactId);
        const searchInput = document.getElementById('hotel-cust-search');
        const custIdInput = document.getElementById('hotel-cust-id');
        const flagBadge = document.getElementById('hotel-cust-flag-badge');
        const dropdown = document.getElementById('hotel-cust-dropdown');

        if (custIdInput) custIdInput.value = contactId;
        if (searchInput) searchInput.value = cust ? `${cust.name} - ${cust.phone || 'Không SĐT'}` : '';
        if (flagBadge) flagBadge.classList.toggle('hidden', !cust || !cust.is_flagged);
        if (dropdown) dropdown.classList.add('hidden');

        // Tải danh sách thú cưng của khách này
        try {
            const res = await fetch(`/api/pets/customer/${contactId}`);
            currentCustPets = await res.json();
        } catch (e) {
            console.error('Lỗi tải thú cưng của khách:', e);
            currentCustPets = [];
        }

        // Cập nhật lại các select bé trên từng dòng
        updateAllPetSelects();
    }

    function updateAllPetSelects() {
        const tbody = document.getElementById('tbody-hotel-batch-pets');
        if (!tbody) return;
        const petSelects = tbody.querySelectorAll('.batch-hotel-pet-select');
        petSelects.forEach(sel => {
            const curVal = sel.value;
            let optHtml = '<option value="__new__">➕ Nhập bé mới tại chỗ</option>';
            if (currentCustPets && currentCustPets.length > 0) {
                optHtml += currentCustPets.map(p => `
                    <option value="${p.id}" data-name="${p.name}" data-breed="${p.breed || ''}" data-weight="${p.weight || 0}" ${p.id == curVal ? 'selected' : ''}>
                        ${p.species === 'cat' ? '🐱' : '🐶'} ${p.name} (${p.breed || 'Chưa rõ'}, ${p.weight || 0}kg)
                    </option>
                `).join('');
            }
            sel.innerHTML = optHtml;
        });
    }

    function addHotelBatchPetRow(defaultRoomId) {
        const tbody = document.getElementById('tbody-hotel-batch-pets');
        if (!tbody) return;

        const rowIdx = tbody.querySelectorAll('.hotel-batch-row').length + 1;
        const targetRoomId = defaultRoomId || initialSelectedRoomId;

        // Tạo options cho phòng trống
        const roomOpts = state.rooms.map(r => `
            <option value="${r.id}" data-rate="${r.price_per_day || 0}" ${r.id == targetRoomId ? 'selected' : ''} ${r.status === 'occupied' && r.id != targetRoomId ? 'disabled' : ''}>
                ${r.code} - ${r.name} (${(r.price_per_day || 0).toLocaleString('vi-VN')} đ/ngày) ${r.status === 'occupied' ? '[Có bé]' : ''}
            </option>
        `).join('');

        // Tạo options cho bé
        let petOpts = '<option value="__new__">➕ Nhập bé mới tại chỗ</option>';
        if (currentCustPets && currentCustPets.length > 0) {
            petOpts += currentCustPets.map(p => `
                <option value="${p.id}" data-name="${p.name}" data-breed="${p.breed || ''}" data-weight="${p.weight || 0}">
                    ${p.species === 'cat' ? '🐱' : '🐶'} ${p.name} (${p.breed || 'Chưa rõ'}, ${p.weight || 0}kg)
                </option>
            `).join('');
        }

        const tr = document.createElement('tr');
        tr.className = 'hotel-batch-row hover:bg-slate-50/50 transition';
        tr.innerHTML = `
            <td class="p-2.5 text-center font-bold text-slate-400 font-mono row-idx">${rowIdx}</td>
            <td class="p-2.5 space-y-1.5">
                <select class="batch-hotel-pet-select w-full border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-700 bg-white"
                        onchange="window.hotelManager.onBatchPetSelectChange(this)">
                    ${petOpts}
                </select>
                <div class="batch-new-pet-fields grid grid-cols-2 gap-1.5">
                    <input type="text" placeholder="Tên bé" class="batch-pet-name border rounded-lg p-1 text-xs font-medium">
                    <input type="text" placeholder="Giống loài" class="batch-pet-breed border rounded-lg p-1 text-xs">
                </div>
            </td>
            <td class="p-2.5 space-y-1.5">
                <div class="flex items-center gap-1">
                    <input type="number" step="0.1" min="0" placeholder="Cân nặng" class="batch-pet-weight w-20 border rounded-lg p-1.5 text-xs font-mono font-bold">
                    <span class="text-slate-400 font-bold text-[11px]">kg</span>
                </div>
                <input type="text" placeholder="Sức khỏe: ve rận, nấm, sẹo..." class="batch-pet-health w-full border rounded-lg p-1.5 text-xs text-rose-700">
            </td>
            <td class="p-2.5 space-y-1.5">
                <select class="batch-hotel-room-select w-full border border-indigo-200 rounded-lg p-1.5 text-xs font-bold text-indigo-700 bg-indigo-50/30"
                        onchange="window.hotelManager.onBatchRoomSelectChange(this)">
                    ${roomOpts}
                </select>
                <div class="flex items-center gap-1">
                    <span class="text-slate-500 text-[10px] shrink-0 font-medium">Giá ngày:</span>
                    <input type="number" step="10000" class="batch-hotel-daily-rate w-full border border-slate-300 rounded p-1 text-xs font-bold text-indigo-700 text-right"
                           value="${(state.rooms.find(r => r.id == targetRoomId) || state.rooms[0] || {}).price_per_day || 150000}"
                           placeholder="Đơn giá"
                           oninput="window.hotelManager.recalcHotelBatchSummary()">
                    <span class="text-[10px] text-slate-400 font-bold shrink-0">đ</span>
                </div>
            </td>
            <td class="p-2.5 space-y-1.5">
                <input type="text" placeholder="Ăn uống: Hạt 2 cữ, pate..." class="batch-pet-feeding w-full border rounded-lg p-1.5 text-xs">
                <input type="text" placeholder="Đồ gửi: 1 balo, nệm, thuốc..." class="batch-pet-items w-full border rounded-lg p-1.5 text-xs text-slate-600">
            </td>
            <td class="p-2.5 text-center">
                <button type="button" onclick="window.hotelManager.removeHotelBatchPetRow(this)" class="text-slate-300 hover:text-rose-600 font-bold text-base p-1" title="Xóa bé này">✕</button>
            </td>
        `;

        tbody.appendChild(tr);
        recalcHotelBatchSummary();
    }

    function removeHotelBatchPetRow(btn) {
        const tr = btn.closest('tr');
        const tbody = document.getElementById('tbody-hotel-batch-pets');
        if (!tbody) return;
        if (tbody.querySelectorAll('.hotel-batch-row').length <= 1) {
            alert('Cần có ít nhất 1 bé trong đợt tiếp nhận!');
            return;
        }
        tr.remove();
        // Cập nhật lại số thứ tự
        tbody.querySelectorAll('.hotel-batch-row').forEach((r, i) => {
            const idxCell = r.querySelector('.row-idx');
            if (idxCell) idxCell.textContent = i + 1;
        });
        recalcHotelBatchSummary();
    }

    function onBatchPetSelectChange(selectEl) {
        const tr = selectEl.closest('tr');
        const newFields = tr.querySelector('.batch-new-pet-fields');
        const nameInput = tr.querySelector('.batch-pet-name');
        const breedInput = tr.querySelector('.batch-pet-breed');
        const weightInput = tr.querySelector('.batch-pet-weight');

        if (selectEl.value === '__new__') {
            if (newFields) newFields.classList.remove('hidden');
            if (nameInput) nameInput.value = '';
            if (breedInput) breedInput.value = '';
            if (weightInput) weightInput.value = '';
        } else {
            if (newFields) newFields.classList.add('hidden');
            const selectedOpt = selectEl.selectedOptions[0];
            if (selectedOpt) {
                if (nameInput) nameInput.value = selectedOpt.dataset.name || '';
                if (breedInput) breedInput.value = selectedOpt.dataset.breed || '';
                if (weightInput) weightInput.value = selectedOpt.dataset.weight || '';
            }
        }
    }

    function onBatchRoomSelectChange(selectEl) {
        const tr = selectEl.closest('tr');
        const rateInput = tr.querySelector('.batch-hotel-daily-rate');
        const opt = selectEl.selectedOptions[0];
        if (opt && rateInput) {
            rateInput.value = opt.dataset.rate || 0;
        }
        recalcHotelBatchSummary();
    }

    function recalcHotelBatchSummary() {
        const tbody = document.getElementById('tbody-hotel-batch-pets');
        if (!tbody) return;
        const rows = tbody.querySelectorAll('.hotel-batch-row');
        let totalDailyRate = 0;

        rows.forEach(tr => {
            const rateInput = tr.querySelector('.batch-hotel-daily-rate');
            const rate = parseFloat(rateInput ? rateInput.value : 0) || 0;
            totalDailyRate += rate;
        });

        const totalPetsEl = document.getElementById('hotel-batch-total-pets');
        const estDailyEl = document.getElementById('hotel-batch-est-daily-rate');
        if (totalPetsEl) totalPetsEl.textContent = rows.length;
        if (estDailyEl) estDailyEl.textContent = totalDailyRate.toLocaleString('vi-VN') + ' đ';
    }

    function closeHotelCheckinModal() {
        const modal = document.getElementById('modal-hotel-checkin');
        if (modal) modal.classList.add('hidden');
    }

    async function submitHotelBatchCheckin(andPrint = false) {
        const contactId = parseInt(document.getElementById('hotel-cust-id')?.value);
        if (!contactId) {
            alert('Vui lòng tìm và chọn khách hàng!');
            document.getElementById('hotel-cust-search')?.focus();
            return;
        }

        const checkinTime = document.getElementById('hotel-batch-checkin-time')?.value;
        const expectedCheckout = document.getElementById('hotel-batch-expected-time')?.value;
        const depositAmount = parseFloat(document.getElementById('hotel-deposit-amount')?.value) || 0;

        const tbody = document.getElementById('tbody-hotel-batch-pets');
        const rows = tbody ? Array.from(tbody.querySelectorAll('.hotel-batch-row')) : [];
        if (rows.length === 0) {
            alert('Vui lòng thêm ít nhất 1 bé để tiếp nhận!');
            return;
        }

        const items = [];
        const usedRooms = new Set();

        for (let idx = 0; idx < rows.length; idx++) {
            const tr = rows[idx];
            const petSelVal = tr.querySelector('.batch-hotel-pet-select')?.value;
            const petId = (petSelVal && petSelVal !== '__new__') ? parseInt(petSelVal) : null;
            const petName = tr.querySelector('.batch-pet-name')?.value.trim();
            const petBreed = tr.querySelector('.batch-pet-breed')?.value.trim();
            const petWeight = parseFloat(tr.querySelector('.batch-pet-weight')?.value) || 0;
            const roomId = parseInt(tr.querySelector('.batch-hotel-room-select')?.value);
            const healthCondition = tr.querySelector('.batch-pet-health')?.value.trim() || '';
            const feedingNotes = tr.querySelector('.batch-pet-feeding')?.value.trim() || '';
            const itemsBrought = tr.querySelector('.batch-pet-items')?.value.trim() || '';

            if (!petId && !petName) {
                alert(`Dòng ${idx + 1}: Vui lòng chọn hoặc nhập tên của bé!`);
                return;
            }
            if (!roomId) {
                alert(`Dòng ${idx + 1}: Vui lòng chọn buồng phòng!`);
                return;
            }
            if (usedRooms.has(roomId)) {
                alert(`Buồng phòng dòng ${idx + 1} bị trùng với một bé khác trong cùng đợt!`);
                return;
            }
            usedRooms.add(roomId);

            const roomObj = state.rooms.find(r => r.id === roomId);
            const rateInput = tr.querySelector('.batch-hotel-daily-rate');
            const dailyRate = rateInput ? (parseFloat(rateInput.value) || 0) : (roomObj ? (roomObj.price_per_day || 0) : 150000);

            items.push({
                room_id: roomId,
                pet_id: petId,
                pet_name: petName,
                pet_breed: petBreed,
                pet_weight: petWeight,
                daily_rate: dailyRate,
                health_condition: healthCondition,
                feeding_notes: feedingNotes,
                items_brought: itemsBrought
            });
        }

        try {
            const res = await fetch('/api/hotel/checkin-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contact_id: contactId,
                    check_in_time: checkinTime,
                    expected_checkout_time: expectedCheckout,
                    deposit_amount: depositAmount,
                    items: items
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Lỗi tiếp nhận lưu trú');
            }

            const data = await res.json();
            closeHotelCheckinModal();
            await loadHotelRooms();

            if (andPrint && data.batch_code) {
                await printHotelIntakeTicketDirectly(data.batch_code);
            } else {
                alert(`Check-in thành công cho ${data.count} bé! Mã đợt: ${data.batch_code}`);
            }
        } catch (err) {
            alert(err.message);
        }
    }

    // ==========================================
    // MẪU IN PHIẾU TIẾP NHẬN HOTEL K80 (CHUYÊN MÁY IN NHIỆT 80MM)
    // ==========================================
    function generateHotelIntakeTicketHtml(batchData, shopInfo = {}) {
        const bookings = Array.isArray(batchData) ? batchData : (batchData.bookings || [batchData]);
        if (bookings.length === 0) return '';

        const first = bookings[0];
        const now = new Date();
        const dateStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

        const shopName = shopInfo.company_name || 'PETCARE STATION';
        const shopPhone = shopInfo.company_phone || '0908.888.999';
        const shopAddr = shopInfo.company_address || 'Hệ Thống Dịch Vụ Thú Cưng';

        let totalDaily = 0;
        let totalDeposit = parseFloat(first.deposit_amount || 0);

        const petsHtml = bookings.map((b, idx) => {
            const rate = parseFloat(b.daily_rate || 0);
            totalDaily += rate;
            const petWeight = b.pet_weight_at_checkin || b.pet_weight ? `${b.pet_weight_at_checkin || b.pet_weight} kg` : '-';

            return `
                <div style="border: 1px dashed #000; padding: 6px; margin-bottom: 6px; border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 13px;">
                        <span>🐾 Bé ${idx + 1}: ${b.pet_name || 'Bé cưng'}</span>
                        <span style="font-family: monospace;">${(rate).toLocaleString('vi-VN')} đ/ngày</span>
                    </div>
                    <div style="font-size: 11px; margin-top: 2px;">
                        <b>Buồng phòng:</b> [${b.room_code || ''}] ${b.room_name || ''}
                    </div>
                    <div style="font-size: 11px; margin-top: 2px;">
                        <b>Giống loài / Cân nặng:</b> ${b.pet_breed || 'Chưa rõ'} | ${petWeight}
                    </div>
                    ${b.health_condition ? `
                        <div style="font-size: 11px; margin-top: 2px; color: #000; background: #eee; padding: 2px 4px; border-radius: 2px;">
                            <b>⚠️ Sức khỏe lúc nhận:</b> ${b.health_condition}
                        </div>
                    ` : ''}
                    ${b.feeding_notes ? `
                        <div style="font-size: 11px; margin-top: 2px;">
                            <b>🍲 Ăn uống:</b> ${b.feeding_notes}
                        </div>
                    ` : ''}
                    ${b.items_brought ? `
                        <div style="font-size: 11px; margin-top: 2px;">
                            <b>🎒 Đồ gửi kèm:</b> ${b.items_brought}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        return `
            <div style="font-family: monospace; width: 72mm; margin: 0 auto; padding: 3px; font-size: 12px; line-height: 1.35; color: #000;">
                <div style="text-align: center; margin-bottom: 8px;">
                    <div style="font-size: 15px; font-weight: 900; text-transform: uppercase;">${shopName}</div>
                    <div style="font-size: 10px;">${shopAddr}</div>
                    <div style="font-size: 11px; font-weight: 800;">Hotline: ${shopPhone}</div>
                </div>

                <div style="text-align: center; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0; margin-bottom: 8px;">
                    <div style="font-size: 13px; font-weight: 900; text-transform: uppercase;">PHIẾU TIẾP NHẬN HOTEL</div>
                    <div style="font-size: 11px; font-weight: 800; margin-top: 2px;">Mã đợt: ${first.batch_code || first.code || ''}</div>
                    <div style="font-size: 10px; color: #333;">Thời gian: ${dateStr}</div>
                </div>

                <div style="margin-bottom: 8px; font-size: 11px;">
                    <div><b>Chủ nuôi:</b> ${first.contact_name || 'Khách vãng lai'}</div>
                    <div><b>Số điện thoại:</b> ${first.contact_phone || 'Chưa có SĐT'}</div>
                    <div><b>Dự kiến đón:</b> ${first.expected_checkout_time ? first.expected_checkout_time.replace('T', ' ').slice(0, 16) : 'Chưa định ngày'}</div>
                </div>

                <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; margin-bottom: 4px;">
                    DANH SÁCH BÉ LƯU TRÚ (${bookings.length} bé):
                </div>

                ${petsHtml}

                <div style="border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px; font-size: 11px;">
                    <div style="display: flex; justify-content: space-between; font-weight: 800;">
                        <span>TỔNG TIỀN PHÒNG / NGÀY:</span>
                        <span style="font-family: monospace;">${totalDaily.toLocaleString('vi-VN')} đ</span>
                    </div>
                    ${totalDeposit > 0 ? `
                        <div style="display: flex; justify-content: space-between; font-weight: 900; margin-top: 2px;">
                            <span>TIỀN ĐÃ ĐẶT CỌC:</span>
                            <span style="font-family: monospace;">- ${totalDeposit.toLocaleString('vi-VN')} đ</span>
                        </div>
                    ` : ''}
                </div>

                <div style="border-top: 1px dashed #000; margin-top: 8px; padding-top: 6px; font-size: 10px; line-height: 1.25; text-align: justify;">
                    <b>* Cam kết:</b> Tiệm thực hiện chăm sóc, vệ sinh và cho ăn theo đúng thông tin tiếp nhận trên. Chủ nuôi xác nhận tình trạng sức khỏe của bé và đã cung cấp đầy đủ thông tin bệnh lý (nếu có).
                </div>

                <div style="display: flex; justify-content: space-between; margin-top: 12px; text-align: center; font-size: 10px;">
                    <div style="width: 48%;">
                        <b>CHỦ NUÔI KÝ NHẬN</b><br>
                        <span style="font-size: 9px; color: #555;">(Ký & ghi rõ họ tên)</span>
                        <div style="height: 14mm;"></div>
                    </div>
                    <div style="width: 48%;">
                        <b>NV TIẾP NHẬN</b><br>
                        <span style="font-size: 9px; color: #555;">(Ký & ghi rõ họ tên)</span>
                        <div style="height: 14mm;"></div>
                    </div>
                </div>

                <div style="text-align: center; font-size: 10px; margin-top: 8px; border-top: 1px dotted #000; padding-top: 4px;">
                    Cảm ơn Quý khách đã tin tưởng gửi bé! ❤️
                </div>
            </div>
        `;
    }

    async function printHotelIntakeTicketDirectly(batchCodeOrBookingId) {
        let bookings = [];
        try {
            if (typeof batchCodeOrBookingId === 'string' && batchCodeOrBookingId.startsWith('HTB-')) {
                const res = await fetch(`/api/hotel/bookings/batch/${batchCodeOrBookingId}`);
                if (res.ok) bookings = await res.json();
            } else if (typeof batchCodeOrBookingId === 'number') {
                const room = state.rooms.find(r => r.active_booking_id === batchCodeOrBookingId);
                if (room) bookings = [room];
            }
        } catch (e) {
            console.error('Lỗi lấy dữ liệu in hotel:', e);
        }

        if (bookings.length === 0) {
            alert('Không tìm thấy dữ liệu tiếp nhận để in phiếu!');
            return;
        }

        const shopInfo = window.companySettings || {};
        const html = generateHotelIntakeTicketHtml(bookings, shopInfo);

        let iframe = document.getElementById('print-hotel-iframe');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'print-hotel-iframe';
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '350px';
            iframe.style.height = '600px';
            iframe.style.border = '0';
            iframe.style.zIndex = '-9999';
            iframe.style.opacity = '0.01';
            iframe.style.pointerEvents = 'none';
            document.body.appendChild(iframe);
        }

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>In Phiếu Tiếp Nhận Hotel K80</title>
                <style>
                    @page { size: 80mm auto; margin: 0; }
                    body {
                        margin: 0;
                        padding: 0;
                        background: #fff;
                        color: #000;
                        font-weight: 900 !important;
                        -webkit-text-stroke: 0.35px #000 !important;
                    }
                </style>
            </head>
            <body>
                ${html}
            </body>
            </html>
        `);
        doc.close();

        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        }, 300);
    }

    // ==========================================
    // POPUP CHECK-OUT
    // ==========================================
    let currentCheckoutBookingId = null;
    let currentCheckoutSummary = null;

    async function openHotelCheckoutModal(bookingId) {
        currentCheckoutBookingId = bookingId;
        const room = state.rooms.find(r => r.active_booking_id === bookingId);
        if (!room) return;

        const modal = document.getElementById('modal-hotel-checkout');
        if (!modal) return;

        document.getElementById('co-room-code').innerText = `${room.code} - ${room.name}`;
        document.getElementById('co-pet-name').innerText = `${room.pet_species === 'cat' ? '🐱' : '🐶'} ${room.pet_name} (${room.pet_breed || ''})`;
        document.getElementById('co-customer-name').innerText = `${room.contact_name} (${room.contact_phone || ''})`;
        document.getElementById('co-time-range').innerText = `${room.check_in_time ? room.check_in_time.slice(0, 10) : ''} ➔ ${new Date().toLocaleDateString('vi-VN')} (${room.calculated_days} ngày)`;

        // Reset hiển thị trước
        const roomAmtEl = document.getElementById('co-room-amount');
        const spaAmtEl = document.getElementById('co-spa-amount');
        const spaListEl = document.getElementById('co-spa-list');
        const depAmtEl = document.getElementById('co-deposit-amount');
        const totAmtEl = document.getElementById('co-total-amount');

        if (roomAmtEl) roomAmtEl.innerText = (room.current_total_amount || 0).toLocaleString('vi-VN') + ' đ';
        if (spaAmtEl) spaAmtEl.innerText = '0 đ';
        if (spaListEl) spaListEl.innerHTML = '<span class="text-slate-400">Không có dịch vụ Spa gộp</span>';
        if (depAmtEl) depAmtEl.innerText = '- 0 đ';
        if (totAmtEl) totAmtEl.innerText = (room.current_total_amount || 0).toLocaleString('vi-VN') + ' đ';

        currentCheckoutSummary = null;
        const walletWrap = document.getElementById('co-spa-wallet-wrapper');
        const walletCheckbox = document.getElementById('co-use-spa-wallet');
        const walletInputBox = document.getElementById('co-wallet-input-box');
        const walletInput = document.getElementById('co-spa-wallet-deduct-input');
        if (walletWrap) walletWrap.classList.add('hidden');
        if (walletCheckbox) walletCheckbox.checked = false;
        if (walletInputBox) walletInputBox.classList.add('hidden');
        if (walletInput) walletInput.value = 0;

        // Gọi API checkout-summary để bóc tách tiền gộp chính xác
        try {
            const res = await fetch(`/api/hotel/checkout-summary/${bookingId}`);
            if (res.ok) {
                const summary = await res.json();
                currentCheckoutSummary = summary;
                if (roomAmtEl) roomAmtEl.innerText = (summary.room_total || 0).toLocaleString('vi-VN') + ' đ';
                if (spaAmtEl) spaAmtEl.innerText = (summary.spa_total || 0).toLocaleString('vi-VN') + ' đ';
                if (depAmtEl) depAmtEl.innerText = `- ${(summary.deposit_amount || 0).toLocaleString('vi-VN')} đ`;
                if (totAmtEl) totAmtEl.innerText = (summary.grand_total || 0).toLocaleString('vi-VN') + ' đ';

                if (spaListEl) {
                    if (summary.spa_tickets && summary.spa_tickets.length > 0) {
                        spaListEl.innerHTML = summary.spa_tickets.map(t => `
                            <div class="flex justify-between items-center py-0.5 border-b border-dashed border-slate-200">
                                <span>• ${t.service_type} (${t.status === 'done' ? 'Đã xong' : 'Chờ làm'})</span>
                                <span class="font-bold text-slate-800">${(t.price || 0).toLocaleString('vi-VN')} đ</span>
                            </div>
                        `).join('');
                    } else {
                        spaListEl.innerHTML = '<span class="text-slate-400 italic">Không có dịch vụ Spa kèm theo</span>';
                    }
                }

                // Ví Spa CHỈ hiển thị nếu có dịch vụ spa gộp và khách có số dư > 0
                const maxDeduct = summary.max_spa_wallet_deduction || 0;
                if (walletWrap && summary.spa_total > 0 && (summary.contact_spa_wallet || 0) > 0) {
                    walletWrap.classList.remove('hidden');
                    const balEl = document.getElementById('co-wallet-balance');
                    const maxNoteEl = document.getElementById('co-wallet-max-note');
                    if (balEl) balEl.innerText = (summary.contact_spa_wallet || 0).toLocaleString('vi-VN');
                    if (maxNoteEl) maxNoteEl.innerText = `Tối đa: ${maxDeduct.toLocaleString('vi-VN')} đ`;
                }
            }
        } catch (err) {
            console.error("Lỗi tải checkout summary:", err);
        }

        modal.classList.remove('hidden');
    }

    function closeHotelCheckoutModal() {
        const modal = document.getElementById('modal-hotel-checkout');
        if (modal) modal.classList.add('hidden');
        currentCheckoutSummary = null;
    }

    function onToggleCheckoutWallet(checkbox) {
        const inputBox = document.getElementById('co-wallet-input-box');
        const input = document.getElementById('co-spa-wallet-deduct-input');
        if (!inputBox) return;
        if (checkbox.checked) {
            inputBox.classList.remove('hidden');
            const maxDeduct = (currentCheckoutSummary && currentCheckoutSummary.max_spa_wallet_deduction) || 0;
            if (input) input.value = maxDeduct;
        } else {
            inputBox.classList.add('hidden');
            if (input) input.value = 0;
        }
    }

    function onWalletDeductInput(input) {
        const maxDeduct = (currentCheckoutSummary && currentCheckoutSummary.max_spa_wallet_deduction) || 0;
        let val = parseFloat(input.value) || 0;
        if (val < 0) val = 0;
        if (val > maxDeduct) val = maxDeduct;
        input.value = val;
    }

    async function submitHotelCheckout() {
        if (!currentCheckoutBookingId) return;

        const walletCheckbox = document.getElementById('co-use-spa-wallet');
        const walletInput = document.getElementById('co-spa-wallet-deduct-input');
        const useSpaWallet = !!(walletCheckbox && walletCheckbox.checked);
        const spaWalletAmount = useSpaWallet ? (parseFloat(walletInput && walletInput.value) || 0) : 0;

        try {
            const res = await fetch(`/api/hotel/checkout/${currentCheckoutBookingId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payment_method: 'cash',
                    use_spa_wallet: useSpaWallet,
                    spa_wallet_amount: spaWalletAmount
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Lỗi check-out');
            }

            const data = await res.json();
            alert(`Trả phòng thành công! Tổng cộng: ${data.total_amount.toLocaleString('vi-VN')} đ cho ${data.total_days} ngày.`);
            closeHotelCheckoutModal();
            await loadHotelRooms();
            
            // Nếu Tab Hóa Đơn đang mở thì tự động reload lịch sử
            loadHistory();
        } catch (err) {
            alert(err.message);
        }
    }

    // ==========================================
    // VIEW 4: CẤU HÌNH & DANH SÁCH BUỒNG PHÒNG
    // ==========================================
    async function loadRoomGroupsDatalist() {
        try {
            const res = await fetch('/api/hotel/room-groups');
            if (!res.ok) return;
            const groups = await res.json();
            const dl = document.getElementById('hotel-room-groups-datalist');
            if (dl) {
                dl.innerHTML = groups.map(g => `<option value="${g}">`).join('');
            }
        } catch (e) {
            console.error("Lỗi tải nhóm phòng:", e);
        }
    }

    function renderRoomsConfigTable() {
        const tbody = document.getElementById('tbody-hotel-rooms-config-list');
        if (!tbody) return;

        loadRoomGroupsDatalist();

        if (!state.rooms || state.rooms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400">Chưa có buồng phòng nào. Bấm "+ Thêm Buồng Phòng Mới" để tạo.</td></tr>';
            return;
        }

        tbody.innerHTML = state.rooms.map(room => {
            const isOccupied = room.status === 'occupied';
            const isMaint = room.status === 'maintenance';
            
            let statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">✨ Trống</span>`;
            if (isOccupied) {
                statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">🐾 Đang ở (${room.pet_name || 'Bé'})</span>`;
            } else if (isMaint) {
                statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">🛠 Bảo trì</span>`;
            }

            const zoneName = room.zone === 'cat' ? '🐱 Khu Mèo' : (room.zone === 'vip' ? '👑 Khu VIP' : '🐶 Khu Chó');

            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="p-2.5 font-bold font-mono text-slate-900">${room.code}</td>
                    <td class="p-2.5 font-bold text-slate-800">${room.name}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 text-[11px]">
                            ${room.room_group || 'Khu Tiêu Chuẩn'}
                        </span>
                    </td>
                    <td class="p-2.5 text-slate-600">${zoneName}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-indigo-700">${(room.price_per_day || 0).toLocaleString('vi-VN')} đ</td>
                    <td class="p-2.5 text-right font-mono text-slate-700">${(room.price_per_hour || 0).toLocaleString('vi-VN')} đ</td>
                    <td class="p-2.5 text-center font-bold text-slate-600">${room.capacity || 1} bé</td>
                    <td class="p-2.5 text-center">${statusBadge}</td>
                    <td class="p-2.5 text-center space-x-1">
                        <button onclick="window.hotelManager.openRoomEditorModal(${room.id})" 
                                class="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-bold text-xs border border-indigo-200">
                            ✏️ Sửa
                        </button>
                        <button onclick="window.hotelManager.deleteRoom(${room.id})" 
                                ${isOccupied ? 'disabled title="Phòng đang có khách lưu trú không thể xóa"' : ''}
                                class="px-2 py-1 ${isOccupied ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-rose-50 hover:bg-rose-100 text-rose-700'} rounded font-bold text-xs border">
                            🗑️ Xóa
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function openRoomEditorModal(roomId = null) {
        loadRoomGroupsDatalist();
        const modal = document.getElementById('modal-hotel-room-editor');
        if (!modal) return;

        const titleEl = document.getElementById('modal-hotel-room-editor-title');
        const idInput = document.getElementById('hotel-room-edit-id');
        const codeInput = document.getElementById('hotel-room-input-code');
        const nameInput = document.getElementById('hotel-room-input-name');
        const groupInput = document.getElementById('hotel-room-input-group');
        const zoneSelect = document.getElementById('hotel-room-input-zone');
        const priceDayInput = document.getElementById('hotel-room-input-price-day');
        const priceHourInput = document.getElementById('hotel-room-input-price-hour');
        const capacityInput = document.getElementById('hotel-room-input-capacity');
        const statusSelect = document.getElementById('hotel-room-input-status');
        const descInput = document.getElementById('hotel-room-input-description');

        if (roomId) {
            const room = state.rooms.find(r => r.id === roomId);
            if (!room) return;
            if (titleEl) titleEl.innerHTML = `<span>✏️</span> Chỉnh Sửa Buồng Phòng: <span class="text-indigo-600">${room.code}</span>`;
            if (idInput) idInput.value = room.id;
            if (codeInput) { codeInput.value = room.code; codeInput.readOnly = true; codeInput.classList.add('bg-slate-100'); }
            if (nameInput) nameInput.value = room.name || '';
            if (groupInput) groupInput.value = room.room_group || 'Khu Tiêu Chuẩn';
            if (zoneSelect) zoneSelect.value = room.zone || 'cat';
            if (priceDayInput) priceDayInput.value = room.price_per_day || 150000;
            if (priceHourInput) priceHourInput.value = room.price_per_hour || 25000;
            if (capacityInput) capacityInput.value = room.capacity || 1;
            if (statusSelect) statusSelect.value = room.status || 'available';
            if (descInput) descInput.value = room.description || '';
        } else {
            if (titleEl) titleEl.innerHTML = `<span>🏢</span> Thêm Buồng Phòng Mới`;
            if (idInput) idInput.value = '';
            if (codeInput) { codeInput.value = ''; codeInput.readOnly = false; codeInput.classList.remove('bg-slate-100'); }
            if (nameInput) nameInput.value = '';
            if (groupInput) groupInput.value = 'Khu Tiêu Chuẩn';
            if (zoneSelect) zoneSelect.value = 'cat';
            if (priceDayInput) priceDayInput.value = 150000;
            if (priceHourInput) priceHourInput.value = 25000;
            if (capacityInput) capacityInput.value = 1;
            if (statusSelect) statusSelect.value = 'available';
            if (descInput) descInput.value = '';
        }

        modal.classList.remove('hidden');
    }

    function closeRoomEditorModal() {
        const modal = document.getElementById('modal-hotel-room-editor');
        if (modal) modal.classList.add('hidden');
    }

    async function saveRoomEditor() {
        const id = document.getElementById('hotel-room-edit-id')?.value;
        const code = document.getElementById('hotel-room-input-code')?.value.trim();
        const name = document.getElementById('hotel-room-input-name')?.value.trim();
        const room_group = document.getElementById('hotel-room-input-group')?.value.trim() || 'Khu Tiêu Chuẩn';
        const zone = document.getElementById('hotel-room-input-zone')?.value || 'cat';
        const price_per_day = parseFloat(document.getElementById('hotel-room-input-price-day')?.value) || 0;
        const price_per_hour = parseFloat(document.getElementById('hotel-room-input-price-hour')?.value) || 0;
        const capacity = parseInt(document.getElementById('hotel-room-input-capacity')?.value) || 1;
        const status = document.getElementById('hotel-room-input-status')?.value || 'available';
        const description = document.getElementById('hotel-room-input-description')?.value.trim() || '';

        if (!code) {
            alert('Vui lòng nhập mã buồng phòng!');
            return;
        }
        if (!name) {
            alert('Vui lòng nhập tên buồng phòng!');
            return;
        }

        const payload = {
            code, name, room_group, zone, price_per_day, price_per_hour, capacity, status, description
        };

        try {
            let res;
            if (id) {
                res = await fetch(`/api/hotel/rooms/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch(`/api/hotel/rooms`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Không thể lưu buồng phòng');
            }

            closeRoomEditorModal();
            await loadHotelRooms();
            renderRoomsConfigTable();
            alert('Đã lưu thông tin buồng phòng thành công!');
        } catch (err) {
            alert(err.message);
        }
    }

    async function deleteRoom(roomId) {
        const room = state.rooms.find(r => r.id === roomId);
        const code = room ? room.code : roomId;
        const confirmed = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({
                title: 'Xóa Buồng Phòng',
                message: `Bạn có chắc chắn muốn xóa buồng phòng ${code} không?`,
                type: 'danger',
                confirmText: 'Xóa Phòng',
                cancelText: 'Hủy bỏ',
                icon: '🗑️'
            })
            : confirm(`Bạn có chắc chắn muốn xóa buồng phòng ${code} không?`);
        if (!confirmed) return;

        try {
            const res = await fetch(`/api/hotel/rooms/${roomId}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Lỗi xóa phòng');
            }
            await loadHotelRooms();
            renderRoomsConfigTable();
            if (window.showToast) window.showToast(`Đã xóa buồng phòng ${code} thành công!`, 'success');
            else alert(`Đã xóa buồng phòng ${code} thành công!`);
        } catch (err) {
            if (window.showToast) window.showToast('Lỗi: ' + err.message, 'error');
            else alert(err.message);
        }
    }

    // ==========================================
    // SPA <-> HOTEL WORKFLOW (CHIỀU 1 & CHIỀU 2)
    // ==========================================
    let currentBookSpaBookingId = null;

    function openBookSpaModal(bookingId) {
        currentBookSpaBookingId = bookingId;
        const room = state.rooms.find(r => r.active_booking_id === bookingId);
        if (!room) return;

        const modal = document.getElementById('modal-hotel-book-spa');
        if (!modal) return;

        document.getElementById('book-spa-booking-id').value = bookingId;
        document.getElementById('book-spa-room-code').innerText = `${room.code} - ${room.name}`;
        document.getElementById('book-spa-pet-name').innerText = `${room.pet_species === 'cat' ? '🐱' : '🐶'} ${room.pet_name} (${room.contact_name})`;

        const srvSel = document.getElementById('book-spa-service-type');
        if (srvSel) {
            srvSel.onchange = function() {
                const opt = srvSel.selectedOptions[0];
                const priceInput = document.getElementById('book-spa-price');
                if (opt && priceInput && opt.dataset.price) {
                    priceInput.value = opt.dataset.price;
                }
            };
        }

        modal.classList.remove('hidden');
    }

    function closeBookSpaModal() {
        const modal = document.getElementById('modal-hotel-book-spa');
        if (modal) modal.classList.add('hidden');
    }

    async function submitBookSpaForGuest() {
        if (!currentBookSpaBookingId) return;

        const service_type = document.getElementById('book-spa-service-type')?.value;
        const price = parseFloat(document.getElementById('book-spa-price')?.value) || 0;
        const note = document.getElementById('book-spa-note')?.value.trim() || '';

        try {
            const res = await fetch(`/api/hotel/book-spa-for-guest/${currentBookSpaBookingId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ service_type, price, note })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Lỗi đặt lịch Spa');
            }

            closeBookSpaModal();
            alert(`Đã đặt dịch vụ Spa [${service_type}] cho bé thành công! Chi phí sẽ tự động gộp vào bill phòng khi trả.`);
            await loadHotelRooms();
        } catch (err) {
            alert(err.message);
        }
    }

    let currentSpaTransferTicketId = null;

    function openSpaTransferModal(ticketId, ticketData = {}) {
        currentSpaTransferTicketId = ticketId;
        const modal = document.getElementById('modal-spa-transfer-hotel');
        if (!modal) return;

        document.getElementById('spa-transfer-ticket-id').value = ticketId;
        document.getElementById('spa-transfer-ticket-code').innerText = ticketData.code || `#SP-${ticketId}`;
        document.getElementById('spa-transfer-info').innerText = `${ticketData.pet_name || 'Bé'} (${ticketData.customer_name || ''})`;

        const roomSel = document.getElementById('spa-transfer-room-select');
        if (roomSel) {
            const availRooms = state.rooms.filter(r => r.status === 'available');
            if (availRooms.length === 0) {
                roomSel.innerHTML = '<option value="">Hết buồng phòng trống!</option>';
            } else {
                roomSel.innerHTML = availRooms.map(r => `
                    <option value="${r.id}">${r.code} - ${r.name} (${(r.price_per_day || 0).toLocaleString('vi-VN')} đ/ngày)</option>
                `).join('');
            }
        }

        const expInput = document.getElementById('spa-transfer-expected-checkout');
        if (expInput) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            expInput.value = getLocalNowDateTimeLocalStr(tomorrow);
        }

        modal.classList.remove('hidden');
    }

    function closeSpaTransferModal() {
        const modal = document.getElementById('modal-spa-transfer-hotel');
        if (modal) modal.classList.add('hidden');
    }

    async function submitSpaTransferToHotel() {
        if (!currentSpaTransferTicketId) return;

        const room_id = parseInt(document.getElementById('spa-transfer-room-select')?.value);
        if (!room_id) {
            alert('Vui lòng chọn buồng phòng trống lưu trú!');
            return;
        }

        const expected_checkout_time = document.getElementById('spa-transfer-expected-checkout')?.value;
        const deposit_amount = parseFloat(document.getElementById('spa-transfer-deposit')?.value) || 0;
        const feeding_notes = document.getElementById('spa-transfer-feeding')?.value.trim() || '';
        const items_brought = document.getElementById('spa-transfer-items')?.value.trim() || '';

        try {
            const res = await fetch(`/api/hotel/transfer-from-spa/${currentSpaTransferTicketId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_id,
                    expected_checkout_time,
                    deposit_amount,
                    feeding_notes,
                    items_brought
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Lỗi chuyển sang Hotel');
            }

            const data = await res.json();
            closeSpaTransferModal();
            alert(`Đã tiếp nhận thú cưng vào buồng phòng ${data.room_code}! Tiền Spa sẽ được kết chuyển gộp vào hóa đơn phòng.`);
            await loadHotelRooms();
        } catch (err) {
            alert(err.message);
        }
    }

    // In phiếu lưu trú
    function printHotelTicket(bookingId) {
        alert(`Đang chuẩn bị phiếu in lưu trú cho mã booking: ${bookingId}`);
    }

    // ==========================================
    // LỊCH SỬ HOTEL CHO TAB HÓA ĐƠN (TAB-ORDERS)
    // ==========================================
    async function loadHistory() {
        const tbody = document.getElementById('hotel-history-table-body');
        if (!tbody) return;

        try {
            const res = await fetch('/api/hotel/bookings/history');
            if (!res.ok) throw new Error('Không thể tải lịch sử lưu trú');
            state.historyBookings = await res.json();

            const badge = document.getElementById('hotel-history-count-badge');
            if (badge) badge.innerText = `${state.historyBookings.length} lượt`;

            if (state.historyBookings.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-slate-400 italic">Chưa có lượt lưu trú nào hoàn tất.</td></tr>';
                return;
            }

            renderHistoryRows(state.historyBookings);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-rose-500">Lỗi: ${err.message}</td></tr>`;
        }
    }

    function renderHistoryRows(list) {
        const tbody = document.getElementById('hotel-history-table-body');
        if (!tbody) return;

        tbody.innerHTML = list.map(b => `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                <td class="p-3 font-bold font-mono text-indigo-700">${b.code}</td>
                <td class="p-3 font-bold text-slate-800">${b.room_code} - ${b.room_name}</td>
                <td class="p-3 font-bold text-slate-900">${b.pet_name} <span class="text-[10px] font-normal text-slate-400">(${b.pet_breed || ''})</span></td>
                <td class="p-3 text-slate-700">${b.contact_name} <span class="text-[10px] text-slate-400">(${b.contact_phone || ''})</span></td>
                <td class="p-3 font-mono text-slate-500">${formatDateTime(b.check_in_time) || ''}</td>
                <td class="p-3 font-mono text-slate-500">${formatDateTime(b.actual_checkout_time) || ''}</td>
                <td class="p-3 text-center font-mono font-bold text-indigo-700">${b.total_days} ngày</td>
                <td class="p-3 text-right font-mono font-black text-rose-700">${(b.total_amount || 0).toLocaleString('vi-VN')} đ</td>
                <td class="p-3 text-center">
                    <button onclick="window.hotelManager.printHotelTicket(${b.id})" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-[11px]">
                        🖨️ In Lại
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function filterHistory() {
        const query = (document.getElementById('search-hotel-history')?.value || '').toLowerCase().trim();
        if (!query) {
            renderHistoryRows(state.historyBookings);
            return;
        }

        const filtered = state.historyBookings.filter(b => 
            (b.code && b.code.toLowerCase().includes(query)) ||
            (b.contact_name && b.contact_name.toLowerCase().includes(query)) ||
            (b.contact_phone && b.contact_phone.toLowerCase().includes(query)) ||
            (b.pet_name && b.pet_name.toLowerCase().includes(query)) ||
            (b.room_code && b.room_code.toLowerCase().includes(query))
        );
        renderHistoryRows(filtered);
    }

    // Export module ra window
    window.hotelManager = {
        init,
        loadHotelRooms,
        switchHotelView,
        setFilterStatus,
        setFilterZone,
        selectRoom,
        openHotelCheckinModal,
        closeHotelCheckinModal,
        onHotelCustSearchInput,
        selectHotelCust,
        addHotelBatchPetRow,
        removeHotelBatchPetRow,
        onBatchPetSelectChange,
        onBatchRoomSelectChange,
        recalcHotelBatchSummary,
        submitHotelBatchCheckin,
        submitHotelCheckin: submitHotelBatchCheckin, // backward compatibility
        generateHotelIntakeTicketHtml,
        printHotelIntakeTicketDirectly,
        openHotelCheckoutModal,
        closeHotelCheckoutModal,
        onToggleCheckoutWallet,
        onWalletDeductInput,
        submitHotelCheckout,
        renderGanttTimeline,
        changeGanttWeek,
        printHotelTicket: printHotelIntakeTicketDirectly,
        loadHistory,
        filterHistory,
        // Cấu hình buồng phòng & Đơn giá
        renderRoomsConfigTable,
        loadRoomGroupsDatalist,
        openRoomEditorModal,
        closeRoomEditorModal,
        saveRoomEditor,
        deleteRoom,
        // Spa <-> Hotel Workflow
        openBookSpaModal,
        closeBookSpaModal,
        submitBookSpaForGuest,
        openSpaTransferModal,
        closeSpaTransferModal,
        submitSpaTransferToHotel
    };

})();
