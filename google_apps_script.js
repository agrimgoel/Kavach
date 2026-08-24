/**
 * Google Apps Script for Emergency Service Finder
 * 
 * Instructions:
 * 1. Create a Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Delete any default code and paste this script.
 * 4. Click Save (floppy disk icon).
 * 5. Click Deploy > New Deployment.
 * 6. Select "Web app" as the deployment type.
 * 7. Set:
 *    - Execute as: "Me" (your email)
 *    - Who has access: "Anyone"
 * 8. Click Deploy. Authorize access if prompted.
 * 9. Copy the Web App URL and paste it in the Web App URL settings input of the website.
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Emergency Service API is running." }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === "register") {
      var usersSheet = spreadsheet.getSheetByName("Users");
      if (!usersSheet) {
        usersSheet = spreadsheet.insertSheet("Users");
        usersSheet.appendRow(["Timestamp", "Name", "Phone", "Emergency Contact Name", "Emergency Contact Phone"]);
        usersSheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#e0f7fa");
      }
      
      // Check if user already exists (by phone) to update or append
      var phone = String(data.phone);
      var rows = usersSheet.getDataRange().getValues();
      var userRowIndex = -1;
      
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][2]) === phone) {
          userRowIndex = i + 1; // 1-based index
          break;
        }
      }
      
      var timestamp = new Date();
      if (userRowIndex > -1) {
        // Update user
        usersSheet.getRange(userRowIndex, 1).setValue(timestamp);
        usersSheet.getRange(userRowIndex, 2).setValue(data.name);
        usersSheet.getRange(userRowIndex, 4).setValue(data.emergencyName);
        usersSheet.getRange(userRowIndex, 5).setValue(data.emergencyPhone);
      } else {
        // New user
        usersSheet.appendRow([timestamp, data.name, phone, data.emergencyName, data.emergencyPhone]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "User registered/updated successfully." }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeaders({ "Access-Control-Allow-Origin": "*" });
    }
    
    if (action === "logAlert") {
      var alertsSheet = spreadsheet.getSheetByName("Alerts");
      if (!alertsSheet) {
        alertsSheet = spreadsheet.insertSheet("Alerts");
        alertsSheet.appendRow(["Timestamp", "User Phone", "Alert Type", "Latitude", "Longitude", "Map Link", "Emergency Contact Notified"]);
        alertsSheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#ffebee");
      }
      
      var timestamp = new Date();
      var mapLink = "https://www.google.com/maps?q=" + data.latitude + "," + data.longitude;
      
      alertsSheet.appendRow([
        timestamp,
        data.phone,
        data.alertType,
        data.latitude,
        data.longitude,
        mapLink,
        data.emergencyPhone
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Emergency alert logged successfully." }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeaders({ "Access-Control-Allow-Origin": "*" });
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid action." }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders({ "Access-Control-Allow-Origin": "*" });
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders({ "Access-Control-Allow-Origin": "*" });
  }
}
