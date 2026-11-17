import "../styles.css";
import "./admin.css";
import { isSupabaseConfigured, supabase } from "./supabase.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const PAYMENT_LABELS = {
  awaiting_review: "รอตรวจสลิป",
  paid: "จ่ายแล้ว",
  rejected: "สลิปไม่ผ่าน",
};
const COLOR_LABELS = {
  cream: "ครีม",
  forest: "เขียวเข้ม",
  terracotta: "อิฐ",
  ink: "ดำ",
};

const loginPanel = document.querySelector("#loginPanel");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const dashboard = document.querySelector("#dashboard");
const dashboardMessage = document.querySelector("#dashboardMessage");
const signOutButton = document.querySelector("#signOutButton");
const orderRows = document.querySelector("#orderRows");
const statusFilter = document.querySelector("#statusFilter");
const emptyOrders = document.querySelector("#emptyOrders");

let orders = [];
let currentSettings = null;

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("message-error", isError);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showLogin(message = "", isError = false) {
  loginPanel.hidden = false;
  dashboard.hidden = true;
  signOutButton.hidden = true;
  setMessage(loginMessage, message, isError);
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  signOutButton.hidden = false;
}

async function checkAdminAccess() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return false;
  const { data, error } = await supabase.rpc("is_store_admin");
  if (error) throw error;
  return data === true;
}

async function loadOrders() {
  setMessage(dashboardMessage, "กำลังโหลดรายการ…");
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  orders = data;
  renderOrders();
  document.querySelector("#totalOrders").textContent = String(orders.length);
  document.querySelector("#waitingOrders").textContent = String(
    orders.filter((order) => order.payment_status === "awaiting_review").length,
  );
  document.querySelector("#paidOrders").textContent = String(
    orders.filter((order) => order.payment_status === "paid").length,
  );
  setMessage(dashboardMessage, `แสดง ${orders.length} รายการล่าสุด`);
}

function makeOrderRow(order) {
  const row = element("tr");
  const createdAt = new Date(order.created_at).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const idCell = element("td");
  idCell.append(element("time", "order-time", createdAt));
  idCell.append(element("code", "order-id", order.id.slice(0, 8).toUpperCase()));

  const customerCell = element("td");
  customerCell.append(element("strong", "customer-name", order.customer_name));
  customerCell.append(element("span", "customer-phone", order.phone));
  customerCell.append(element(
    "span",
    "customer-item",
    `${COLOR_LABELS[order.shirt_color]} / ${order.shirt_size} × ${order.quantity}`,
  ));

  const fulfillmentCell = element("td");
  fulfillmentCell.append(element(
    "strong",
    "",
    order.fulfillment === "pickup" ? "มารับเอง" : "จัดส่ง",
  ));
  if (order.address) fulfillmentCell.append(element("span", "address-text", order.address));

  const totalCell = element("td", "total-cell", `${order.total.toLocaleString("th-TH")} ฿`);
  const slipCell = element("td");
  const slipButton = element("button", "slip-button", "เปิดดูสลิป ↗");
  slipButton.type = "button";
  slipButton.addEventListener("click", async () => {
    slipButton.disabled = true;
    const slipWindow = window.open("about:blank", "_blank");
    try {
      if (!slipWindow) throw new Error("เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต popup แล้วลองอีกครั้ง");
      const { data, error } = await supabase.storage
        .from("payment-slips")
        .createSignedUrl(order.slip_path, 60);
      if (error) throw error;
      slipWindow.opener = null;
      slipWindow.location.href = data.signedUrl;
    } catch (error) {
      if (slipWindow) slipWindow.close();
      setMessage(dashboardMessage, `เปิดสลิปไม่สำเร็จ: ${error.message}`, true);
    } finally {
      slipButton.disabled = false;
    }
  });
  slipCell.append(slipButton);

  const statusCell = element("td");
  const statusEditor = element("div", "status-editor");
  const select = document.createElement("select");
  select.setAttribute("aria-label", `สถานะการชำระ ${order.customer_name}`);
  Object.entries(PAYMENT_LABELS).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === order.payment_status;
    select.append(option);
  });
  const saveButton = element("button", "save-status-button", "บันทึก");
  saveButton.type = "button";
  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    try {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: select.value })
        .eq("id", order.id);
      if (error) throw error;
      await loadOrders();
    } catch (error) {
      setMessage(dashboardMessage, `อัปเดตสถานะไม่สำเร็จ: ${error.message}`, true);
    } finally {
      saveButton.disabled = false;
    }
  });
  statusEditor.append(select, saveButton);
  statusCell.append(statusEditor);
  row.append(idCell, customerCell, fulfillmentCell, totalCell, slipCell, statusCell);
  return row;
}

