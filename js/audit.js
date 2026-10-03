// js/audit.js
import { db, auth } from "./firebase.js";
import { ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Helper: Log an event to Firebase Realtime Database
export async function logAuditEvent(actionType, details) {
  try {
    const user = auth.currentUser;
    const userEmail = user ? (user.email || user.uid) : "Unknown User";
    const timestamp = new Date().toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    const logEntry = {
      user: userEmail,
      action: actionType, // e.g. "Stock In", "Stock Out", "Bake Batch", "Dispose Expired"
      details: details,   // e.g. "Added 50 kg Flour"
      timestamp: timestamp,
      rawDate: Date.now()
    };

    await push(ref(db, "audit_logs/"), logEntry);
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

// Render Audit Logs Table in Real-Time
function initAuditLog() {
  const tableBody = document.getElementById("auditLogTableBody");
  const searchInput = document.getElementById("auditSearchInput");

  if (!tableBody) return;

  onValue(ref(db, "audit_logs/"), (snapshot) => {
    tableBody.innerHTML = "";
    if (!snapshot.exists()) {
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No audit records found.</td></tr>`;
      return;
    }

    const logs = [];
    snapshot.forEach((childSnap) => {
      logs.push({ key: childSnap.key, ...childSnap.val() });
    });

    // Sort newest first
    logs.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0));

    const render = () => {
      const query = searchInput ? searchInput.value.toLowerCase() : "";
      tableBody.innerHTML = "";

      const filtered = logs.filter(log => 
        (log.user && log.user.toLowerCase().includes(query)) ||
        (log.action && log.action.toLowerCase().includes(query)) ||
        (log.details && log.details.toLowerCase().includes(query))
      );

      if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No matching audit logs.</td></tr>`;
        return;
      }

      filtered.forEach(log => {
        let badgeColor = "bg-secondary";
        if (log.action === "Stock In") badgeColor = "bg-success";
        if (log.action === "Stock Out" || log.action === "Dispose Expired") badgeColor = "bg-danger";
        if (log.action === "Bake Batch") badgeColor = "bg-warning text-dark";

        tableBody.innerHTML += `
          <tr>
            <td class="small text-muted">${log.timestamp || "-"}</td>
            <td class="fw-bold">${log.user}</td>
            <td><span class="badge ${badgeColor}">${log.action}</span></td>
            <td>${log.details}</td>
          </tr>
        `;
      });
    };

    render();
    if (searchInput) searchInput.addEventListener("input", render);
  });
}

document.addEventListener("DOMContentLoaded", initAuditLog);
