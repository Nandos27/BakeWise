// js/inventory.js
import { db, auth, formatDecimal } from "./firebase.js";
import { ref, push, set, onValue, remove, update, get, query, orderByChild } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
    window.allIngredients = allIngredients; 
    renderInventoryTable();
  });
}

const searchInput = document.getElementById("searchInput");
const filterCat = document.getElementById("filterCategorySelect");

if (searchInput) searchInput.addEventListener("input", renderInventoryTable);
if (filterCat) filterCat.addEventListener("change", renderInventoryTable);

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

  renderDashboardWidgets();
}

// -------------------------------------------------------------
// MODULE 3: CATEGORIES & SUPPLIERS
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
// STOCK IN FORM HANDLER (ADDED & FIXED)
// -------------------------------------------------------------
const stockInForm = document.getElementById("stockInForm");
if (stockInForm) {
  stockInForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const ingKey = document.getElementById("stockInIngSelect").value;
    const addedQty = parseFloat(document.getElementById("stockInQty").value);
    const supplier = document.getElementById("stockInSupSelect").value;
    const entryDate = document.getElementById("stockInDate").value;

    if (!ingKey || isNaN(addedQty) || addedQty <= 0) {
      alert("Please select an ingredient and enter a valid quantity.");
      return;
    }

    get(ref(db, `ingredients/${ingKey}`)).then((snap) => {
      if (!snap.exists()) {
        alert("Selected ingredient not found in database.");
        return;
      }

      const item = snap.val();
      const currentQty = parseFloat(item.quantity || 0);
      const newQty = currentQty + addedQty;

      update(ref(db, `ingredients/${ingKey}`), { quantity: newQty })
        .then(() => {
          return push(ref(db, 'stock_in/'), {
            ingredientName: item.name,
            addedQty: addedQty,
            unit: item.unit,
            supplier: supplier || "Direct Stock In",
            date: entryDate
          });
        })
        .then(() => {
          alert("Stock In recorded and inventory updated successfully!");
          stockInForm.reset();
          const today = new Date().toISOString().split("T")[0];
          const stockInDateElem = document.getElementById("stockInDate");
          if (stockInDateElem) stockInDateElem.value = today;
        })
        .catch((err) => {
          alert("Error processing Stock In: " + err.message);
        });
    });
  });
}

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
  const selectedCategory = document.getElementById("queryCategory")?.value || "ALL";

  // 1. Filter Transactions Table
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

  // 2. Make Top Metrics & Attention Table Dynamic
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dynamicTotalItems = 0;
  let dynamicLowStock = 0;
  let dynamicExpired = 0;
  let attentionHTML = "";

  Object.values(allIngredients).forEach(item => {
    const matchesCategory = (selectedCategory === "ALL") || (item.category === selectedCategory);
    const matchesItemName = (selectedItem === "ALL") || (item.name === selectedItem);

    if (matchesCategory && matchesItemName) {
      dynamicTotalItems++;

      const isLowStock = item.quantity <= item.minThreshold;
      let isExpired = false;
      
      if (item.expiryDate) {
        const expDate = new Date(item.expiryDate);
        if (expDate < today) isExpired = true;
      }

      if (isLowStock) dynamicLowStock++;
      if (isExpired) dynamicExpired++;

      if (isLowStock || isExpired) {
        let issueBadge = isExpired 
          ? `<span class="badge bg-warning text-dark">Expired</span>`
          : `<span class="badge bg-danger">Low Stock</span>`;
        
        let limitText = isExpired ? `Expired: ${item.expiryDate}` : `Min: ${item.minThreshold}`;

        // Generate Dispose button for expired items
        const actionHtml = isExpired 
          ? `<button type="button" class="btn btn-sm btn-outline-danger btn-dispose-expired" data-id="${item.id || item.ingredientId}" data-qty="${item.quantity}">
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

  if (document.getElementById("rptTotalItems")) document.getElementById("rptTotalItems").innerText = dynamicTotalItems;
  if (document.getElementById("rptLowStock")) document.getElementById("rptLowStock").innerText = dynamicLowStock;
  if (document.getElementById("rptExpired")) document.getElementById("rptExpired").innerText = dynamicExpired;
  
  const attentionTable = document.getElementById("attentionTableBody");
  if (attentionTable) attentionTable.innerHTML = attentionHTML;

  // 3. Dynamic Chart Update
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
  if (chartCanvas) {
    const ctx = chartCanvas.getContext('2d');
    if (window.inventoryChart) window.inventoryChart.destroy();
    
    const labelsWithValues = Object.keys(dynamicCategoryCounts).map(cat => {
      return `${cat} (${dynamicCategoryCounts[cat]})`;
    });

    window.inventoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labelsWithValues,
        datasets: [{
          data: Object.values(dynamicCategoryCounts),
          backgroundColor: ['#0d6efd', '#ffc107', '#198754', '#dc3545', '#6c757d', '#0dcaf0'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'bottom',
            labels: {
              boxWidth: 12,
              font: { size: 11 }
            }
          }
        }
      }
    });
  }
};

// -------------------------------------------------------------
// FORECAST TABLE RENDERER
// -------------------------------------------------------------
function renderForecastTable() {
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

function renderDashboardWidgets() {
  window.runTransactionQuery();
  renderForecastTable();
}

// Global delete helpers
window.deleteCategory = (key) => { if (confirm("Delete this category?")) remove(ref(db, 'categories/' + key)); };
window.deleteIngredient = (key) => { if (confirm("Delete this ingredient?")) remove(ref(db, 'ingredients/' + key)); };
window.deleteSupplier = (key) => { if (confirm("Delete this supplier?")) remove(ref(db, 'suppliers/' + key)); };

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
});

window.printForecastReport = function() {
  const printArea = document.getElementById("printArea");
  if (!printArea) return;

  const originalContents = document.body.innerHTML;
  const printContents = printArea.innerHTML;

  document.body.innerHTML = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #2C241B;">
      <div style="text-align: center; border-bottom: 2px solid #A05A35; padding-bottom: 10px; margin-bottom: 15px;">
        <h1 style="margin: 0; color: #A05A35; font-size: 22px;">BakeWise Kitchen Management</h1>
        <h2 style="margin: 5px 0 0 0; font-size: 15px; color: #555;">30-Day Purchase Order & Forecast Report</h2>
      </div>
      ${printContents}
      <div style="margin-top: 25px; text-align: center; font-size: 10px; color: #888;">
        BakeWise Integrated Kitchen System &bull; Official Generated Forecast
      </div>
    </div>
  `;

  window.print();
  document.body.innerHTML = originalContents;
  window.location.reload();
};

// High-resolution PDF Options Configuration
const getHighResPdfOptions = (filename) => ({
  margin:       10,
  filename:     filename,
  image:        { type: 'jpeg', quality: 0.98 },
  html2canvas:  { scale: 3, logging: false, useCORS: true }, // Higher scale prevents blurry scan look
  jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
});

// High-resolution PDF Options Configuration
const getPdfConfig = (filename) => ({
  margin:       [12, 12, 12, 12],
  filename:     filename,
  image:        { type: 'jpeg', quality: 0.98 },
  html2canvas:  { scale: 2.5, logging: false, useCORS: true },
  jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
});

// Helper for professional PDF Header Block
const generatePdfHeader = (reportTitle, reportSubtitle) => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const reportRef = "RPT-" + Math.floor(100000 + Math.random() * 900000);

  return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <h1 style="margin: 0; color: #1e3a8a; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">BAKEWISE KITCHEN MANAGEMENT</h1>
          <p style="margin: 3px 0 0 0; font-size: 13px; color: #475569; font-weight: 600;">${reportTitle}</p>
        </div>
        <div style="text-align: right; font-size: 10px; color: #64748b; line-height: 1.4;">
          <div><strong>Report Ref:</strong> ${reportRef}</div>
          <div><strong>Generated:</strong> ${currentDate}</div>
          <div><strong>Scope:</strong> Operational Audit</div>
        </div>
      </div>
    </div>
  `;
};

// 1. Formal Executive Summary PDF Generation
window.printSummaryReport = function() {
  if (typeof html2pdf === "undefined") {
    alert("PDF library is missing! Check your script imports in dashboard.html.");
    return;
  }

  try {
    const totalIngredients = document.getElementById("rptTotalItems")?.innerText || "0";
    const lowStock = document.getElementById("rptLowStock")?.innerText || "0";
    const expired = document.getElementById("rptExpired")?.innerText || "0";
    const suppliers = document.getElementById("rptSuppliers")?.innerText || "0";

    let chartImgHtml = "";
    const chartCanvas = document.getElementById("categoryChart");

    if (chartCanvas) {
      try {
        const chartDataUrl = chartCanvas.toDataURL("image/png");
        chartImgHtml = `
          <div style="margin-top: 25px; padding: 15px; border: 1px solid #e2e8f0; border-radius: 6px; background-color: #ffffff;">
            <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
              Category Breakdown Visual Analysis
            </div>
            <div style="text-align: center;">
              <img src="${chartDataUrl}" style="max-width: 260px; height: auto;" />
            </div>
          </div>
        `;
      } catch (err) {
        console.warn("Unable to capture canvas image for PDF:", err);
      }
    }

    const container = document.createElement("div");
    container.innerHTML = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 10px; color: #0f172a; background: #ffffff;">
        ${generatePdfHeader("Executive Inventory & Operations Summary", "Overview Metrics")}

        <!-- Metric KPI Cards -->
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
          <div style="flex: 1; border: 1px solid #cbd5e1; border-top: 3px solid #1e3a8a; padding: 12px; border-radius: 4px; background: #f8fafc; text-align: center;">
            <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">Total Items</div>
            <div style="font-size: 22px; font-weight: 700; color: #1e3a8a; margin-top: 4px;">${totalIngredients}</div>
          </div>
          <div style="flex: 1; border: 1px solid #cbd5e1; border-top: 3px solid #dc2626; padding: 12px; border-radius: 4px; background: #f8fafc; text-align: center;">
            <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">Low Stock</div>
            <div style="font-size: 22px; font-weight: 700; color: #dc2626; margin-top: 4px;">${lowStock}</div>
          </div>
          <div style="flex: 1; border: 1px solid #cbd5e1; border-top: 3px solid #d97706; padding: 12px; border-radius: 4px; background: #f8fafc; text-align: center;">
            <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">Expired Items</div>
            <div style="font-size: 22px; font-weight: 700; color: #d97706; margin-top: 4px;">${expired}</div>
          </div>
          <div style="flex: 1; border: 1px solid #cbd5e1; border-top: 3px solid #16a34a; padding: 12px; border-radius: 4px; background: #f8fafc; text-align: center;">
            <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">Active Suppliers</div>
            <div style="font-size: 22px; font-weight: 700; color: #16a34a; margin-top: 4px;">${suppliers}</div>
          </div>
        </div>

        ${chartImgHtml}

        <!-- Official Footer -->
        <div style="margin-top: 40px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8;">
          <div>BakeWise Enterprise Inventory System &bull; Confidential</div>
          <div>Page 1 of 1</div>
        </div>
      </div>
    `;

    html2pdf().set(getPdfConfig('BakeWise_Executive_Summary.pdf')).from(container).save();
  } catch (err) {
    console.error("Executive Summary PDF Generation Error:", err);
    alert("Could not export PDF. Please check the console.");
  }
};

// 2. Formal Detailed Itemized Audit Report PDF
window.printDetailedReport = function() {
  if (typeof html2pdf === "undefined") {
    alert("PDF library is missing! Check your script imports in dashboard.html.");
    return;
  }

  try {
    // Sanitize record count text to prevent duplicate words glitch
    let rawRecordCount = document.getElementById("queryRecordCount")?.innerText || "0";
    let cleanRecordCount = rawRecordCount.replace(/records/gi, '').trim();

    // Collect transaction rows safely
    const originalTable = document.getElementById("fullTransactionTableBody");
    let formattedRows = "";

    if (originalTable && originalTable.rows.length > 0) {
      Array.from(originalTable.rows).forEach((row, idx) => {
        if (row.cells.length >= 5) {
          const date = row.cells[0].innerText.trim();
          const type = row.cells[1].innerText.trim();
          const ingredient = row.cells[2].innerText.trim();
          const quantity = row.cells[3].innerText.trim();
          const details = row.cells[4].innerText.trim();

          const isStockIn = type.toLowerCase().includes("in");
          const typeColor = isStockIn ? "#16a34a" : "#dc2626";
          const bgColor = idx % 2 === 0 ? "#ffffff" : "#f8fafc";

          formattedRows += `
            <tr style="background-color: ${bgColor}; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 7px 10px; font-size: 10px; color: #334155;">${date}</td>
              <td style="padding: 7px 10px; font-size: 10px; font-weight: 700; color: ${typeColor};">${type}</td>
              <td style="padding: 7px 10px; font-size: 10px; font-weight: 600; color: #0f172a;">${ingredient}</td>
              <td style="padding: 7px 10px; font-size: 10px; font-weight: 700; color: #334155;">${quantity}</td>
              <td style="padding: 7px 10px; font-size: 10px; color: #475569;">${details}</td>
            </tr>
          `;
        }
      });
    } else {
      formattedRows = `<tr><td colspan="5" style="text-align: center; padding: 15px; color: #94a3b8; font-size: 11px;">No transactions found for the specified filters.</td></tr>`;
    }

    const container = document.createElement("div");
    container.innerHTML = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 10px; color: #0f172a; background: #ffffff;">
        ${generatePdfHeader("Itemized Inventory Audit & Ledger", "Detailed Transactions")}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #f1f5f9; padding: 8px 12px; border-radius: 4px; border: 1px solid #cbd5e1;">
          <span style="font-size: 11px; font-weight: 700; color: #1e3a8a; text-transform: uppercase;">Filtered Transaction Records</span>
          <span style="font-size: 11px; font-weight: 700; background: #1e3a8a; color: #ffffff; padding: 2px 8px; border-radius: 12px;">${cleanRecordCount} Total Records</span>
        </div>

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1;">
          <thead>
            <tr style="background-color: #1e3a8a; color: #ffffff;">
              <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase;">Date</th>
              <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase;">Type</th>
              <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase;">Ingredient</th>
              <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase;">Quantity</th>
              <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase;">Reason / Supplier</th>
            </tr>
          </thead>
          <tbody>
            ${formattedRows}
          </tbody>
        </table>

        <!-- Official Footer -->
        <div style="margin-top: 30px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8;">
          <div>BakeWise Enterprise Inventory System &bull; Audit Trail Log</div>
          <div>Official System Document</div>
        </div>
      </div>
    `;

    html2pdf().set(getPdfConfig('BakeWise_Detailed_Transaction_Report.pdf')).from(container).save();
  } catch (err) {
    console.error("Detailed Audit PDF Generation Error:", err);
    alert("Could not export Detailed PDF. Please check the console.");
  }
};
// ==========================================
// EXPIRED ITEM DISPOSAL HANDLER
// ==========================================

/**
 * Handles disposing of expired items:
 * - Records an automatic "Stock Out" transaction with reason "Expired Disposal"
 * - Deducts/clears item stock quantity from database/state
 */
async function disposeExpiredItem(itemId, disposeQty) {
  if (!disposeQty || disposeQty <= 0) {
    alert("Invalid disposal quantity.");
    return;
  }

  if (!confirm(`Are you sure you want to dispose ${disposeQty} units of expired stock?`)) {
    return;
  }

  try {
    // 1. Prepare Stock Out transaction payload
    const transactionData = {
      itemId: itemId,
      type: "Stock Out",
      quantity: Number(disposeQty),
      reason: "Expired Disposal",
      timestamp: new Date().toISOString()
    };

    // Replace with your project's transaction handler if needed
    if (typeof saveTransaction === "function") {
      await saveTransaction(transactionData);
    } else if (typeof firebase !== "undefined") {
      // Firebase Firestore backup fallback
      await db.collection("transactions").add(transactionData);
    }

    // 2. Update stock level for the item
    if (typeof updateItemQuantity === "function") {
      await updateItemQuantity(itemId, -Number(disposeQty));
    }

    alert("Expired stock successfully disposed.");

    // 3. Refresh reports and tables
    if (typeof renderInventoryTable === "function") renderInventoryTable();
    if (typeof window.runTransactionQuery === "function") window.runTransactionQuery();

  } catch (error) {
    console.error("Error disposing expired stock:", error);
    alert("Failed to dispose expired stock. Please check the console for details.");
  }
}

// Global delegated click listener for Dispose buttons
document.addEventListener("click", function (e) {
  const btn = e.target.closest(".btn-dispose-expired");
  if (btn) {
    const itemId = btn.getAttribute("data-id");
    const qty = parseFloat(btn.getAttribute("data-qty"));

    if (itemId && !isNaN(qty)) {
      disposeExpiredItem(itemId, qty);
    }
  }
});
