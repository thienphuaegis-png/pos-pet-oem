# Sửa các lỗi từ đợt review 2026-10-22 — Implementation Plan

> **Dành cho AI thực thi:** làm TUẦN TỰ từng Task. Mỗi Task: viết test (đỏ) → sửa code → chạy test (xanh) → dán nguyên văn output terminal → DỪNG chờ xác nhận rồi mới sang Task kế.

**Mục tiêu:** Vá lỗi lộ hash mật khẩu và API key AI qua `GET /api/staff`; ghi tiền cọc Spa đúng tài khoản nhận; trả thông báo lỗi sạch ở `POST /api/orders`; kiểm tra tài khoản chi khi trả nợ NCC; tăng số version cache JS; build lại exe.

**Kiến trúc:** FastAPI + SQLite (`database.get_db()` trả về `sqlite3.Row`), frontend JS thuần tải bằng `<script src="...?v=...">` trong `templates/index.html`. Mọi luồng thu tiền dùng chung `dependencies.resolve_payment_account(cur, method, account_id)`: tiền mặt vào két; chuyển khoản/thẻ bắt buộc chọn tài khoản đúng loại, sai thì trả `HTTPException(400)`.

**Tech stack:** Python 3.11 (`.venv`), FastAPI, pytest, PyInstaller. Repo: `D:\Projects_Hermes\pos-offline-petcare2`.

## Ràng buộc chung

- Python: luôn dùng `.venv/Scripts/python.exe`. **Không** dùng `pyinstaller.exe` trong `.venv` vì nó trỏ nhầm venv, build ra exe thiếu PIL.
- Chạy test: `.venv/Scripts/python.exe -m pytest -q --no-header -p no:cacheprovider <file>`. File `tests/conftest.py` đã tách DB (copy `data/pos.db` sang thư mục tạm), test không đụng DB thật.
- **Không chạy 2 lượt pytest song song** (sẽ làm `test_git_hygiene` đỏ giả).
- Working tree đang có ~53 file sửa chưa commit của chủ dự án. **Không** `git stash`, `git checkout`, `git reset` hay commit. Để nguyên cho chủ dự án review.
- Shell là git-bash trên Windows: dùng cú pháp POSIX, đường dẫn dạng `C:/...` hoặc tương đối.

## Ràng buộc phạm vi (nghiêm ngặt)

1. Chỉ sửa đúng file, hàm, đoạn ghi trong Task. Không refactor, không reformat, không xoá comment lân cận.
2. Phải chạy lệnh verify thật và dán nguyên văn output. Cấm tự báo PASS khi không có log.
3. Xong 1 Task thì dừng lại chờ xác nhận.
4. Sau mỗi lần patch: đọc lại diff, kiểm tra không vô tình xoá dòng kề bên (nhất là trong object literal JS hoặc dict Python).

## Bản đồ file

| File | Thay đổi |
|---|---|
| `routers/pos.py:1082-1089` (`list_staff`) | Chỉ SELECT các cột an toàn |
| `routers/pos.py:1383-1386` (`create_order`) | Thêm `except HTTPException` trước `except Exception` |
| `routers/partners.py` (`PetServiceCreate`, `create_pet_service`, `create_pet_services_batch`) | Thêm field `deposit_method`; chọn tài khoản cọc theo hình thức |
| `templates/index.html` (~dòng 9953-9956) | Thêm `<select>` hình thức cọc và tài khoản cọc |
| `static/js/modules/spa.js` | Đồng bộ ô tài khoản cọc; gửi `deposit_method` và `deposit_account_id` |
| `routers/oem.py` (`pay_single_order_debt`) | Kiểm tra `account_id`: tồn tại, đang hoạt động, đúng quỹ |
| `static/js/modules/cashflow.js:308` | Chỉ liệt kê tài khoản thuộc quỹ đang chọn |
| `templates/index.html:11254-11264` | Tăng `?v=` cho `spa.js`, `cashflow.js`, `ai_agent.js` |
| `tests/test_staff_list_no_secrets.py` | Tạo mới |
| `tests/test_spa_deposit_account.py` | Tạo mới |
| `tests/test_create_order_error_detail.py` | Tạo mới |
| `tests/test_pay_order_debt_account_check.py` | Tạo mới |
| `POS_Mastercare.exe` | Build lại |

