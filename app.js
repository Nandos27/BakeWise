// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
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
        // SV Requirement: Check if email is verified BEFORE letting them in
        if (!userCredential.user.emailVerified) {
          signOut(auth); // Boot them back out
          showAlert(alertBox, "Access Denied: Please verify your email first. Check your inbox!", "danger");
          return; // Stop the code from going to the dashboard
        }
        
        // If verified, go to dashboard
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

    // Check password rules
    if (password.length < 6) return showAlert(alertBox, "Password must be at least 6 characters.", "danger");
    if (password !== confirmPassword) return showAlert(alertBox, "Passwords do not match!", "danger");

    // Create user in Firebase Auth
    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        // Send email notification
        sendEmailVerification(userCredential.user).catch(err => console.log(err));

        // Save default user role as kitchen_staff
        set(ref(db, 'users/' + userCredential.user.uid), {
          fullName: fullName,
          email: email,
          role: "kitchen_staff"
        }).then(() => {
          // Force sign out immediately so they don't auto-login
          signOut(auth).then(() => {
            showAlert(alertBox, "Account created! Please check your email to verify before logging in.", "success");
            setTimeout(() => window.location.href = "index.html", 3000);
          });
        });
      })
      .catch((err) => showAlert(alertBox, "Error: " + err.message, "danger"));
  });
}

// Check logged-in user role
onAuthStateChanged(auth, (user) => {
  if (user) {
    // SECURITY GUARD: If user lands on dashboard without verifying email, kick them out!
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

        const greeting = document.getElementById("userGreeting");
        if (greeting) greeting.innerText = `Welcome, ${userData.fullName}!`;
        
        const roleBadge = document.getElementById("userRoleBadge");
        if (roleBadge) roleBadge.innerText = `Role: ${role.replace('_', ' ')}`;

        // Show supervisor or admin elements
        if (role === "admin" || role === "supervisor") {
          document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("d-none"));
          const container = document.getElementById("ingTableContainer");
          if (container) container.className = "col-md-8";
        }
        // Show admin-only elements
        if (role === "admin") {
          document.querySelectorAll(".super-admin-only").forEach(el => el.classList.remove("d-none"));
        }
      }
    });
  }
});

// -------------------------------------------------------------
// MODULES 2, 7, 8, 9, 10: INGREDIENTS, SEARCH, LOW STOCK & EXPIRY
// -------------------------------------------------------------
let allIngredients = {};

// Add ingredient form
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

  // Read ingredients from Firebase
  onValue(ref(db, 'ingredients/'), (snapshot) => {
    allIngredients = snapshot.exists() ? snapshot.val() : {};
    renderInventoryTable();
  });
}

// Search and filter triggers
const searchInput = document.getElementById("searchInput");
const filterCat = document.getElementById("filterCategorySelect");

if (searchInput) searchInput.addEventListener("input", renderInventoryTable);
if (filterCat) filterCat.addEventListener("change", renderInventoryTable);

