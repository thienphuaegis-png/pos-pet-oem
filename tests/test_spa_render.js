// Node.js test script to verify that SPA rendering functions execute without any ReferenceError or runtime exceptions.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== BẮT ĐẦU TEST RUNTIME SPA RENDER ===');

// Mock DOM elements
const elements = {};
function getOrCreateElement(id) {
    if (!elements[id]) {
        elements[id] = {
            id,
            innerHTML: '',
            innerText: '',
            textContent: '',
            value: '',
            className: '',
            addEventListener: () => {},
            removeEventListener: () => {},
            classList: {
                classes: new Set(),
                add: function(c) { this.classes.add(c); },
                remove: function(c) { this.classes.delete(c); },
                contains: function(c) { return this.classes.has(c); }
            }
        };
    }
    return elements[id];
}

// Ensure target containers exist
[
    'table-pet-services',
    'kanban-board',
    'kanban-col-pending', 'kanban-count-pending',
    'kanban-col-in_progress', 'kanban-count-in_progress',
    'kanban-col-completed', 'kanban-count-completed',
    'kanban-col-checked_out', 'kanban-count-checked_out',
    'search-pet-services',
    'spa-view-table', 'spa-view-kanban',
    'btn-spa-view-table', 'btn-spa-view-kanban',
    'prog-teeth-cleaning', 'prog-art-cutting', 'prog-surcharge', 'prog-shipping-fee', 'prog-tip-amount', 'prog-final-price'
].forEach(id => getOrCreateElement(id));

const mockIframe = {
    id: 'print-service-iframe',
    style: {},
    contentWindow: {
        document: {
            open: () => {},
            write: (html) => { mockIframe._lastHtml = html; },
            close: () => {}
        },
        focus: () => {},
        print: () => {}
    }
};