---

### Task 1: `GET /api/staff` không trả `password_hash`, `ai_api_key` (P0 bảo mật)

**Bối cảnh:** `routers/pos.py` hàm `list_staff()` đang chạy `SELECT * FROM staff`. Router này chỉ yêu cầu đăng nhập, nên mọi nhân viên đều đọc được `password_hash`, `ai_api_key` và `token_version` của người khác. Frontend chỉ dùng `id`, `name`, `role`, `commission_rate` (xem `static/js/app.js:4575`, `static/js/staff.js:196-208`, `static/js/modules/productions.js:4448,4696,5448`).

**Files:**
- Sửa: `routers/pos.py` hàm `list_staff`
- Test: `tests/test_staff_list_no_secrets.py`

- [ ] **Step 1: Viết test fail**

```python
# tests/test_staff_list_no_secrets.py
from fastapi.testclient import TestClient
from server import app
from tests.auth_helpers import staff_auth_headers

client = TestClient(app)


def test_staff_list_hides_password_hash_and_ai_key():
    h = staff_auth_headers("cashier")
    r = client.post("/api/auth/my-ai-config", json={"ai_api_key": "AIzaLEAKCHECK1234567890"}, headers=h)
    assert r.status_code == 200, r.text
    try:
        res = client.get("/api/staff", headers=staff_auth_headers("staff"))
        assert res.status_code == 200, res.text
        rows = res.json()
        assert rows
        for row in rows:
            assert "password_hash" not in row
            assert "ai_api_key" not in row
            assert "token_version" not in row
            assert {"id", "name", "role", "commission_rate"} <= set(row)
    finally:
        client.post("/api/auth/my-ai-config", json={"ai_api_key": ""}, headers=h)
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

`.venv/Scripts/python.exe -m pytest -q --no-header -p no:cacheprovider tests/test_staff_list_no_secrets.py`
Kỳ vọng: FAIL tại `assert "password_hash" not in row`.

- [ ] **Step 3: Sửa code** (`routers/pos.py`, trong `list_staff`)

```python
    cur.execute("SELECT id, name, phone, role, commission_rate, is_active, created_at FROM staff ORDER BY id ASC")
```

- [ ] **Step 4: Chạy lại test và test dùng `/api/staff` cũ**

`.venv/Scripts/python.exe -m pytest -q --no-header -p no:cacheprovider tests/test_staff_list_no_secrets.py tests/test_price_list_and_oem_enhancements.py`
Kỳ vọng: tất cả PASS.

---

### Task 2: Tiền cọc Spa ghi đúng tài khoản nhận (P1 tiền)

**Bối cảnh:** `create_pet_service` (khoảng dòng 1704-1708) và `create_pet_services_batch` (khoảng dòng 1882-1890) trong `routers/partners.py` gọi `resolve_payment_account(cur, "any", deposit_account_id)`. Form Spa chưa có ô chọn tài khoản cọc nên `deposit_account_id` luôn rỗng, và tiền cọc luôn vào két tiền mặt, kể cả khi khách chuyển khoản. Không thể đoán theo `payment_method`, vì phiếu chưa thanh toán thì JS gửi `payment_method = null` (`spa.js` ~dòng 5259).

**Quyết định:** thêm field `deposit_method` (`cash` | `transfer` | `card`, mặc định `cash`).
- `cash`: luôn vào két, bỏ qua `deposit_account_id`.
- `transfer` hoặc `card`: bắt buộc có `deposit_account_id` đúng loại, thiếu thì trả 400 (do `resolve_payment_account` xử lý).

**Files:**
- Sửa: `routers/partners.py` (class `PetServiceCreate`, `create_pet_service`, `create_pet_services_batch`)
- Sửa: `templates/index.html` (khối "Tip thợ & Tiền cọc", ~dòng 9953-9956)
- Sửa: `static/js/modules/spa.js` (sau `onSpaPayMethodChanged` ~dòng 4924; reset form ~dòng 3829; submit ~dòng 5289 và payload ~dòng 5396)
- Test: `tests/test_spa_deposit_account.py`

- [ ] **Step 1: Viết test fail**

```python
# tests/test_spa_deposit_account.py
from pathlib import Path
from fastapi.testclient import TestClient
from server import app
from database import get_db
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())