// Render inventory table with low stock and expiry check
function renderInventoryTable() {
  const tableBody = document.getElementById("inventoryTableBody");
  const stockInSelect = document.getElementById("stockInIngSelect");
  const stockOutSelect = document.getElementById("stockOutIngSelect");

  if (tableBody) tableBody.innerHTML = "";
  if (stockInSelect) stockInSelect.innerHTML = `<option value="">Select Ingredient</option>`;
  if (stockOutSelect) stockOutSelect.innerHTML = `<option value="">Select Ingredient</option>`;

  const searchVal = searchInput ? searchInput.value.toLowerCase() : "";
  const catVal = filterCat ? filterCat.value : "";
  const today = new Date().toISOString().split("T")[0];

  let totalItems = 0, lowStockCount = 0, expiredCount = 0;

  Object.keys(allIngredients).forEach((key) => {
    const item = allIngredients[key];
    totalItems++;

    // Search and category matching
    const matchesSearch = item.name.toLowerCase().includes(searchVal);
    const matchesCategory = catVal === "" || item.category === catVal;

    // Check low stock (Warning if within 20% of threshold)
    const isLowStock = item.quantity <= item.minThreshold;
    const isAlmostLow = !isLowStock && (item.quantity <= (item.minThreshold * 1.2));

    // Check expiry dates (Warning if within 7 days)
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
      
      // Stock Badges
      if (isLowStock) statusBadges += `<span class="badge bg-danger me-1">Low Stock</span>`;
      else if (isAlmostLow) statusBadges += `<span class="badge bg-warning text-dark me-1">Almost Low</span>`;
      
      // Expiry Badges
      if (isExpired) statusBadges += `<span class="badge bg-danger me-1">Expired</span>`;
      else if (isExpiringSoon) statusBadges += `<span class="badge bg-warning text-dark me-1">Expiring Soon</span>`;
      
      // All Good Badge
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

    // Populate dropdowns for Stock In and Stock Out
    if (stockInSelect) stockInSelect.innerHTML += `<option value="${key}">${item.name}</option>`;
    if (stockOutSelect) stockOutSelect.innerHTML += `<option value="${key}">${item.name}</option>`;
  });

  // Update stats on Report Tab
  if (document.getElementById("rptTotalItems")) document.getElementById("rptTotalItems").innerText = totalItems;
  if (document.getElementById("rptLowStock")) document.getElementById("rptLowStock").innerText = lowStockCount;
  if (document.getElementById("rptExpired")) document.getElementById("rptExpired").innerText = expiredCount;

  // Make sure admin buttons stay visible if user is logged in as supervisor/admin
  if (auth.currentUser) {
    get(ref(db, `users/${auth.currentUser.uid}`)).then((snap) => {
      if (snap.exists() && (snap.val().role === 'supervisor' || snap.val().role === 'admin')) {
        document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("d-none"));
      }
    });
  }
}

// Edit Modal Loader
window.openEditModal = function(key, name, qty, unit, minThreshold, expiryDate) {
  document.getElementById("editKey").value = key;
  document.getElementById("editName").value = name;
  document.getElementById("editQty").value = qty;
  document.getElementById("editUnit").value = unit;
  document.getElementById("editMin").value = minThreshold || 0;
  document.getElementById("editExpiry").value = expiryDate || "";

  new bootstrap.Modal(document.getElementById('editModal')).show();
};

// Edit form submit
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
const addSupplierForm = document.getElementById("addSupplierForm");
if (addSupplierForm) {
  addSupplierForm.addEventListener("submit", (e) => {
    e.preventDefault();
    push(ref(db, 'suppliers/'), {
      name: document.getElementById("supName").value,
      contact: document.getElementById("supContact").value,
      phone: document.getElementById("supPhone").value
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
        if (supTable) supTable.innerHTML += `<tr><td class="fw-bold">${item.name}</td><td>${item.contact}</td><td>${item.phone}</td><td><button class="btn btn-sm btn-outline-danger" onclick="deleteSupplier('${key}')">Delete</button></td></tr>`;
        if (stockInSupSelect) stockInSupSelect.innerHTML += `<option value="${item.name}">${item.name}</option>`;
      });
    }
    if (document.getElementById("rptSuppliers")) document.getElementById("rptSuppliers").innerText = count;
  });
}

// -------------------------------------------------------------
// MODULE 5: STOCK IN
// -------------------------------------------------------------
const stockInForm = document.getElementById("stockInForm");
if (stockInForm) {
  stockInForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const ingKey = document.getElementById("stockInIngSelect").value;
    const addedQty = parseFloat(document.getElementById("stockInQty").value);
    const supplierName = document.getElementById("stockInSupSelect").value;
    const entryDate = document.getElementById("stockInDate").value;

    get(ref(db, `ingredients/${ingKey}`)).then((snap) => {
      if (snap.exists()) {
        const item = snap.val();
        update(ref(db, `ingredients/${ingKey}`), { quantity: item.quantity + addedQty });
        
        push(ref(db, 'stock_in/'), { 
          ingredientName: item.name, 
          addedQty: addedQty, 
          unit: item.unit, 
          supplier: supplierName, 
          date: entryDate 
        }).then(() => { 
          alert("Stock In recorded!"); 
          stockInForm.reset(); 
        });
      }
    });
  });

  onValue(ref(db, 'stock_in/'), (snap) => {
    const table = document.getElementById("stockInTableBody");
    if (table) table.innerHTML = "";
    if (snap.exists()) {
      Object.values(snap.val()).forEach((item) => {
        if (table) table.innerHTML += `<tr><td>${item.date}</td><td class="fw-bold">${item.ingredientName}</td><td class="text-success fw-bold">+${item.addedQty} ${item.unit}</td><td>${item.supplier}</td></tr>`;
      });
    }
  });
}

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
    if (snap.exists()) {
      Object.values(snap.val()).forEach((item) => {
        if (table) table.innerHTML += `<tr><td>${item.date}</td><td class="fw-bold">${item.ingredientName}</td><td class="text-danger fw-bold">-${item.deductedQty} ${item.unit}</td><td>${item.reason}</td></tr>`;
      });
    }
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
        
        // Skip listing any user who is an Admin (Hides Admin from the table)
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

