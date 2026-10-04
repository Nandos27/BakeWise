// js/inventory.js
import { db, auth, formatDecimal } from "./firebase.js";
import { ref, push, set, onValue, remove, update, get, query, orderByChild } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { logAuditEvent } from "./audit.js";

export let allIngredients = {};
export let globalStockIn = [];
export let globalStockOut = [];

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

    push(ref(db, 'ingredients/'), newIng).then(async () => {
      await logAuditEvent("Add Ingredient", `Created new ingredient: ${ingName} (${qty} ${unit})`);
      alert("Ingredient Saved!");
      addIngredientForm.reset();
    });
  });

  onValue(ref(db, 'ingredients/'), (snapshot) => {
    allIngredients = snapshot.exists() ? snapshot.val() : {};
    window.allIngredients = allIngredients; 
    renderInventoryTable();
    renderDashboardWidgets();
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
  editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const key = document.getElementById("editKey").value;
    if (!key) return;

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

    update(ref(db, `ingredients/${key}`), updatedData)
      .then(async () => {
        await logAuditEvent("Edit Ingredient", `Updated ingredient details for: ${newName} (Qty: ${newQty} ${newUnit}, Exp: ${newExp})`);
        alert("Ingredient updated successfully!");
        const editModalElement = document.getElementById('editModal');
        if (editModalElement && typeof bootstrap !== "undefined") {
          const modal = bootstrap.Modal.getInstance(editModalElement);
          if (modal) modal.hide();
        }
      })
      .catch((err) => {
        alert("Error updating ingredient: " + err.message);
      });
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
  addCategoryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const catName = document.getElementById("catName").value;
    push(ref(db, 'categories/'), { name: catName }).then(async () => {
      await logAuditEvent("Add Category", `Created category: ${catName}`);
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
    const supName = document.getElementById("supName").value;
    push(ref(db, 'suppliers/'), {
      name: supName,
      contact: document.getElementById("supContact").value,
      phone: document.getElementById("supPhone").value,
      email: document.getElementById("supEmail").value
    }).then(async () => {
      await logAuditEvent("Add Supplier", `Saved supplier: ${supName}`);
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
// STOCK IN / STOCK OUT LISTENERS WITH AUDIT LOGGING
// -------------------------------------------------------------
const stockInForm = document.getElementById("stockInForm");
if (stockInForm) {
  stockInForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const ingKey = document.getElementById("stockInIngSelect").value;
    const addedQty = parseFloat(document.getElementById("stockInQty").value);
    const supplier = document.getElementById("stockInSupSelect").value;
    const entryDate = document.getElementById("stockInDate").value;
    const newExpiry = document.getElementById("stockInNewExpiry").value;

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
      const expDateStr = newExpiry ? toIsoDateString(newExpiry) : (item.expiryDate || "");

      let existingBatches = getItemBatches(item);
      const matchingBatch = existingBatches.find(b => toIsoDateString(b.expiryDate) === expDateStr);

      if (matchingBatch) {
        matchingBatch.qty = (parseFloat(matchingBatch.qty) || 0) + addedQty;
      } else {
        existingBatches.push({ qty: addedQty, expiryDate: expDateStr });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const validBatches = existingBatches.filter(b => b.qty > 0 && new Date(b.expiryDate) >= today);
      let primaryExpiry = item.expiryDate;
      if (validBatches.length > 0) {
        validBatches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
        primaryExpiry = validBatches[0].expiryDate;
      } else if (newExpiry) {
        primaryExpiry = toIsoDateString(newExpiry);
      }

      const updatePayload = {
        quantity: newQty,
        expiryDate: primaryExpiry,
        batches: existingBatches
      };

      update(ref(db, `ingredients/${ingKey}`), updatePayload)
        .then(() => {
          return push(ref(db, 'stock_in/'), {
            ingredientName: item.name,
            addedQty: addedQty,
            unit: item.unit,
            supplier: supplier || "Direct Stock In",
            date: entryDate,
            newExpiry: expDateStr || "N/A"
          });
        })
        .then(async () => {
          await logAuditEvent("Stock In", `Added +${addedQty} ${item.unit} of ${item.name} (Supplier: ${supplier || 'Direct'}, Expiry: ${expDateStr || 'N/A'})`);
          alert("Stock In recorded and inventory updated successfully!");
          stockInForm.reset();
          const todayStr = new Date().toISOString().split("T")[0];
          const stockInDateElem = document.getElementById("stockInDate");
          if (stockInDateElem) stockInDateElem.value = todayStr;
        })
        .catch((err) => {
          alert("Error processing Stock In: " + err.message);
        });
    });
  });
}

const stockOutForm = document.getElementById("stockOutForm");
if (stockOutForm) {
  stockOutForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const ingKey = document.getElementById("stockOutIngSelect").value;
    const deductedQty = parseFloat(document.getElementById("stockOutQty").value);
    const reason = document.getElementById("stockOutReason").value;
    const useDate = document.getElementById("stockOutDate").value;

    if (!ingKey || isNaN(deductedQty) || deductedQty <= 0) {
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

      if (deductedQty > currentQty) {
        alert(`Cannot deduct ${deductedQty} ${item.unit}. Only ${currentQty} ${item.unit} available.`);
        return;
      }

      const newQty = currentQty - deductedQty;

      update(ref(db, `ingredients/${ingKey}`), { quantity: newQty })
        .then(() => {
          return push(ref(db, 'stock_out/'), {
            ingredientName: item.name,
            deductedQty: deductedQty,
            unit: item.unit,
            reason: reason || "General Use",
            date: useDate
          });
        })
        .then(async () => {
          await logAuditEvent("Stock Out", `Deducted -${deductedQty} ${item.unit} of ${item.name} (Reason: ${reason})`);
          alert("Stock Out recorded successfully!");
          stockOutForm.reset();
          const todayStr = new Date().toISOString().split("T")[0];
          const stockOutDateElem = document.getElementById("stockOutDate");
          if (stockOutDateElem) stockOutDateElem.value = todayStr;
        })
        .catch((err) => {
          alert("Error processing Stock Out: " + err.message);
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
        let issueBadge = isExpired 
          ? `<span class="badge bg-warning text-dark">Expired</span>`
          : `<span class="badge bg-danger">Low Stock</span>`;
        
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
          backgroundColor: ['#0d6efd', '#ffc107', '#198754', '#dc3545', '#6c757d', '#0dcaf0'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
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
  const printArea = document.getElementById("printArea");
  if (!printArea) {
    alert("Print area content not found.");
    return;
  }

  const printIframe = document.createElement("iframe");
  printIframe.style.position = "fixed";
  printIframe.style.right = "0";
  printIframe.style.bottom = "0";
  printIframe.style.width = "0";
  printIframe.style.height = "0";
  printIframe.style.border = "0";
  document.body.appendChild(printIframe);

  const iframeDoc = printIframe.contentWindow.document;

  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>BakeWise Forecast Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #2C241B; }
          .header { text-align: center; border-bottom: 2px solid #A05A35; padding-bottom: 10px; margin-bottom: 15px; }
          .header h1 { margin: 0; color: #A05A35; font-size: 22px; }
          .header h2 { margin: 5px 0 0 0; font-size: 15px; color: #555; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #f4f4f4; }
          .footer { margin-top: 25px; text-align: center; font-size: 10px; color: #888; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>BakeWise Kitchen Management</h1>
          <h2>30-Day Purchase Order & Forecast Report</h2>
        </div>
        ${printArea.innerHTML}
        <div class="footer">
          BakeWise Integrated Kitchen System &bull; Official Generated Forecast
        </div>
      </body>
    </html>
  `);
  iframeDoc.close();

  setTimeout(() => {
    printIframe.contentWindow.focus();
    printIframe.contentWindow.print();
    document.body.removeChild(printIframe);
  }, 500);
};

const getPdfConfig = (filename) => ({
  margin:       [12, 12, 12, 12],
  filename:     filename,
  image:        { type: 'jpeg', quality: 0.98 },
  html2canvas:  { scale: 2.5, logging: false, useCORS: true },
  jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
});

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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 138);
  doc.text("BAKEWISE KITCHEN MANAGEMENT", 14, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text("Itemized Inventory Audit & Ledger", 14, 26);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 58, 138);
  doc.text(`${filteredTransactions.length} Records`, 14, 36);

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
      startY: 42,
      head: [['Date', 'Type', 'Ingredient', 'Qty', 'Reason / Supplier']],
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [15, 23, 42] },
      margin: { left: 14, right: 14 }
    });
  } else {
    let y = 46;
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    body.forEach(r => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(r.join("  |  ").substring(0, 110), 14, y);
      y += 6;
    });
  }

  // Mobile-safe save: blob + anchor, fallback to new tab
  const filename = 'BakeWise_Detailed_Transaction_Report.pdf';
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isIOS) {
    // iOS: open in new tab so the native PDF viewer handles it
    const w = window.open(url, '_blank');
    if (!w) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } else {
    // Desktop + Android: trigger a direct download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
