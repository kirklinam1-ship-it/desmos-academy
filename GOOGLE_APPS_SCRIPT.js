/*  ============================================================
    DESMOS ACADEMY — Google Apps Script Backend
    ============================================================

    SETUP INSTRUCTIONS (takes ~5 minutes):

    1. Go to https://sheets.google.com and create a new spreadsheet
    2. Rename it "Desmos Academy Tracker"
    3. Rename the first tab (bottom) to "Roster"
    4. Create a second tab called "Activity Log"
    5. In the "Roster" tab, add these headers in Row 1:
         A1: Student ID
         B1: Student Name
         C1: Last Login
         D1: M1 Practice
         E1: M1 Checkpoint
         F1: M2 Practice
         G1: M2 Checkpoint
         H1: M3 Practice
         I1: M3 Checkpoint
         J1: Status
    6. In the "Activity Log" tab, add these headers in Row 1:
         A1: Timestamp
         B1: Student ID
         C1: Student Name
         D1: Action
         E1: Module
         F1: Detail
    7. Now go to Extensions → Apps Script
    8. Delete whatever is in the editor and paste this ENTIRE file
    9. Click the disk icon to Save (or Ctrl+S)
    10. Click "Deploy" → "New deployment"
    11. Click the gear icon next to "Select type" → choose "Web app"
    12. Set "Execute as" → "Me"
    13. Set "Who has access" → "Anyone"
    14. Click "Deploy"
    15. Click "Authorize access" → choose your Google account →
        click "Advanced" → "Go to Desmos Academy (unsafe)" → "Allow"
    16. COPY the Web App URL it gives you
    17. Open index.html, find the line that says:
        const SHEETS_API_URL = '';
        and paste your URL between the quotes
    18. Done! Student data will now sync to your Google Sheet.

    ============================================================ */

// Get the active spreadsheet
function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

// Handle incoming POST requests from the HTML page
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (action === 'login') {
      return handleLogin(data);
    } else if (action === 'practice_complete') {
      return handlePractice(data);
    } else if (action === 'checkpoint_pass') {
      return handleCheckpoint(data, true);
    } else if (action === 'checkpoint_fail') {
      return handleCheckpoint(data, false);
    } else if (action === 'get_progress') {
      return handleGetProgress(data);
    }

    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Unknown action'}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Also handle GET requests (for loading progress)
function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'get_progress') {
      return handleGetProgress(e.parameter);
    } else if (action === 'get_roster') {
      return handleGetRoster();
    }
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Unknown action'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== HANDLERS =====

function handleLogin(data) {
  var roster = getSheet('Roster');
  var log = getSheet('Activity Log');
  var studentId = String(data.studentId);
  var studentName = data.studentName;
  var now = new Date().toLocaleString('en-US', {timeZone: 'America/Chicago'});

  // Find or create student row in Roster
  var row = findStudentRow(roster, studentId);

  if (row === -1) {
    // New student — add to roster
    roster.appendRow([studentId, studentName, now, 0, '', 0, '', 0, '', 'Active']);
  } else {
    // Existing student — update last login and name
    roster.getRange(row, 2).setValue(studentName);
    roster.getRange(row, 3).setValue(now);
  }

  // Log the login
  log.appendRow([now, studentId, studentName, 'LOGIN', '', '']);

  // Return any saved progress for this student
  return getProgressResponse(roster, studentId);
}

function handlePractice(data) {
  var roster = getSheet('Roster');
  var log = getSheet('Activity Log');
  var studentId = String(data.studentId);
  var moduleId = data.moduleId;
  var problemIndex = data.problemIndex;
  var now = new Date().toLocaleString('en-US', {timeZone: 'America/Chicago'});

  var row = findStudentRow(roster, studentId);
  if (row === -1) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Student not found'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Update practice count for the module
  // M1 Practice = col 4, M2 Practice = col 6, M3 Practice = col 8
  var col = 2 + (moduleId * 2);
  var currentCount = roster.getRange(row, col).getValue() || 0;
  roster.getRange(row, col).setValue(currentCount + 1);

  // Log the activity
  log.appendRow([now, studentId, data.studentName, 'PRACTICE_COMPLETE',
    'Module ' + moduleId, 'Problem ' + (problemIndex + 1)]);

  return ContentService.createTextOutput(JSON.stringify({status: 'ok'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleCheckpoint(data, passed) {
  var roster = getSheet('Roster');
  var log = getSheet('Activity Log');
  var studentId = String(data.studentId);
  var moduleId = data.moduleId;
  var now = new Date().toLocaleString('en-US', {timeZone: 'America/Chicago'});

  var row = findStudentRow(roster, studentId);
  if (row === -1) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Student not found'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (passed) {
    // Update checkpoint status
    // M1 Checkpoint = col 5, M2 = col 7, M3 = col 9
    var col = 3 + (moduleId * 2);
    roster.getRange(row, col).setValue('PASSED');

    // Check if all 3 modules passed → update status
    var m1 = roster.getRange(row, 5).getValue();
    var m2 = roster.getRange(row, 7).getValue();
    var m3 = roster.getRange(row, 9).getValue();
    if (m1 === 'PASSED' && m2 === 'PASSED' && m3 === 'PASSED') {
      roster.getRange(row, 10).setValue('GRADUATED ★');
    }
  }

  // Log the activity
  log.appendRow([now, studentId, data.studentName,
    passed ? 'CHECKPOINT_PASSED' : 'CHECKPOINT_FAILED',
    'Module ' + moduleId, passed ? 'Passed' : 'Failed attempt']);

  return ContentService.createTextOutput(JSON.stringify({status: 'ok'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleGetProgress(data) {
  var roster = getSheet('Roster');
  var studentId = String(data.studentId);
  return getProgressResponse(roster, studentId);
}

function handleGetRoster() {
  var roster = getSheet('Roster');
  var lastRow = roster.getLastRow();
  var result = {};

  if (lastRow > 1) {
    var data = roster.getRange(2, 1, lastRow - 1, 2).getValues();
    data.forEach(function(row) {
      if (row[0]) result[String(row[0])] = row[1];
    });
  }

  return ContentService.createTextOutput(JSON.stringify({status: 'ok', roster: result}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== UTILITIES =====

function findStudentRow(sheet, studentId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(studentId)) {
      return i + 2; // +2 because array is 0-indexed and row 1 is headers
    }
  }
  return -1;
}

function getProgressResponse(roster, studentId) {
  var row = findStudentRow(roster, studentId);
  var progress = {
    m1_practice: 0, m1_checkpoint: '',
    m2_practice: 0, m2_checkpoint: '',
    m3_practice: 0, m3_checkpoint: ''
  };

  if (row !== -1) {
    progress.m1_practice = roster.getRange(row, 4).getValue() || 0;
    progress.m1_checkpoint = roster.getRange(row, 5).getValue() || '';
    progress.m2_practice = roster.getRange(row, 6).getValue() || 0;
    progress.m2_checkpoint = roster.getRange(row, 7).getValue() || '';
    progress.m3_practice = roster.getRange(row, 8).getValue() || 0;
    progress.m3_checkpoint = roster.getRange(row, 9).getValue() || '';
  }

  return ContentService.createTextOutput(JSON.stringify({status: 'ok', progress: progress}))
    .setMimeType(ContentService.MimeType.JSON);
}
