// js/recipes.js
import { db, auth } from "./firebase.js";
import { ref, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let globalRecipes = {};

// Helper function to dynamically generate <option> markup from global inventory
function getIngredientOptionsHtml(selectedKey = "") {
  let optionsHtml = `<option value="">Select Ingredient</option>`;
  
  const ingredientsData = window.allIngredients || {};

  if (ingredientsData) {
    Object.keys(ingredientsData).forEach((key) => {
      const item = ingredientsData[key];
      const isSelected = key === selectedKey ? "selected" : "";
      optionsHtml += `<option value="${key}" ${isSelected}>${item.name} (${item.unit || 'unit'})</option>`;
    });
  }

  return optionsHtml;
}

// Function to refresh options in all existing rows
function updateAllIngredientDropdowns() {
  const selects = document.querySelectorAll(".recipe-ing-select");
  selects.forEach((select) => {
    const currentVal = select.value;
    select.innerHTML = getIngredientOptionsHtml(currentVal);
  });
}

// Sync dropdown options whenever ingredients node updates
onValue(ref(db, 'ingredients/'), () => {
  updateAllIngredientDropdowns();
});

// Dynamic ingredient row creation
const recipeIngContainer = document.getElementById("recipeIngredientsContainer");
const addIngRowBtn = document.getElementById("addIngredientRowBtn");

function createIngredientRow() {
  if (!recipeIngContainer) return;

  const rowId = "row-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  const rowDiv = document.createElement("div");
  rowDiv.className = "row g-2 mb-2 align-items-center recipe-ing-row";
  rowDiv.id = rowId;

  rowDiv.innerHTML = `
    <div class="col-7">
      <select class="form-select form-select-sm recipe-ing-select" required>
        ${getIngredientOptionsHtml()}
      </select>
    </div>
    <div class="col-4">
      <input type="number" step="0.01" min="0.01" class="form-control form-control-sm recipe-ing-qty" placeholder="Qty per unit" required>
    </div>
    <div class="col-1 text-end">
      <button type="button" class="btn btn-sm btn-outline-danger border-0 p-0" onclick="document.getElementById('${rowId}').remove()">
        <i class="bi bi-x-circle-fill"></i>
      </button>
    </div>
  `;
  recipeIngContainer.appendChild(rowDiv);
}

if (addIngRowBtn) {
  addIngRowBtn.addEventListener("click", createIngredientRow);
}

// Save Recipe Handler
const createRecipeForm = document.getElementById("createRecipeForm");
if (createRecipeForm) {
  createRecipeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const recipeName = document.getElementById("recipeName").value.trim();
    const rows = document.querySelectorAll(".recipe-ing-row");

    if (rows.length === 0) {
      alert("Please add at least one ingredient row.");
      return;
    }

    const ingredientsList = [];
    let isValid = true;
    const currentInventory = window.allIngredients || {};

    rows.forEach((row) => {
      const select = row.querySelector(".recipe-ing-select");
      const qtyInput = row.querySelector(".recipe-ing-qty");

      const ingKey = select.value;
      const amount = parseFloat(qtyInput.value);

      if (!ingKey || isNaN(amount) || amount <= 0) {
        isValid = false;
        return;
      }

      ingredientsList.push({
        ingredientKey: ingKey,
        ingredientName: currentInventory[ingKey]?.name || "Unknown",
        unit: currentInventory[ingKey]?.unit || "",
        amountPerUnit: amount
      });
    });

    if (!isValid) {
      alert("Please select a valid ingredient and amount for each row.");
      return;
    }

    push(ref(db, 'recipes/'), {
      name: recipeName,
      ingredients: ingredientsList,
      createdAt: new Date().toISOString()
    }).then(() => {
      alert(`Recipe "${recipeName}" saved successfully!`);
      createRecipeForm.reset();
      if (recipeIngContainer) recipeIngContainer.innerHTML = "";
      createIngredientRow();
    }).catch((err) => alert("Error saving recipe: " + err.message));
  });
}

// Fetch & Display Saved Recipes
onValue(ref(db, 'recipes/'), (snapshot) => {
  globalRecipes = snapshot.exists() ? snapshot.val() : {};
  renderRecipesUI();
});

function renderRecipesUI() {
  const recipeTable = document.getElementById("recipeTableBody");
  const bakeSelect = document.getElementById("bakeRecipeSelect");

  if (recipeTable) recipeTable.innerHTML = "";
  if (bakeSelect) bakeSelect.innerHTML = `<option value="">Select Recipe...</option>`;

  Object.keys(globalRecipes).forEach((key) => {
    const recipe = globalRecipes[key];

    if (bakeSelect) {
      bakeSelect.innerHTML += `<option value="${key}">${recipe.name}</option>`;
    }

    if (recipeTable) {
      const ingredientsSummary = (recipe.ingredients || []).map(i => 
        `<span class="badge bg-light text-dark border me-1 mb-1">${i.ingredientName}: ${i.amountPerUnit} ${i.unit}</span>`
      ).join(" ");

      recipeTable.innerHTML += `
        <tr>
          <td class="fw-bold">${recipe.name}</td>
          <td>${ingredientsSummary}</td>
          <td>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteRecipe('${key}')">Delete</button>
          </td>
        </tr>`;
    }
  });
}

window.deleteRecipe = function(key) {
  if (confirm("Are you sure you want to delete this recipe?")) {
    remove(ref(db, `recipes/${key}`));
  }
};

