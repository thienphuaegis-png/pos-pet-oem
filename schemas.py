from pydantic import BaseModel, Field
from typing import List, Optional

# --- POS & Orders ---
class OrderItemIn(BaseModel):
    product_id: int
    quantity: float
    price: float

class PaymentSplitIn(BaseModel):
    method: str  # cash, transfer, card, ewallet
    amount: float
    account_id: Optional[int] = None

class OrderCreate(BaseModel):
    customer_id: int
    staff_id: int
    discount: float = 0
    paid_amount: float
    note: Optional[str] = ""
    warehouse_id: Optional[int] = 1 # Kho xuất nguyên liệu
    account_id: Optional[int] = None
    shift_id: Optional[int] = None
    items: List[OrderItemIn]
    payments: Optional[List[PaymentSplitIn]] = None
    use_spa_wallet: Optional[bool] = False
    spa_wallet_amount: Optional[float] = 0

class OrderUpdate(BaseModel):
    customer_id: Optional[int] = None
    staff_id: Optional[int] = None
    discount: Optional[float] = None
    paid_amount: Optional[float] = None
    note: Optional[str] = None
    warehouse_id: Optional[int] = 1
    items: Optional[List[OrderItemIn]] = None

# --- Products & Catalog ---
class ProductCreate(BaseModel):
    code: str
    name: str
    type: str # product, service, material
    cost_price: float = 0
    sell_price: float = 0
    unit: str = "cái"
    stock: float = 0
    category: Optional[str] = "Khác"
    warehouse_id: Optional[int] = 1
    supplier_ids: Optional[List[int]] = None

class ProductUpdate(BaseModel):
    code: Optional[str] = None
    name: str
    type: str = "product"
    cost_price: float = 0
    sell_price: float = 0
    unit: str = "cái"
    category: Optional[str] = None
    supplier_ids: Optional[List[int]] = None

class WriteOffItemIn(BaseModel):
    item_type: str # 'product' or 'ingredient'
    item_id: int
    quantity: float
    reason: Optional[str] = "Hư hỏng / Hết hạn"

class WriteOffCreate(BaseModel):
    warehouse_id: int = 1
    note: Optional[str] = "Xuất hủy hàng hóa"
    items: List[WriteOffItemIn]

# --- Ingredients & Inventory ---
class IngredientCreate(BaseModel):
    code: str
    name: str
    unit: str
    type: str = "RAW"
    initial_stock: float = 0
    initial_cost: float = 0
    warehouse_id: Optional[int] = 1

class IngredientUpdate(BaseModel):
    code: Optional[str] = None
    name: str
    unit: str
    type: str = "IS_PHYSICAL"
    latest_cost: Optional[float] = None

class WarehouseCreate(BaseModel):
    code: Optional[str] = None
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    is_active: Optional[int] = 1
    is_default: Optional[int] = 0

class WarehouseUpdate(BaseModel):
    code: Optional[str] = None
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    is_active: Optional[int] = 1
    is_default: Optional[int] = 0

class InventoryAdjust(BaseModel):
    warehouse_id: int
    ingredient_id: int
    new_quantity: float
    reason: str

class TransferItemIn(BaseModel):
    item_type: str # product hoac ingredient
    product_id: Optional[int] = None
    ingredient_id: Optional[int] = None
    quantity: float

class TransferCreate(BaseModel):
    from_warehouse_id: int
    to_warehouse_id: int
    note: Optional[str] = ""
    items: List[TransferItemIn]

class AuditItemIn(BaseModel):
    item_type: str # product hoac ingredient
    product_id: Optional[int] = None
    ingredient_id: Optional[int] = None
    actual_quantity: float

class AuditCreate(BaseModel):
    warehouse_id: int
    note: Optional[str] = ""
    items: List[AuditItemIn]

# --- BOM & Production ---
class BOMItemIn(BaseModel):
    ingredient_id: int
    quantity: float

class BOMSetRequest(BaseModel):
    items: List[BOMItemIn]

class ProductionItemIn(BaseModel):
    product_id: int
    quantity: float