def _setup():
    db = get_db()
    cur = db.cursor()
    cur.execute("INSERT INTO contacts (name, type) VALUES ('KH Coc CK', 'customer')")
    cid = cur.lastrowid
    cur.execute("""INSERT OR IGNORE INTO payment_accounts (code, name, account_type, owner_type, is_active, is_default)
                   VALUES ('TK-TEST-COC', 'TK test coc', 'bank', 'COMPANY', 1, 0)""")
    bank_id = cur.execute("SELECT id FROM payment_accounts WHERE code = 'TK-TEST-COC'").fetchone()["id"]
    db.commit()
    db.close()
    return cid, bank_id


def _ticket(cid, **kw):
    t = {"customer_id": cid, "pet_name": "Coc", "weight_at_service": 3.0, "service_type": "Tắm",
         "price": 200000, "payment_status": "unpaid", "deposit_amount": 50000}
    t.update(kw)
    return t


def _deposit_acc_type(ticket_id):
    db = get_db()
    row = db.execute("""SELECT pa.account_type FROM cashbook cb JOIN payment_accounts pa ON pa.id = cb.account_id
                        WHERE cb.ref_type = 'pet_service_deposit' AND cb.ref_id = ?""", (ticket_id,)).fetchone()
    db.close()
    return row["account_type"] if row else None


def test_deposit_transfer_goes_to_selected_bank():
    cid, bank_id = _setup()
    r = client.post("/api/pet-services", json=_ticket(cid, deposit_method="transfer", deposit_account_id=bank_id))
    assert r.status_code == 200, r.text
    assert _deposit_acc_type(r.json()["id"]) == "bank"


def test_deposit_transfer_without_account_is_400():
    cid, _ = _setup()
    r = client.post("/api/pet-services", json=_ticket(cid, deposit_method="transfer"))
    assert r.status_code == 400, r.text
    assert "tài khoản" in r.json()["detail"].lower()


def test_deposit_default_is_cash():
    cid, _ = _setup()
    r = client.post("/api/pet-services", json=_ticket(cid))
    assert r.status_code == 200, r.text
    assert _deposit_acc_type(r.json()["id"]) == "cash"


def test_batch_deposit_transfer_goes_to_selected_bank():
    cid, bank_id = _setup()
    r = client.post("/api/pet-services/batch", json={
        "customer_id": cid,
        "tickets": [_ticket(cid, deposit_method="transfer", deposit_account_id=bank_id)]})
    assert r.status_code == 200, r.text
    assert _deposit_acc_type(r.json()["tickets"][0]["id"]) == "bank"


def test_deposit_ui_wired():
    root = Path(__file__).resolve().parent.parent
    html = (root / "templates/index.html").read_text(encoding="utf-8")
    js = (root / "static/js/modules/spa.js").read_text(encoding="utf-8")
    assert 'id="svc-deposit-method"' in html and 'id="svc-deposit-account"' in html
    assert "syncSvcDepositAccountRow" in js
    assert "deposit_method: depositMethod" in js and "deposit_account_id: depositAccountId" in js
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

`.venv/Scripts/python.exe -m pytest -q --no-header -p no:cacheprovider tests/test_spa_deposit_account.py`
Kỳ vọng: `test_deposit_transfer_goes_to_selected_bank` có thể PASS (vì `"any"` nhận mọi tài khoản), nhưng `test_deposit_transfer_without_account_is_400` và `test_deposit_ui_wired` phải FAIL.

- [ ] **Step 3: Backend** (`routers/partners.py`)

3a. Trong `class PetServiceCreate`, ngay dưới dòng `deposit_account_id: Optional[int] = None ...`, thêm:

```python
    deposit_method: Optional[str] = "cash"    # hình thức nhận cọc: cash|transfer|card
```

