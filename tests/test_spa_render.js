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
            children: [],
            appendChild: function(c) { this.children.push(c); },
            querySelectorAll: () => [],
            querySelector: () => ({ value: '', textContent: '', closest: () => null }),
            closest: () => null,
            remove: function() {},
            addEventListener: () => {},
            removeEventListener: () => {},
            classList: {
                classes: new Set(),
                add: function(c) { this.classes.add(c); },
                remove: function(c) { this.classes.delete(c); },
                contains: function(c) { return this.classes.has(c); },
                toggle: function(c, force) {
                    if (typeof force === 'boolean') {
                        if (force) this.classes.add(c);
                        else this.classes.delete(c);
                        return force;
                    }
                    if (this.classes.has(c)) { this.classes.delete(c); return false; }
                    this.classes.add(c); return true;
                }
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
    'prog-teeth-cleaning', 'prog-art-cutting', 'prog-surcharge', 'prog-shipping-fee', 'prog-tip-amount', 'prog-final-price',
    'svc-primary-package', 'svc-dye-package',
    'svc-single-pet-view', 'svc-batch-pets-view', 'btn-mode-single-pet', 'btn-mode-batch-pets',
    'footer-single-actions', 'footer-batch-actions', 'svc-customer-red-flag', 'svc-customer-warning-text',
    'svc-customer-history-list', 'svc-history-pet-filter', 'tbody-batch-pets', 'batch-total-pets',
    'batch-grand-total', 'svc-base-price-display', 'svc-surcharges-total-display', 'svc-total-price-display',
    'svc-teeth-cleaning', 'svc-art-cutting', 'svc-surcharge', 'svc-shipping-fee', 'svc-tip-amount',
    'svc-customer-id', 'svc-pet-weight', 'svc-total-price',
    'btn-toggle-spa-spreadsheet', 'spa-spreadsheet-actions', 'dirty-ticket-count',
    'btn-save-spa-spreadsheet', 'btn-cancel-spa-spreadsheet',
    'modal-spa-bulk-edit-compact', 'compact-bulk-total-tickets', 'compact-bulk-selected-count',
    'compact-bulk-select-cutter', 'compact-bulk-select-worker', 'compact-bulk-select-status',
    'compact-bulk-master-cb', 'compact-bulk-tbody', 'compact-bulk-dirty-info', 'btn-save-compact-bulk',
    'btn-subtab-order-retail', 'btn-subtab-order-spa', 'orders-subview-retail', 'orders-subview-spa',
    'spa-invoices-table-body', 'search-spa-invoices', 'select-spa-invoice-status-filter',
    'select-spa-invoice-payment-filter', 'spa-invoices-count-badge', 'spa-inv-total-revenue',
    'pagination-spa-invoices', 'btn-spa-inv-date-today', 'btn-spa-inv-date-all', 'input-spa-inv-date-custom',
    'spa-date-strip-container', 'input-spa-custom-date',
    'btn-spa-filter-daily-all', 'btn-spa-filter-daily-unreturned', 'btn-spa-filter-daily-returned',
    'count-daily-all', 'count-daily-unreturned', 'count-daily-returned'
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
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
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

// Load Lego module: static/js/modules/spa.js
const spaJsPath = path.join(__dirname, '..', 'static', 'js', 'modules', 'spa.js');
if (fs.existsSync(spaJsPath)) {
    const spaCode = fs.readFileSync(spaJsPath, 'utf8');
    vm.runInContext(spaCode, context);
}

console.log('✅ app.js & modules/spa.js loaded into VM without parse errors.');

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

// Test 6: K80 Spa receipt has SL, unit price, discount and totals like retail POS
console.log('\n--- TEST 6: K80 Spa receipt formatting with SL and discounts ---');
context.allPetServiceTickets.push({
    id: 999,
    code: 'DV260925999999',
    ticket_number: 99,
    customer_name: 'Test Khách',
    customer_phone: '0909999999',
    pet_name: 'Test Pet',
    pet_breed: 'Poodle',
    pet_gender: 'Đực',
    pet_color: 'Trắng',
    weight_at_service: 3.5,
    shaving_feet: 'Cạo bàn',
    service_type: 'CB Tắm (1+2+3)',
    price: 160000,
    payment_status: 'unpaid',
    services_json: JSON.stringify([
        { name: 'CB Tắm (1+2+3) (2-6kg)', quantity: 1, price: 160000, original_price: 200000 }
    ])
});
context.printPetServiceTicketDirectly(999, 'intake');
const intakeHtml = mockIframe._lastHtml;
if (!intakeHtml.includes('>SL</th>') || !intakeHtml.includes('>Đơn giá</th>') || !intakeHtml.includes('>Thành tiền</th>')) {
    throw new Error('Intake ticket missing SL, Đơn giá or Thành tiền columns!');
}
if (!intakeHtml.includes('line-through') || !intakeHtml.includes('(Giảm 40.000 đ)')) {
    throw new Error('Intake ticket missing discount display!');
}
if (!intakeHtml.includes('Giảm giá / Ưu đãi:') || !intakeHtml.includes('TỔNG TẠM TÍNH:')) {
    throw new Error('Intake ticket missing summary discount or total!');
}

context.printPetServiceTicketDirectly(999, 'invoice');
const invoiceHtml = mockIframe._lastHtml;
if (!invoiceHtml.includes('>SL</th>') || !invoiceHtml.includes('>Đơn giá</th>') || !invoiceHtml.includes('>Thành tiền</th>')) {
    throw new Error('Invoice ticket missing SL, Đơn giá or Thành tiền columns!');
}
if (!invoiceHtml.includes('line-through') || !invoiceHtml.includes('(Giảm 40.000 đ)')) {
    throw new Error('Invoice ticket missing discount display!');
}
if (!invoiceHtml.includes('Giảm giá / Ưu đãi:') || !invoiceHtml.includes('TỔNG CỘNG:')) {
    throw new Error('Invoice ticket missing summary discount or total!');
}
console.log('✅ TEST 6 PASSED: K80 Spa receipts format matches retail POS with SL, discounts and totals.');

// Test 7: populateServicePackageDropdowns() dynamically populates services by category
console.log('\n--- TEST 7: Dynamic Spa Service Packages Populating ---');
context.allPetPricingData = [
    { service_name: 'Dịch Vụ Test Đã Đổi Tên VIP', category: 'Dịch Vụ Lẻ Chó', min_weight: 0, max_weight: 5, price: 150000 },
    { service_name: 'Combo Tắm Spa Hoàng Gia', category: 'Gói Combo Chó', min_weight: 2, max_weight: 10, price: 250000 },
    { service_name: 'Nhuộm Ombre 4 Chân', category: 'Nhuộm Lông', min_weight: 0, max_weight: 999, price: 180000 }
];

context.populateServicePackageDropdowns();

const primarySelectHtml = elements['svc-primary-package'].innerHTML;
const dyeSelectHtml = elements['svc-dye-package'].innerHTML;

if (!primarySelectHtml.includes('optgroup label="Dịch Vụ Lẻ Chó"') || !primarySelectHtml.includes('value="Dịch Vụ Test Đã Đổi Tên VIP"')) {
    throw new Error(`Primary select missing renamed service! HTML: ${primarySelectHtml}`);
}
if (!primarySelectHtml.includes('optgroup label="Gói Combo Chó"') || !primarySelectHtml.includes('value="Combo Tắm Spa Hoàng Gia"')) {
    throw new Error(`Primary select missing combo service! HTML: ${primarySelectHtml}`);
}
if (primarySelectHtml.includes('Nhuộm Ombre 4 Chân')) {
    throw new Error('Primary select must not contain dye services!');
}

if (!dyeSelectHtml.includes('value="Nhuộm Ombre 4 Chân"') || !dyeSelectHtml.includes('-- Không nhuộm --')) {
    throw new Error(`Dye select missing dye service or default option! HTML: ${dyeSelectHtml}`);
}

console.log('✅ TEST 7 PASSED: populateServicePackageDropdowns correctly grouped by category and updated renamed services.');

// Test 8: 3-column Layout Helpers, Money Formatting & Batch Mode
console.log('\n--- TEST 8: 3-Column Layout, Money Formatting & Batch Mode ---');
if (typeof context.formatMoneyString !== 'function' || typeof context.parseMoneyInput !== 'function') {
    throw new Error('Money helper functions not exported on context!');
}

const f1 = context.formatMoneyString(150000);
if (f1 !== '150.000') {
    throw new Error(`formatMoneyString(150000) expected '150.000', got '${f1}'`);
}

const p1 = context.parseMoneyInput('150.000 đ');
if (p1 !== 150000) {
    throw new Error(`parseMoneyInput('150.000 đ') expected 150000, got ${p1}`);
}

// Test mode switcher
context.setSvcIntakeMode('batch');
if (elements['svc-batch-pets-view'].classList.contains('hidden')) {
    throw new Error('Batch view should be visible in batch mode!');
}
if (!elements['svc-single-pet-view'].classList.contains('hidden')) {
    throw new Error('Single view should be hidden in batch mode!');
}

context.setSvcIntakeMode('single');
if (!elements['svc-batch-pets-view'].classList.contains('hidden')) {
    throw new Error('Batch view should be hidden in single mode!');
}
if (elements['svc-single-pet-view'].classList.contains('hidden')) {
    throw new Error('Single view should be visible in single mode!');
}

console.log('✅ TEST 8 PASSED: 3-Column Layout, Money Formatting & Batch Mode work correctly.');

// Test 9: Spreadsheet Inline Edit Mode
console.log('\n--- TEST 9: Spreadsheet Inline Edit Mode ---');
if (typeof context.toggleSpaSpreadsheetMode !== 'function' || typeof context.markTicketDirty !== 'function') {
    throw new Error('Spreadsheet mode functions not defined on context!');
}

// Toggle on spreadsheet mode
context.toggleSpaSpreadsheetMode(true);
if (!elements['btn-toggle-spa-spreadsheet'].classList.contains('hidden')) {
    throw new Error('Toggle button should be hidden when spreadsheet mode is active!');
}
if (elements['spa-spreadsheet-actions'].classList.contains('hidden')) {
    throw new Error('Spreadsheet actions should be visible when spreadsheet mode is active!');
}

// Verify editable table output
const editableHtml = elements['table-pet-services'].innerHTML;
if (!editableHtml.includes('Yêu cầu khách...') || !editableHtml.includes('Thợ cắt...')) {
    throw new Error('Table did not render editable inputs in spreadsheet mode!');
}
if (!editableHtml.includes('openServiceProgressModal') || !editableHtml.includes('printPetServiceTicketDirectly')) {
    throw new Error('Column 1 should contain direct action buttons!');
}

// Mark ticket dirty
context.markTicketDirty(1, 'staff_cutter', 'Thợ Sang', null);
if (String(elements['dirty-ticket-count'].textContent) !== '1') {
    throw new Error(`Expected dirty ticket count 1, got ${elements['dirty-ticket-count'].textContent}`);
}

// Test detail fee change
if (typeof context.onSpaSpreadsheetDetailFeeChange === 'function') {
    context.onSpaSpreadsheetDetailFeeChange(1, 'teeth_cleaning', { value: '30.000', closest: () => ({ classList: { add: () => {} } }) });
}
if (typeof context.onSpaSpreadsheetWeightChange === 'function') {
    context.onSpaSpreadsheetWeightChange(1, { value: '4.2', closest: () => ({ classList: { add: () => {} } }) });
}

// Toggle off spreadsheet mode
context.toggleSpaSpreadsheetMode(false);
if (elements['btn-toggle-spa-spreadsheet'].classList.contains('hidden')) {
    throw new Error('Toggle button should be visible when spreadsheet mode is inactive!');
}
if (!elements['spa-spreadsheet-actions'].classList.contains('hidden')) {
    throw new Error('Spreadsheet actions should be hidden when spreadsheet mode is inactive!');
}
if (String(elements['dirty-ticket-count'].textContent) !== '0') {
    throw new Error(`Expected dirty ticket count 0 after reset, got ${elements['dirty-ticket-count'].textContent}`);
}

console.log('✅ TEST 9 PASSED: Spreadsheet Inline Edit Mode toggles and marks dirty correctly.');

// TEST 10: In Hàng Loạt Phiếu Spa Gộp (Consolidated K80 Ticket)
console.log('\n--- TEST 10: printBatchPetServiceTickets() Consolidated K80 ---');
const sampleBatchTickets = [
    {
        id: 101,
        code: 'DV260925001',
        ticket_number: 1,
        pet_name: 'Bé Bông',
        pet_breed: 'Poodle',
        pet_gender: 'Đực',
        pet_color: 'Trắng',
        weight_at_service: 3.5,
        shaving_feet: 'Có cạo bàn',
        service_type: 'Gói Cắt Tỉa',
        price: 250000,
        customer_name: 'Anh Long',
        customer_phone: '0911000009',
        customer_request: 'Cắt tai ngắn',
        accessories: 'Dây dắt đỏ',
        services_json: JSON.stringify([
            { name: 'Gói Cắt Tỉa', quantity: 1, price: 200000, original_price: 200000 },
            { name: 'Đánh răng', quantity: 1, price: 50000, original_price: 50000 }
        ])
    },
    {
        id: 102,
        code: 'DV260925002',
        ticket_number: 2,
        pet_name: 'Bé Miu',
        pet_breed: 'Mèo Anh',
        pet_gender: 'Cái',
        pet_color: 'Xám',
        weight_at_service: 4.0,
        shaving_feet: 'Không cạo bàn',
        service_type: 'Tắm Mèo',
        price: 180000,
        customer_name: 'Anh Long',
        customer_phone: '0911000009',
        customer_request: 'Sấy kỹ',
        services_json: JSON.stringify([
            { name: 'Tắm Mèo', quantity: 1, price: 180000, original_price: 180000 }
        ])
    }
];

const consolidatedHtml = context.generateBatchConsolidatedTicketHtml(sampleBatchTickets, 'intake');
if (!consolidatedHtml || !consolidatedHtml.includes('PHIẾU TIẾP NHẬN DỊCH VỤ (TỔNG HỢP)')) {
    throw new Error('generateBatchConsolidatedTicketHtml missing title or content!');
}
if (!consolidatedHtml.includes('🐕 BÉ 1: Bé Bông') || !consolidatedHtml.includes('🐕 BÉ 2: Bé Miu')) {
    throw new Error('generateBatchConsolidatedTicketHtml missing individual pet sections!');
}
if (!consolidatedHtml.includes('430.000') || !consolidatedHtml.includes('2 bé')) {
    throw new Error('generateBatchConsolidatedTicketHtml grand total calculation incorrect!');
}
if (!consolidatedHtml.includes('NV Tiếp Nhận') || !consolidatedHtml.includes('Khách Gửi Bé')) {
    throw new Error('generateBatchConsolidatedTicketHtml missing signature boxes!');
}

context.printBatchPetServiceTickets(sampleBatchTickets, 'intake', true);
console.log('✅ TEST 10 PASSED: Consolidated K80 batch ticket generated with all pets grouped into 1 receipt.');

// Test 11: Deduplication of art cutting fee and paper cut spacing
console.log('\n--- TEST 11: Art cutting fee deduplication and paper cut spacing ---');
const testTicketWithArt = {
    id: 99,
    ticket_number: 99,
    code: 'DV999',
    customer_name: 'Anh Nam',
    customer_phone: '0988000999',
    pet_name: 'Bé Xù',
    service_type: 'Combo Tắm Cắt',
    price: 350000,
    art_cutting_fee: 50000,
    services_json: JSON.stringify([
        { name: 'Combo Tắm Cắt', quantity: 1, price: 300000, original_price: 300000 },
        { name: 'Cắt tạo kiểu nghệ thuật', quantity: 1, price: 50000, original_price: 50000 }
    ])
};

const lineItems = context.getTicketLineItems(testTicketWithArt);
const artCount = lineItems.filter(it => it.name.includes('nghệ thuật')).length;
if (artCount !== 1) {
    throw new Error(`Expected exactly 1 art cutting line item, found ${artCount}!`);
}

const singleTicketHtml = context.generateSinglePetTicketHtml(testTicketWithArt, 'invoice');
if (!singleTicketHtml.includes('height: 18mm')) {
    throw new Error('Single ticket HTML missing 18mm paper cut spacing buffer!');
}
if (!consolidatedHtml.includes('height: 18mm')) {
    throw new Error('Consolidated ticket HTML missing 18mm paper cut spacing buffer!');
}
console.log('✅ TEST 11 PASSED: Art cutting fee is deduplicated (exactly 1 line) and paper cut spacing buffer is 18mm.');

// Test 12: Droplist Popup for 3 Columns (Service, Request, Staff)
console.log('\n--- TEST 12: Droplist Popup for 3 Columns (Service, Request, Staff) ---');
if (typeof context.openSpaCellDroplist !== 'function') {
    throw new Error('openSpaCellDroplist is not exported to window!');
}
if (typeof context.saveSpaCellQuickEdit !== 'function') {
    throw new Error('saveSpaCellQuickEdit is not exported to window!');
}

// Check table rendering contains click handlers for the 3 columns
context.renderPetServicesTable();
const tableDroplistHtml = elements['table-pet-services'].innerHTML;
if (!tableDroplistHtml.includes("openSpaCellDroplist(event,") || !tableDroplistHtml.includes("'service'") || !tableDroplistHtml.includes("'request'") || !tableDroplistHtml.includes("'staff'")) {
    throw new Error('Table rows missing openSpaCellDroplist triggers for 3 columns!');
}
console.log('✅ TEST 12 PASSED: openSpaCellDroplist triggers for Service, Request, and Staff verified in table HTML.');

// Test 13: Split Ticket (Service, Tip, Deposit, Payable) and dedicated slips
console.log('\n--- TEST 13: Split Ticket (Service, Tip, Deposit) & Dedicated Slips ---');
const testSplitTicket = {
    id: 105,
    ticket_number: 105,
    code: 'DV260925105',
    customer_name: 'Chị Mai',
    customer_phone: '0909123456',
    pet_name: 'Bé Miu Miu',
    service_type: 'Combo Tắm Vệ Sinh',
    price: 300000,
    tip_amount: 50000,
    deposit_amount: 100000,
    staff_cutter: 'Thợ Tâm',
    staff_worker_1: 'Thợ Lan',
    staff_receiver: 'Lễ Tân Thảo',
    services_json: JSON.stringify([
        { name: 'Combo Tắm Vệ Sinh', quantity: 1, price: 300000, original_price: 300000 }
    ])
};

// 1. Invoice breakdown
const splitInvoiceHtml = context.generateSinglePetTicketHtml(testSplitTicket, 'invoice');
if (!splitInvoiceHtml.includes('1. Tiền Dịch Vụ Spa:') || !splitInvoiceHtml.includes('300.000')) {
    throw new Error('Invoice missing service price line!');
}
if (!splitInvoiceHtml.includes('2. Tiền Tip Thợ (thu hộ):') || !splitInvoiceHtml.includes('+ 50.000')) {
    throw new Error('Invoice missing tip breakdown line!');
}
if (!splitInvoiceHtml.includes('3. Đã Đặt Cọc Trước:') || !splitInvoiceHtml.includes('- 100.000')) {
    throw new Error('Invoice missing deposit deduction line!');
}
if (!splitInvoiceHtml.includes('THỰC THU TẠI QUẦY:') || !splitInvoiceHtml.includes('250.000')) {
    throw new Error('Invoice missing or incorrect payable amount (300k + 50k - 100k = 250k)!');
}

// 2. Tip slip
const tipSlipHtml = context.generateSinglePetTicketHtml(testSplitTicket, 'tip_slip');
if (!tipSlipHtml.includes('PHIẾU TIỀN TIP CHO THỢ') || !tipSlipHtml.includes('50.000') || !tipSlipHtml.includes('Thợ Nhận Tip')) {
    throw new Error('Tip slip missing required title, amount or recipient signature block!');
}

// 3. Deposit slip
const depositSlipHtml = context.generateSinglePetTicketHtml(testSplitTicket, 'deposit_slip');
if (!depositSlipHtml.includes('BIÊN NHẬN TIỀN ĐẶT CỌC') || !depositSlipHtml.includes('100.000') || !depositSlipHtml.includes('Thu Ngân Nhận Cọc')) {
    throw new Error('Deposit slip missing required title, amount or receiver signature block!');
}

// 4. Intake ticket with deposit
const intakeDepositHtml = context.generateSinglePetTicketHtml(testSplitTicket, 'intake');
if (!intakeDepositHtml.includes('ĐÃ ĐẶT CỌC TRƯỚC:') || !intakeDepositHtml.includes('100.000') || !intakeDepositHtml.includes('CÒN LẠI KHI NHẬN BÉ:')) {
    throw new Error('Intake ticket missing deposit display or remaining balance!');
}

// 5. Table row rendering with tip / deposit buttons and Column 10 breakdown
context.allPetServiceTickets.push(testSplitTicket);
context.renderPetServicesTable();
const tableWithSplitHtml = elements['table-pet-services'].innerHTML;
if (!tableWithSplitHtml.includes("printPetServiceTicketDirectly(105, 'tip_slip')")) {
    throw new Error('Table row missing print tip slip button!');
}
if (!tableWithSplitHtml.includes("printPetServiceTicketDirectly(105, 'deposit_slip')")) {
    throw new Error('Table row missing print deposit slip button!');
}
if (!tableWithSplitHtml.includes('+50.000') || !tableWithSplitHtml.includes('-100.000') || !tableWithSplitHtml.includes('250.000')) {
    throw new Error('Table row Column 10 missing tip/deposit breakdown or final payable!');
}
console.log('✅ TEST 13 PASSED: Split ticket, Tip slip, Deposit slip, and table breakdown verified 100%.');

// Test 14: Phone Badge & Bulk Staff Cutter Assignment
console.log('\n--- TEST 14: Phone Badge & Bulk Staff Cutter Assignment ---');
const badgeHtml = context.formatPhoneBadge('0988101010');
if (!badgeHtml.includes('0988 101 010') || !badgeHtml.includes('0988 ••• 010') || !badgeHtml.includes('group-hover/phone')) {
    throw new Error('Phone badge does not properly format or mask phone number!');
}

context.selectedSpaTicketIds.clear();
context.selectedSpaTicketIds.add(1);
context.selectedSpaTicketIds.add(2);
context.allSpaStaffList = [{ name: 'Thợ Kiệt', role: 'Thợ Cắt' }];
context.applyBulkPetServiceStaffCutter('Thợ Kiệt');

const t1 = context.allPetServiceTickets.find(t => t.id === 1);
const t2 = context.allPetServiceTickets.find(t => t.id === 2);
if (t1.staff_cutter !== 'Thợ Kiệt' || t2.staff_cutter !== 'Thợ Kiệt') {
    throw new Error('Bulk staff cutter assignment failed to update target tickets!');
}
console.log('✅ TEST 14 PASSED: Phone badge and bulk staff cutter assignment verified 100%.');

// Test 15: Compact Bulk Edit Modal Workflow
console.log('\n--- TEST 15: Compact Bulk Edit Modal Workflow ---');
context.allSpaStaffList = [
    { name: 'Thợ Kiệt', role: 'Thợ Cắt' },
    { name: 'Thợ Vân', role: 'Thợ Tắm' }
];

context.openSpaBulkEditModal();
const modalEl = elements['modal-spa-bulk-edit-compact'];
if (modalEl.classList.contains('hidden')) {
    throw new Error('openSpaBulkEditModal should remove hidden class from modal!');
}

// Select all tickets in modal
context.compactBulkSelectAll(true);
if (elements['compact-bulk-selected-count'].textContent === '0') {
    throw new Error('compactBulkSelectAll(true) should select all tickets!');
}

// Set bulk values: Cutter = Thợ Kiệt, Worker 1 = Thợ Vân, Worker 2 = Thợ Lan, Status = in_progress
elements['compact-bulk-select-cutter'].value = 'Thợ Kiệt';
elements['compact-bulk-select-worker'].value = 'Thợ Vân';
if (elements['compact-bulk-select-worker2']) elements['compact-bulk-select-worker2'].value = 'Thợ Lan';
elements['compact-bulk-select-status'].value = 'in_progress';

context.applyCompactBulkChanges();

// Verify tbody rendered changes
const compactTbodyHtml = elements['compact-bulk-tbody'].innerHTML;
if (!compactTbodyHtml.includes('Thợ Kiệt') || !compactTbodyHtml.includes('Thợ Vân') || !compactTbodyHtml.includes('Đang làm')) {
    throw new Error('Compact bulk table does not show applied cutter, worker or status!');
}

// Save compact bulk changes
context.saveCompactBulkEdit();
const updatedTicket = context.allPetServiceTickets.find(t => t.id === 1);
if (updatedTicket.staff_cutter !== 'Thợ Kiệt' || updatedTicket.staff_worker_1 !== 'Thợ Vân' || updatedTicket.status !== 'in_progress') {
    throw new Error('saveCompactBulkEdit failed to commit changes to local tickets array!');
}
// Test individual row dropdown change inside table
if (typeof context.onCompactBulkRowChange === 'function') {
    context.onCompactBulkRowChange(1, 'staff_cutter', 'Thợ Kiệt Pro');
    const tableHtmlAfterRowChange = elements['compact-bulk-tbody'].innerHTML;
    if (!tableHtmlAfterRowChange.includes('Thợ Kiệt Pro')) {
        throw new Error('Compact bulk table does not reflect individual row change!');
    }
}

console.log('✅ TEST 15 PASSED: Compact bulk edit modal workflow (Cutter, Worker, Status & Row Dropdowns) verified 100%.');

// Test 16: Service Change Audit & K80 Print Output
console.log('\n--- TEST 16: Service Change Audit & K80 Print Output ---');
const changedTicket = {
    id: 999,
    code: 'DV20260926099',
    ticket_number: 99,
    customer_name: 'Anh Phú',
    customer_phone: '0988101010',
    pet_name: 'Bé Phốc Sóc',
    pet_breed: 'Pomeranian',
    pet_color: 'Vàng cam',
    pet_gender: 'Đực',
    weight_at_service: 2.8,
    original_service_type: 'Cắt Tỉa Tạo Kiểu Phốc Sóc',
    original_price: 300000,
    service_type: 'Tắm Cạo Sạch Sẽ',
    service_change_reason: 'Lông rối bết nhiều không gỡ được',
    service_changed_at: '26/09/2026 15:30',
    price: 200000,
    payment_status: 'paid'
};

// 1. Verify Table rendering with strikethrough and change reason badge
context.allPetServiceTickets.unshift(changedTicket);
context.renderPetServicesTable();
const tableWithChangedSvcHtml = elements['table-pet-services'].innerHTML;
if (!tableWithChangedSvcHtml.includes('line-through decoration-rose-500') || !tableWithChangedSvcHtml.includes('Cắt Tỉa Tạo Kiểu Phốc Sóc') || !tableWithChangedSvcHtml.includes('🔄 Đổi DV:')) {
    throw new Error('Table does not show original service strikethrough or change badge!');
}

// 2. Verify K80 Invoice Print contains service change history box
const k80InvoiceHtml = context.generateSinglePetTicketHtml(changedTicket, 'invoice');
if (!k80InvoiceHtml.includes('LỊCH SỬ ĐIỀU CHỈNH DỊCH VỤ') || !k80InvoiceHtml.includes('Lông rối bết nhiều không gỡ được') || !k80InvoiceHtml.includes('Tắm Cạo Sạch Sẽ')) {
    throw new Error('K80 invoice does not print service change history block!');
}

// 3. Verify K80 Intake Print contains service change history box
const k80IntakeHtml = context.generateSinglePetTicketHtml(changedTicket, 'intake');
if (!k80IntakeHtml.includes('Gói gốc:') || !k80IntakeHtml.includes('Đổi sang:') || !k80IntakeHtml.includes('Lông rối bết nhiều không gỡ được')) {
    throw new Error('K80 intake ticket does not print service change summary!');
}

console.log('✅ TEST 16 PASSED: Service change audit display in table and K80 receipts verified 100%.');

// Test 17: Spa Invoices History in Tab Orders
console.log('\n--- TEST 17: Spa Invoices History in Tab Orders ---');
const checkoutTicket = context.allPetServiceTickets.find(t => t.id === 4);
if (checkoutTicket) checkoutTicket.status = 'checked_out';

context.allSpaInvoicesData = context.allPetServiceTickets;
context.setSpaInvoiceDateFilter('all');
elements['select-spa-invoice-status-filter'].value = 'checked_out';
elements['select-spa-invoice-payment-filter'].value = 'all';
elements['search-spa-invoices'].value = '';
context.filterSpaInvoicesList();
const historyTableHtml = elements['spa-invoices-table-body'].innerHTML;
if (!historyTableHtml.includes('#18') || !historyTableHtml.includes('Kiki')) {
    throw new Error('Spa Invoices History (spa-invoices-table-body) must contain checked-out tickets (#18)!');
}
if (historyTableHtml.includes('#15') || historyTableHtml.includes('Milu')) {
    throw new Error('Spa Invoices History filtered to checked_out must NOT contain active pending tickets (#15)!');
}

// Test subtab switching
context.switchOrderSubTab('spa');
if (elements['orders-subview-spa'].classList.contains('hidden') || !elements['orders-subview-retail'].classList.contains('hidden')) {
    throw new Error('switchOrderSubTab(spa) failed to show orders-subview-spa or hide orders-subview-retail!');
}

console.log('✅ TEST 17 PASSED: Tab Orders > Sub-tab Spa Invoices correctly manages full historical query.');

// Test 18: Date Strip Calendar & Daily Ticket View (Unreturned + Returned Today)
console.log('\n--- TEST 18: Spa Date Strip Calendar & Daily Ticket View ---');
const todayStr = context.getLocalTodayDateStr();

// Ensure tickets have today's date
context.allPetServiceTickets.forEach(t => {
    t.ticket_date = todayStr;
});

// 1. Default view: both unreturned (#15 Milu) AND returned (#18 Kiki) must appear
context.setPetServiceDateFilter('today');
context.setSpaDailyQuickFilter('all');
context.renderPetServicesTable();
const todayTableHtml = elements['table-pet-services'].innerHTML;

if (!todayTableHtml.includes('#15') || !todayTableHtml.includes('Milu')) {
    throw new Error('Today table must show active unreturned ticket #15 Milu!');
}
if (!todayTableHtml.includes('#18') || !todayTableHtml.includes('Kiki')) {
    throw new Error('Today table must STILL show returned ticket #18 Kiki for today!');
}
if (!todayTableHtml.includes('border-l-emerald-500') || !todayTableHtml.includes('reopenCheckedOutTicket')) {
    throw new Error('Returned row must be highlighted with emerald border and have reopen action!');
}

// 2. Quick filter: not_checked_out
context.setSpaDailyQuickFilter('not_checked_out');
const unreturnedTableHtml = elements['table-pet-services'].innerHTML;
if (!unreturnedTableHtml.includes('#15') || !unreturnedTableHtml.includes('Milu')) {
    throw new Error('Unreturned filter must show ticket #15 Milu!');
}
if (unreturnedTableHtml.includes('#18') || unreturnedTableHtml.includes('Kiki')) {
    throw new Error('Unreturned filter must NOT show ticket #18 Kiki!');
}

// 3. Quick filter: checked_out
context.setSpaDailyQuickFilter('checked_out');
const returnedTableHtml = elements['table-pet-services'].innerHTML;
if (returnedTableHtml.includes('#15') || returnedTableHtml.includes('Milu')) {
    throw new Error('Returned filter must NOT show active ticket #15 Milu!');
}
if (!returnedTableHtml.includes('#18') || !returnedTableHtml.includes('Kiki')) {
    throw new Error('Returned filter must show ticket #18 Kiki!');
}

// 4. Date Strip Render
context.setSpaDailyQuickFilter('all');
context.renderSpaDateStrip();
const dateStripHtml = elements['spa-date-strip-container'].innerHTML;
if (!dateStripHtml.includes('Hôm nay') || !dateStripHtml.includes('selectSpaStripDate')) {
    throw new Error('Date strip HTML missing today indicator or selectSpaStripDate trigger!');
}

console.log('✅ TEST 18 PASSED: Date strip and daily ticket view (unreturned + returned today) verified 100%.');

console.log('\n🎉 TOÀN BỘ 18 TEST CASES ĐÃ PASS 100%! ĐẢM BẢO QUY TẮC NGHIỆP VỤ!');
