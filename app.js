// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  sendPasswordResetEmail, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, push, set, onValue, remove, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDJaABTeg8QWibEzf9Q9tFFPd-1GvBbp1k",
  authDomain: "bakery-inventory-system.firebaseapp.com",
  databaseURL: "https://bakery-inventory-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bakery-inventory-system",
  storageBucket: "bakery-inventory-system.firebasestorage.app",
  messagingSenderId: "369844090351",
  appId: "1:369844090351:web:528b34f3a36cc14a74321a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Simple alert helper function
function showAlert(element, message, type) {
  if (element) {
    element.className = `alert alert-${type}`;
    element.innerText = message;
    element.classList.remove("d-none");
  }
}

// -------------------------------------------------------------
// MODULE 1: LOGIN & REGISTRATION
// -------------------------------------------------------------

// Login form
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const alertBox = document.getElementById("errorAlert");

    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        if (!userCredential.user.emailVerified) {
          signOut(auth); 
          showAlert(alertBox, "Access Denied: Please verify your email first. Check your inbox!", "danger");
          return; 
        }
        window.location.href = "dashboard.html";
      })
      .catch((error) => showAlert(alertBox, "Login failed: " + error.message, "danger"));
  });
}

// Logout button
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    signOut(auth).then(() => window.location.href = "index.html");
  });
}

// Registration form
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fullName = document.getElementById("regFullName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    const confirmPassword = document.getElementById("regConfirmPassword").value;
    const alertBox = document.getElementById("alertBox");

    if (password.length < 6) return showAlert(alertBox, "Password must be at least 6 characters.", "danger");
    if (password !== confirmPassword) return showAlert(alertBox, "Passwords do not match!", "danger");

    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        sendEmailVerification(userCredential.user).catch(err => console.log(err));

        set(ref(db, 'users/' + userCredential.user.uid), {
          fullName: fullName,
          email: email,
          role: "kitchen_staff"
        }).then(() => {
          signOut(auth).then(() => {
            showAlert(alertBox, "Account created! Please check your email to verify before logging in.", "success");
            setTimeout(() => window.location.href = "index.html", 3000);
          });
        });
      })
      .catch((err) => showAlert(alertBox, "Error: " + err.message, "danger"));
  });
}

// Forgot Password Logic
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener("click", (e) => {
    e.preventDefault();
    let email = document.getElementById("email") ? document.getElementById("email").value.trim() : "";
    
    if (!email) {
      email = prompt("Please enter your account email address to reset your password:");
    }

    if (email) {
      sendPasswordResetEmail(auth, email)
        .then(() => {
          alert(`Success! A password reset link has been sent to ${email}. Check your inbox.`);
        })
        .catch((error) => {
          alert("Error sending reset email: " + error.message);
        });
    } else {
      alert("Email address is required to reset your password.");
    }
  });
}

// Check logged-in user role & secure the page
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (!user.emailVerified) {
      signOut(auth).then(() => {
        if (window.location.pathname.includes("dashboard.html")) {
          window.location.href = "index.html";
        }
      });
      return;
    }

    get(ref(db, `users/${user.uid}`)).then((snapshot) => {
      if (snapshot.exists()) {
        const userData = snapshot.val();
        const role = userData.role || "kitchen_staff";

        window.currentUserRole = role;

        const greeting = document.getElementById("userGreeting");
        if (greeting) greeting.innerText = `Welcome, ${userData.fullName}!`;
        
        const roleBadge = document.getElementById("userRoleBadge");
        if (roleBadge) roleBadge.innerText = `Role: ${role.replace('_', ' ')}`;

        if (role === "admin" || role === "supervisor") {
          document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("d-none"));
          const container = document.getElementById("ingTableContainer");
          if (container) container.className = "col-md-8";
          
          if (typeof renderPendingStockCards === "function") {
            renderPendingStockCards();
          }
        }
        if (role === "admin") {
          document.querySelectorAll(".super-admin-only").forEach(el => el.classList.remove("d-none"));
        }
      }
    });
  } else {
    if (window.location.pathname.includes("dashboard.html")) {
      window.location.href = "index.html";
    }
  }
}); 