3b. Trong `create_pet_service`, thay đúng 1 dòng:

```python
            account_id = resolve_payment_account(cur, "any", ticket.deposit_account_id)
```

bằng:

```python
            dep_m = ticket.deposit_method if ticket.deposit_method in ("cash", "transfer", "card") else "cash"
            account_id = resolve_payment_account(cur, dep_m, ticket.deposit_account_id if dep_m != "cash" else None)
```

Có thể sửa comment ngay dòng trên thành `# Cọc: tiền mặt -> két; CK/thẻ -> bắt buộc tài khoản đúng loại`.

3c. Trong `create_pet_services_batch`, thay đúng 1 dòng:

```python
                dep_account_id = resolve_payment_account(cur, "any", t.deposit_account_id)
```

bằng:

```python
                dep_m = t.deposit_method if t.deposit_method in ("cash", "transfer", "card") else "cash"
                dep_account_id = resolve_payment_account(cur, dep_m, t.deposit_account_id if dep_m != "cash" else None)
```

- [ ] **Step 4: HTML** (`templates/index.html`)

Trong khối có `id="svc-deposit-amount"`, ngay sau thẻ `<input ... id="svc-deposit-amount" ...>` (vẫn nằm trong cùng `<div>`), thêm:

```html
                                <select id="svc-deposit-method" onchange="syncSvcDepositAccountRow()" class="w-full mt-1 text-[10.5px] border p-1 rounded bg-white font-semibold text-slate-700">
                                    <option value="cash">💵 Cọc tiền mặt</option>
                                    <option value="transfer">💳 Cọc chuyển khoản</option>
                                    <option value="card">💳 Cọc quẹt thẻ</option>
                                </select>
                                <select id="svc-deposit-account" class="hidden w-full mt-1 text-[10.5px] border p-1 rounded bg-white font-semibold text-slate-700"></select>
```

- [ ] **Step 5: JS** (`static/js/modules/spa.js`)

5a. Ngay sau dòng `window.onSpaPayMethodChanged = onSpaPayMethodChanged;`, thêm:

```js
        // Tài khoản nhận tiền cọc: tiền mặt -> két (ẩn ô); CK/thẻ -> bắt buộc chọn
        async function syncSvcDepositAccountRow() {
            const m = document.getElementById('svc-deposit-method')?.value || 'cash';
            const sel = document.getElementById('svc-deposit-account');
            if (!sel) return;
            const need = spaAccountNeedsAccount(m);
            sel.classList.toggle('hidden', !need);
            if (!need) return;
            await loadSpaPaymentAccounts();
            fillSpaAccountSelect(sel, m, sel.dataset.method === m ? sel.value : null);
            sel.dataset.method = m;
        }
        window.syncSvcDepositAccountRow = syncSvcDepositAccountRow;
```

5b. Reset form: ngay sau dòng `if (depEl) depEl.value = '';` (~dòng 3830), thêm:

```js
            const depMethodEl = document.getElementById('svc-deposit-method');
            if (depMethodEl) { depMethodEl.value = 'cash'; syncSvcDepositAccountRow(); }
```

5c. Trong `submitCreateServiceTicket`, ngay sau dòng
`if (weight <= 0) { alert('Vui lòng nhập cân nặng của bé (VD: 3.5 hoặc 3,5)!'); return; }`, thêm:

```js
            const depositMethod = depositAmount > 0 ? (document.getElementById('svc-deposit-method')?.value || 'cash') : 'cash';
            let depositAccountId = null;
            if (depositAmount > 0 && spaAccountNeedsAccount(depositMethod)) {
                depositAccountId = spaAccountIdForMethod(depositMethod, document.getElementById('svc-deposit-account'));
                if (!depositAccountId) {
                    alert('Vui lòng chọn "Tài khoản nhận tiền cọc" cho hình thức ' + (depositMethod === 'card' ? 'quẹt thẻ' : 'chuyển khoản') + '!');
                    return;
                }
            }
```

5d. Trong payload của cùng hàm, ngay sau dòng `deposit_amount: depositAmount,`, thêm 2 dòng (giữ nguyên dòng `return_method: '',` phía dưới):

