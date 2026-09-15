// js/purchasing.js
import { db, auth } from "./firebase.js";
import { ref, push, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 1. Populate Email Order Supplier Dropdown & Auto-fill Email
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

const poSupplierSelect = document.getElementById("poSupplierSelect");
if (poSupplierSelect) {
  poSupplierSelect.addEventListener("change", (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    const email = selectedOption.getAttribute("data-email");
    const emailInput = document.getElementById("poSupplierEmail");
    if (emailInput) emailInput.value = email || "";
  });
}

// 2. Populate Ingredient Select Dropdown for PO Form
onValue(ref(db, 'ingredients/'), (snapshot) => {
  const poIngSelect = document.getElementById("poIngredientSelect");
  if (!poIngSelect) return;

  poIngSelect.innerHTML = `<option value="">Select Ingredient</option>`;
  if (snapshot.exists()) {
    const data = snapshot.val();
    Object.keys(data).forEach((key) => {
      const item = data[key];
      poIngSelect.innerHTML += `<option value="${key}">${item.name} (${item.unit || 'unit'})</option>`;
    });
  }
});

// 3. Handle Email Submission via EmailJS & Save to Database
const emailOrderForm = document.getElementById("emailOrderForm");
if (emailOrderForm) {
  emailOrderForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const supplierName = document.getElementById("poSupplierSelect")?.value;
    const supplierEmail = document.getElementById("poSupplierEmail")?.value;
    const ingKey = document.getElementById("poIngredientSelect")?.value;
    const orderQty = parseFloat(document.getElementById("poOrderQty")?.value);
    const poNum = document.getElementById("poNumber")?.value || "PO-" + Date.now().toString().slice(-4);
    const orderDetails = document.getElementById("poMessage")?.value || "";
    const sendBtn = document.getElementById("sendEmailBtn");

    if (!supplierEmail || !ingKey || isNaN(orderQty)) {
      alert("Please complete all required fields including supplier, ingredient, and quantity.");
      return;
    }

    const ingSelect = document.getElementById("poIngredientSelect");
    const selectedIngOption = ingSelect ? ingSelect.options[ingSelect.selectedIndex].text : "Item";
    const currentInventory = window.allIngredients || {};
    const ingName = currentInventory[ingKey]?.name || selectedIngOption.split(" (")[0];
    const unit = currentInventory[ingKey]?.unit || "";

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Sending...`;
    }

    const templateParams = {
      supplier_name: supplierName,
      to_email: supplierEmail,
      po_number: poNum,
      order_details: `Item: ${ingName}\nQuantity: ${orderQty} ${unit}\nNotes: ${orderDetails}`,
      sent_by: auth.currentUser ? auth.currentUser.email : "BakeWise Team"
    };

    emailjs.send("service_6funyvl", "template_kxksovu", templateParams)
      .then(() => {
        const newOrder = {
          poNumber: poNum,
          supplierName: supplierName,
          supplierEmail: supplierEmail,
          ingredientKey: ingKey,
          ingredientName: ingName,
          quantity: orderQty,
          unit: unit,
          notes: orderDetails,
          status: "Pending",
          date: new Date().toISOString().split("T")[0]
        };

        return push(ref(db, 'purchase_orders/'), newOrder);
      })
      .then(() => {
        alert(`Purchase Order (${poNum}) successfully emailed to ${supplierName} and saved!`);
        emailOrderForm.reset();

        const modalEl = document.getElementById('emailOrderModal');
        if (modalEl && typeof bootstrap !== "undefined") {
          const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
          modalInstance.hide();
        }
      })
      .catch((error) => {
        console.error("Email/Order Error:", error);
        alert("Failed to send order: " + (error.text || JSON.stringify(error)));
      })
      .finally(() => {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.innerHTML = `<i class="bi bi-send me-1"></i> Send Order`;
        }
      });
  });
}

// 4. Render Purchase Order History Table
onValue(ref(db, 'purchase_orders/'), (snapshot) => {
  const tableBody = document.getElementById("poHistoryTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = "";
  if (!snapshot.exists()) {
    tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">No purchase orders found.</td></tr>`;
    return;
  }

  const orders = snapshot.val();
  Object.keys(orders).forEach((key) => {
    const po = orders[key];
    const isReceived = po.status === "Received";

    const row = `
      <tr>
        <td class="fw-bold">${po.poNumber}</td>
        <td>${po.date}</td>
        <td>${po.supplierName}</td>
        <td class="fw-bold">${po.ingredientName}</td>
        <td>${po.quantity} ${po.unit}</td>
        <td>
          <span class="badge ${isReceived ? 'bg-success' : 'bg-warning text-dark'}">
            ${po.status}
          </span>
        </td>
        <td>
          <button class="btn btn-sm btn-outline-secondary me-1" onclick="downloadOrderPdf('${key}')">
            <i class="bi bi-download"></i> PDF
          </button>
          ${!isReceived ? `
            <button class="btn btn-sm btn-success" onclick="markOrderReceived('${key}')">
              <i class="bi bi-check-circle"></i> Order Received
            </button>
          ` : `
            <button class="btn btn-sm btn-light text-muted" disabled>Received</button>
          `}
        </td>
      </tr>`;

    tableBody.innerHTML += row;
  });
});