class ProductionCreate(BaseModel):
    warehouse_id: Optional[int] = 1
    items: Optional[List[ProductionItemIn]] = None
    note: Optional[str] = ""
    # Giữ tương thích ngược cho request đơn lẻ
    product_id: Optional[int] = None
    quantity: Optional[float] = None

# --- Purchases (PO) ---
class PurchaseItemIn(BaseModel):
    item_type: str # product hoac ingredient
    product_id: Optional[int] = None
    ingredient_id: Optional[int] = None
    item_name: Optional[str] = ""
    unit: Optional[str] = ""
    quantity: float
    cost_price: float

class PurchaseCreate(BaseModel):
    supplier_id: int
    warehouse_id: Optional[int] = 1
    discount: float = 0
    shipping_fee: float = 0
    other_fee: float = 0
    vat_rate: float = 0
    paid_amount: float = 0
    fund_source: Optional[str] = "PERSONAL"
    expected_date: Optional[str] = None
    note: Optional[str] = ""
    status: Optional[str] = "pending"
    items: List[PurchaseItemIn]

# --- Payment Accounts & Cashbook ---
class PaymentAccountCreate(BaseModel):
    code: str
    name: str
    account_type: str # cash, bank, ewallet
    owner_type: Optional[str] = "COMPANY" # COMPANY, PERSONAL
    bank_name: Optional[str] = ""
    account_number: Optional[str] = ""
    account_holder: Optional[str] = ""
    initial_balance: Optional[float] = 0.0
    is_default: Optional[int] = 0

class PaymentAccountUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    account_type: Optional[str] = None
    owner_type: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    initial_balance: Optional[float] = None
    is_default: Optional[int] = None
    is_active: Optional[int] = None

class CashbookCreate(BaseModel):
    code: Optional[str] = None
    type: str # in, out, THU, CHI
    category: str
    amount: float
    account_id: Optional[int] = None
    contact_id: Optional[int] = None
    ref_type: Optional[str] = "manual"
    ref_id: Optional[int] = None
    note: Optional[str] = ""
    description: Optional[str] = ""
    fund_source: Optional[str] = "COMPANY"

# --- Settings & Templates ---
class CompanySettingsUpdate(BaseModel):
    app_name: Optional[str] = "⚡ POS Offline"
    shop_name: str
    shop_address: Optional[str] = ""
    shop_phone: Optional[str] = ""
    shop_footer: Optional[str] = ""
    shop_bank_code: Optional[str] = ""
    shop_bank_account: Optional[str] = ""
    shop_bank_owner: Optional[str] = ""
    shop_qr_mode: Optional[str] = "vietqr"
    shop_qr_image: Optional[str] = ""
    shop_logo: Optional[str] = ""

class TemplateSettingsUpdate(BaseModel):
    print_blocks_config: str

class RolePermissionUpdate(BaseModel):
    role: str
    perm_key: str
    allowed: bool

class ModuleToggleUpdate(BaseModel):
    key: str  # module_oem | module_pet_services | module_price_lists
    enabled: bool

class StaffPermissionUpdate(BaseModel):
    staff_id: int
    perm_key: str
    allowed: Optional[bool] = None  # None = xoa override, dung lai theo quyen mac dinh cua role


# --- Price Lists ---
class PriceListCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = ""

class PriceListUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[int] = None

class ProductPriceCreate(BaseModel):
    product_id: int
    price: float
    min_qty: float = 1
    discount_percent: float = 0

class ProductPriceUpdate(BaseModel):
    price: Optional[float] = None
    min_qty: Optional[float] = None
    discount_percent: Optional[float] = None


# --- Customer Segments ---
class CustomerSegmentCreate(BaseModel):
    code: str
    name: str
    discount_percent: float = 0
    priority: int = 0
    price_list_id: Optional[int] = None
    min_points: Optional[int] = 0
    allow_points: Optional[int] = 1

class CustomerSegmentUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    discount_percent: Optional[float] = None
    priority: Optional[int] = None
    is_active: Optional[int] = None
    price_list_id: Optional[int] = None
    min_points: Optional[int] = None
    allow_points: Optional[int] = None


