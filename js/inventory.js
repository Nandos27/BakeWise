// js/inventory.js
import { db, auth, formatDecimal } from "./firebase.js";
import { ref, push, set, onValue, remove, update, get, query, orderByChild } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { logAuditEvent } from "./audit.js";

// ========== BRAND + PDF HELPERS ==========
const BRAND = {
  primary:   [160, 90, 53],
  primaryLt: [252, 244, 238],
  ink:       [44, 36, 27],
  muted:     [120, 110, 100],
  rule:      [220, 210, 200],
  ok:        [22, 163, 74],
  warn:      [217, 119, 6],
  danger:    [220, 38, 38],
  white:     [255, 255, 255]
};

const BRAND_NAME = "BakeWise";
const BRAND_TAGLINE = "Bakery Ingredient & Material Tracker";

function bakeWiseDocHeader(doc, subtitle) {
  const pageW = doc.internal.pageSize.width;
  const margin = 14;

  doc.setFont("times", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...BRAND.primary);
  doc.text(BRAND_NAME, margin, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.muted);
  doc.text(subtitle, margin, 27);

  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
  const ref = "RPT-" + Math.floor(100000 + Math.random() * 900000);

  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  doc.text(`Ref: ${ref}`, pageW - margin, 18, { align: "right" });
  doc.text(`Generated: ${now}`, pageW - margin, 23, { align: "right" });

  doc.setDrawColor(...BRAND.primary);
  doc.setLineWidth(0.7);
  doc.line(margin, 32, pageW - margin, 32);

  return 38;
}

function bakeWiseDocFooter(doc, note) {
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;
  const margin = 14;

  doc.setDrawColor(...BRAND.rule);
  doc.setLineWidth(0.3);
  doc.line(margin, pageH - 18, pageW - margin, pageH - 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  doc.text(note || `${BRAND_TAGLINE} • System-generated report`, margin, pageH - 12);
  doc.text("Page 1 of 1", pageW - margin, pageH - 12, { align: "right" });
}

function bakeWiseAutoTableTheme() {
  return {
    theme: 'grid',
    headStyles: {
      fillColor: BRAND.primary,
      textColor: BRAND.white,
      fontSize: 9,
      fontStyle: 'bold',
      lineColor: BRAND.primary,
      lineWidth: 0.2
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: BRAND.ink,
      lineColor: BRAND.rule,
      lineWidth: 0.15
    },
    alternateRowStyles: { fillColor: BRAND.primaryLt },
    styles: { cellPadding: 2 },
    margin: { left: 14, right: 14, bottom: 24 }
  };
}

function bakeWiseMultiPageFooter(doc) {
  return (data) => {
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const margin = 14;
    const total = doc.internal.getNumberOfPages();

    doc.setDrawColor(...BRAND.rule);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 18, pageW - margin, pageH - 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(`${BRAND_TAGLINE} • System-generated report`, margin, pageH - 12);
    doc.text(`Page ${data.pageNumber} of ${total}`, pageW - margin, pageH - 12, { align: "right" });
  };
}

function bakeWiseSavePdf(doc, filename) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isIOS) {
    // iOS: open in new tab, never revoke — WebKit needs the blob alive
    window.open(url, '_blank');
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoke on next interaction, or after 60s as a fallback — whichever first
  const cleanup = () => {
    URL.revokeObjectURL(url);
    window.removeEventListener('click', cleanup);
    window.removeEventListener('touchstart', cleanup);
  };
  window.addEventListener('click', cleanup, { once: true });
  window.addEventListener('touchstart', cleanup, { once: true });
  setTimeout(cleanup, 60000);
}

function emptyStateHTML(message, icon = "bi-inbox") {
  return `
    <tr>
      <td colspan="20" class="text-center py-5 text-muted">
        <i class="bi ${icon}" style="font-size: 2rem; opacity: 0.4;"></i>
        <div class="mt-2 small">${message}</div>
      </td>
    </tr>`;
}

// ========== SHARED PAGINATION HELPER ==========
function paginate({ list, pagerId, perPage, currentPage, onPageChange }) {
  const pagerEl = document.getElementById(pagerId);
  if (!pagerEl) return;
  const total = list.length;
  if (total === 0) { pagerEl.innerHTML = ""; return; }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(Math.max(currentPage, 1), totalPages);
  const start = (p - 1) * perPage;
  const end = Math.min(start + perPage, total);

  pagerEl.innerHTML = `
    <div class="d-flex justify-content-between align-items-center small text-muted mt-2 px-1 flex-wrap gap-2">
      <div class="d-flex align-items-center gap-2">
        <span>Showing ${start + 1}–${end} of ${total}</span>
        <select class="form-select form-select-sm" style="width:auto;" data-pp="${pagerId}">
          <option value="10"  ${perPage===10 ?"selected":""}>10 / page</option>
          <option value="20"  ${perPage===20 ?"selected":""}>20 / page</option>
          <option value="50"  ${perPage===50 ?"selected":""}>50 / page</option>
          <option value="100" ${perPage===100?"selected":""}>100 / page</option>
        </select>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-sm btn-outline-secondary" data-nav="prev" ${p===1?"disabled":""}>
          <i class="bi bi-chevron-left"></i>
        </button>
        <span>Page ${p} / ${totalPages}</span>
        <button class="btn btn-sm btn-outline-secondary" data-nav="next" ${p===totalPages?"disabled":""}>
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>`;

  pagerEl.querySelector("select[data-pp]")?.addEventListener("change", (e) => {
    onPageChange({ page: 1, perPage: parseInt(e.target.value, 10) });
  });
  pagerEl.querySelector('[data-nav="prev"]')?.addEventListener("click", () => onPageChange({ page: p - 1 }));
  pagerEl.querySelector('[data-nav="next"]')?.addEventListener("click", () => onPageChange({ page: p + 1 }));
}

// ========== END HELPERS ==========

export { BRAND, BRAND_NAME, BRAND_TAGLINE, bakeWiseDocHeader, bakeWiseDocFooter, bakeWiseAutoTableTheme, bakeWiseMultiPageFooter, bakeWiseSavePdf, paginate };
export let allIngredients = {};
export let globalStockIn = [];
export let globalStockOut = [];