// -------------------------------------------------------------
// MODULES 2, 7, 8, 9, 10: INGREDIENTS, SEARCH, LOW STOCK & EXPIRY
// -------------------------------------------------------------
let allIngredients = {};
let globalStockIn = [];
let globalStockOut = [];

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
    renderInventoryTable();
  });
}

const searchInput = document.getElementById("searchInput");
const filterCat = document.getElementById("filterCategorySelect");

if (searchInput) searchInput.addEventListener("input", renderInventoryTable);
if (filterCat) filterCat.addEventListener("change", renderInventoryTable);

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
    
    if (item.expiryDate) {
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

      const row = `
        <tr class="${isLowStock ? 'table-danger' : ''}">
          <td class="fw-bold">${item.name}</td>
          <td><span class="badge bg-secondary">${item.category}</span></td>
          <td class="fw-bold">${item.quantity} ${item.unit}</td>
          <td>${item.minThreshold} ${item.unit}</td>
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

window.openEditModal = function(key, name, qty, unit, minThreshold, expiryDate) {
  document.getElementById("editKey").value = key;
  document.getElementById("editName").value = name;
  document.getElementById("editQty").value = qty;
  document.getElementById("editUnit").value = unit;
  document.getElementById("editMin").value = minThreshold || 0;
  document.getElementById("editExpiry").value = expiryDate || "";

  new bootstrap.Modal(document.getElementById('editModal')).show();
};

const editForm = document.getElementById("editForm");
if (editForm) {
  editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const key = document.getElementById("editKey").value;
    const updatedData = {
      name: document.getElementById("editName").value,
      quantity: parseFloat(document.getElementById("editQty").value),
      minThreshold: parseFloat(document.getElementById("editMin").value),
      expiryDate: document.getElementById("editExpiry").value,
      unit: document.getElementById("editUnit").value
    };

    update(ref(db, 'ingredients/' + key), updatedData).then(() => {
      alert("Ingredient updated!");
      bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
    });
  });
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
  let ingredientUpdates = { 
    quantity: (allIngredients[payload.ingredientKey]?.quantity || 0) + payload.addedQty 
  };
  
  if (payload.newExpiryDate) {
    ingredientUpdates.expiryDate = payload.newExpiryDate;
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
    stockInForm.reset(); 
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("stockInDate").value = today;
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
// MODULE 6: STOCK OUT
// -------------------------------------------------------------
const stockOutForm = document.getElementById("stockOutForm");
if (stockOutForm) {
  stockOutForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const ingKey = document.getElementById("stockOutIngSelect").value;
    const deductedQty = parseFloat(document.getElementById("stockOutQty").value);
    const reason = document.getElementById("stockOutReason").value;
    const entryDate = document.getElementById("stockOutDate").value;

    get(ref(db, `ingredients/${ingKey}`)).then((snap) => {
      if (snap.exists()) {
        const item = snap.val();
        if (item.quantity < deductedQty) return alert("Error: Not enough stock to deduct!");

        update(ref(db, `ingredients/${ingKey}`), { quantity: item.quantity - deductedQty });

        push(ref(db, 'stock_out/'), { 
          ingredientName: item.name, 
          deductedQty: deductedQty, 
          unit: item.unit, 
          reason: reason, 
          date: entryDate 
        }).then(() => { 
          alert("Stock Out recorded and stock deducted!"); 
          stockOutForm.reset(); 
        });
      }
    });
  });

  onValue(ref(db, 'stock_out/'), (snap) => {
    const table = document.getElementById("stockOutTableBody");
    if (table) table.innerHTML = "";
    globalStockOut = [];
    if (snap.exists()) {
      Object.values(snap.val()).forEach((item) => {
        globalStockOut.push({...item, type: "OUT"});
        if (table) table.innerHTML += `<tr><td>${item.date}</td><td class="fw-bold">${item.ingredientName}</td><td class="text-danger fw-bold">-${item.deductedQty} ${item.unit}</td><td>${item.reason}</td></tr>`;
      });
    }
    renderDashboardWidgets();
  });
}

// -------------------------------------------------------------
// MODULE 12: USER ROLE MANAGEMENT (ADMIN ONLY)
// -------------------------------------------------------------
const userTableBody = document.getElementById("userManagementTableBody");
if (userTableBody) {
  onValue(ref(db, 'users/'), (snapshot) => {
    userTableBody.innerHTML = "";
    if (snapshot.exists()) {
      const users = snapshot.val();
      Object.keys(users).forEach((uid) => {
        const u = users[uid];
        
        if (u.role === "admin") return;

        userTableBody.innerHTML += `
          <tr>
            <td>${u.fullName}</td>
            <td>${u.email}</td>
            <td><span class="badge bg-secondary text-capitalize">${u.role.replace('_', ' ')}</span></td>
            <td>
              <button class="btn btn-sm btn-outline-primary me-1" onclick="updateUserRole('${uid}', 'kitchen_staff')">Set Staff</button>
              <button class="btn btn-sm btn-outline-success" onclick="updateUserRole('${uid}', 'supervisor')">Set Supervisor</button>
            </td>
          </tr>`;
      });
    }
  });
}

window.updateUserRole = (uid, newRole) => {
  if (newRole !== 'kitchen_staff' && newRole !== 'supervisor') {
    alert("Invalid role selection.");
    return;
  }
  update(ref(db, `users/${uid}`), { role: newRole })
    .then(() => alert(`User role updated to ${newRole.replace('_', ' ')}!`));
};

// -------------------------------------------------------------
// DASHBOARD WIDGETS, REPORTS QUERY & FORECAST
// -------------------------------------------------------------
function renderDashboardWidgets() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Immediate Attention Table
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
          <td>${item.quantity} ${item.unit}</td>
          <td class="text-muted">${limitText}</td>
        </tr>`;
    }
  });
  
  if (!attentionHTML) {
    attentionHTML = `<tr><td colspan="4" class="text-center text-success py-3">✅ All systems normal!</td></tr>`;
  }
  if (attentionTable) attentionTable.innerHTML = attentionHTML;

  // 2. Chart.js Category Breakdown
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

  // 3. Restock Forecast Algorithm
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
              <td>${usedLast30Days.toFixed(1)} ${item.unit}</td>
              <td class="text-warning">${item.quantity} ${item.unit}</td>
              <td class="text-success fw-bold">+${Math.ceil(toOrder)} ${item.unit}</td>
            </tr>`;
        }
      }
    });

    if (forecastHTML === "") {
      forecastHTML = `<tr><td colspan="5" class="text-center text-muted py-3">Inventory levels are optimal. No bulk orders required right now.</td></tr>`;
    }
    forecastTable.innerHTML = forecastHTML;
  }

  // 4. Update Query Filter Dropdown & Refresh Audit Records Once
  populateQueryDropdown();
  window.runTransactionQuery();
}

// Global delete helpers
window.deleteCategory = (key) => { if (confirm("Delete this category?")) remove(ref(db, 'categories/' + key)); };
window.deleteIngredient = (key) => { if (confirm("Delete this ingredient?")) remove(ref(db, 'ingredients/' + key)); };
window.deleteSupplier = (key) => { if (confirm("Delete this supplier?")) remove(ref(db, 'suppliers/' + key)); };

// Auto-fill form dates
document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split("T")[0];
  const stockInDate = document.getElementById("stockInDate");
  const stockOutDate = document.getElementById("stockOutDate");
  
  if (stockInDate) stockInDate.value = today;
  if (stockOutDate) stockOutDate.value = today;
});

// Dynamic Transaction Query Engine
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
      ? `<span class="text-success fw-bold">+${tx.addedQty || 0} ${tx.unit}</span>`
      : `<span class="text-danger fw-bold">-${tx.deductedQty || 0} ${tx.unit}</span>`;
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

window.resetTransactionQuery = function() {
  if (document.getElementById("queryStartDate")) document.getElementById("queryStartDate").value = "";
  if (document.getElementById("queryEndDate")) document.getElementById("queryEndDate").value = "";
  if (document.getElementById("queryType")) document.getElementById("queryType").value = "ALL";
  if (document.getElementById("queryIngredient")) document.getElementById("queryIngredient").value = "ALL";
  window.runTransactionQuery();
};

// Wire up the Filter & Reset button events
document.getElementById("queryFilterBtn")?.addEventListener("click", window.runTransactionQuery);
document.getElementById("queryResetBtn")?.addEventListener("click", window.resetTransactionQuery);


// -------------------------------------------------------------
// MODULE 13: DIRECT EMAIL PURCHASE ORDERS & PDF DOWNLOAD
// -------------------------------------------------------------

// Populate Email Order Supplier Dropdown
onValue(ref(db, 'suppliers/'), (snapshot) => {
  const poSelect = document.getElementById("poSupplierSelect");
  if (!poSelect) return;

  const currentSelection = poSelect.value;
  poSelect.innerHTML = `<option value="">Select Supplier</option>`;
  
  if (snapshot.exists()) {
    const data = snapshot.val();
    Object.keys(data).forEach((key) => {
      const sup = data[key];
      poSelect.innerHTML += `<option value="${sup.name}" data-email="${sup.email || ''}">${sup.name}</option>`;
    });
  }
  if (currentSelection) poSelect.value = currentSelection;
});

// Auto-fill supplier email when selected
const poSupplierSelect = document.getElementById("poSupplierSelect");
if (poSupplierSelect) {
  poSupplierSelect.addEventListener("change", (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    const email = selectedOption.getAttribute("data-email");
    document.getElementById("poSupplierEmail").value = email || "";
  });
}

// 1. Download PDF Locally
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
if (downloadPdfBtn) {
  downloadPdfBtn.addEventListener("click", () => {
    const supplierName = document.getElementById("poSupplierSelect").value;
    const supplierEmail = document.getElementById("poSupplierEmail").value;
    const poNum = document.getElementById("poNumber").value || "PO-1001";
    const orderDetails = document.getElementById("poMessage").value;

    if (!supplierName || !orderDetails) {
      alert("Please select a supplier and enter order details first.");
      return;
    }

    // Populate Hidden PDF Template
    document.getElementById("pdfPoNumber").innerText = poNum;
    document.getElementById("pdfDate").innerText = "Date: " + new Date().toLocaleDateString();
    document.getElementById("pdfSupplierName").innerText = supplierName;
    document.getElementById("pdfSupplierEmail").innerText = supplierEmail;
    document.getElementById("pdfOrderDetails").innerText = orderDetails;

    const invoiceElement = document.getElementById("invoiceContainer");
    invoiceElement.style.display = "block";

    const opt = {
      margin:       0.5,
      filename:     `Invoice_${poNum}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(invoiceElement).save().then(() => {
      invoiceElement.style.display = "none";
    });
  });
}

