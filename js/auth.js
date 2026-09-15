// js/auth.js
import { auth, db, showAlert } from "./firebase.js";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  sendPasswordResetEmail, 
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Login form with 30-Minute Expiry Verification Check via Auth Metadata
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    let password = document.getElementById("password").value;
    const alertBox = document.getElementById("errorAlert");

    setPersistence(auth, browserSessionPersistence)
      .then(() => {
        return signInWithEmailAndPassword(auth, email, password);
      })
      .then(async (userCredential) => {
        const user = userCredential.user;

        // Check if verified
        if (!user.emailVerified) {
          const creationTime = new Date(user.metadata.creationTime).getTime();
          const now = Date.now();
          const thirtyMinutes = 30 * 60 * 1000;

          // Check if 30 minutes elapsed since account creation
          if ((now - creationTime) > thirtyMinutes) {
            await signOut(auth);
            if (alertBox) {
              alertBox.className = "alert alert-warning py-2 mb-3";
              alertBox.innerHTML = `
                <div><strong>Verification expired:</strong> Your 30-minute verification window has ended.</div>
                <button type="button" class="btn btn-sm btn-dark mt-2 fw-bold" id="resendVerificationBtn">
                  <i class="bi bi-arrow-repeat me-1"></i> Resend Fresh Link
                </button>
              `;
              alertBox.classList.remove("d-none");

              // Bind click event to resend verification
              document.getElementById("resendVerificationBtn")?.addEventListener("click", async () => {
                const resendBtn = document.getElementById("resendVerificationBtn");
                if (resendBtn) {
                  resendBtn.disabled = true;
                  resendBtn.innerText = "Sending...";
                }

                try {
                  const tempCred = await signInWithEmailAndPassword(auth, email, password);
                  await sendEmailVerification(tempCred.user);
                  
                  password = null;
                  await signOut(auth);
                  
                  alertBox.className = "alert alert-success py-2 mb-3";
                  alertBox.innerText = "A fresh verification link has been sent! Check your inbox.";
                } catch (err) {
                  alertBox.className = "alert alert-danger py-2 mb-3";
                  alertBox.innerText = "Error: " + err.message;
                  if (resendBtn) {
                    resendBtn.disabled = false;
                    resendBtn.innerText = "Resend Fresh Link";
                  }
                }
              });
            }
            return;
          }

          password = null;
          await signOut(auth);
          showAlert(alertBox, "Access Denied: Please verify your email via the link sent to your inbox.", "danger");
          return;
        }

        password = null;
        window.location.href = "dashboard.html";
      })
      .catch((error) => {
        password = null;
        showAlert(alertBox, "Login failed: " + error.message, "danger");
      });
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
            showAlert(alertBox, "Account created! Security notice: You have 30 minutes to verify your email before the link expires.", "success");
            setTimeout(() => window.location.href = "index.html", 4000);
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
      } else {
        signOut(auth).then(() => {
          alert("Access Denied: Your user profile has been deleted by an administrator.");
          window.location.href = "index.html";
        });
      }
    });
  } else {
    if (window.location.pathname.includes("dashboard.html")) {
      window.location.href = "index.html";
    }
  }
});