```js
                deposit_method: depositMethod,
                deposit_account_id: depositAccountId,
```

- [ ] **Step 6: Verify**

```
.venv/Scripts/python.exe -m pytest -q --no-header -p no:cacheprovider tests/test_spa_deposit_account.py tests/test_spa_payment_flow.py tests/test_spa_batch_ticket_number.py tests/test_spa_pay_account_selection.py
node --check static/js/modules/spa.js
```

Kỳ vọng: tất cả PASS, `node --check` không in gì.

---

### Task 3: `POST /api/orders` trả nguyên thông báo lỗi nghiệp vụ (P2)

**Bối cảnh:** `create_order` (`routers/pos.py` ~dòng 1383) dùng `except Exception as e: raise HTTPException(400, str(e))`. Khi `resolve_payment_account` ném `HTTPException(400, "Vui lòng chọn ...")`, client nhận chuỗi `"400: Vui lòng chọn ..."`. Lỗi 403/404 cũng bị đổi thành 400.

**Files:**
- Sửa: `routers/pos.py` hàm `create_order`, khối `except` cuối hàm
- Test: `tests/test_create_order_error_detail.py`

- [ ] **Step 1: Viết test fail**

```python
# tests/test_create_order_error_detail.py
import time
from fastapi.testclient import TestClient
from server import app
from database import get_db
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())


def test_create_order_business_error_keeps_clean_detail():
    db = get_db()
    cur = db.cursor()
    cur.execute("INSERT INTO products (code, name, type, stock, sell_price, cost_price) VALUES (?, 'SP test loi', 'product', 10, 1000, 500)",
                (f"SP-ERR-{int(time.time() * 1000)}",))
    pid = cur.lastrowid
    sid = cur.execute("SELECT id FROM staff ORDER BY id LIMIT 1").fetchone()["id"]
    db.commit()
    db.close()
    r = client.post("/api/orders", json={
        "customer_id": 1, "staff_id": sid,
        "items": [{"product_id": pid, "quantity": 1, "price": 1000}],
        "paid_amount": 1000, "payment_method": "transfer"})  # chuyển khoản nhưng không gửi account_id
    assert r.status_code == 400, r.text
    assert r.json()["detail"].startswith("Vui lòng chọn tài khoản"), r.json()["detail"]
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** (detail bắt đầu bằng `"400: "`)

- [ ] **Step 3: Sửa code.** Thay khối:

```python
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
```

bằng:

```python
        conn.commit()
    except HTTPException:
        # Lỗi nghiệp vụ (400/403/404) giữ nguyên mã và thông báo, không bọc lại
        conn.rollback()
        conn.close()
        raise
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
```

(Chỉ sửa đúng khối `except` của `create_order`, tức khối ngay trước `return {"status": "ok", "order_code": code, ...}`.)

- [ ] **Step 4: Verify**

`.venv/Scripts/python.exe -m pytest -q --no-header -p no:cacheprovider tests/test_create_order_error_detail.py tests/test_payment_accounts_all_flows.py`
Kỳ vọng: PASS. Nếu một test cũ đang assert chuỗi `"400: ..."`, sửa assert của test đó theo hành vi mới và ghi rõ trong báo cáo.

---

### Task 4: Trả nợ NCC kiểm tra tài khoản chi (P2)

**Bối cảnh:** `pay_single_order_debt` (`routers/oem.py` ~dòng 1284) dùng thẳng `req.account_id`, không kiểm tra tài khoản có tồn tại, đang hoạt động, có đúng quỹ hay không. Hậu quả: chi bằng Quỹ Cá Nhân nhưng ghi vào tài khoản Cty. Thêm nữa, UI `cashflow.js:308` liệt kê tài khoản của **mọi** quỹ và có thể tự chọn `activeAccs[0]` thuộc quỹ khác.

**Files:**
- Sửa: `routers/oem.py` hàm `pay_single_order_debt`
- Sửa: `static/js/modules/cashflow.js:308`
- Test: `tests/test_pay_order_debt_account_check.py`

- [ ] **Step 1: Viết test fail**

```python
# tests/test_pay_order_debt_account_check.py
from fastapi.testclient import TestClient
import database
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())


