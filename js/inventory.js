// js/inventory.js
import { db, auth, formatDecimal } from "./firebase.js";
import { ref, push, set, onValue, remove, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

export let allIngredients = {};
export let globalStockIn = [];
export let globalStockOut = [];

// -------------------------------------------------------------
// MODULE 2: INGREDIENTS
// -------------------------------------------------------------
const addIngredientForm = document.getElementById("addIngredientForm");
if (addIngredientForm) {
  addIngredientForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const newIng = {
      name: document.getElementById("ingName").value,
      category: document.getElementById("ingCategorySelect").value,
      quantity: parseFloat(document.getElementById("ingQty").value),
      minThreshold: parseFloat(document.getElementById("ingMin").value),
      expiryDate: document.getElementById("ingExpiry").value,
      unit: document.getElementById("ingUnit").value
    };

    push(ref(db, 'ingredients/'), newIng).then(() => {
      alert("Ingredient Saved!");
      addIngredientForm.reset();
    });
  });

  onValue(ref(db, 'ingredients/'), (snapshot) => {
    allIngredients = snapshot.exists() ? snapshot.val() : {};
    window.allIngredients = allIngredients; // Expose globally for cross-module use
    renderInventoryTable();
  });
}

const searchInput = document.getElementById("searchInput");
const filterCat = document.getElementById("filterCategorySelect");

if (searchInput) searchInput.addEventListener("input", renderInventoryTable);
if (filterCat) filterCat.addEventListener("change", renderInventoryTable);

// Make edit modal function globally available for HTML inline onclick handlers
window.openEditModal = function(key, name, qty, unit, min, expiry) {
  const editKey = document.getElementById("editKey");
  const editName = document.getElementById("editName");
  const editQty = document.getElementById("editQty");
  const editMin = document.getElementById("editMin");
  const editExpiry = document.getElementById("editExpiry");
  const editUnit = document.getElementById("editUnit");

  if (editKey) editKey.value = key;
  if (editName) editName.value = name;
  if (editQty) editQty.value = qty;
  if (editMin) editMin.value = min;
  if (editExpiry) editExpiry.value = expiry;
  if (editUnit) editUnit.value = unit;

  const editModalElement = document.getElementById('editModal');
  if (editModalElement && typeof bootstrap !== "undefined") {
    const modal = bootstrap.Modal.getInstance(editModalElement) || new bootstrap.Modal(editModalElement);
    modal.show();
  }
};

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

    const isLowStock = item.quantity <= item.minThreshold;
    const isAlmostLow = !isLowStock && (item.quantity <= (item.minThreshold * 1.2));

    let isExpired = false;
    let isExpiringSoon = false;
    
    if (item.expiryDate && item.quantity > 0) {
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0); 
      const expDate = new Date(item.expiryDate);
      const daysDiff = (expDate - todayDate) / (1000 * 60 * 60 * 24);
      
      if (daysDiff < 0) isExpired = true;
      else if (daysDiff >= 0 && daysDiff <= 7) isExpiringSoon = true;
    }

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
      if (isExpired) {
        quantityDisplay += `<br><small class="text-danger fw-bold">(${formatDecimal(item.quantity)} ${item.unit} Expired)</small>`;
      }

      const row = `
        <tr class="${isLowStock ? 'table-danger' : ''}">
          <td class="fw-bold">${item.name}</td>
          <td><span class="badge bg-secondary">${item.category}</span></td>
          <td class="fw-bold">${quantityDisplay}</td>
          <td>${formatDecimal(item.minThreshold)} ${item.unit}</td>
          <td>${item.expiryDate || 'N/A'}</td>
          <td>${statusBadges}</td>
          <td class="admin-only d-none">
            <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditModal('${key}', '${item.name}', ${item.quantity}, '${item.unit}', ${item.minThreshold}, '${item.expiryDate}')">Edit</button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteIngredient('${key}')">Delete</button>
          </td>
        </tr>`;

      if (tableBody) tableBody.innerHTML += row;
    }

    if (stockInSelect) stockInSelect.innerHTML += `<option value="${key}">${item.name}</option>`;
    if (stockOutSelect) stockOutSelect.innerHTML += `<option value="${key}">${item.name}</option>`;
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

  renderDashboardWidgets();
}