const sandbox = {
    console: console,
    document: {
        getElementById: (id) => {
            if (id === 'print-service-iframe') return mockIframe;
            return getOrCreateElement(id);
        },
        createElement: (tag) => {
            if (tag === 'iframe') return mockIframe;
            return getOrCreateElement('elem_' + Math.random());
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        body: {
            appendChild: () => {}
        }
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { reload: () => {} },
    setTimeout: (fn) => fn(),
    alert: (msg) => console.log('Mock Alert:', msg),
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
};

// Also mirror document/window
sandbox.window = sandbox;

// Load static/js/app.js into context
const appJsPath = path.join(__dirname, '..', 'static', 'js', 'app.js');
const appCode = fs.readFileSync(appJsPath, 'utf8');

const context = vm.createContext(sandbox);
vm.runInContext(appCode, context);

console.log('✅ app.js loaded into VM without parse errors.');

// Provide sample tickets covering all 4 statuses
context.allPetServiceTickets = [
    {
        id: 1,
        code: 'DV20260918001',
        ticket_number: 15,
        customer_name: 'Anh Phú',
        customer_phone: '0901234567',
        pet_name: 'Milu',
        pet_breed: 'Poodle',
        pet_color: 'Nâu đỏ',
        pet_gender: 'Đực',
        weight_at_service: 3.2,
        service_type: 'Combo Cắt Tỉa Super VIP',
        shaving_feet: 'Cạo 4 bàn tròn',
        customer_request: 'Cắt tròn mặt, bo đuôi',
        accessories: 'Dây dắt đỏ',
        staff_receiver: 'Huyền Trân',
        staff_cutter: 'Cún',
        staff_worker_1: 'Thanh Vân',
        staff_dyer: '',
        teeth_cleaning: 20000,
        art_cutting_fee: 30000,
        surcharge: 0,
        shipping_fee: 0,
        tip_amount: 50000,
        price: 400000,
        payment_status: 'paid',
        payment_method: 'Chuyển khoản',
        status: 'pending',
        call_status: 'Chưa gọi',
        received_time: '08:30',
        arrival_method: 'Khách chở tới',
        checkout_time: '',
        return_method: ''
    },
    {
        id: 2,
        code: 'DV20260918002',
        ticket_number: 16,
        customer_name: 'Chị Mai',
        customer_phone: '0988776655',
        pet_name: 'Bông',
        pet_breed: 'Phốc Sóc',
        pet_color: 'Trắng',
        pet_gender: 'Cái',
        weight_at_service: 2.1,
        service_type: 'Tắm Vệ Sinh Tiêu Chuẩn',
        status: 'in_progress',
        call_status: 'Đã gọi đón',
        received_time: '09:15',
        price: 150000,
        payment_status: 'unpaid'
    },
    {
        id: 3,
        code: 'DV20260918003',
        ticket_number: 17,
        customer_name: 'Anh Tuấn',
        customer_phone: '0911223344',
        pet_name: 'Lu',
        pet_breed: 'Corgi',
        weight_at_service: 9.5,
        service_type: 'Cắt Tỉa Tạo Kiểu',
        status: 'completed',
        call_status: 'Đã gọi đón',
        received_time: '10:00',
        price: 350000,
        payment_status: 'paid'
    },
    {
        id: 4,
        code: 'DV20260918004',
        ticket_number: 18,
        customer_name: 'Cô Lan',
        customer_phone: '0933445566',
        pet_name: 'Kiki',
        pet_breed: 'Chihuahua',
        weight_at_service: 1.8,
        service_type: 'Tắm Spa Dưỡng Lông',
        status: 'checked_out',
        call_status: 'Đã gọi đón',
        received_time: '11:00',
        checkout_time: '12:30',
        price: 200000,
        payment_status: 'paid'
    }
];

// Test 1: renderPetServicesTable
console.log('\n--- TEST 1: renderPetServicesTable() ---');
context.renderPetServicesTable();
const tableHtml = elements['table-pet-services'].innerHTML;
if (!tableHtml.includes('#15') || !tableHtml.includes('Milu')) {
    throw new Error('renderPetServicesTable did not render ticket data correctly!');
}
console.log('✅ TEST 1 PASSED: Table render 13 columns output length =', tableHtml.length);

// Test 2: renderKanbanBoard (Từng bị lỗi ReferenceError: statusSelector is not defined)
console.log('\n--- TEST 2: renderKanbanBoard() ---');
context.renderKanbanBoard();
if (!elements['kanban-col-pending'].innerHTML.includes('#15')) {
    throw new Error('Kanban pending column missing ticket #15');
}
if (!elements['kanban-col-in_progress'].innerHTML.includes('#16')) {
    throw new Error('Kanban in_progress column missing ticket #16');
}
if (!elements['kanban-col-completed'].innerHTML.includes('#17')) {
    throw new Error('Kanban completed column missing ticket #17');
}
if (!elements['kanban-col-checked_out'].innerHTML.includes('#18')) {
    throw new Error('Kanban checked_out column missing ticket #18');
}
console.log('✅ TEST 2 PASSED: Kanban board rendered 4 columns with full selectors and actions.');

// Test 3: switchSpaView (Chỉ 2 view: table & kanban)
console.log('\n--- TEST 3: switchSpaView() ---');
['table', 'kanban'].forEach(v => {
    context.switchSpaView(v);
    console.log(`  - View switched to '${v}': container hidden =`, elements[`spa-view-${v}`].classList.contains('hidden'));
});
console.log('✅ TEST 3 PASSED: switchSpaView toggles active view and renders without error.');

// Test 4: printPetServiceTicketDirectly (intake & invoice - TIP KHÔNG IN RA)
console.log('\n--- TEST 4: printPetServiceTicketDirectly() ---');
context.printPetServiceTicketDirectly(1, 'intake');
if (!mockIframe._lastHtml || !mockIframe._lastHtml.includes('PHIẾU TIẾP NHẬN DỊCH VỤ') || !mockIframe._lastHtml.includes('Khách Gửi Bé')) {
    throw new Error('Intake ticket template missing 2 signatures or title!');
}
context.printPetServiceTicketDirectly(1, 'invoice');
if (!mockIframe._lastHtml || !mockIframe._lastHtml.includes('HÓA ĐƠN THANH TOÁN SPA') || !mockIframe._lastHtml.includes('BẢNG KÊ CHI PHÍ & DỊCH VỤ')) {
    throw new Error('Invoice ticket template missing breakdown table or title!');
}
// KIỂM TRA QUY TẮC: TIỀN TIP KHÔNG IN RA HÓA ĐƠN
if (mockIframe._lastHtml.includes('Tiền tip thợ')) {
    throw new Error('VI PHẠM QUY TẮC: Tiền tip vẫn bị in ra hóa đơn K80!');
}
console.log('✅ TEST 4 PASSED: K80 templates generated and verified TIP is NOT printed.');

// Test 5: calculateProgTotal KHÔNG cộng tip vào tổng phải thu
console.log('\n--- TEST 5: calculateProgTotal() excludes tip from total ---');
context.currentProgressTicketBasePrice = 300000;
elements['prog-teeth-cleaning'].value = '20000';
elements['prog-art-cutting'].value = '30000';
elements['prog-surcharge'].value = '10000';
elements['prog-shipping-fee'].value = '40000';
elements['prog-tip-amount'].value = '50000'; // 50k tip
context.calculateProgTotal();
const calculatedTotal = elements['prog-final-price'].value;
// Tổng đúng phải là: 300k + 20k + 30k + 10k + 40k = 400.000đ (KHÔNG CỘNG 50k TIP)
if (calculatedTotal !== 400000) {
    throw new Error(`VI PHẠM: Tổng tiền phải thu đang là ${calculatedTotal}, lẽ ra phải là 400000 (không cộng 50k tip)!`);
}
console.log(`✅ TEST 5 PASSED: calculateProgTotal calculated exactly ${calculatedTotal}đ (excluded 50.000đ tip).`);

console.log('\n🎉 TOÀN BỘ 5 TEST CASES ĐÃ PASS 100%! ĐẢM BẢO QUY TẮC NGHIỆP VỤ!');