// ========== REUSABLE BUTTON LOADING STATE ==========
window.setBtnLoading = function(btn, text = "Saving...") {
  if (!btn) return;
  btn.dataset.originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${text}`;
};

window.resetBtn = function(btn) {
  if (!btn) return;
  btn.disabled = false;
  if (btn.dataset.originalHtml) {
    btn.innerHTML = btn.dataset.originalHtml;
    delete btn.dataset.originalHtml;
  }
};
// ========== END LOADING STATE ==========

// -------------------------------------------------------------
// BATCH & EXPIRY FUNCTIONS
// -------------------------------------------------------------
function getItemBatches(item) {
  if (Array.isArray(item.batches) && item.batches.length > 0) {
    return item.batches;
  }
  if (item.expiryDate && item.quantity > 0) {
    return [{ qty: parseFloat(item.quantity) || 0, expiryDate: item.expiryDate }];
  }
  return [{ qty: parseFloat(item.quantity) || 0, expiryDate: "" }];
}

function calculateItemStockDetails(item) {
  const batches = getItemBatches(item);
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  let totalQty = 0;
  let expiredQty = 0;
  let expiringSoonQty = 0;
  let validQty = 0;
  let validExpiries = [];

  batches.forEach(b => {
    const bQty = parseFloat(b.qty) || 0;
    totalQty += bQty;

    if (bQty > 0 && b.expiryDate) {
      let parts = b.expiryDate.split(/[-/]/);
      let expDate;
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          expDate = new Date(parts[0], parts[1] - 1, parts[2]);
        } else {
          expDate = new Date(parts[2], parts[1] - 1, parts[0]);
        }
      } else {
        expDate = new Date(b.expiryDate);
      }

      if (!isNaN(expDate.getTime())) {
        const daysDiff = (expDate - todayDate) / (1000 * 60 * 60 * 24);
        if (daysDiff < 0) {
          expiredQty += bQty;
        } else {
          validQty += bQty;
          validExpiries.push(b.expiryDate);
          if (daysDiff <= 7) {
            expiringSoonQty += bQty;
          }
        }
      } else {
        validQty += bQty;
      }
    } else if (bQty > 0) {
      validQty += bQty;
    }
  });

  let displayExpiry = item.expiryDate || "N/A";
  if (validExpiries.length > 0) {
    validExpiries.sort((a, b) => new Date(a) - new Date(b));
    displayExpiry = validExpiries[0];
  }

  return {
    totalQty,
    validQty,
    expiredQty,
    expiringSoonQty,
    isExpired: expiredQty > 0,
    isExpiringSoon: expiringSoonQty > 0 && expiredQty === 0,
    displayExpiry,
    batches
  };
}

function toIsoDateString(rawDate) {
  if (!rawDate) return "";
  let parts = rawDate.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return rawDate;
}

// -------------------------------------------------------------
// MODULE 2: INGREDIENTS
// -------------------------------------------------------------
const addIngredientForm = document.getElementById("addIngredientForm");
if (addIngredientForm) {
  addIngredientForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = addIngredientForm.querySelector("button[type=submit]");
    setBtnLoading(btn, "Adding...");
    try {
      const ingName = document.getElementById("ingName").value;
      const qty = parseFloat(document.getElementById("ingQty").value);
      const unit = document.getElementById("ingUnit").value;
      const expDate = toIsoDateString(document.getElementById("ingExpiry").value);

      const newIng = {
        name: ingName,
        category: document.getElementById("ingCategorySelect").value,
        quantity: qty,
        minThreshold: parseFloat(document.getElementById("ingMin").value),
        expiryDate: expDate,
        unit: unit,
        batches: [{ qty: qty, expiryDate: expDate }]
      };

      await push(ref(db, 'ingredients/'), newIng);
      await logAuditEvent("Add Ingredient", `Created new ingredient: ${ingName} (${qty} ${unit})`);
      alert("Ingredient Saved!");
      addIngredientForm.reset();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      resetBtn(btn);
    }
  });

  onValue(ref(db, 'ingredients/'), (snapshot) => {
    allIngredients = snapshot.exists() ? snapshot.val() : {};
    window.allIngredients = allIngredients; 
    renderInventoryTable();
    renderDashboardWidgets();
    populateQueryDropdown();
  });
}

const searchInput = document.getElementById("searchInput");
const filterCat = document.getElementById("filterCategorySelect");

if (searchInput) searchInput.addEventListener("input", renderInventoryTable);
if (filterCat) filterCat.addEventListener("change", renderInventoryTable);

window.openEditModal = function(key) {
  const item = allIngredients[key];
  if (!item) return;

  const editKey = document.getElementById("editKey");
  const editName = document.getElementById("editName");
  const editQty = document.getElementById("editQty");
  const editMin = document.getElementById("editMin");
  const editExpiry = document.getElementById("editExpiry");
  const editUnit = document.getElementById("editUnit");

  if (editKey) editKey.value = key;
  if (editName) editName.value = item.name || "";
  if (editQty) editQty.value = item.quantity || 0;
  if (editMin) editMin.value = item.minThreshold || 0;
  if (editExpiry) editExpiry.value = toIsoDateString(item.expiryDate);
  if (editUnit) editUnit.value = item.unit || "kg";

  const editModalElement = document.getElementById('editModal');
  if (editModalElement && typeof bootstrap !== "undefined") {
    const modal = bootstrap.Modal.getInstance(editModalElement) || new bootstrap.Modal(editModalElement);
    modal.show();
  }
};

const editForm = document.getElementById("editForm");
if (editForm) {
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = document.getElementById("editKey").value;
    if (!key) return;

    const btn = editForm.querySelector("button[type=submit]");
    setBtnLoading(btn, "Updating...");
    try {
      const existingItem = allIngredients[key] || {};
      const newName = document.getElementById("editName").value;
      const newQty = parseFloat(document.getElementById("editQty").value);
      const newUnit = document.getElementById("editUnit").value;
      const newExp = toIsoDateString(document.getElementById("editExpiry").value);

      const updatedData = {
        name: newName,
        category: existingItem.category || "",
        quantity: newQty,
        minThreshold: parseFloat(document.getElementById("editMin").value),
        expiryDate: newExp,
        unit: newUnit,
        batches: [{ qty: newQty, expiryDate: newExp }]
      };

      await update(ref(db, `ingredients/${key}`), updatedData);
      await logAuditEvent("Edit Ingredient", `Updated ingredient details for: ${newName} (Qty: ${newQty} ${newUnit}, Exp: ${newExp})`);
      alert("Ingredient updated successfully!");
      const editModalElement = document.getElementById('editModal');
      if (editModalElement && typeof bootstrap !== "undefined") {
        const modal = bootstrap.Modal.getInstance(editModalElement);
        if (modal) modal.hide();
      }
    } catch (err) {
      alert("Error updating ingredient: " + err.message);
    } finally {
      resetBtn(btn);
    }
  });
}

function renderInventoryTable() {
  const tableBody = document.getElementById("inventoryTableBody");
  const stockInSelect = document.getElementById("stockInIngSelect");
  const stockOutSelect = document.getElementById("stockOutIngSelect");

  if (tableBody) tableBody.innerHTML = "";
  if (stockInSelect) stockInSelect.innerHTML = `<option value="">Select Ingredient</option>`;
  if (stockOutSelect) stockOutSelect.innerHTML = `<option value="">Select Ingredient</option>`;

  const searchVal = searchInput ? searchInput.value.toLowerCase() : "";
  const catVal = filterCat ? filterCat.value : "";

  let totalItems = 0, lowStockCount = 0, expiredCount = 0;

  Object.keys(allIngredients).forEach((key) => {
    const item = allIngredients[key];
    totalItems++;

    const matchesSearch = item.name.toLowerCase().includes(searchVal);
    const matchesCategory = catVal === "" || item.category === catVal;

    const {
      totalQty,
      validQty,
      expiredQty,
      expiringSoonQty,
      isExpired,
      isExpiringSoon,
      displayExpiry
    } = calculateItemStockDetails(item);

    const isLowStock = validQty <= item.minThreshold;
    const isAlmostLow = !isLowStock && (validQty <= (item.minThreshold * 1.2));

    if (isLowStock) lowStockCount++;
    if (isExpired) expiredCount++;

    if (matchesSearch && matchesCategory) {
      let statusBadges = "";
      if (isLowStock) statusBadges += `<span class="badge bg-danger me-1">Low Stock</span>`;
      else if (isAlmostLow) statusBadges += `<span class="badge bg-warning text-dark me-1">Almost Low</span>`;
      if (isExpired) statusBadges += `<span class="badge bg-danger me-1">Expired</span>`;
      else if (isExpiringSoon) statusBadges += `<span class="badge bg-warning text-dark me-1">Expiring Soon</span>`;
      
      if (!isLowStock && !isAlmostLow && !isExpired && !isExpiringSoon) {
        statusBadges = `<span class="badge bg-success">OK</span>`;
      }

      let quantityDisplay = `${formatDecimal(item.quantity)} ${item.unit}`;
      if (expiredQty > 0) {
        quantityDisplay += `<br><small class="text-danger fw-bold">(${formatDecimal(expiredQty)} ${item.unit} Expired)</small>`;
      }

      const row = `
        <tr class="${isLowStock ? 'table-danger' : ''}">
          <td class="fw-bold">${item.name}</td>
          <td><span class="badge bg-secondary">${item.category}</span></td>
          <td class="fw-bold">${quantityDisplay}</td>
          <td>${formatDecimal(item.minThreshold)} ${item.unit}</td>
          <td>${displayExpiry || 'N/A'}</td>
          <td>${statusBadges}</td>
          <td class="admin-only d-none">
            <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditModal('${key}')">Edit</button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteIngredient('${key}')">Delete</button>
          </td>
        </tr>`;

      if (tableBody) tableBody.innerHTML += row;
    }

    if (stockInSelect) stockInSelect.innerHTML += `<option value="${key}">${item.name} (${item.unit || 'unit'})</option>`;
    if (stockOutSelect) stockOutSelect.innerHTML += `<option value="${key}">${item.name} (${item.unit || 'unit'})</option>`;
  });

  if (document.getElementById("rptTotalItems")) document.getElementById("rptTotalItems").innerText = totalItems;
  if (document.getElementById("rptLowStock")) document.getElementById("rptLowStock").innerText = lowStockCount;
  if (document.getElementById("rptExpired")) document.getElementById("rptExpired").innerText = expiredCount;

  if (auth.currentUser) {
    get(ref(db, `users/${auth.currentUser.uid}`)).then((snap) => {
      if (snap.exists() && (snap.val().role === 'supervisor' || snap.val().role === 'admin')) {
        document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("d-none"));
      }
    });
  }
}

// -------------------------------------------------------------
// MODULE 3: CATEGORIES & SUPPLIERS
// -------------------------------------------------------------
const addCategoryForm = document.getElementById("addCategoryForm");
if (addCategoryForm) {
  addCategoryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = addCategoryForm.querySelector("button[type=submit]");
    setBtnLoading(btn, "Adding...");
    try {
      const catName = document.getElementById("catName").value;
      await push(ref(db, 'categories/'), { name: catName });
      await logAuditEvent("Add Category", `Created category: ${catName}`);
      alert("Category Added!");
      addCategoryForm.reset();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      resetBtn(btn);
    }
  });

  onValue(ref(db, 'categories/'), (snapshot) => {
    const listGroup = document.getElementById("categoryListGroup");
    const ingSelect = document.getElementById("ingCategorySelect");
    const filterSelect = document.getElementById("filterCategorySelect");
    const queryCatSelect = document.getElementById("queryCategory");

    if (listGroup) listGroup.innerHTML = "";
    if (ingSelect) ingSelect.innerHTML = `<option value="">Select Category</option>`;
    if (filterSelect) filterSelect.innerHTML = `<option value="">All Categories</option>`;
    
    const currentQueryCat = queryCatSelect ? queryCatSelect.value : "ALL";
    if (queryCatSelect) queryCatSelect.innerHTML = `<option value="ALL">All Categories</option>`;

    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.keys(data).forEach((key) => {
        const cat = data[key];
        if (listGroup) listGroup.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center">${cat.name} <button class="btn btn-sm btn-outline-danger" onclick="deleteCategory('${key}')">Delete</button></li>`;
        if (ingSelect) ingSelect.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
        if (filterSelect) filterSelect.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
        if (queryCatSelect) queryCatSelect.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
      });
      if (queryCatSelect) queryCatSelect.value = currentQueryCat;
    }
  });
}

