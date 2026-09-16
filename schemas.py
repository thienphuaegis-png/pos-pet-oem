from pydantic import BaseModel
from typing import List, Optional

# --- POS & Orders ---
class OrderItemIn(BaseModel):
    product_id: int
    quantity: float
    price: float

class OrderCreate(BaseModel):
    customer_id: int
    staff_id: int
    discount: float = 0
    paid_amount: float
    note: Optional[str] = ""
    warehouse_id: Optional[int] = 1 # Kho xuất nguyên liệu
    items: List[OrderItemIn]

# --- Products & Catalog ---
class ProductCreate(BaseModel):
    code: str
    name: str
    type: str # product, service, material
    cost_price: float = 0
    sell_price: float = 0
    unit: str = "cái"
    stock: float = 0
    warehouse_id: Optional[int] = 1
    supplier_ids: Optional[List[int]] = None

class ProductUpdate(BaseModel):
    code: Optional[str] = None
    name: str
    type: str = "product"
    cost_price: float = 0
    sell_price: float = 0
    unit: str = "cái"
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
    name: str
    unit: str
    type: str = "RAW"

class WarehouseCreate(BaseModel):
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    is_default: Optional[int] = 0

class WarehouseUpdate(BaseModel):
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
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
    expected_date: Optional[str] = None
    note: Optional[str] = ""
    items: List[PurchaseItemIn]

# --- Cashbook ---
class CashbookCreate(BaseModel):
    type: str # THU hoac CHI
    category: str
    amount: float
    description: Optional[str] = ""
    ref_type: Optional[str] = None
    ref_id: Optional[int] = None

# --- Settings & Templates ---
class CompanySettingsUpdate(BaseModel):
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    bank_name: Optional[str] = ""
    bank_account: Optional[str] = ""
    bank_owner: Optional[str] = ""
    qr_url: Optional[str] = ""

class TemplateSettingsUpdate(BaseModel):
    paper_size: str
    preset_name: Optional[str] = None
    is_active: Optional[bool] = False
    config_json: str