// 2. Handle Free Email Submission via EmailJS
const emailOrderForm = document.getElementById("emailOrderForm");
if (emailOrderForm) {
  emailOrderForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const supplierName = document.getElementById("poSupplierSelect").value;
    const supplierEmail = document.getElementById("poSupplierEmail").value;
    const poNum = document.getElementById("poNumber").value;
    const orderDetails = document.getElementById("poMessage").value;
    const sendBtn = document.getElementById("sendEmailBtn");

    if (!supplierEmail) {
      alert("Error: Selected supplier has no email address saved!");
      return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Sending...`;

    const templateParams = {
      supplier_name: supplierName,
      to_email: supplierEmail,
      po_number: poNum,
      order_details: orderDetails,
      sent_by: auth.currentUser ? auth.currentUser.email : "BakeWise Team"
    };

    emailjs.send("YOUR_SERVICE_ID", "YOUR_TEMPLATE_ID", templateParams)
      .then(() => {
        alert(`Purchase Order (${poNum}) successfully emailed to ${supplierName}!`);
        emailOrderForm.reset();
        bootstrap.Modal.getInstance(document.getElementById('emailOrderModal')).hide();
      })
      .catch((error) => {
        alert("Failed to send email: " + (error.text || JSON.stringify(error)));
      })
      .finally(() => {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `<i class="bi bi-send me-1"></i> Send Email Order`;
      });
  });
}