# --- Combos ---
class ComboItemIn(BaseModel):
    product_id: int = Field(gt=0, description="ID sản phẩm (phải > 0)")
    quantity: float = Field(gt=0, description="Số lượng (phải > 0)")

class ComboCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50, description="Mã combo (không rỗng)")
    name: str = Field(min_length=1, max_length=200, description="Tên combo (không rỗng)")
    sell_price: float = Field(ge=0, default=0, description="Giá bán combo")
    discount_percent: float = Field(ge=0, le=100, default=0, description="% giảm giá")
    items: List[ComboItemIn]

class ComboUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    sell_price: Optional[float] = Field(default=None, ge=0)
    discount_percent: Optional[float] = Field(default=None, ge=0, le=100)
    is_active: Optional[int] = Field(default=None, ge=0, le=1)


# --- OEM Orders ---
class OEMOrderItemIn(BaseModel):
    product_id: int
    ordered_qty: float = Field(gt=0, description="Số lượng đặt")
    unit_price: float = Field(ge=0, description="Đơn giá gia công niêm yết")

class OEMOrderCreate(BaseModel):
    partner_id: int
    oem_warehouse_id: int = 1
    dest_warehouse_id: int = 1
    expected_delivery_date: Optional[str] = None
    fund_source: str = "COMPANY"
    vat_percent: float = 8.0
    discount_percent: float = 0.0
    deposit_amount: float = 0.0
    note: Optional[str] = ""
    items: List[OEMOrderItemIn]

class OEMOrderUpdate(BaseModel):
    partner_id: int
    oem_warehouse_id: int = 1
    dest_warehouse_id: int = 1
    expected_delivery_date: Optional[str] = None
    vat_percent: float = 0.0
    discount_percent: float = 0.0
    note: Optional[str] = ""
    fund_source: Optional[str] = "COMPANY"
    items: List[OEMOrderItemIn]

class OEMOrderDeposit(BaseModel):
    deposit_amount: float = Field(gt=0)
    deposit_date: Optional[str] = None
    fund_source: Optional[str] = "COMPANY"
    note: Optional[str] = None

class OEMReceiveItemIn(BaseModel):
    item_id: int
    received_qty: float = Field(ge=0)

class OEMOrderReceive(BaseModel):
    items: List[OEMReceiveItemIn]
    pay_remaining_now: bool = False
    payment_fund_source: Optional[str] = "COMPANY"
    note: Optional[str] = None


# --- Promotions & Pricing ---
class PromotionCreate(BaseModel):
    code: Optional[str] = None
    name: str = Field(min_length=1)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: Optional[int] = 1

class PromotionUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: Optional[int] = None

class PromotionItemCreate(BaseModel):
    product_id: Optional[int] = None
    target_type: Optional[str] = "product" # 'product', 'spa_service', 'spa_category'
    service_name: Optional[str] = None
    spa_category: Optional[str] = None
    discount_type: str = Field(pattern="^(pct|fixed)$")
    discount_val: float = Field(ge=0)

class PromotionSpaItemCreate(BaseModel):
    target_type: str = Field(pattern="^(spa_service|spa_category)$")
    service_name: Optional[str] = None
    spa_category: Optional[str] = None
    discount_type: str = Field(pattern="^(pct|fixed)$")
    discount_val: float = Field(ge=0)

class PriceListSpaItemCreate(BaseModel):
    target_type: str = Field(pattern="^(service|category)$")
    service_name: Optional[str] = None
    spa_category: Optional[str] = None
    discount_percent: float = Field(ge=0, le=100)

class PricingSpaCalculateRequest(BaseModel):
    customer_id: Optional[int] = None
    service_name: str
    weight: float = Field(ge=0)

class PricingCalculateItemIn(BaseModel):
    product_id: int
    quantity: float = 1.0

class PricingCalculateRequest(BaseModel):
    customer_id: Optional[int] = None
    items: List[PricingCalculateItemIn]