const addSupplierForm = document.getElementById("addSupplierForm");
if (addSupplierForm) {
  addSupplierForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = addSupplierForm.querySelector("button[type=submit]");
    setBtnLoading(btn, "Adding...");
    try {
      const supName = document.getElementById("supName").value;
      await push(ref(db, 'suppliers/'), {
        name: supName,
        contact: document.getElementById("supContact").value,
        phone: document.getElementById("supPhone").value,
        email: document.getElementById("supEmail").value
      });
      await logAuditEvent("Add Supplier", `Saved supplier: ${supName}`);
      alert("Supplier Saved!");
      addSupplierForm.reset();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      resetBtn(btn);
    }
  });

  onValue(ref(db, 'suppliers/'), (snapshot) => {
    const supTable = document.getElementById("supplierTableBody");
    const stockInSupSelect = document.getElementById("stockInSupSelect");

    if (supTable) supTable.innerHTML = "";
    if (stockInSupSelect) stockInSupSelect.innerHTML = `<option value="">Select Supplier</option>`;

    let count = 0;
    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.keys(data).forEach((key) => {
        count++;
        const item = data[key];
        if (supTable) supTable.innerHTML += `<tr><td class="fw-bold">${item.name}</td><td>${item.contact}</td><td>${item.email || 'N/A'}</td><td>${item.phone}</td><td><button class="btn btn-sm btn-outline-danger" onclick="deleteSupplier('${key}')">Delete</button></td></tr>`;
        if (stockInSupSelect) stockInSupSelect.innerHTML += `<option value="${item.name}" data-email="${item.email || ''}">${item.name}</option>`;
      });
    }
    if (document.getElementById("rptSuppliers")) document.getElementById("rptSuppliers").innerText = count;
  });
}

