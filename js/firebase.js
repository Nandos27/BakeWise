// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  sendPasswordResetEmail, 
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, push, set, onValue, remove, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDJaABTeg8QWibEzf9Q9tFFPd-1GvBbp1k",
  authDomain: "bakery-inventory-system.firebaseapp.com",
  databaseURL: "https://bakery-inventory-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bakery-inventory-system",
  storageBucket: "bakery-inventory-system.firebasestorage.app",
  messagingSenderId: "369844090351",
  appId: "1:369844090351:web:528b34f3a36cc14a74321a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Helper function for formatting numbers
export function formatDecimal(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return parseFloat(Number(num).toFixed(3)).toString();
}

// Helper function for UI alerts
export function showAlert(element, message, type) {
  if (element) {
    element.className = `alert alert-${type}`;
    element.innerText = message;
    element.classList.remove("d-none");
  }
}