function renderOrders() {
  const selectedStatus = statusFilter.value;
  const visibleOrders = selectedStatus === "all"
    ? orders
    : orders.filter((order) => order.payment_status === selectedStatus);
  orderRows.replaceChildren(...visibleOrders.map(makeOrderRow));
  emptyOrders.hidden = visibleOrders.length > 0;
}

async function loadSettings() {
  const { data, error } = await supabase
    .from("store_settings")
    .select("payment_qr_path, pickup_instructions")
    .eq("id", 1)
    .single();
  if (error) throw error;
  currentSettings = data;
  document.querySelector("#pickupInstructionsInput").value = data.pickup_instructions;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isSupabaseConfigured) {
    setMessage(loginMessage, "ยังไม่ได้ตั้งค่า Supabase — ดู README.md", true);
    return;
  }
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setMessage(loginMessage, "กำลังเข้าสู่ระบบ…");
  try {
    const formData = new FormData(loginForm);
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (error) throw error;
    if (!await checkAdminAccess()) {
      await supabase.auth.signOut();
      throw new Error("บัญชีนี้ไม่ได้รับสิทธิ์แอดมิน");
    }
    showDashboard();
    await Promise.all([loadOrders(), loadSettings()]);
  } catch (error) {
    showLogin(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#refreshButton").addEventListener("click", async () => {
  try {
    await loadOrders();
  } catch (error) {
    setMessage(dashboardMessage, `โหลดรายการไม่สำเร็จ: ${error.message}`, true);
  }
});

statusFilter.addEventListener("change", renderOrders);

signOutButton.addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    setMessage(dashboardMessage, `ออกจากระบบไม่สำเร็จ: ${error.message}`, true);
    return;
  }
  showLogin();
});

document.querySelector("#qrSettingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.querySelector("#storeQrUpload");
  const file = fileInput.files?.[0];
  if (!file || !MIME_EXTENSIONS[file.type] || file.size > MAX_FILE_BYTES) {
    setMessage(dashboardMessage, "เลือกภาพ QR PNG, JPG หรือ WEBP ขนาดไม่เกิน 5 MB ก่อน", true);
    return;
  }

  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;
  const path = `qr/${crypto.randomUUID()}.${MIME_EXTENSIONS[file.type]}`;
  let uploaded = false;
  try {
    const { error: uploadError } = await supabase.storage
      .from("store-assets")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    uploaded = true;

    const { error: updateError } = await supabase
      .from("store_settings")
      .update({ payment_qr_path: path, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (updateError) throw updateError;

    const oldPath = currentSettings?.payment_qr_path;
    currentSettings.payment_qr_path = path;
    if (oldPath && oldPath !== path) {
      const { error: cleanupError } = await supabase.storage.from("store-assets").remove([oldPath]);
      if (cleanupError) {
        setMessage(dashboardMessage, `เปลี่ยน QR แล้ว แต่ลบไฟล์เดิมไม่สำเร็จ: ${cleanupError.message}`, true);
        return;
      }
    }
    fileInput.value = "";
    setMessage(dashboardMessage, "บันทึก QR รับเงินเรียบร้อย");
  } catch (error) {
    let message = `บันทึก QR ไม่สำเร็จ: ${error.message}`;
    if (uploaded) {
      const { error: cleanupError } = await supabase.storage.from("store-assets").remove([path]);
      if (cleanupError) message += ` และลบไฟล์ที่อัปโหลดไม่สำเร็จ: ${cleanupError.message}`;
    }
    setMessage(dashboardMessage, message, true);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

document.querySelector("#pickupSettingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const instructions = document.querySelector("#pickupInstructionsInput").value.trim();
  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;
  try {
    const { error } = await supabase
      .from("store_settings")
      .update({ pickup_instructions: instructions, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;
    currentSettings.pickup_instructions = instructions;
    setMessage(dashboardMessage, "บันทึกรายละเอียดจุดรับเรียบร้อย");
  } catch (error) {
    setMessage(dashboardMessage, `บันทึกจุดรับไม่สำเร็จ: ${error.message}`, true);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

async function initializeAdmin() {
  if (!isSupabaseConfigured) {
    showLogin("ยังไม่ได้ตั้งค่า Supabase — ดู README.md", true);
    return;
  }
  try {
    if (await checkAdminAccess()) {
      showDashboard();
      await Promise.all([loadOrders(), loadSettings()]);
      return;
    }
    showLogin();
  } catch (error) {
    showLogin(`ตรวจสอบบัญชีแอดมินไม่สำเร็จ: ${error.message}`, true);
  }
}

initializeAdmin();