def _setup(acc_owner, acc_active=1, tag="A"):
    conn = database.get_db()
    cur = conn.cursor()
    code = f"TK-T4-{tag}"
    cur.execute("""INSERT INTO payment_accounts (code, name, account_type, owner_type, is_active, is_default)
                   VALUES (?, ?, 'bank', ?, ?, 0)""", (code, f"TK test {tag}", acc_owner, acc_active))
    acc_id = cur.lastrowid
    cur.execute("""INSERT INTO contacts (name, phone, type, debt, initial_debt_personal, initial_debt_company)
                   VALUES ('NCC T4', '0911000444', 'supplier', 1000000, 1000000, 0)""")
    supp_id = cur.lastrowid
    cur.execute("""INSERT INTO purchases (code, supplier_id, total_amount, paid_amount, debt_amount, vat_rate, vat_amount, created_at)
                   VALUES (?, ?, 1000000, 0, 1000000, 0, 0, '2026-10-20 10:00:00')""", (f"PO-T4-{tag}", supp_id))
    po_id = cur.lastrowid
    conn.commit()
    conn.close()
    return acc_id, po_id


def _debt(po_id):
    conn = database.get_db()
    d = conn.execute("SELECT debt_amount FROM purchases WHERE id = ?", (po_id,)).fetchone()["debt_amount"]
    conn.close()
    return d


def test_reject_account_of_other_fund():
    acc_id, po_id = _setup("COMPANY", tag="WRONGFUND")
    r = client.post("/api/cashflow-debts/pay-order", json={
        "order_type": "PO", "order_id": po_id, "amount": 100000,
        "fund_source": "PERSONAL", "account_id": acc_id})  # PO không VAT -> bắt buộc Quỹ Cá Nhân
    assert r.status_code == 400, r.text
    assert _debt(po_id) == 1000000


def test_reject_inactive_account():
    acc_id, po_id = _setup("PERSONAL", acc_active=0, tag="INACTIVE")
    r = client.post("/api/cashflow-debts/pay-order", json={
        "order_type": "PO", "order_id": po_id, "amount": 100000,
        "fund_source": "PERSONAL", "account_id": acc_id})
    assert r.status_code == 400, r.text
    assert _debt(po_id) == 1000000


def test_cashflow_ui_filters_accounts_by_fund():
    js = open("static/js/modules/cashflow.js", encoding="utf-8").read()
    assert "(a.owner_type || 'COMPANY') === targetFund" in js
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** (2 test API hiện trả 200)

- [ ] **Step 3: Backend** (`routers/oem.py`)

Chèn ngay **sau** khối kiểm tra `if req.amount > order_debt + 0.01: ... raise ...` và **trước** dòng `alloc = req.amount`, để kiểm tra xong mới trừ nợ:

```python
    if req.account_id:
        cur.execute("SELECT owner_type FROM payment_accounts WHERE id = ? AND is_active = 1", (req.account_id,))
        acc_row = cur.fetchone()
        if not acc_row:
            conn.close()
            raise HTTPException(status_code=400, detail="Tài khoản chi không tồn tại hoặc đã ngừng hoạt động")
        if (acc_row["owner_type"] or "COMPANY") != req.fund_source:
            conn.close()
            fund_label = "Quỹ Cty" if req.fund_source == "COMPANY" else "Quỹ Cá Nhân"
            raise HTTPException(status_code=400, detail=f"Tài khoản chi không thuộc {fund_label}")
```

Giữ nguyên đoạn `acc_id = req.account_id` / `if not acc_id: ...` phía dưới.

- [ ] **Step 4: UI** (`static/js/modules/cashflow.js`, trong `loadCFDPayOrderAccounts`)

Thay:

```js
                const activeAccs = (accounts || []).filter(a => a.is_active);
```

bằng:

```js
                const activeAccs = (accounts || []).filter(a => a.is_active && (a.owner_type || 'COMPANY') === targetFund);
```

- [ ] **Step 5: Verify**