// Purchase Order History Filtering
function filterPOHistoryTable() {
  const searchValue = document.getElementById("poSearchInput")?.value.toLowerCase().trim() || "";
  const statusValue = document.getElementById("poStatusFilter")?.value.toLowerCase() || "";
  
  const rows = document.querySelectorAll("#poHistoryTableBody tr");

  rows.forEach(row => {
    const textContent = row.textContent.toLowerCase();
    const matchesSearch = textContent.includes(searchValue);
    const matchesStatus = !statusValue || textContent.includes(statusValue);

    if (matchesSearch && matchesStatus) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

document.getElementById("poSearchInput")?.addEventListener("input", filterPOHistoryTable);
document.getElementById("poStatusFilter")?.addEventListener("change", filterPOHistoryTable);

// 5. Action: Download PDF for a specific Purchase Order
window.downloadOrderPdf = function(orderKey) {
  get(ref(db, `purchase_orders/${orderKey}`)).then((snap) => {
    if (!snap.exists()) return;
    const po = snap.val();

    const pdfPoNumber = document.getElementById("pdfPoNumber");
    const pdfDate = document.getElementById("pdfDate");
    const pdfSupplierName = document.getElementById("pdfSupplierName");
    const pdfSupplierEmail = document.getElementById("pdfSupplierEmail");
    const pdfOrderDetails = document.getElementById("pdfOrderDetails");

    if (pdfPoNumber) pdfPoNumber.innerText = po.poNumber;
    if (pdfDate) pdfDate.innerText = "Date: " + po.date;
    if (pdfSupplierName) pdfSupplierName.innerText = po.supplierName;
    if (pdfSupplierEmail) pdfSupplierEmail.innerText = po.supplierEmail;
    if (pdfOrderDetails) pdfOrderDetails.innerText = `Item: ${po.ingredientName}\nQuantity: ${po.quantity} ${po.unit}\nNotes: ${po.notes || 'None'}`;

    const invoiceElement = document.getElementById("invoiceContainer");
    if (!invoiceElement) {
      alert("Invoice container element not found.");
      return;
    }

    invoiceElement.style.display = "block";

    const opt = {
      margin: 0.5,
      filename: `Invoice_${po.poNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(invoiceElement).save().then(() => {
      invoiceElement.style.display = "none";
    }).catch((err) => {
      console.error("PDF generation error:", err);
      invoiceElement.style.display = "none";
    });
  });
};

// 6. Action: Mark Order Received & Automatically Restock Stock
window.markOrderReceived = function(orderKey) {
  get(ref(db, `purchase_orders/${orderKey}`)).then((snap) => {
    if (!snap.exists()) return;
    const po = snap.val();

    if (po.status === "Received") {
      alert("This order has already been marked as received.");
      return;
    }

    if (!confirm(`Confirm receipt of ${po.quantity} ${po.unit} of ${po.ingredientName}? This will automatically add it to your live inventory.`)) {
      return;
    }

    const ingRef = ref(db, `ingredients/${po.ingredientKey}`);
    get(ingRef).then((ingSnap) => {
      if (ingSnap.exists()) {
        const currentQty = parseFloat(ingSnap.val().quantity || 0);
        const newQty = currentQty + parseFloat(po.quantity);

        update(ingRef, { quantity: newQty });

        push(ref(db, 'stock_in/'), {
          ingredientName: po.ingredientName,
          addedQty: po.quantity,
          unit: po.unit,
          supplier: po.supplierName,
          date: new Date().toISOString().split("T")[0]
        });

        update(ref(db, `purchase_orders/${orderKey}`), { status: "Received" }).then(() => {
          alert(`Success! Added ${po.quantity} ${po.unit} of ${po.ingredientName} to inventory stock.`);
        });
      } else {
        alert("Ingredient record not found in database.");
      }
    });
  });
};