// Update role function (Only allows setting staff or supervisor)
window.updateUserRole = (uid, newRole) => {
  if (newRole !== 'kitchen_staff' && newRole !== 'supervisor') {
    alert("Invalid role selection.");
    return;
  }
  update(ref(db, `users/${uid}`), { role: newRole })
    .then(() => alert(`User role updated to ${newRole.replace('_', ' ')}!`));
};

function renderDashboardWidgets() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- 1. ACTION TABLE LOGIC ---
    const attentionTable = document.getElementById("attentionTableBody");
    let attentionHTML = "";
    
    inventoryData.forEach(item => {
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
    
    // Fallback if everything is fine
    if (!attentionHTML) {
        attentionHTML = `<tr><td colspan="4" class="text-center text-success py-3">✅ All systems normal!</td></tr>`;
    }
    if (attentionTable) attentionTable.innerHTML = attentionHTML;


    // --- 2. RECENT ACTIVITY LOGIC ---
    const activityTable = document.getElementById("recentActivityBody");
    let activityHTML = "";
    
    // Sort transactions by date (newest first) and grab the top 5
    if (typeof transactionHistory !== 'undefined' && transactionHistory.length > 0) {
        const recentTx = transactionHistory.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
        
        recentTx.forEach(tx => {
            const typeBadge = tx.type === "IN" 
                ? `<span class="badge bg-success">Stock In</span>` 
                : `<span class="badge bg-secondary">Stock Out</span>`;
            
            const qtyColor = tx.type === "IN" ? "text-success" : "text-danger";
            const sign = tx.type === "IN" ? "+" : "-";

            activityHTML += `
                <tr>
                    <td>${tx.date}</td>
                    <td>${typeBadge}</td>
                    <td class="fw-bold">${tx.ingredientName}</td>
                    <td class="fw-bold ${qtyColor}">${sign}${tx.quantity}</td>
                    <td class="text-muted">${tx.reason || 'Standard Update'}</td>
                </tr>`;
        });
    } else {
        activityHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No recent transactions logged yet.</td></tr>`;
    }
    
    if (activityTable) activityTable.innerHTML = activityHTML;


    // --- 3. CHART.JS LOGIC ---
    const categoryCounts = {};
    inventoryData.forEach(item => {
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    });

    const chartCanvas = document.getElementById('categoryChart');
    if (chartCanvas) {
        const ctx = chartCanvas.getContext('2d');
        
        // Destroy previous chart to prevent hover flickering glitches
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
}

// Global delete functions
window.deleteCategory = (key) => { if (confirm("Delete this category?")) remove(ref(db, 'categories/' + key)); };
window.deleteIngredient = (key) => { if (confirm("Delete this ingredient?")) remove(ref(db, 'ingredients/' + key)); };
window.deleteSupplier = (key) => { if (confirm("Delete this supplier?")) remove(ref(db, 'suppliers/' + key)); };

// Auto-fill today's date in Stock In and Stock Out forms
document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split("T")[0];
  const stockInDate = document.getElementById("stockInDate");
  const stockOutDate = document.getElementById("stockOutDate");
  
  if (stockInDate) stockInDate.value = today;
  if (stockOutDate) stockOutDate.value = today;
});