// -------------------------------------------------------------
// STOCK IN / STOCK OUT LISTENERS WITH AUDIT LOGGING
// -------------------------------------------------------------
const stockInForm = document.getElementById("stockInForm");
if (stockInForm) {
  stockInForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = stockInForm.querySelector("button[type=submit]");
    setBtnLoading(btn, "Adding...");
    try {
      
    const ingKey = document.getElementById("stockInIngSelect").value;
    const addedQty = parseFloat(document.getElementById("stockInQty").value);
    const supplier = document.getElementById("stockInSupSelect").value;
    const entryDate = document.getElementById("stockInDate").value;
    const newExpiry = document.getElementById("stockInNewExpiry").value;

    if (!ingKey || isNaN(addedQty) || addedQty <= 0) {
      alert("Please select an ingredient and enter a valid quantity.");
      return;
    }

    const item = allIngredients[ingKey];
    if (!item) { alert("Ingredient not found."); return; }

    const payload = {
      ingredientKey: ingKey,
      ingredientName: item.name,
      addedQty: addedQty,
      unit: item.unit,
      supplier: supplier || "Direct Stock In",
      date: entryDate,
      newExpiry: newExpiry ? toIsoDateString(newExpiry) : (item.expiryDate || ""),
      submittedBy: auth.currentUser ? auth.currentUser.email : "Staff",
      submittedAt: new Date().toISOString(),
      status: "pending"
    };

    if (window.currentUserRole !== "admin" && window.currentUserRole !== "supervisor") {
      try {
        await push(ref(db, 'pending_stock_in/'), payload);
        await logAuditEvent("Stock In (Pending)", `Submitted +${addedQty} ${item.unit} of ${item.name} for approval`);
        alert("Stock In submitted for Admin verification.");
        stockInForm.reset();
        const todayStr = new Date().toISOString().split("T")[0];
        const d = document.getElementById("stockInDate");
        if (d) d.value = todayStr;
      } catch (err) {
        alert("Error submitting: " + err.message);
      }
      return;
    }

    await executeDirectStockIn(payload);
      } finally {
    resetBtn(btn);
  }
  });
}