```
.venv/Scripts/python.exe -m pytest -q --no-header -p no:cacheprovider tests/test_pay_order_debt_account_check.py tests/test_pay_single_order_debt.py
node --check static/js/modules/cashflow.js
```

Kỳ vọng: tất cả PASS.

---

### Task 5: Tăng version cache JS

**Bối cảnh:** `cashflow.js` và `ai_agent.js` đã sửa trong đợt này nhưng `templates/index.html` vẫn để `?v=20261016_01`, nên trình duyệt ở máy khách có thể dùng bản JS cũ. Task 2 cũng sửa `spa.js`.

**Files:** `templates/index.html` (khoảng dòng 11254-11264)

- [ ] **Step 1:** Đổi đúng 3 chuỗi sau:
  - `/static/js/modules/spa.js?v=20261021_09` → `/static/js/modules/spa.js?v=20261022_01`
  - `/static/js/modules/cashflow.js?v=20261016_01` → `/static/js/modules/cashflow.js?v=20261022_01`
  - `/static/js/modules/ai_agent.js?v=20261016_01` → `/static/js/modules/ai_agent.js?v=20261022_01`
- [ ] **Step 2: Verify:** `grep -n "spa.js?v=\|cashflow.js?v=\|ai_agent.js?v=" templates/index.html` phải hiện 3 dòng `20261022_01`.

---

### Task 6: Full suite + build lại exe

**Bối cảnh:** sau khi sửa file Python (`routers/*`) bắt buộc build lại `POS_Mastercare.exe` (nằm ở thư mục gốc repo) trước khi push. Bản exe hiện tại build lúc 09:51 ngày 2026-10-22, cũ hơn các thay đổi ở `ai_assistant.py`, `auth.py`, `database.py`.

- [ ] **Step 1: Full test suite** (chạy 1 lượt duy nhất, ~3 phút):

```
.venv/Scripts/python.exe -m pytest -q --no-header -p no:cacheprovider --tb=line 2>&1 | tail -15
```

Kỳ vọng: `0 failed`. Dán dòng tổng kết `N passed, M skipped`. Mốc trước khi sửa: 717 passed, 10 skipped.

- [ ] **Step 2: Kiểm tra JS:**

```
for f in static/js/modules/spa.js static/js/modules/cashflow.js; do node --check $f && echo "OK $f"; done
```

- [ ] **Step 3: Build exe** (ra thẳng thư mục gốc):

```
.venv/Scripts/python.exe -m PyInstaller POS_Mastercare.spec --distpath . -y
```

- [ ] **Step 4: Verify build:** `ls -l --time-style=+%F_%T POS_Mastercare.exe` phải hiện thời điểm vừa build và kích thước ~31 MB.

- [ ] **Step 5:** KHÔNG commit, KHÔNG push. Báo lại cho chủ dự án: danh sách file đã sửa, output test, timestamp exe.

---

## Ngoài phạm vi (không làm)

- **`start_ticket_number` không có giới hạn trên** (`routers/partners.py` ~dòng 1752): rủi ro thấp (chỉ nhảy số phiếu), và test hiện có `tests/test_spa_batch_ticket_number.py` cố ý dùng `max + 50`. Thêm giới hạn khi có báo cáo nhảy số thật.
- Lỗi lộ hash mật khẩu ở các endpoint khác: đã grep, chỉ `routers/pos.py` có `SELECT * FROM staff`.

## Checklist nghiệm thu

- [ ] Task 1: `/api/staff` không còn `password_hash`, `ai_api_key`, `token_version`
- [ ] Task 2: cọc CK/thẻ vào đúng tài khoản; CK thiếu tài khoản thì 400; mặc định vào két
- [ ] Task 3: lỗi `/api/orders` không còn tiền tố `"400: "`
- [ ] Task 4: trả nợ NCC chặn tài khoản sai quỹ hoặc đã ngừng hoạt động; UI chỉ liệt kê tài khoản đúng quỹ
- [ ] Task 5: 3 file JS đã tăng `?v=`
- [ ] Task 6: full suite 0 failed; exe đã build lại
