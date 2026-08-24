# Kavach - Emergency Service Finder & Alert System 🛡️

**Kavach** is a premium, mobile-first web application designed to auto-detect a user's live GPS location, list nearby emergency facilities (Police, Hospitals, Fire Stations) on an interactive map, and trigger instant calls to helper services while automatically transmitting the live location coordinates to a configured guardian (e.g., father).

It uses **LocalStorage** for offline persistence and integrates seamlessly with **Google Sheets** (via **Google Apps Script**) as a real-time database.

---

## 🚀 Hosting on Netlify

Since this project consists of pure static files (`index.html`, `style.css`, `app.js`), hosting it on Netlify is simple and free:

1. **Sign up / Log in** to [Netlify](https://www.netlify.com/).
2. Click **Add new site** > **Deploy manually**.
3. Drag and drop the entire folder containing `index.html`, `style.css`, and `app.js` into the upload box.
4. Netlify will deploy the site and provide a secure `https://...` URL.
5. **Note on HTTPS:** Geolocation APIs (mobile phone GPS) require a secure connection (`https`) to function. Netlify automatically provides SSL/HTTPS for free, making it perfect for Kavach!

---

## 📊 Setting Up Google Sheets Database & Sync

To connect the application to your database so that all registrations and emergency logs are automatically synced:

### Step 1: Create a Google Sheet
1. Open [Google Sheets](https://sheets.google.com) and create a blank spreadsheet.
2. You can name it `Kavach Emergency Logs`.

### Step 2: Add Google Apps Script
1. Inside your sheet, click on **Extensions** in the top menu and select **Apps Script**.
2. Delete any code in the editor and copy-paste the contents of the `google_apps_script.js` file (provided in the workspace root).
3. Click the **Save** (floppy disk) icon.

### Step 3: Deploy as Web App
1. Click the **Deploy** button at the top right, then select **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set the following settings:
   - **Description**: `Kavach API`
   - **Execute as**: `Me` (your Google account)
   - **Who has access**: `Anyone` *(Crucial: This allows Netlify to communicate with the sheet)*
4. Click **Deploy**.
5. You might be prompted to **Authorize Access**. Click *Authorize*, log into your account, click *Advanced*, and select *Go to Kavach API (unsafe)*.
6. Once deployed, copy the **Web app URL** provided in the confirmation window. It will look like this:
   `https://script.google.com/macros/s/.../exec`

---

## ⚙️ How and Where to Paste the Web App URL

1. Open your deployed Netlify website (or run a local server).
2. The website will display the **Registration (Initialize Kavach)** screen on first run. Fill in your details and your guardian's contact info. Click **Initialize Kavach**.
3. Once on the main dashboard, look at the top right corner. Click the **Gear Icon (Settings)**.
4. In the settings panel under **Database Integration (Google Sheets)**, you will see an input field labeled `Google Apps Script Web App URL`.
5. **Paste the URL** you copied in Step 3 here.
6. Click **Save Config**.

---

## 💡 How Sync and Emergency Alerts Work

Once you save the URL, the site is fully synced with your Google Sheet:
- **Registration Sync:** Every time a new user registers or edits their details in the settings panel, it sends a payload to the Apps Script. The sheet automatically creates a tab named `Users` and inserts/updates the user details.
- **Emergency Action Trigger:** When a user taps any big action button (e.g., Police, Ambulance, Fire, Women Helpline):
  1. The app immediately initiates a telephone dial call to the helpline.
  2. The app compiles a pre-filled SMS/WhatsApp message containing the user's exact coordinate variables and a Google Maps live-tracking link.
  3. A popup shows options to **Send SMS** or **Send WhatsApp** directly to the registered loved one's phone with 1 tap.
  4. Simultaneously, the app runs a background POST request to send the coordinates, timestamp, and alert type directly to the Sheets Web App, which logs it under a sheet named `Alerts`.
