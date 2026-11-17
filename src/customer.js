import "../styles.css";
import { isSupabaseConfigured, supabase } from "./supabase.js";

const PRICE_PER_SHIRT = 390;
const SHIPPING_FEE = 40;
const FREE_SHIPPING_QUANTITY = 2;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const form = document.querySelector("#orderForm");
const quantityOutput = document.querySelector("#quantity");
const totalPrice = document.querySelector("#totalPrice");
const paymentTotal = document.querySelector("#paymentTotal");
const shippingNote = document.querySelector("#shippingNote");
const teeScene = document.querySelector("#teeScene");
const colorLabel = document.querySelector("#colorLabel");
const sizeDialog = document.querySelector("#sizeDialog");
const confirmationDialog = document.querySelector("#confirmationDialog");
const orderMessage = document.querySelector("#orderMessage");
const paymentSlip = document.querySelector("#paymentSlip");
const submitButton = form.querySelector('button[type="submit"]');
const addressField = document.querySelector("#addressField");
const addressInput = form.elements.address;
const pickupInstructions = document.querySelector("#pickupInstructions");

let quantity = 1;
let storeSettings = null;
let customerSessionReady = false;

function getFulfillment() {
  return form.querySelector('input[name="fulfillment"]:checked').value;
}

function updateTotals() {
  const isPickup = getFulfillment() === "pickup";
  const subtotal = quantity * PRICE_PER_SHIRT;
  const shipping = isPickup || quantity >= FREE_SHIPPING_QUANTITY ? 0 : SHIPPING_FEE;
  const total = subtotal + shipping;
  quantityOutput.value = quantity;
  quantityOutput.textContent = quantity;
  totalPrice.textContent = total.toLocaleString("th-TH");
  paymentTotal.textContent = total.toLocaleString("th-TH");
  shippingNote.textContent = isPickup
    ? "รับสินค้าเอง · ไม่มีค่าจัดส่ง"
    : shipping === 0
      ? "จัดส่งฟรี"
      : `ค่าจัดส่ง ${SHIPPING_FEE} ฿`;
  addressField.hidden = isPickup;
  addressInput.required = !isPickup;
  pickupInstructions.hidden = !isPickup || !storeSettings?.pickup_instructions;
  pickupInstructions.textContent = isPickup ? storeSettings?.pickup_instructions ?? "" : "";
}

function setOrderMessage(message, isError = false) {
  orderMessage.textContent = message;
  orderMessage.classList.toggle("message-error", isError);
}

function showError(message) {
  setOrderMessage(message, true);
}

async function ensureCustomerSession() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session) return;

  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw signInError;
}

async function loadStoreSettings() {
  const { data, error } = await supabase
    .from("store_settings")
    .select("payment_qr_path, pickup_instructions")
    .eq("id", 1)
    .single();
  if (error) throw error;

  storeSettings = data;
  if (data.payment_qr_path) {
    const { data: imageData } = supabase.storage
      .from("store-assets")
      .getPublicUrl(data.payment_qr_path);
    const qrImage = document.querySelector("#qrImage");
    qrImage.src = imageData.publicUrl;
    qrImage.hidden = false;
    document.querySelector("#qrPlaceholder").hidden = true;
  }
  updateTotals();
}

async function initializeStore() {
  if (!isSupabaseConfigured) {
    showError("ยังไม่ได้ตั้งค่า Supabase — ดูวิธีตั้งค่าใน README.md");
    submitButton.disabled = true;
    return;
  }

  try {
    await ensureCustomerSession();
    customerSessionReady = true;
    await loadStoreSettings();
    if (!storeSettings.payment_qr_path) {
      showError("ร้านยังไม่ได้ตั้งค่า QR รับเงิน กรุณาติดต่อร้านก่อนสั่งจอง");
      submitButton.disabled = true;
      return;
    }
    setOrderMessage("เลือกรับสินค้า แนบสลิป แล้วส่งรายการให้ร้านตรวจสอบได้เลย");
  } catch (error) {
    showError(`เชื่อมต่อระบบสั่งจองไม่สำเร็จ: ${error.message}`);
    submitButton.disabled = true;
  }
}

document.querySelector("#decreaseQuantity").addEventListener("click", () => {
  quantity = Math.max(1, quantity - 1);
  updateTotals();
});

document.querySelector("#increaseQuantity").addEventListener("click", () => {
  quantity = Math.min(20, quantity + 1);
  updateTotals();
});

document.querySelectorAll('input[name="color"]').forEach((input) => {
  input.addEventListener("change", (event) => {
    teeScene.dataset.color = event.target.value;
    colorLabel.textContent = event.target.dataset.label;
  });
});

form.querySelectorAll('input[name="fulfillment"]').forEach((input) => {
  input.addEventListener("change", updateTotals);
});

