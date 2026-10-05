// js/audit.js
import { db, auth } from "./firebase.js";
import { ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Helper: Log any user operation to Firebase
export async function logAuditEvent(actionType, details) {
  try {
    const user = auth.currentUser;
    const userEmail = user ? (user.email || user.uid) : "System / Anonymous";
    
    const now = new Date();
    const timestamp = now.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit"
    }) + " " + now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    const logEntry = {
      user: userEmail,
      action: actionType,
      details: details,
      timestamp: timestamp,
      rawDate: Date.now()
    };

    await push(ref(db, "audit_logs/"), logEntry);
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

// Real-Time Table Renderer for Admin Audit Log Tab (paginated)
let auditFullList = [];
let auditPage = 1;
let auditPerPage = 20;
let auditSearchQuery = "";

function renderAuditPage() {
  const tableBody = document.getElementById("auditLogTableBody");
  const pagerEl = document.getElementById("auditPager");
  if (!tableBody) return;

  // Filter
  const q = auditSearchQuery.toLowerCase();
  const filtered = auditFullList.filter(log =>
    (log.user && log.user.toLowerCase().includes(q)) ||
    (log.action && log.action.toLowerCase().includes(q)) ||
    (log.details && log.details.toLowerCase().includes(q)) ||
    (log.timestamp && log.timestamp.toLowerCase().includes(q))
  );

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No matching audit logs found.</td></tr>`;
    if (pagerEl) pagerEl.innerHTML = "";
    return;
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / auditPerPage));
  if (auditPage > totalPages) auditPage = totalPages;
  if (auditPage < 1) auditPage = 1;

  const start = (auditPage - 1) * auditPerPage;
  const slice = filtered.slice(start, start + auditPerPage);

  tableBody.innerHTML = slice.map(log => {
    let badgeClass = "bg-secondary";
    if (log.action === "Stock In") badgeClass = "bg-success";
    if (log.action === "Stock Out") badgeClass = "bg-danger";
    if (log.action === "Dispose Expired") badgeClass = "bg-dark";
    if (log.action === "Add Ingredient" || log.action === "Add Category" || log.action === "Add Supplier") badgeClass = "bg-info text-dark";
    if (log.action === "Edit Ingredient") badgeClass = "bg-primary";
    if (log.action && log.action.includes("Delete")) badgeClass = "bg-warning text-dark";

    return `
      <tr>
        <td class="small text-muted font-monospace">${log.timestamp || "-"}</td>
        <td class="fw-bold">${log.user}</td>
        <td><span class="badge ${badgeClass}">${log.action}</span></td>
        <td>${log.details}</td>
      </tr>`;
  }).join("");

  if (pagerEl) {
    pagerEl.innerHTML = `
      <div class="d-flex justify-content-between align-items-center small text-muted mt-2 px-1 flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2">
          <span>Showing ${start + 1}–${Math.min(start + auditPerPage, total)} of ${total}</span>
          <select class="form-select form-select-sm" style="width:auto;" id="auditPerPageSelect">
            <option value="10"  ${auditPerPage===10 ?"selected":""}>10 / page</option>
            <option value="20"  ${auditPerPage===20 ?"selected":""}>20 / page</option>
            <option value="50"  ${auditPerPage===50 ?"selected":""}>50 / page</option>
            <option value="100" ${auditPerPage===100?"selected":""}>100 / page</option>
          </select>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-sm btn-outline-secondary" id="auditPrev" ${auditPage===1?"disabled":""}>
            <i class="bi bi-chevron-left"></i>
          </button>
          <span>Page ${auditPage} / ${totalPages}</span>
          <button class="btn btn-sm btn-outline-secondary" id="auditNext" ${auditPage===totalPages?"disabled":""}>
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>`;

    pagerEl.querySelector("#auditPrev")?.addEventListener("click", () => {
      if (auditPage > 1) { auditPage--; renderAuditPage(); }
    });
    pagerEl.querySelector("#auditNext")?.addEventListener("click", () => {
      if (auditPage < totalPages) { auditPage++; renderAuditPage(); }
    });
    pagerEl.querySelector("#auditPerPageSelect")?.addEventListener("change", (e) => {
      auditPerPage = parseInt(e.target.value, 10) || 20;
      auditPage = 1;
      renderAuditPage();
    });
  }
}

function initAuditLog() {
  const tableBody = document.getElementById("auditLogTableBody");
  const searchInput = document.getElementById("auditSearchInput");
  if (!tableBody) return;

  onValue(ref(db, "audit_logs/"), (snapshot) => {
    auditFullList = [];
    if (snapshot.exists()) {
      snapshot.forEach((childSnap) => {
        auditFullList.push({ key: childSnap.key, ...childSnap.val() });
      });
      auditFullList.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0));
    }
    auditPage = 1;
    renderAuditPage();
  });

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      auditSearchQuery = e.target.value || "";
      auditPage = 1;
      renderAuditPage();
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuditLog);
} else {
  initAuditLog();
}
