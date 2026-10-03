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

// Real-Time Table Renderer for Admin Audit Log Tab
function initAuditLog() {
  const tableBody = document.getElementById("auditLogTableBody");
  const searchInput = document.getElementById("auditSearchInput");

  if (!tableBody) return;

  onValue(ref(db, "audit_logs/"), (snapshot) => {
    tableBody.innerHTML = "";
    if (!snapshot.exists()) {
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No system activities recorded yet.</td></tr>`;
      return;
    }

    const logs = [];
    snapshot.forEach((childSnap) => {
      logs.push({ key: childSnap.key, ...childSnap.val() });
    });

    // Sort newest logs first
    logs.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0));

    const render = () => {
      const query = searchInput ? searchInput.value.toLowerCase() : "";
      tableBody.innerHTML = "";

      const filtered = logs.filter(log => 
        (log.user && log.user.toLowerCase().includes(query)) ||
        (log.action && log.action.toLowerCase().includes(query)) ||
        (log.details && log.details.toLowerCase().includes(query)) ||
        (log.timestamp && log.timestamp.toLowerCase().includes(query))
      );

      if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No matching audit logs found.</td></tr>`;
        return;
      }

      filtered.forEach(log => {
        let badgeClass = "bg-secondary";
        if (log.action === "Stock In") badgeClass = "bg-success";
        if (log.action === "Stock Out") badgeClass = "bg-danger";
        if (log.action === "Dispose Expired") badgeClass = "bg-dark";
        if (log.action === "Add Ingredient" || log.action === "Add Category" || log.action === "Add Supplier") badgeClass = "bg-info text-dark";
        if (log.action === "Edit Ingredient") badgeClass = "bg-primary";
        if (log.action.includes("Delete")) badgeClass = "bg-warning text-dark";

        tableBody.innerHTML += `
          <tr>
            <td class="small text-muted font-monospace">${log.timestamp || "-"}</td>
            <td class="fw-bold">${log.user}</td>
            <td><span class="badge ${badgeClass}">${log.action}</span></td>
            <td>${log.details}</td>
          </tr>
        `;
      });
    };

    render();
    if (searchInput) searchInput.addEventListener("input", render);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuditLog);
} else {
  initAuditLog();
}