paymentSlip.addEventListener("change", () => {
  const file = paymentSlip.files?.[0];
  if (!file) return;
  if (!MIME_EXTENSIONS[file.type]) {
    paymentSlip.setCustomValidity("กรุณาเลือกภาพ PNG, JPG หรือ WEBP");
  } else if (file.size > MAX_FILE_BYTES) {
    paymentSlip.setCustomValidity("ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB");
  } else {
    paymentSlip.setCustomValidity("");
    document.querySelector("#paymentMessage").textContent = `เลือกไฟล์แล้ว: ${file.name}`;
  }
  paymentSlip.reportValidity();
});

document.querySelector("#sizeGuideButton").addEventListener("click", () => sizeDialog.showModal());
sizeDialog.querySelector(".dialog-close").addEventListener("click", () => sizeDialog.close());
sizeDialog.querySelector(".dialog-done").addEventListener("click", () => sizeDialog.close());
confirmationDialog.querySelector(".dialog-close").addEventListener("click", () => confirmationDialog.close());
confirmationDialog.querySelector(".dialog-done").addEventListener("click", () => confirmationDialog.close());

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (!customerSessionReady || !storeSettings?.payment_qr_path) {
    showError("ระบบยังไม่พร้อมรับรายการ กรุณาลองใหม่ภายหลัง");
    return;
  }

  const slip = paymentSlip.files?.[0];
  if (!slip || !MIME_EXTENSIONS[slip.type] || slip.size > MAX_FILE_BYTES) {
    showError("กรุณาแนบสลิป PNG, JPG หรือ WEBP ขนาดไม่เกิน 5 MB");
    return;
  }

  submitButton.disabled = true;
  setOrderMessage("กำลังส่งคำสั่งจองและอัปโหลดสลิป…");
  let uploadedSlipPath = null;

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error("ไม่พบเซสชันผู้สั่งจอง กรุณาโหลดหน้าใหม่");

    const userId = userData.user.id;
    const orderId = crypto.randomUUID();
    uploadedSlipPath = `${userId}/${orderId}.${MIME_EXTENSIONS[slip.type]}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-slips")
      .upload(uploadedSlipPath, slip, {
        cacheControl: "3600",
        contentType: slip.type,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const data = new FormData(form);
    const fulfillment = data.get("fulfillment");
    const subtotal = quantity * PRICE_PER_SHIRT;
    const shippingFee = fulfillment === "pickup" || quantity >= FREE_SHIPPING_QUANTITY
      ? 0
      : SHIPPING_FEE;
    const order = {
      id: orderId,
      user_id: userId,
      customer_name: data.get("customerName").trim(),
      phone: data.get("phone"),
      fulfillment,
      address: fulfillment === "delivery" ? data.get("address").trim() : null,
      shirt_color: data.get("color"),
      shirt_size: data.get("size"),
      quantity,
      subtotal,
      shipping_fee: shippingFee,
      total: subtotal + shippingFee,
      slip_path: uploadedSlipPath,
      payment_status: "awaiting_review",
    };
    const { error: insertError } = await supabase.from("orders").insert(order);
    if (insertError) throw insertError;

    const colorName = form.querySelector('input[name="color"]:checked').dataset.label;
    const fulfillmentSummary = fulfillment === "pickup"
      ? "มารับเอง"
      : `จัดส่ง: ${order.address}`;
    const summary = [
      `เลขที่รายการ ${orderId}`,
      `${order.customer_name} · ${order.phone}`,
      `เสื้อสี${colorName} ไซซ์ ${order.shirt_size} จำนวน ${quantity} ตัว`,
      `${fulfillmentSummary} · ยอด ${order.total.toLocaleString("th-TH")} ฿`,
      "สถานะชำระเงิน: รอตรวจสอบสลิป",
    ].join("\n");
    document.querySelector("#confirmationText").textContent = summary;
    setOrderMessage("ส่งรายการถึงร้านแล้ว รอตรวจสอบสลิปและสถานะในหลังบ้าน");
    form.reset();
    quantity = 1;
    teeScene.dataset.color = "cream";
    colorLabel.textContent = "ครีม";
    paymentSlip.setCustomValidity("");
    updateTotals();
    confirmationDialog.showModal();
  } catch (error) {
    let message = `ส่งคำสั่งจองไม่สำเร็จ: ${error.message}`;
    if (uploadedSlipPath) {
      const { error: cleanupError } = await supabase.storage
        .from("payment-slips")
        .remove([uploadedSlipPath]);
      if (cleanupError) message += ` (ลบไฟล์สลิปที่อัปโหลดไม่สำเร็จ: ${cleanupError.message})`;
    }
    showError(message);
  } finally {
    submitButton.disabled = false;
  }
});

updateTotals();
initializeStore();
