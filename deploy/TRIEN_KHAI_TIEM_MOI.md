# Đưa POS sang một tiệm mới

Tài liệu này dành cho **anh Phú** (người quản trị), không phải người ở tiệm.

Repo: `https://github.com/thienphuaegis-png/pos-pet-oem` (private)

---

## Bước 1: Tạo khoá riêng cho tiệm mới

Mỗi tiệm **một khoá riêng**. Không dùng chung — mất khoá một tiệm thì chỉ thu hồi tiệm đó.

Mở PowerShell trên máy anh:

```powershell
ssh-keygen -t ed25519 -f "$HOME\.ssh\pos_tiem2" -N '""' -C "pos-tiem2-readonly"
```

Đổi `tiem2` thành tên tiệm thật cho dễ nhớ (`pos_nhatrang`, `pos_bentre`...).

Nạp khoá công khai lên GitHub, **read-only**:

```powershell
gh repo deploy-key add "$HOME\.ssh\pos_tiem2.pub" --repo thienphuaegis-png/pos-pet-oem --title "Tiem 2 - chi doc"
```

Kiểm tra đúng là read-only:

```powershell
gh api repos/thienphuaegis-png/pos-pet-oem/keys --jq '.[] | "\(.title) read_only=\(.read_only)"'
```

Phải thấy `read_only=true`. Nếu thấy `false` — xoá đi làm lại, máy tiệm sẽ đẩy ngược được lên repo.

---

## Bước 2: Chuẩn bị USB

Trên máy anh, clone một bản sạch (đừng chép thư mục đang làm việc — nó có `.venv` nặng và `data` là dữ liệu của anh):

```powershell
cd $env:TEMP
git clone git@github.com:thienphuaegis-png/pos-pet-oem.git POS
```

Chép khoá riêng vào đúng chỗ:

```powershell
Copy-Item "$HOME\.ssh\pos_tiem2" "$env:TEMP\POS\deploy\khoa_tiem"
```

Chép cả thư mục `POS` ra USB.

> Khoá nằm trong `.gitignore` nên không bao giờ bị đẩy ngược lên GitHub. Có test canh việc này (`tests/test_git_hygiene.py`).

---

## Bước 3: Tại tiệm

1. Chép thư mục `POS` từ USB vào ổ cứng — nên để `C:\POS` (đường dẫn ngắn, không dấu, không space)
2. Chuột phải `C:\POS\deploy\CAI_DAT_MAY_CHU.bat` → **Run as administrator**
3. Đợi. Lần đầu 5–15 phút (tải Python, Git, thư viện).
4. Xong khi thấy **CAI DAT XONG - SERVER DANG CHAY**

Bộ cài tự làm: cài Python + Git nếu thiếu, tạo môi trường, mở firewall cổng 8999, đặt tự khởi động, sinh mã QR, tạo shortcut.

**Ghi lại địa chỉ** hiện ở màn hình cuối (dạng `http://192.168.x.x:8999`).

---

## Bước 4: Bàn giao

- In `deploy\QR_POS.png` dán ở quầy (điện thoại quét vào dùng)
- Đưa `deploy\HUONG_DAN.md` cho người phụ trách đọc
- **Đổi mật khẩu `admin/admin123` ngay tại chỗ**, đừng để tiệm tự làm
- Máy tính khác trong tiệm: chạy `CAI_MAY_CON.bat`, tự tìm ra máy chủ

---

## Phát hành bản cập nhật

Trên máy anh:

```powershell
cd D:\Projects_Hermes\pos-offline-petcare2
git push github main
```

Rồi nhắn tiệm: bấm icon **CẬP NHẬT POS** trên Desktop máy chủ.

Tiệm bấm là xong: tự sao lưu DB → tải code mới → nâng cấp schema → chạy lại. Nếu tải lỗi thì dừng ngay, dữ liệu nguyên vẹn, tự chạy lại bản cũ.

> **Trước khi push:** chạy `.venv\Scripts\python.exe tests\test_git_hygiene.py` và `tests\test_deploy_scripts.py`. Đẩy code lỗi lên là cả mấy tiệm cùng dính.

---

## Thu hồi quyền một tiệm

Nghỉ hợp tác, mất máy, khoá bị lộ:

```powershell
gh api repos/thienphuaegis-png/pos-pet-oem/keys --jq '.[] | "\(.id) \(.title)"'
gh api -X DELETE repos/thienphuaegis-png/pos-pet-oem/keys/<ID>
```

Tiệm đó hết cập nhật được ngay. POS vẫn chạy với bản hiện có — dữ liệu của họ không bị ảnh hưởng.

---

## Lưu ý đã trả giá để biết

| Điều | Vì sao |
|---|---|
| Không bao giờ để `data/pos.db` vào git | `git pull` sẽ **đè dữ liệu thật** của tiệm. Có test canh. |
| Đường dẫn khoá phải dùng `/` | ssh trên Windows nuốt dấu `\` → `Permission denied` |
| Không dùng lệnh `timeout` trong .bat | Máy có Git Bash gọi nhầm bản Unix; `timeout.exe` chết khi stdin bị chuyển hướng |
| Dò Python/Git bằng đường dẫn tuyệt đối | PATH của session admin khác PATH của user |
| Không đồng bộ qua Google Drive/OneDrive | Sync file `.db` đang mở làm **hỏng SQLite** |
| Mỗi tiệm một khoá | Thu hồi được từng tiệm mà không ảnh hưởng tiệm khác |
