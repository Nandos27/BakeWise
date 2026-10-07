# BakeWise – Bakery Ingredient Tracking Web Application

BakeWise is a web-based bakery inventory management system developed to
help bakeries manage ingredients, track stock movements, monitor inventory,
and support purchasing decisions. The system aims to reduce manual
inventory errors, improve stock visibility, and help reduce ingredient
wastage.

## 📋 Table of Contents

1. [Features](#-features)
2. [Tech Stack](#-tech-stack)
3. [System Workflow](#-system-workflow)
4. [Getting Started](#-getting-started)
5. [Usage](#-usage)
6. [Testing](#-testing)
7. [Roadmap](#-roadmap)
8. [Project Team](#-project-team)

## ✨ Features

- **User Authentication:** User registration and login using Firebase
  Authentication.
- **Role-Based Access:** Provides system functions according to the user's
  assigned role.
- **Dashboard:** Provides an overview of inventory information and
  monitoring data.
- **Inventory Management:** Add, view, update, and delete ingredient
  records.
- **Stock In & Stock Out:** Record incoming and outgoing ingredient stock
  and update inventory quantities.
- **Recipe Management:** Store recipes and their required ingredients.
- **Recipe-Based Stock Deduction:** Automatically deduct required
  ingredient quantities from inventory when applicable.
- **Low-Stock Monitoring:** Identify ingredients that reach their minimum
  stock level.
- **Expiry Monitoring:** Monitor ingredient expiry information.
- **Supplier Management:** Manage supplier information.
- **Purchase Orders:** Create and manage ingredient purchase orders.
- **30-Day Forecasting:** Estimate future ingredient requirements using
  historical usage information with a 10% buffer.
- **Transaction History:** Track inventory movements and activities.
- **Reports:** Generate inventory and forecasting information for
  monitoring and purchasing decisions.

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3, Bootstrap 5.3, JavaScript
- **Authentication:** Firebase Authentication
- **Database:** Firebase Realtime Database
- **Charts:** Chart.js
- **PDF Generation:** jsPDF, jsPDF AutoTable, html2pdf.js
- **Email Integration:** EmailJS
- **Development:** Visual Studio Code
- **Version Control:** Git & GitHub
- **Hosting:** Hostinger
- **Automation:** GitHub Actions

### How the technologies work together

- **HTML5** provides the structure of the web application.
- **CSS3** provides custom styling and layout.
- **Bootstrap** provides responsive layouts and interface components.
- **JavaScript** handles application logic, user interactions,
  calculations, database operations, and dynamic interface updates.
- **Firebase Authentication** handles user authentication.
- **Firebase Realtime Database** stores and synchronizes application data.
- **Chart.js** is used for data visualisation and dashboard charts.
- **jsPDF / html2pdf.js** support PDF report generation.
- **EmailJS** is used for email-related purchasing functionality.
- **Git and GitHub** are used for source-code version control and
  collaboration.

## 🔄 System Workflow

```text
User
 ↓
Login / Authentication
 ↓
Dashboard
 ↓
Inventory Management
 ↓
Stock In / Stock Out
 ↓
Recipe Management & Stock Deduction
 ↓
Low Stock / Expiry Monitoring
 ↓
Suppliers / Purchase Orders
 ↓
30-Day Forecast
 ↓
Reports / Transaction History
