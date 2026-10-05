// js/purchasing.js
import { db, auth } from "./firebase.js";
import { ref, push, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { BRAND, BRAND_NAME, BRAND_TAGLINE, bakeWiseDocHeader, bakeWiseDocFooter, bakeWiseSavePdf, paginate } from "./inventory.js";


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

        // Close modal safely and blur active element to prevent aria-hidden warnings
        const modalEl = document.getElementById('emailOrderModal');
        if (modalEl && typeof bootstrap !== "undefined") {
          const activeEl = document.activeElement;
          if (modalEl.contains(activeEl)) {
            activeEl.blur();
          }

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

// 4. Render Purchase Order History Table (paginated)
let poFullList = [];
let poPage = 1;
let poPerPage = 20;

function renderPoPage() {
  const tableBody = document.getElementById("poHistoryTableBody");
  if (!tableBody) return;

  const total = poFullList.length;
  if (total === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">No purchase orders found.</td></tr>`;
    const p = document.getElementById("poPager");
    if (p) p.innerHTML = "";
    return;
  }

  const start = (poPage - 1) * poPerPage;
  const slice = poFullList.slice(start, start + poPerPage);

  tableBody.innerHTML = slice.map(({ key, po }) => {
    const isReceived = po.status === "Received";
    return `
      <tr>
        <td class="fw-bold">${po.poNumber}</td>
        <td>${po.date}</td>
        <td>${po.supplierName}</td>
        <td class="fw-bold">${po.ingredientName}</td>
        <td>${po.quantity} ${po.unit}</td>
        <td><span class="badge ${isReceived ? 'bg-success' : 'bg-warning text-dark'}">${po.status}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-secondary me-1" onclick="downloadOrderPdf('${key}')">
            <i class="bi bi-file-earmark-pdf me-1"></i> PDF
          </button>
          ${!isReceived ? `
            <button class="btn btn-sm btn-success" onclick="markOrderReceived('${key}')">
              <i class="bi bi-check-circle"></i> Order Received
            </button>` : `
            <button class="btn btn-sm btn-light text-muted" disabled>Received</button>`}
        </td>
      </tr>`;
  }).join("");

  paginate({
    list: poFullList,
    pagerId: "poPager",
    perPage: poPerPage,
    currentPage: poPage,
    onPageChange: ({ page, perPage }) => {
      if (page) poPage = page;
      if (perPage) { poPerPage = perPage; poPage = 1; }
      renderPoPage();
    }
  });
}

onValue(ref(db, 'purchase_orders/'), (snapshot) => {
  poFullList = [];
  if (snapshot.exists()) {
    const orders = snapshot.val();
    Object.keys(orders)
      .map(key => ({ key, po: orders[key] }))
      .sort((a, b) => new Date(b.po.date) - new Date(a.po.date))
      .forEach(entry => poFullList.push(entry));
  }
  poPage = 1;
  renderPoPage();
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

// 5. Action:  PDF for a specific Purchase Order
window.downloadOrderPdf = function(orderKey) {
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { alert("jsPDF library missing!"); return; }

  get(ref(db, `purchase_orders/${orderKey}`)).then((snap) => {
    if (!snap.exists()) return;
    const po = snap.val();

    const doc = new jsPDFCtor('p', 'mm', 'a4');
    const pageW = doc.internal.pageSize.width;
    const margin = 14;

    // Header (custom — PO number sits top-right instead of Ref/Generated)
    doc.setFont("times", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...BRAND.primary);
    doc.text(BRAND_NAME, margin, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.muted);
    doc.text("Official Purchase Order & Invoice", margin, 27);

    doc.setFont("times", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...BRAND.primary);
    doc.text(String(po.poNumber || "-"), pageW - margin, 20, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    doc.text("Date: " + (po.date || "-"), pageW - margin, 26, { align: "right" });

    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.7);
    doc.line(margin, 32, pageW - margin, 32);

    // Supplier block
    let y = 42;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.ink);
    doc.text("To Supplier:", margin, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.text(String(po.supplierName || "-"), margin, y);
    y += 7;
    doc.setTextColor(...BRAND.muted);
    doc.text(String(po.supplierEmail || "-"), margin, y);

    // Order specifications
    y += 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.primary);
    doc.text("Order Specifications:", margin, y);

    y += 4;
    const boxH = 30;
    doc.setFillColor(...BRAND.primaryLt);
    doc.roundedRect(margin, y, pageW - margin * 2, boxH, 1.5, 1.5, 'F');

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.ink);
    let innerY = y + 8;
    doc.text(`Item: ${po.ingredientName || "-"}`, margin + 6, innerY);
    innerY += 7;
    doc.text(`Quantity: ${po.quantity || "-"} ${po.unit || ""}`, margin + 6, innerY);
    innerY += 7;
    doc.text(`Notes: ${po.notes || "None"}`, margin + 6, innerY);

    bakeWiseDocFooter(doc, `${BRAND_TAGLINE} • System-generated invoice`);
    bakeWiseSavePdf(doc, `Invoice_${po.poNumber || orderKey}.pdf`);
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

    if (!confirm(`Confirm receipt of ${po.quantity} ${po.unit || ''} of ${po.ingredientName}? This will automatically add it to your live inventory.`)) {
      return;
    }

    const ingRef = ref(db, `ingredients/${po.ingredientKey}`);
    get(ingRef).then((ingSnap) => {
      let updatePromise;

      if (ingSnap.exists()) {
        const currentQty = parseFloat(ingSnap.val().quantity || 0);
        const newQty = currentQty + parseFloat(po.quantity);
        updatePromise = update(ingRef, { quantity: newQty });
      } else {
        // Fallback: Re-create ingredient if it was previously deleted
        updatePromise = set(ingRef, {
          name: po.ingredientName,
          category: "General",
          quantity: parseFloat(po.quantity),
          minThreshold: 5,
          expiryDate: "",
          unit: po.unit || "unit"
        });
      }

      updatePromise.then(() => {
        push(ref(db, 'stock_in/'), {
          ingredientName: po.ingredientName,
          addedQty: parseFloat(po.quantity),
          unit: po.unit || "unit",
          supplier: po.supplierName,
          date: new Date().toISOString().split("T")[0]
        });

        return update(ref(db, `purchase_orders/${orderKey}`), { status: "Received" });
      }).then(() => {
        alert(`Success! Added ${po.quantity} ${po.unit || ''} of ${po.ingredientName} to inventory stock.`);
      }).catch(err => {
        console.error("Error receiving PO:", err);
        alert("Failed to process received order: " + err.message);
      });
    });
  });
};