async function executeDirectStockIn(payload, approverEmail) {
  try {
    const item = allIngredients[payload.ingredientKey];
    if (!item) { alert("Ingredient not found."); return; }

    const currentQty = parseFloat(item.quantity || 0);
    const newQty = currentQty + payload.addedQty;
    const expDateStr = payload.newExpiry || item.expiryDate || "";

    let existingBatches = getItemBatches(item);
    const matchingBatch = existingBatches.find(b => toIsoDateString(b.expiryDate) === expDateStr);

    if (matchingBatch) {
      matchingBatch.qty = (parseFloat(matchingBatch.qty) || 0) + payload.addedQty;
    } else {
      existingBatches.push({ qty: payload.addedQty, expiryDate: expDateStr });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validBatches = existingBatches.filter(b => b.qty > 0 && new Date(b.expiryDate) >= today);
    let primaryExpiry = item.expiryDate;
    if (validBatches.length > 0) {
      validBatches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
      primaryExpiry = validBatches[0].expiryDate;
    } else if (payload.newExpiry) {
      primaryExpiry = toIsoDateString(payload.newExpiry);
    }

    await update(ref(db, `ingredients/${payload.ingredientKey}`), {
      quantity: newQty,
      expiryDate: primaryExpiry,
      batches: existingBatches
    });

    await push(ref(db, 'stock_in/'), {
      ingredientName: item.name,
      addedQty: payload.addedQty,
      unit: item.unit,
      supplier: payload.supplier,
      date: payload.date,
      newExpiry: expDateStr || "N/A"
    });

    if (approverEmail) {
      await logAuditEvent(
        "Stock In (Approved)",
        `Approved +${payload.addedQty} ${item.unit} of ${item.name} (Submitted by: ${payload.submittedBy || "Staff"}, Approved by: ${approverEmail})`
      );
    } else {
      await logAuditEvent(
        "Stock In",
        `Added +${payload.addedQty} ${item.unit} of ${item.name} (Supplier: ${payload.supplier})`
      );
    }
    
    alert("Stock In recorded successfully!");
    if (stockInForm) {
      stockInForm.reset();
      const todayStr = new Date().toISOString().split("T")[0];
      const d = document.getElementById("stockInDate");
      if (d) d.value = todayStr;
    }
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// -------------------------------------------------------------
// PENDING STOCK-IN APPROVALS (admin/supervisor only)
// -------------------------------------------------------------
window.renderPendingStockCards = function() {
  const container = document.getElementById("pendingStockCard");
  const table = document.getElementById("pendingStockTableBody");
  const countBadge = document.getElementById("pendingStockCount");
  if (!container || !table) return;

  if (window.currentUserRole !== "admin" && window.currentUserRole !== "supervisor") {
    container.style.display = "none";
    return;
  }

  get(ref(db, 'pending_stock_in/')).then((snap) => {
    table.innerHTML = "";
    if (snap.exists()) {
      container.style.display = "block";
      const data = snap.val();
      const keys = Object.keys(data);
      if (countBadge) countBadge.textContent = `${keys.length} Pending`;

      keys.forEach(key => {
        const item = data[key];
        table.innerHTML += `
          <tr>
            <td>${item.date || "-"}</td>
            <td><small class="text-secondary">${item.submittedBy || "Staff"}</small></td>
            <td class="fw-bold">${item.ingredientName}</td>
            <td class="text-success fw-bold">+${item.addedQty} ${item.unit}</td>
            <td>${item.supplier || "-"}</td>
            <td class="text-end">
              <button class="btn btn-sm btn-success py-1 px-2 me-1" onclick="approvePendingStock('${key}')">Approve</button>
              <button class="btn btn-sm btn-outline-danger py-1 px-2" onclick="rejectPendingStock('${key}')">Reject</button>
            </td>
          </tr>`;
      });
    } else {
      container.style.display = "none";
    }
  });
};

onValue(ref(db, 'pending_stock_in/'), () => {
  if (window.currentUserRole === "admin" || window.currentUserRole === "supervisor") {
    window.renderPendingStockCards();
  }
});

window.approvePendingStock = async function(key) {
  const snap = await get(ref(db, 'pending_stock_in/' + key));
  if (!snap.exists()) return;
  const item = snap.val();
  const approver = auth.currentUser ? auth.currentUser.email : "Unknown";
  await executeDirectStockIn(item, approver);
  await remove(ref(db, 'pending_stock_in/' + key));
  window.renderPendingStockCards();
};

window.rejectPendingStock = async function(key) {
  const snap = await get(ref(db, 'pending_stock_in/' + key));
  if (!snap.exists()) return;
  const item = snap.val();

  if (!confirm(`Reject ${item.addedQty} ${item.unit} of ${item.ingredientName} submitted by ${item.submittedBy}?`)) return;

  const rejecter = auth.currentUser ? auth.currentUser.email : "Unknown";
  await logAuditEvent(
    "Stock In (Rejected)",
    `Rejected +${item.addedQty} ${item.unit} of ${item.ingredientName} (Submitted by: ${item.submittedBy || "Staff"}, Rejected by: ${rejecter})`
  );
  await remove(ref(db, 'pending_stock_in/' + key));
  window.renderPendingStockCards();
};

if (typeof window.currentUserRole === "undefined") {
  window.currentUserRole = "kitchen_staff";
}

const stockOutForm = document.getElementById("stockOutForm");
if (stockOutForm) {
  stockOutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = stockOutForm.querySelector("button[type=submit]");
    setBtnLoading(btn, "Deducting...");
    try {
      const ingKey = document.getElementById("stockOutIngSelect").value;
      const deductedQty = parseFloat(document.getElementById("stockOutQty").value);
      const reason = document.getElementById("stockOutReason").value;
      const useDate = document.getElementById("stockOutDate").value;

      if (!ingKey || isNaN(deductedQty) || deductedQty <= 0) {
        alert("Please select an ingredient and enter a valid quantity.");
        return;
      }

      const snap = await get(ref(db, `ingredients/${ingKey}`));
      if (!snap.exists()) {
        alert("Selected ingredient not found in database.");
        return;
      }

      const item = snap.val();
      const currentQty = parseFloat(item.quantity || 0);

      if (deductedQty > currentQty) {
        alert(`Cannot deduct ${deductedQty} ${item.unit}. Only ${currentQty} ${item.unit} available.`);
        return;
      }

      const newQty = currentQty - deductedQty;

      await update(ref(db, `ingredients/${ingKey}`), { quantity: newQty });
      await push(ref(db, 'stock_out/'), {
        ingredientName: item.name,
        deductedQty: deductedQty,
        unit: item.unit,
        reason: reason || "General Use",
        date: useDate
      });
      await logAuditEvent("Stock Out", `Deducted -${deductedQty} ${item.unit} of ${item.name} (Reason: ${reason})`);
      alert("Stock Out recorded successfully!");
      stockOutForm.reset();
      const todayStr = new Date().toISOString().split("T")[0];
      const d = document.getElementById("stockOutDate");
      if (d) d.value = todayStr;
    } catch (err) {
      alert("Error processing Stock Out: " + err.message);
    } finally {
      resetBtn(btn);
    }
  });
}

let stockInFullList = [];
let stockInPage = 1;
let stockInPerPage = 20;

function renderStockInHistory() {
  const table = document.getElementById("stockInTableBody");
  if (!table) return;
  const total = stockInFullList.length;
  if (total === 0) {
    table.innerHTML = emptyStateHTML("No stock-in records yet. Record your first stock-in to see it here.", "bi-box-arrow-in-down");
    const p = document.getElementById("stockInPager");
    if (p) p.innerHTML = "";
    return;
  }
  const start = (stockInPage - 1) * stockInPerPage;
  const slice = stockInFullList.slice(start, start + stockInPerPage);
  table.innerHTML = slice.map(item => `
    <tr>
      <td>${item.date}</td>
      <td class="fw-bold">${item.ingredientName}</td>
      <td class="text-success fw-bold">+${item.addedQty} ${item.unit}</td>
      <td>${item.supplier}</td>
    </tr>`).join("");

  paginate({
    list: stockInFullList,
    pagerId: "stockInPager",
    perPage: stockInPerPage,
    currentPage: stockInPage,
    onPageChange: ({ page, perPage }) => {
      if (page) stockInPage = page;
      if (perPage) { stockInPerPage = perPage; stockInPage = 1; }
      renderStockInHistory();
    }
  });
}

onValue(ref(db, 'stock_in/'), (snap) => {
  stockInFullList = [];
  if (snap.exists()) {
    Object.values(snap.val())
      .map(i => ({ ...i, type: "IN" }))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach(item => stockInFullList.push(item));
  }
  globalStockIn = stockInFullList;
  stockInPage = 1;
  renderStockInHistory();
  renderDashboardWidgets();
});

let stockOutFullList = [];
let stockOutPage = 1;
let stockOutPerPage = 20;

function renderStockOutHistory() {
  const table = document.getElementById("stockOutTableBody");
  if (!table) return;
  const total = stockOutFullList.length;
  if (total === 0) {
    table.innerHTML = emptyStateHTML("No stock-out records yet. Bake a batch or deduct stock to see activity here.", "bi-box-arrow-up");    const p = document.getElementById("stockOutPager");
    if (p) p.innerHTML = "";
    return;
  }
  const start = (stockOutPage - 1) * stockOutPerPage;
  const slice = stockOutFullList.slice(start, start + stockOutPerPage);
  table.innerHTML = slice.map(item => `
    <tr>
      <td>${item.date}</td>
      <td class="fw-bold">${item.ingredientName}</td>
      <td class="text-danger fw-bold">-${item.deductedQty} ${item.unit}</td>
      <td>${item.reason}</td>
    </tr>`).join("");

  paginate({
    list: stockOutFullList,
    pagerId: "stockOutPager",
    perPage: stockOutPerPage,
    currentPage: stockOutPage,
    onPageChange: ({ page, perPage }) => {
      if (page) stockOutPage = page;
      if (perPage) { stockOutPerPage = perPage; stockOutPage = 1; }
      renderStockOutHistory();
    }
  });
}

onValue(ref(db, 'stock_out/'), (snap) => {
  stockOutFullList = [];
  if (snap.exists()) {
    Object.values(snap.val())
      .map(i => ({ ...i, type: "OUT" }))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach(item => stockOutFullList.push(item));
  }
  globalStockOut = stockOutFullList;
  stockOutPage = 1;
  renderStockOutHistory();
  renderDashboardWidgets();
});

// -------------------------------------------------------------
// TRANSACTION QUERY & REPORT RENDERING
// -------------------------------------------------------------
function populateQueryDropdown() {
  const dropdown = document.getElementById("queryIngredient");
  if (!dropdown) return;

  const currentSelection = dropdown.value;
  const selectedCategory = document.getElementById("queryCategory")?.value || "ALL";

  let options = '<option value="ALL">All Ingredients</option>';
  Object.values(allIngredients).forEach(item => {
    if (selectedCategory === "ALL" || item.category === selectedCategory) {
      options += `<option value="${item.name}">${item.name}</option>`;
    }
  });
  dropdown.innerHTML = options;
  if (currentSelection) dropdown.value = currentSelection;
}

let txCurrentPage = 1;
let TX_PER_PAGE = 20;
let txFullList = [];

function renderTransactionTable(records) {
  txFullList = records;
  txCurrentPage = 1;

  const countBadge = document.getElementById("queryRecordCount");
  if (countBadge) countBadge.textContent = `${records.length} records`;

  renderTxPage();
}

function renderTxPage() {
  const table = document.getElementById("fullTransactionTableBody");
  const pager = document.getElementById("txPager");
  if (!table) return;

  const total = txFullList.length;

  if (total === 0) {
    table.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No matching transactions found.</td></tr>`;
    if (pager) pager.innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(total / TX_PER_PAGE));
  if (txCurrentPage > totalPages) txCurrentPage = totalPages;
  if (txCurrentPage < 1) txCurrentPage = 1;

  const start = (txCurrentPage - 1) * TX_PER_PAGE;
  const end = Math.min(start + TX_PER_PAGE, total);
  const slice = txFullList.slice(start, end);

  table.innerHTML = slice.map(tx => {
    const isStockIn = tx.type === "IN";
    const badge = isStockIn
      ? '<span class="badge bg-success">Stock In</span>'
      : '<span class="badge bg-danger">Stock Out</span>';
    const qtyDisplay = isStockIn
      ? `<span class="text-success fw-bold">+${formatDecimal(tx.addedQty)} ${tx.unit}</span>`
      : `<span class="text-danger fw-bold">-${formatDecimal(tx.deductedQty)} ${tx.unit}</span>`;
    const detail = tx.supplier || tx.reason || "-";

    return `
      <tr>
        <td>${tx.date || "-"}</td>
        <td>${badge}</td>
        <td class="fw-bold">${tx.ingredientName}</td>
        <td>${qtyDisplay}</td>
        <td>${detail}</td>
      </tr>`;
  }).join("");

  if (pager) {
    pager.innerHTML = `
      <div class="d-flex justify-content-between align-items-center small text-muted mt-2 px-1 flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2">
          <span>Showing ${start + 1}–${end} of ${total}</span>
          <select class="form-select form-select-sm" style="width: auto;"
                  onchange="window.txSetPerPage(this.value)">
            <option value="10"  ${TX_PER_PAGE === 10  ? "selected" : ""}>10 / page</option>
            <option value="20"  ${TX_PER_PAGE === 20  ? "selected" : ""}>20 / page</option>
            <option value="50"  ${TX_PER_PAGE === 50  ? "selected" : ""}>50 / page</option>
            <option value="100" ${TX_PER_PAGE === 100 ? "selected" : ""}>100 / page</option>
          </select>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-sm btn-outline-secondary"
                  ${txCurrentPage === 1 ? "disabled" : ""}
                  onclick="window.txPrevPage()">
            <i class="bi bi-chevron-left"></i>
          </button>
          <span>Page ${txCurrentPage} / ${totalPages}</span>
          <button class="btn btn-sm btn-outline-secondary"
                  ${txCurrentPage === totalPages ? "disabled" : ""}
                  onclick="window.txNextPage()">
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>`;
  }
}

window.txPrevPage = function () {
  if (txCurrentPage > 1) {
    txCurrentPage--;
    renderTxPage();
  }
};

window.txNextPage = function () {
  const totalPages = Math.max(1, Math.ceil(txFullList.length / TX_PER_PAGE));
  if (txCurrentPage < totalPages) {
    txCurrentPage++;
    renderTxPage();
  }
};

window.txSetPerPage = function (value) {
  const n = parseInt(value, 10);
  if (!isNaN(n) && n > 0) {
    TX_PER_PAGE = n;
    txCurrentPage = 1;
    renderTxPage();
  }
};

window.runTransactionQuery = function() {
  const startDate = document.getElementById("queryStartDate")?.value;
  const endDate = document.getElementById("queryEndDate")?.value;
  const selectedType = document.getElementById("queryType")?.value || "ALL";
  const selectedItem = document.getElementById("queryIngredient")?.value || "ALL";
  const selectedCategory = document.getElementById("queryCategory")?.value || "ALL";

  const allRecords = [...globalStockIn, ...globalStockOut];
  allRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredTransactions = allRecords.filter(tx => {
    const txDate = tx.date;
    const matchStart = !startDate || txDate >= startDate;
    const matchEnd = !endDate || txDate <= endDate;
    const matchType = (selectedType === "ALL") || tx.type === selectedType;
    const matchItem = (selectedItem === "ALL") || tx.ingredientName === selectedItem;

    let matchCategory = true;
    if (selectedCategory !== "ALL") {
      const matchedIngKey = Object.keys(allIngredients).find(k => allIngredients[k].name === tx.ingredientName);
      if (matchedIngKey) {
        matchCategory = allIngredients[matchedIngKey].category === selectedCategory;
      } else {
        matchCategory = false;
      }
    }

    return matchStart && matchEnd && matchType && matchItem && matchCategory;
  });

  renderTransactionTable(filteredTransactions);

  let dynamicTotalItems = 0;
  let dynamicLowStock = 0;
  let dynamicExpired = 0;
  let attentionHTML = "";

  Object.keys(allIngredients).forEach(ingKey => {
    const item = allIngredients[ingKey];
    const matchesCategory = (selectedCategory === "ALL") || (item.category === selectedCategory);
    const matchesItemName = (selectedItem === "ALL") || (item.name === selectedItem);

    if (matchesCategory && matchesItemName) {
      dynamicTotalItems++;

      const { expiredQty, validQty, isExpired } = calculateItemStockDetails(item);
      const isLowStock = validQty <= item.minThreshold;

      if (isLowStock) dynamicLowStock++;
      if (isExpired) dynamicExpired++;

      if (isLowStock || isExpired) {
        let issueBadge = "";
          if (isExpired) issueBadge += `<span class="badge bg-warning text-dark me-1">Expired</span>`;
          if (isLowStock) issueBadge += `<span class="badge bg-danger">Low Stock</span>`;
        
        let limitText = isExpired ? `Expired Qty: ${formatDecimal(expiredQty)} ${item.unit}` : `Min: ${item.minThreshold}`;

        const actionHtml = isExpired 
          ? `<button type="button" class="btn btn-sm btn-outline-danger btn-dispose-expired" data-id="${ingKey}" data-qty="${expiredQty}">
               <i class="bi bi-trash3-fill me-1"></i>Dispose
             </button>`
          : `<span class="text-muted small">N/A</span>`;

        attentionHTML += `
          <tr>
            <td class="fw-bold">${item.name}</td>
            <td>${issueBadge}</td>
            <td>${formatDecimal(item.quantity)} ${item.unit}</td>
            <td class="text-muted">${limitText}</td>
            <td class="text-end">${actionHtml}</td>
          </tr>`;
      }
    }
  });

  if (!attentionHTML) {
    attentionHTML = `<tr><td colspan="5" class="text-center text-success py-3">✅ All systems normal for this selection!</td></tr>`;
  }

  const attentionCount = dynamicLowStock + dynamicExpired;
  const badge = document.getElementById("attentionCountBadge");
  if (badge) {
    badge.textContent = attentionCount;
    badge.style.display = attentionCount > 0 ? "" : "none";
  }

  if (document.getElementById("rptTotalItems")) document.getElementById("rptTotalItems").innerText = dynamicTotalItems;
  if (document.getElementById("rptLowStock")) document.getElementById("rptLowStock").innerText = dynamicLowStock;
  if (document.getElementById("rptExpired")) document.getElementById("rptExpired").innerText = dynamicExpired;
  
  const attentionTable = document.getElementById("attentionTableBody");
  if (attentionTable) attentionTable.innerHTML = attentionHTML;

  let dynamicCategoryCounts = {};
  filteredTransactions.forEach(tx => {
    const matchedIngKey = Object.keys(allIngredients).find(k => allIngredients[k].name === tx.ingredientName);
    if (matchedIngKey) {
      const cat = allIngredients[matchedIngKey].category || "Uncategorized";
      dynamicCategoryCounts[cat] = (dynamicCategoryCounts[cat] || 0) + 1;
    }
  });

  if (Object.keys(dynamicCategoryCounts).length === 0) {
    Object.values(allIngredients).forEach(item => {
      if (selectedCategory === "ALL" || item.category === selectedCategory) {
        dynamicCategoryCounts[item.category] = (dynamicCategoryCounts[item.category] || 0) + 1;
      }
    });
  }

  const chartCanvas = document.getElementById('categoryChart');
  if (chartCanvas && typeof Chart !== "undefined") {
    const ctx = chartCanvas.getContext('2d');
    if (window.inventoryChart) window.inventoryChart.destroy();
    
    const labelsWithValues = Object.keys(dynamicCategoryCounts).map(cat => `${cat} (${dynamicCategoryCounts[cat]})`);

    window.inventoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labelsWithValues,
        datasets: [{
          data: Object.values(dynamicCategoryCounts),
          backgroundColor: ['#7A6A5A', '#A89376', '#5C6B5A', '#8B7355', '#C9B8A0', '#4A5A5A'],
          borderColor: '#FFFFFF',
          borderWidth: 2
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }
};

// ==========================================
// EXPIRED ITEM DISPOSAL HANDLER
// ==========================================
async function disposeExpiredItem(ingKey, disposeQty) {
  if (!ingKey || isNaN(disposeQty) || disposeQty <= 0) {
    alert("Invalid item key or disposal quantity.");
    return;
  }

  const targetIngredient = allIngredients[ingKey];
  if (!targetIngredient) {
    alert("Ingredient not found in system memory.");
    return;
  }

  if (!confirm(`Are you sure you want to dispose ${formatDecimal(disposeQty)} ${targetIngredient.unit} of expired ${targetIngredient.name}?`)) {
    return;
  }

  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let existingBatches = getItemBatches(targetIngredient);
    let updatedBatches = existingBatches.filter(b => {
      if (!b.expiryDate) return true;
      let exp = new Date(b.expiryDate);
      return exp >= today;
    });

    let newTotalQty = updatedBatches.reduce((acc, b) => acc + (parseFloat(b.qty) || 0), 0);
    let primaryExpiry = updatedBatches.length > 0 ? updatedBatches[0].expiryDate : targetIngredient.expiryDate;

    const stockOutRecord = {
      ingredientName: targetIngredient.name,
      deductedQty: parseFloat(disposeQty),
      unit: targetIngredient.unit || "unit",
      reason: "Expired",
      date: todayStr
    };

    await push(ref(db, 'stock_out/'), stockOutRecord);
    await update(ref(db, `ingredients/${ingKey}`), {
      quantity: newTotalQty,
      expiryDate: primaryExpiry,
      batches: updatedBatches
    });

    await logAuditEvent("Dispose Expired", `Disposed ${disposeQty} ${targetIngredient.unit} of expired ${targetIngredient.name}`);
    alert(`Successfully disposed ${targetIngredient.name}. Transaction recorded as 'Expired'.`);
    renderDashboardWidgets();

  } catch (error) {
    console.error("Error disposing expired stock:", error);
    alert("Failed to dispose expired stock: " + error.message);
  }
}

document.addEventListener("click", function (e) {
  const btn = e.target.closest(".btn-dispose-expired");
  if (btn) {
    const ingKey = btn.getAttribute("data-id");
    const qty = parseFloat(btn.getAttribute("data-qty"));

    if (ingKey && !isNaN(qty)) {
      disposeExpiredItem(ingKey, qty);
    }
  }
});

// -------------------------------------------------------------
// FORECAST TABLE RENDERER
// -------------------------------------------------------------
export function renderForecastTable() {
  const forecastTableBody = document.getElementById("forecastTableBody");
  if (!forecastTableBody) return;

  forecastTableBody.innerHTML = "";

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let usageMap = {};
  globalStockOut.forEach(tx => {
    if (tx.date && new Date(tx.date) >= thirtyDaysAgo) {
      const qty = parseFloat(tx.deductedQty || 0);
      usageMap[tx.ingredientName] = (usageMap[tx.ingredientName] || 0) + qty;
    }
  });

  let rowsHtml = "";
  Object.values(allIngredients).forEach(item => {
    const monthlyUsage = usageMap[item.name] || 0;
    let suggestedOrder = (monthlyUsage * 1.1) - item.quantity;
    if (suggestedOrder < 0) suggestedOrder = 0;

    rowsHtml += `
      <tr>
        <td class="fw-bold">${item.name}</td>
        <td><span class="badge bg-secondary">${item.category || 'General'}</span></td>
        <td>${formatDecimal(monthlyUsage)} ${item.unit}</td>
        <td>${formatDecimal(item.quantity)} ${item.unit}</td>
        <td class="fw-bold text-success">${formatDecimal(suggestedOrder)} ${item.unit}</td>
      </tr>
    `;
  });

  if (!rowsHtml) {
    rowsHtml = `<tr><td colspan="5" class="text-center text-muted py-3">No ingredient data available for forecasting.</td></tr>`;
  }

  forecastTableBody.innerHTML = rowsHtml;
}

export function renderDashboardWidgets() {
  window.runTransactionQuery();
  renderForecastTable();
}

window.deleteCategory = (key) => { 
  const name = allIngredients[key]?.name || key;
  if (confirm("Delete this category?")) {
    remove(ref(db, 'categories/' + key)).then(async () => {
      await logAuditEvent("Delete Category", `Removed category key: ${key}`);
    });
  }
};

window.deleteIngredient = (key) => { 
  const name = allIngredients[key]?.name || key;
  if (confirm("Delete this ingredient?")) {
    remove(ref(db, 'ingredients/' + key)).then(async () => {
      await logAuditEvent("Delete Ingredient", `Deleted ingredient: ${name}`);
    });
  }
};

window.deleteSupplier = (key) => { 
  if (confirm("Delete this supplier?")) {
    remove(ref(db, 'suppliers/' + key)).then(async () => {
      await logAuditEvent("Delete Supplier", `Removed supplier key: ${key}`);
    });
  }
};

window.resetTransactionQuery = function() {
  if (document.getElementById("queryStartDate")) document.getElementById("queryStartDate").value = "";
  if (document.getElementById("queryEndDate")) document.getElementById("queryEndDate").value = "";
  if (document.getElementById("queryType")) document.getElementById("queryType").value = "ALL";
  if (document.getElementById("queryIngredient")) document.getElementById("queryIngredient").value = "ALL";
  if (document.getElementById("queryCategory")) document.getElementById("queryCategory").value = "ALL";
  window.runTransactionQuery();
};

document.getElementById("queryFilterBtn")?.addEventListener("click", window.runTransactionQuery);
document.getElementById("queryResetBtn")?.addEventListener("click", window.resetTransactionQuery);
document.getElementById("queryCategory")?.addEventListener("change", populateQueryDropdown);

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split("T")[0];
  if (document.getElementById("stockInDate")) document.getElementById("stockInDate").value = today;
  if (document.getElementById("stockOutDate")) document.getElementById("stockOutDate").value = today;

  const queryCatElem = document.getElementById("queryCategory");
  if (queryCatElem) {
    queryCatElem.addEventListener("change", populateQueryDropdown);
  }

  const forecastTabEl = document.querySelector('button[data-bs-target="#mod-forecast"]');
  if (forecastTabEl) {
    forecastTabEl.addEventListener('shown.bs.tab', () => {
      renderForecastTable();
    });
  }
});

window.printForecastReport = function() {
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { alert("jsPDF library missing!"); return; }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const usageMap = {};
  globalStockOut.forEach(tx => {
    if (tx.date && new Date(tx.date) >= thirtyDaysAgo) {
      const qty = parseFloat(tx.deductedQty || 0);
      usageMap[tx.ingredientName] = (usageMap[tx.ingredientName] || 0) + qty;
    }
  });

  const rows = Object.values(allIngredients).map(item => {
    const monthlyUsage = usageMap[item.name] || 0;
    let suggestedOrder = (monthlyUsage * 1.1) - item.quantity;
    if (suggestedOrder < 0) suggestedOrder = 0;
    return [
      item.name,
      item.category || "General",
      `${formatDecimal(monthlyUsage)} ${item.unit}`,
      `${formatDecimal(item.quantity)} ${item.unit}`,
      `${formatDecimal(suggestedOrder)} ${item.unit}`
    ];
  });

  const doc = new jsPDFCtor('p', 'mm', 'a4');
  const startY = bakeWiseDocHeader(doc, "30-Day Purchase Order & Forecast Report");

  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND.ink);
  doc.text("BakeWise - 30-Day Purchase Order", 14, startY + 4);

  const body = rows.length ? rows : [["-", "-", "No data available.", "-", "-"]];

  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      startY: startY + 9,
      head: [['Ingredient', 'Category', '30-Day Usage', 'Current Stock', 'Suggested Order (+10%)']],
      body: body,
      ...bakeWiseAutoTableTheme(),
      didDrawPage: bakeWiseMultiPageFooter(doc)
    });
  } else {
    let y = startY + 12;
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.ink);
    body.forEach(r => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(r.join("  |  ").substring(0, 110), 14, y);
      y += 6;
    });
    bakeWiseDocFooter(doc, `${BRAND_TAGLINE} • Official Generated Forecast`);
  }

  bakeWiseSavePdf(doc, 'BakeWise_Forecast_Report.pdf');
};

window.printDetailedReport = function() {
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { alert("jsPDF library missing!"); return; }

  const startDate = document.getElementById("queryStartDate")?.value;
  const endDate = document.getElementById("queryEndDate")?.value;
  const selectedType = document.getElementById("queryType")?.value || "ALL";
  const selectedItem = document.getElementById("queryIngredient")?.value || "ALL";
  const selectedCategory = document.getElementById("queryCategory")?.value || "ALL";

  const allRecords = [...globalStockIn, ...globalStockOut];
  allRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredTransactions = allRecords.filter(tx => {
    const matchStart = !startDate || tx.date >= startDate;
    const matchEnd = !endDate || tx.date <= endDate;
    const matchType = (selectedType === "ALL") || tx.type === selectedType;
    const matchItem = (selectedItem === "ALL") || tx.ingredientName === selectedItem;
    let matchCategory = true;
    if (selectedCategory !== "ALL") {
      const matchedIngKey = Object.keys(allIngredients).find(k => allIngredients[k].name === tx.ingredientName);
      matchCategory = matchedIngKey ? allIngredients[matchedIngKey].category === selectedCategory : false;
    }
    return matchStart && matchEnd && matchType && matchItem && matchCategory;
  });

  const doc = new jsPDFCtor('p', 'mm', 'a4');
  const startY = bakeWiseDocHeader(doc, "Itemized Inventory Audit & Ledger");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.primary);
  doc.text(`${filteredTransactions.length} Records`, 14, startY + 2);

  const body = filteredTransactions.length
    ? filteredTransactions.map(tx => [
        tx.date || "-",
        tx.type === "IN" ? "Stock In" : "Stock Out",
        tx.ingredientName,
        (tx.type === "IN" ? "+" : "-") + (tx.type === "IN" ? tx.addedQty : tx.deductedQty) + " " + (tx.unit || ""),
        tx.supplier || tx.reason || "-"
      ])
    : [["-", "-", "No transactions found.", "-", "-"]];

  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      startY: startY + 6,
      head: [['Date', 'Type', 'Ingredient', 'Qty', 'Reason / Supplier']],
      body: body,
      ...bakeWiseAutoTableTheme(),
      didDrawPage: bakeWiseMultiPageFooter(doc)
    });
  } else {
    let y = startY + 10;
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.ink);
    body.forEach(r => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(r.join("  |  ").substring(0, 110), 14, y);
      y += 6;
    });
    bakeWiseDocFooter(doc);
  }

  bakeWiseSavePdf(doc, 'BakeWise_Detailed_Transaction_Report.pdf');
};

window.printSummaryReport = function() {
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { alert("jsPDF library missing!"); return; }

  const totalIngredients = document.getElementById("rptTotalItems")?.innerText || "0";
  const lowStock = document.getElementById("rptLowStock")?.innerText || "0";
  const expired = document.getElementById("rptExpired")?.innerText || "0";
  const suppliers = document.getElementById("rptSuppliers")?.innerText || "0";
  const attentionCount = document.getElementById("attentionCountBadge")?.innerText || "0";

  const doc = new jsPDFCtor('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.width;
  const margin = 14;

  const startY = bakeWiseDocHeader(doc, "Executive Inventory & Operations Summary");

  // ---- Metric boxes ----
  const boxY = startY + 4;
  const boxH = 22;
  const gap = 4;
  const boxW = (pageW - margin * 2 - gap * 3) / 4;
  const labels = ["TOTAL ITEMS", "LOW STOCK", "EXPIRED ITEMS", "ACTIVE SUPPLIERS"];
  const values = [totalIngredients, lowStock, expired, suppliers];
  const colors = [BRAND.primary, BRAND.danger, BRAND.warn, BRAND.ok];

  labels.forEach((label, i) => {
    const x = margin + i * (boxW + gap);
    doc.setFillColor(...colors[i]);
    doc.rect(x, boxY, boxW, 1.2, 'F');
    doc.setDrawColor(...BRAND.rule);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, boxY + 1.2, boxW, boxH - 1.2, 1, 1, 'S');

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(label, x + boxW / 2, boxY + 8, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...colors[i]);
    doc.text(String(values[i]), x + boxW / 2, boxY + 18, { align: "center" });
  });

  // ---- Attention alert strip ----
  let catBoxY = boxY + boxH + 12;

  if (attentionCount !== "0" && attentionCount !== "") {
    const alertY = boxY + boxH + 4;
    const alertH = 10;

    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, alertY, pageW - margin * 2, alertH, 1.5, 1.5, 'FD');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(185, 28, 28);
    doc.text(
      `${attentionCount} item${attentionCount === "1" ? "" : "s"} require immediate attention.`,
      margin + 8,
      alertY + 6.5
    );

    catBoxY += 12;
  }

  // ---- Category breakdown ----
  const catBoxH = 95;

  doc.setDrawColor(...BRAND.rule);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, catBoxY, pageW - margin * 2, catBoxH, 2, 2, 'S');

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.primary);
  doc.text("CATEGORY BREAKDOWN VISUAL ANALYSIS", margin + 6, catBoxY + 8);

  const chartCanvas = document.getElementById("categoryChart");
  if (chartCanvas) {
    try {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = chartCanvas.width;
      tempCanvas.height = chartCanvas.height;
      const ctx = tempCanvas.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      ctx.drawImage(chartCanvas, 0, 0);
      const chartDataUrl = tempCanvas.toDataURL("image/png");

      const chartImgW = 75;
      const chartImgH = chartImgW * (chartCanvas.height / chartCanvas.width);
      const chartX = (pageW - chartImgW) / 2;
      const chartY = catBoxY + 15;

      doc.addImage(chartDataUrl, 'PNG', chartX, chartY, chartImgW, chartImgH, undefined, 'FAST');
    } catch (e) {
      console.error("Chart capture failed:", e);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.muted);
      doc.text("Chart unavailable.", pageW / 2, catBoxY + 40, { align: "center" });
    }
  }

  bakeWiseDocFooter(doc, `${BRAND_TAGLINE} • Confidential`);
  bakeWiseSavePdf(doc, 'BakeWise_Executive_Summary.pdf');
};