// -------------------------------------------------------------
// MODULE 3: CATEGORIES
// -------------------------------------------------------------
const addCategoryForm = document.getElementById("addCategoryForm");
if (addCategoryForm) {
  addCategoryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    push(ref(db, 'categories/'), { name: document.getElementById("catName").value }).then(() => {
      alert("Category Added!");
      addCategoryForm.reset();
    });
  });

  onValue(ref(db, 'categories/'), (snapshot) => {
    const listGroup = document.getElementById("categoryListGroup");
    const ingSelect = document.getElementById("ingCategorySelect");
    const filterSelect = document.getElementById("filterCategorySelect");

    if (listGroup) listGroup.innerHTML = "";
    if (ingSelect) ingSelect.innerHTML = `<option value="">Select Category</option>`;
    if (filterSelect) filterSelect.innerHTML = `<option value="">All Categories</option>`;

    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.keys(data).forEach((key) => {
        const cat = data[key];
        if (listGroup) listGroup.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center">${cat.name} <button class="btn btn-sm btn-outline-danger" onclick="deleteCategory('${key}')">Delete</button></li>`;
        if (ingSelect) ingSelect.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
        if (filterSelect) filterSelect.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
      });
    }
  });
}

// -------------------------------------------------------------
// MODULE 4: SUPPLIERS
// -------------------------------------------------------------
const addSupplierForm = document.getElementById("addSupplierForm");
if (addSupplierForm) {
  addSupplierForm.addEventListener("submit", (e) => {
    e.preventDefault();
    push(ref(db, 'suppliers/'), {
      name: document.getElementById("supName").value,
      contact: document.getElementById("supContact").value,
      phone: document.getElementById("supPhone").value,
      email: document.getElementById("supEmail").value
    }).then(() => {
      alert("Supplier Saved!");
      addSupplierForm.reset();
    });
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
// MODULE 5: STOCK IN (WITH STAFF APPROVAL WORKFLOW)
// -------------------------------------------------------------
const stockInForm = document.getElementById("stockInForm");
if (stockInForm) {
  stockInForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const ingKey = document.getElementById("stockInIngSelect").value;
    const addedQty = parseFloat(document.getElementById("stockInQty").value);
    const supplierName = document.getElementById("stockInSupSelect").value;
    const entryDate = document.getElementById("stockInDate").value;
    const newExpiryField = document.getElementById("stockInNewExpiry");
    const newExpiryDate = newExpiryField ? newExpiryField.value : "";

    get(ref(db, `ingredients/${ingKey}`)).then((snap) => {
      if (!snap.exists()) return;
      const item = snap.val();

      const payload = {
        ingredientKey: ingKey,
        ingredientName: item.name,
        addedQty: addedQty,
        unit: item.unit,
        supplier: supplierName,
        date: entryDate,
        newExpiryDate: newExpiryDate,
        submittedBy: auth.currentUser ? auth.currentUser.email : "Staff"
      };

      if (window.currentUserRole === "admin" || window.currentUserRole === "supervisor") {
        executeDirectStockIn(payload);
      } else {
        push(ref(db, 'pending_stock_in/'), payload).then(() => {
          alert("Stock In submitted for Admin verification.");
          stockInForm.reset();
          const today = new Date().toISOString().split("T")[0];
          document.getElementById("stockInDate").value = today;
        });
      }
    });
  });

  onValue(ref(db, 'stock_in/'), (snap) => {
    const table = document.getElementById("stockInTableBody");
    if (table) table.innerHTML = "";
    globalStockIn = [];
    if (snap.exists()) {
      Object.values(snap.val()).forEach((item) => {
        globalStockIn.push({...item, type: "IN"});
        if (table) table.innerHTML += `<tr><td>${item.date}</td><td class="fw-bold">${item.ingredientName}</td><td class="text-success fw-bold">+${item.addedQty} ${item.unit}</td><td>${item.supplier}</td></tr>`;
      });
    }
    renderDashboardWidgets();
  });
}

// Stock Out Listener to populate globalStockOut (Crucial for Forecast & Query Engine)
onValue(ref(db, 'stock_out/'), (snap) => {
  const table = document.getElementById("stockOutTableBody");
  if (table) table.innerHTML = "";
  
  globalStockOut = [];
  if (snap.exists()) {
    Object.values(snap.val()).forEach((item) => {
      globalStockOut.push({ ...item, type: "OUT" });
      if (table) {
        table.innerHTML += `<tr><td>${item.date}</td><td class="fw-bold">${item.ingredientName}</td><td class="text-danger fw-bold">-${item.deductedQty} ${item.unit}</td><td>${item.reason}</td></tr>`;
      }
    });
  }
  renderDashboardWidgets();
});

window.renderPendingStockCards = function() {
  const container = document.getElementById("pendingStockCard");
  const table = document.getElementById("pendingStockTableBody");
  const countBadge = document.getElementById("pendingStockCount");
  
  if (!container || !table) return;

  const role = window.currentUserRole;
  if (role !== "admin" && role !== "supervisor") {
    container.style.display = "none";
    return;
  }

  get(ref(db, 'pending_stock_in/')).then((snap) => {
    table.innerHTML = "";
    if (snap.exists()) {
      container.style.display = "block";
      const pendingData = snap.val();
      const keys = Object.keys(pendingData);
      if (countBadge) countBadge.textContent = `${keys.length} Pending`;

      keys.forEach(key => {
        const item = pendingData[key];
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

function executeDirectStockIn(payload) {
  const currentItem = allIngredients[payload.ingredientKey];
  const currentQty = currentItem?.quantity || 0;
  const currentExpiry = currentItem?.expiryDate;
  
  let ingredientUpdates = { 
    quantity: currentQty + payload.addedQty 
  };
  
  if (payload.newExpiryDate) {
    if (currentQty > 0 && currentExpiry) {
      const oldExp = new Date(currentExpiry).getTime();
      const newExp = new Date(payload.newExpiryDate).getTime();
      ingredientUpdates.expiryDate = (oldExp <= newExp) ? currentExpiry : payload.newExpiryDate;
    } else {
      ingredientUpdates.expiryDate = payload.newExpiryDate;
    }
  }

  update(ref(db, `ingredients/${payload.ingredientKey}`), ingredientUpdates);
  
  push(ref(db, 'stock_in/'), { 
    ingredientName: payload.ingredientName, 
    addedQty: payload.addedQty, 
    unit: payload.unit, 
    supplier: payload.supplier, 
    date: payload.date 
  }).then(() => { 
    alert("Stock In recorded successfully!"); 
    if (stockInForm) {
      stockInForm.reset(); 
      const today = new Date().toISOString().split("T")[0];
      const stockInDateElem = document.getElementById("stockInDate");
      if (stockInDateElem) stockInDateElem.value = today;
    }
  });
}

window.approvePendingStock = async function(key) {
  const snapshot = await get(ref(db, 'pending_stock_in/' + key));
  if (!snapshot.exists()) return;

  const item = snapshot.val();
  executeDirectStockIn(item);
  await remove(ref(db, 'pending_stock_in/' + key));
};

window.rejectPendingStock = async function(key) {
  if (confirm("Reject and delete this entry?")) {
    await remove(ref(db, 'pending_stock_in/' + key));
  }
};

// -------------------------------------------------------------
// DASHBOARD WIDGETS, REPORTS QUERY & FORECAST
// -------------------------------------------------------------
function renderDashboardWidgets() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const attentionTable = document.getElementById("attentionTableBody");
  let attentionHTML = "";
  
  Object.values(allIngredients).forEach(item => {
    const isLowStock = item.quantity <= item.minThreshold;
    let isExpired = false;
    
    if (item.expiryDate) {
      const expDate = new Date(item.expiryDate);
      if (expDate < today) isExpired = true;
    }

    if (isLowStock || isExpired) {
      let issueBadge = isExpired 
        ? `<span class="badge bg-warning text-dark">Expired</span>`
        : `<span class="badge bg-danger">Low Stock</span>`;
      
      let limitText = isExpired ? `Expired: ${item.expiryDate}` : `Min: ${item.minThreshold}`;

      attentionHTML += `
        <tr>
          <td class="fw-bold">${item.name}</td>
          <td>${issueBadge}</td>
          <td>${formatDecimal(item.quantity)} ${item.unit}</td>
          <td class="text-muted">${limitText}</td>
        </tr>`;
    }
  });
  
  if (!attentionHTML) {
    attentionHTML = `<tr><td colspan="4" class="text-center text-success py-3">✅ All systems normal!</td></tr>`;
  }
  if (attentionTable) attentionTable.innerHTML = attentionHTML;

  const categoryCounts = {};
  Object.values(allIngredients).forEach(item => {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  });

  const chartCanvas = document.getElementById('categoryChart');
  if (chartCanvas) {
    const ctx = chartCanvas.getContext('2d');
    if (window.inventoryChart) window.inventoryChart.destroy();
    
    window.inventoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(categoryCounts),
        datasets: [{
          data: Object.values(categoryCounts),
          backgroundColor: ['#0d6efd', '#ffc107', '#198754', '#dc3545', '#6c757d', '#0dcaf0'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  const forecastTable = document.getElementById("forecastTableBody");
  if (forecastTable) {
    let forecastHTML = "";
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usageStats = {};
    globalStockOut.forEach(tx => {
      const txDate = new Date(tx.date);
      if (txDate >= thirtyDaysAgo) {
        usageStats[tx.ingredientName] = (usageStats[tx.ingredientName] || 0) + parseFloat(tx.deductedQty || 0);
      }
    });

    Object.values(allIngredients).forEach(item => {
      const usedLast30Days = usageStats[item.name] || 0;
      
      if (usedLast30Days > 0 || item.quantity <= item.minThreshold) {
        const estimatedDemand = usedLast30Days > 0 ? (usedLast30Days * 1.1) : (item.minThreshold * 1.5);
        let toOrder = estimatedDemand - item.quantity;
        
        if (toOrder > 0) {
          forecastHTML += `
            <tr>
              <td class="fw-bold">${item.name}</td>
              <td>${item.category}</td>
              <td>${formatDecimal(usedLast30Days)} ${item.unit}</td>
              <td class="text-warning">${formatDecimal(item.quantity)} ${item.unit}</td>
              <td class="text-success fw-bold">+${formatDecimal(toOrder)} ${item.unit}</td>
            </tr>`;
        }
      }
    });

    if (forecastHTML === "") {
      forecastHTML = `<tr><td colspan="5" class="text-center text-muted py-3">Inventory levels are optimal. No bulk orders required right now.</td></tr>`;
    }
    forecastTable.innerHTML = forecastHTML;
  }

  populateQueryDropdown();
  window.runTransactionQuery();
}

// Global delete helpers
window.deleteCategory = (key) => { if (confirm("Delete this category?")) remove(ref(db, 'categories/' + key)); };
window.deleteIngredient = (key) => { if (confirm("Delete this ingredient?")) remove(ref(db, 'ingredients/' + key)); };
window.deleteSupplier = (key) => { if (confirm("Delete this supplier?")) remove(ref(db, 'suppliers/' + key)); };

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split("T")[0];
  const stockInDate = document.getElementById("stockInDate");
  const stockOutDate = document.getElementById("stockOutDate");
  
  if (stockInDate) stockInDate.value = today;
  if (stockOutDate) stockOutDate.value = today;
});

function populateQueryDropdown() {
  const dropdown = document.getElementById("queryIngredient");
  if (!dropdown) return;

  const currentSelection = dropdown.value;
  let options = '<option value="ALL">All Ingredients</option>';
  Object.values(allIngredients).forEach(item => {
    options += `<option value="${item.name}">${item.name}</option>`;
  });
  dropdown.innerHTML = options;
  if (currentSelection) dropdown.value = currentSelection;
}

function renderTransactionTable(records) {
  const table = document.getElementById("fullTransactionTableBody");
  const countBadge = document.getElementById("queryRecordCount");
  if (!table) return;

  if (countBadge) countBadge.textContent = `${records.length} records`;

  if (records.length === 0) {
    table.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No matching transactions found.</td></tr>`;
    return;
  }

  table.innerHTML = records.map(tx => {
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
}

window.runTransactionQuery = function() {
  const startDate = document.getElementById("queryStartDate")?.value;
  const endDate = document.getElementById("queryEndDate")?.value;
  const selectedType = document.getElementById("queryType")?.value || "ALL";
  const selectedItem = document.getElementById("queryIngredient")?.value || "ALL";

  const allRecords = [...globalStockIn, ...globalStockOut];
  allRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

  const filtered = allRecords.filter(tx => {
    const txDate = tx.date;
    const matchStart = !startDate || txDate >= startDate;
    const matchEnd = !endDate || txDate <= endDate;
    const matchType = (selectedType === "ALL") || tx.type === selectedType;
    const matchItem = (selectedItem === "ALL") || tx.ingredientName === selectedItem;

    return matchStart && matchEnd && matchType && matchItem;
  });

  renderTransactionTable(filtered);
};

// Handle Edit Form Submission
const editForm = document.getElementById("editForm");
if (editForm) {
  editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const key = document.getElementById("editKey").value;
    const updatedIng = {
      name: document.getElementById("editName").value,
      quantity: parseFloat(document.getElementById("editQty").value),
      minThreshold: parseFloat(document.getElementById("editMin").value),
      expiryDate: document.getElementById("editExpiry").value,
      unit: document.getElementById("editUnit").value
    };

    update(ref(db, `ingredients/${key}`), updatedIng).then(() => {
      alert("Ingredient updated successfully!");
      const editModalElement = document.getElementById('editModal');
      if (editModalElement && typeof bootstrap !== "undefined") {
        const activeEl = document.activeElement;
        if (editModalElement.contains(activeEl)) {
          activeEl.blur();
        }

        const modal = bootstrap.Modal.getInstance(editModalElement);
        if (modal) modal.hide();
      }
    }).catch(err => {
      alert("Error updating ingredient: " + err.message);
    });
  });
}

window.resetTransactionQuery = function() {
  if (document.getElementById("queryStartDate")) document.getElementById("queryStartDate").value = "";
  if (document.getElementById("queryEndDate")) document.getElementById("queryEndDate").value = "";
  if (document.getElementById("queryType")) document.getElementById("queryType").value = "ALL";
  if (document.getElementById("queryIngredient")) document.getElementById("queryIngredient").value = "ALL";
  window.runTransactionQuery();
};

document.getElementById("queryFilterBtn")?.addEventListener("click", window.runTransactionQuery);
document.getElementById("queryResetBtn")?.addEventListener("click", window.resetTransactionQuery);
// ==========================================
// BakeWise - Print Reporting Utilities
// ==========================================

// 1. Print Filtered Inventory & Transaction Report (with Donut Chart)
window.printFilteredReport = function() {
  const totalIngredients = document.getElementById("rptTotalItems")?.innerText || "0";
  const lowStock = document.getElementById("rptLowStock")?.innerText || "0";
  const expired = document.getElementById("rptExpired")?.innerText || "0";
  const suppliers = document.getElementById("rptSuppliers")?.innerText || "0";
  const recordCount = document.getElementById("queryRecordCount")?.innerText || "0";

  // Grab table rows and clean out action buttons
  let transactionRows = document.getElementById("fullTransactionTableBody")?.innerHTML || "";
  transactionRows = transactionRows.replace(/<button[\s\S]*?<\/button>/gi, '');

  // Capture Chart.js canvas as a base64 image string
  const chartCanvas = document.getElementById("inventoryStatusChart");
  let chartImageHtml = "";
  if (chartCanvas) {
    const chartImageSrc = chartCanvas.toDataURL("image/png");
    chartImageHtml = `
      <div style="text-align: center; margin: 20px 0;">
        <h3>Inventory Distribution Chart</h3>
        <img src="${chartImageSrc}" style="max-width: 320px; height: auto;" />
      </div>
    `;
  }

  const printWindow = window.open("", "_blank", "width=900,height=700");
  
  if (!printWindow) {
    alert("Pop-up blocked! Please allow pop-ups for this site to print reports.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>BakeWise - Inventory Summary Report</title>
      <style>
        body { font-family: 'Arial', sans-serif; padding: 20px; color: #2C241B; }
        .header { text-align: center; border-bottom: 2px solid #A05A35; padding-bottom: 10px; margin-bottom: 20px; }
        .header h1 { margin: 0; color: #A05A35; }
        .metrics { display: flex; justify-content: space-between; margin-bottom: 20px; text-align: center; }
        .metric-card { border: 1px solid #ccc; padding: 10px; width: 22%; border-radius: 5px; }
        .metric-card h3 { margin: 5px 0 0 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
        th { background-color: #F8F7F3; }
        .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #777; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>BakeWise Kitchen Management</h1>
        <h2>Inventory & Transaction Summary Report</h2>
        <p>Generated on: ${new Date().toLocaleString()}</p>
      </div>

      <div class="metrics">
        <div class="metric-card"><div>Total Items</div><h3>${totalIngredients}</h3></div>
        <div class="metric-card"><div>Low Stock</div><h3>${lowStock}</h3></div>
        <div class="metric-card"><div>Expired</div><h3>${expired}</h3></div>
        <div class="metric-card"><div>Suppliers</div><h3>${suppliers}</h3></div>
      </div>

      ${chartImageHtml}

      <h3>Filtered Transaction History (${recordCount})</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Ingredient</th>
            <th>Quantity</th>
            <th>Reason / Supplier</th>
          </tr>
        </thead>
        <tbody>
          ${transactionRows}
        </tbody>
      </table>

      <div class="footer">
        BakeWise Integrated Kitchen System &bull; Official Generated Report
      </div>
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 300);
};