// -------------------------------------------------------------
// MODULE 6: BATCH PRODUCTION & MANUAL STOCK OUT
// -------------------------------------------------------------
const bakeBatchForm = document.getElementById("bakeBatchForm");
if (bakeBatchForm) {
  bakeBatchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const recipeKey = document.getElementById("bakeRecipeSelect").value;
    const batchQty = parseFloat(document.getElementById("bakeBatchQty").value);

    if (!recipeKey || isNaN(batchQty) || batchQty <= 0) {
      alert("Please select a valid recipe and batch quantity.");
      return;
    }

    const recipe = globalRecipes[recipeKey];
    if (!recipe || !recipe.ingredients) return;

    const currentInventory = window.allIngredients || {};
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    let expiredItems = [];
    let missingStock = [];

    recipe.ingredients.forEach(item => {
      const ingredient = currentInventory[item.ingredientKey];
      const currentStock = ingredient?.quantity || 0;
      const totalNeeded = item.amountPerUnit * batchQty;

      if (ingredient?.expiryDate && currentStock > 0) {
        const expDate = new Date(ingredient.expiryDate);
        if (expDate < todayDate) {
          expiredItems.push(`${item.ingredientName} (Expired: ${currentStock} ${item.unit} on ${ingredient.expiryDate})`);
        }
      }

      if (currentStock < totalNeeded) {
        missingStock.push(`${item.ingredientName} (Need: ${totalNeeded} ${item.unit}, Have: ${currentStock} ${item.unit})`);
      }
    });

    if (expiredItems.length > 0) {
      alert("Cannot bake batch! The following ingredients are EXPIRED:\n\n" + expiredItems.join("\n") + "\n\nPlease discard expired items before baking.");
      return;
    }

    if (missingStock.length > 0) {
      alert("Cannot complete batch due to insufficient stock:\n\n" + missingStock.join("\n"));
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const updatePromises = recipe.ingredients.map(item => {
      const currentStock = currentInventory[item.ingredientKey].quantity;
      const totalDeduction = item.amountPerUnit * batchQty;
      const newQty = currentStock - totalDeduction;

      let ingredientUpdates = { quantity: newQty };
      if (newQty <= 0) {
        ingredientUpdates.expiryDate = "";
      }

      const updateStock = update(ref(db, `ingredients/${item.ingredientKey}`), ingredientUpdates);

      const recordStockOut = push(ref(db, 'stock_out/'), {
        ingredientName: item.ingredientName,
        deductedQty: totalDeduction,
        unit: item.unit,
        reason: `Production: ${batchQty}x ${recipe.name}`,
        date: today
      });

      return Promise.all([updateStock, recordStockOut]);
    });

    Promise.all(updatePromises).then(() => {
      alert(`Successfully baked ${batchQty}x ${recipe.name}! Stock deducted.`);
      bakeBatchForm.reset();
    }).catch(err => alert("Error updating stock: " + err.message));
  });
}

// Manual Stock Out
const stockOutForm = document.getElementById("stockOutForm");
if (stockOutForm) {
  stockOutForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const ingKey = document.getElementById("stockOutIngSelect").value;
    const deductedQty = parseFloat(document.getElementById("stockOutQty").value);
    const reason = document.getElementById("stockOutReason").value;
    const entryDate = document.getElementById("stockOutDate").value;

    get(ref(db, `ingredients/${ingKey}`)).then((snap) => {
      if (!snap.exists()) return;

      const item = snap.val();
      if (item.quantity < deductedQty) {
        return alert("Error: Not enough stock to deduct!");
      }

      const newQty = item.quantity - deductedQty;
      let ingredientUpdates = { quantity: newQty };
      if (newQty <= 0) {
        ingredientUpdates.expiryDate = "";
      }

      update(ref(db, `ingredients/${ingKey}`), ingredientUpdates);

      push(ref(db, 'stock_out/'), { 
        ingredientName: item.name, 
        deductedQty: deductedQty, 
        unit: item.unit, 
        reason: reason, 
        date: entryDate 
      }).then(() => { 
        alert("Stock Out recorded and stock deducted!"); 
        stockOutForm.reset(); 
        const today = new Date().toISOString().split("T")[0];
        const stockOutDateElem = document.getElementById("stockOutDate");
        if (stockOutDateElem) stockOutDateElem.value = today;
      });
    });
  });

  onValue(ref(db, 'stock_out/'), (snap) => {
    const table = document.getElementById("stockOutTableBody");
    if (table) table.innerHTML = "";
    if (snap.exists()) {
      Object.values(snap.val()).forEach((item) => {
        if (table) {
          table.innerHTML += `<tr><td>${item.date}</td><td class="fw-bold">${item.ingredientName}</td><td class="text-danger fw-bold">-${item.deductedQty} ${item.unit}</td><td>${item.reason}</td></tr>`;
        }
      });
    }
  });
}

// Manual Discard Action
window.discardIngredient = function(key) {
  const currentInventory = window.allIngredients || {};
  const item = currentInventory[key];
  if (!item) return;

  if (item.quantity <= 0) {
    alert(`"${item.name}" already has 0 stock.`);
    return;
  }

  if (confirm(`Are you sure you want to discard all remaining stock (${item.quantity} ${item.unit}) of "${item.name}"?`)) {
    const discardedQty = item.quantity;
    const today = new Date().toISOString().split("T")[0];

    const updateStock = update(ref(db, `ingredients/${key}`), { 
      quantity: 0,
      expiryDate: ""
    });

    const logStockOut = push(ref(db, 'stock_out/'), {
      ingredientName: item.name,
      deductedQty: discardedQty,
      unit: item.unit,
      reason: "Expired / Discarded",
      date: today
    });

    Promise.all([updateStock, logStockOut]).then(() => {
      alert(`Successfully discarded ${discardedQty} ${item.unit} of "${item.name}".`);
    }).catch(err => {
      alert("Error processing discard action: " + err.message);
    });
  }
};
