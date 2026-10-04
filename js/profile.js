import { auth, db } from "./firebase.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { sendPasswordResetEmail, updateProfile, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

window.openProfileModal = async function () {
  const user = auth.currentUser;
  if (!user) return;

  document.getElementById("profileEmail").value = user.email || "";
  document.getElementById("profileNameStatus").innerHTML = "";
  document.getElementById("profileStatus").innerHTML = "";

  try {
    const snap = await get(ref(db, `users/${user.uid}`));
    const data = snap.exists() ? snap.val() : {};
    document.getElementById("profileName").value = data.fullName || "";
    document.getElementById("profileRole").value = data.role || "staff";
  } catch {
    document.getElementById("profileName").value = "";
    document.getElementById("profileRole").value = "—";
  }

  const modal = bootstrap.Modal.getInstance(document.getElementById("profileModal"))
             || new bootstrap.Modal(document.getElementById("profileModal"));
  modal.show();
};

window.saveProfileName = async function () {
  const user = auth.currentUser;
  if (!user) return;

  const status = document.getElementById("profileNameStatus");
  const newName = document.getElementById("profileName").value.trim();

  const setStatus = (msg, color) => {
    status.innerHTML = `<span style="color:${color};">${msg}</span>`;
  };

  if (!newName) return setStatus("Name cannot be empty.", "#dc3545");
  if (newName.length > 60) return setStatus("Name is too long.", "#dc3545");

  try {
    // Auth displayName (used by Firebase internally, keeps things tidy)
    await updateProfile(user, { displayName: newName });

    // DB fullName — this is what the app reads
    await update(ref(db, `users/${user.uid}`), { fullName: newName });

    setStatus("Name updated.", "#198754");
    setTimeout(() => status.innerHTML = "", 2000);

    const greeting = document.getElementById("userGreeting");
    if (greeting) greeting.textContent = `Welcome, ${newName}!`;
  } catch (err) {
    setStatus(err.message || "Could not update name.", "#dc3545");
  }
};

window.sendProfilePasswordReset = async function () {
  const status = document.getElementById("profileStatus");
  const user = auth.currentUser;
  if (!user || !user.email) return;

  try {
    await sendPasswordResetEmail(auth, user.email);
    status.innerHTML = `<span style="color:#198754;">Reset email sent to ${user.email}. Check your inbox.</span>`;
  } catch (err) {
    status.innerHTML = `<span style="color:#dc3545;">${err.message || "Could not send reset email."}</span>`;
  }
};

// Populate the sidebar greeting when auth state resolves
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const greeting = document.getElementById("userGreeting");
  if (!greeting) return;

  try {
    const snap = await get(ref(db, `users/${user.uid}`));
    const name = snap.exists() ? (snap.val().fullName || "") : "";
    greeting.textContent = `Welcome, ${name || user.email?.split("@")[0] || "User"}!`;
  } catch {
    greeting.textContent = `Welcome, ${user.displayName || user.email?.split("@")[0] || "User"}!`;
  }
});
