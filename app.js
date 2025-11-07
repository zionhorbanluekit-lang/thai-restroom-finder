// =======================================================
//  --- CONFIGURATION ---
// =======================================================
const googleScriptURL = '/api/gas-proxy'; // Vercel Proxy URL
const googleSheetURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTqqsedupK3z2iMcbU66Lo3xzuNH9RQWSVvyh6alsIgZ-cKAeGV0z1jl35-_JMzLspyjl7A26VHonp/pub?output=csv';

// =======================================================
//  --- GLOBAL VARIABLES ---
// =======================================================
let map = null;
let userLocation = null;
let allRestrooms = []; // We will store all restrooms here for filtering
let currentMarkers = []; // Store the markers that are currently on the map

// =======================================================
//  --- GET HTML ELEMENTS ---
// =======================================================
const statusElement = document.getElementById('status');

// --- Review Modal Elements (UPDATED for <dialog>) ---
const reviewModal = document.getElementById('review-modal');
const reviewForm = document.getElementById('review-form');
const reviewTitle = document.getElementById('review-title');
const reviewRestroomNameInput = document.getElementById('review-restroom-name');
const reviewStarsInput = document.getElementById('review-stars');
const reviewCommentInput = document.getElementById('review-comment');
const reviewerNameInput = document.getElementById('reviewer-name'); // New field
const reviewStatus = document.getElementById('review-status');
const closeModalButton = document.querySelector('.close-modal');

// --- Add Restroom Form Elements ---
const addRestroomForm = document.getElementById('add-restroom-form');
const newRestroomNameInput = document.getElementById('new-restroom-name');
const newPaperCheckbox = document.getElementById('new-paper'); // New field
const newSprayCheckbox = document.getElementById('new-spray'); // New field
const newConditionSelect = document.getElementById('new-condition'); // New field
const addStatus = document.getElementById('add-status');

// --- Filter Elements ---
const filterButton = document.getElementById('filter-button');
const filterPaper = document.getElementById('filter-paper');
const filterSpray = document.getElementById('filter-spray');
const filterCondition = document.getElementById('filter-condition');


// =======================================================
//  --- INITIALIZATION ---
// =======================================================
// Ask for the user's location
navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError);

// Add listener for the new filter button
filterButton.addEventListener('click', applyFilters);

// === NEW MODAL CLOSE LOGIC (for <dialog>) ===
closeModalButton.addEventListener('click', () => {
    reviewModal.close();
});
reviewModal.addEventListener('click', (e) => {
    // Close if user clicks on the backdrop
    if (e.target === reviewModal) {
        reviewModal.close();
    }
});
// =======================================================


// =======================================================
//  --- MAIN MAP & DATA LOGIC ---
// =======================================================

async function onLocationSuccess(position) {
    userLocation = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
    };
    statusElement.innerText = "กำลังโหลดแผนที่...";
    
    // Load the basic map centered on the user
    loadMap(userLocation.lat, userLocation.lon);

    statusElement.innerText = "กำลังดึงข้อมูลห้องน้ำ...";
    try {
        // Fetch the data from the published Google Sheet CSV
        const response = await fetch(googleSheetURL + '&t=' + new Date().getTime());
        if (!response.ok) throw new Error('Network response was not ok');

        const csvText = await response.text();
        allRestrooms = parseCSV(csvText); // Store restrooms in global variable

        if (allRestrooms.length === 0) {
             statusElement.innerText = 'ไม่พบข้อมูลห้องน้ำใน Google Sheet';
             return;
        }

        // Draw all restrooms on the map for the first time
        drawRestroomMarkers(allRestrooms);
        statusElement.innerText = `พบห้องน้ำ ${allRestrooms.length} แห่ง.`;

    } catch (error) {
        console.error('Error fetching or parsing sheet:', error);
        statusElement.innerText = 'เกิดข้อผิดพลาดในการโหลดแผนที่';
    }
}

function onLocationError(error) {
    console.error('Geolocation error:', error);
    statusElement.innerText = 'ไม่สามารถรับตำแหน่งของคุณได้ โปรดอนุญาตให้แชร์ตำแหน่ง';
}

/**
 * Loads the basic map and user's location marker
 */
function loadMap(userLat, userLon) {
    map = L.map('map').setView([userLat, userLon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Add a marker for the user
    L.marker([userLat, userLon]).addTo(map)
        .bindPopup('<b>ตำแหน่งของคุณ</b>')
        .openPopup();
}

/**
 * Parses the CSV text from Google Sheets with new columns
 */
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const dataLines = lines.slice(1); // Remove header
    return dataLines.map(line => {
        const values = line.split(',');
        if (values.length >= 6) { // Now expecting 6 columns
            return {
                name: values[0].trim(),
                lat: parseFloat(values[1]),
                lon: parseFloat(values[2]),
                hasPaper: values[3].trim(), // New field
                hasSpray: values[4].trim(), // New field
                condition: values[5].trim() // New field
            };
        }
        return null;
    }).filter(restroom => restroom !== null && !isNaN(restroom.lat) && !isNaN(restroom.lon));
}

/**
 * Calculates distance between two GPS coordinates
 */
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// =======================================================
//  --- FILTERING LOGIC ---
// =======================================================

/**
 * Clears all restroom markers from the map
 */
function clearAllMarkers() {
    currentMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    currentMarkers = [];
}

/**
 * Draws a specific set of restrooms on the map
 */
function drawRestroomMarkers(restroomsToDraw) {
    restroomsToDraw.forEach(restroom => {
        // Create popup content with new details
        const popupContent = `
            <b>${restroom.name}</b><br>
            <small>
                <b>สภาพ:</b> ${restroom.condition || 'N/A'}<br>
                <b>ทิชชู่:</b> ${restroom.hasPaper || 'N/A'}<br>
                <b>สายฉีด:</b> ${restroom.hasSpray || 'N/A'}
            </small><br>
            <button class="review-button" data-name="${restroom.name}">เขียนรีวิว</button>
        `;
        
        const marker = L.marker([restroom.lat, restroom.lon]).addTo(map)
            .bindPopup(popupContent);
        
        currentMarkers.push(marker); // Store marker to be able to remove it
    });

    // Add listener for review buttons (must be re-added)
    map.on('popupopen', function(e) {
        const reviewButton = e.popup._container.querySelector('.review-button');
        if (reviewButton) {
            reviewButton.onclick = function() {
                const restroomName = this.getAttribute('data-name');
                openReviewModal(restroomName);
            };
        }
    });
}

/**
 * Main filter function
 */
function applyFilters() {
    // 1. Get filter values
    const wantPaper = filterPaper.checked;
    const wantSpray = filterSpray.checked;
    const wantCondition = filterCondition.value;

    statusElement.innerText = 'กำลังฟิลเตอร์...';

    // 2. Filter the global 'allRestrooms' array
    const filteredRestrooms = allRestrooms.filter(restroom => {
        // Check paper
        if (wantPaper && restroom.hasPaper !== 'Yes') {
            return false;
        }
        // Check spray
        if (wantSpray && restroom.hasSpray !== 'Yes') {
            return false;
        }
        // Check condition
        if (wantCondition !== 'any' && restroom.condition !== wantCondition) {
            return false;
        }
        // If it passes all checks, keep it
        return true;
    });

    // 3. Clear old markers
    clearAllMarkers();

    // 4. Draw new, filtered markers
    drawRestroomMarkers(filteredRestrooms);
    statusElement.innerText = `แสดงผล ${filteredRestrooms.length} จาก ${allRestrooms.length} แห่ง`;
}


// =======================================================
//  --- FORM SUBMISSION LOGIC (UPDATED) ---
// =======================================================

// --- "Add New Restroom" Form ---
addRestroomForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!userLocation) {
        addStatus.innerText = 'ไม่สามารถรับตำแหน่งของคุณได้';
        addStatus.className = 'status-message error';
        return;
    }
    addStatus.innerText = 'กำลังเพิ่ม...';
    addStatus.className = 'status-message';

    // Get new form values
    const data = {
        type: 'new_restroom',
        name: newRestroomNameInput.value,
        lat: userLocation.lat,
        lon: userLocation.lon,
        hasPaper: newPaperCheckbox.checked ? 'Yes' : 'No', // New
        hasSpray: newSprayCheckbox.checked ? 'Yes' : 'No', // New
        condition: newConditionSelect.value // New
    };

    // Send data to the Vercel proxy
    fetch(googleScriptURL, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(response => {
        if (response.status === 'success') {
            addStatus.innerText = 'เพิ่มห้องน้ำสำเร็จแล้ว! (ข้อมูลจะอัปเดตในรอบถัดไป)';
            addStatus.className = 'status-message success';
            addRestroomForm.reset();
        } else {
            throw new Error(response.message);
        }
    })
    .catch(error => {
        addStatus.innerText = 'เกิดข้อผิดพลาด: ' + error.message;
        addStatus.className = 'status-message error';
    });
});


// --- "Review Modal" Logic (UPDATED for <dialog>) ---
function openReviewModal(restroomName) {
    reviewTitle.innerText = `เขียนรีวิวสำหรับ "${restroomName}"`;
    reviewRestroomNameInput.value = restroomName;
    reviewStatus.innerText = '';
    reviewForm.reset();
    reviewModal.showModal(); // <-- NEW WAY TO OPEN
}

reviewForm.addEventListener('submit', function(e) {
    e.preventDefault();
    reviewStatus.innerText = 'กำลังส่งรีวิว...';
    reviewStatus.className = 'status-message';

    // Get new form value
    const data = {
        type: 'new_comment',
        restroomName: reviewRestroomNameInput.value,
        stars: reviewStarsInput.value,
        comment: reviewCommentInput.value,
        reviewerName: reviewerNameInput.value // New
    };

    // Send data to the Vercel proxy
    fetch(googleScriptURL, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(response => {
        if (response.status === 'success') {
            reviewStatus.innerText = 'ส่งรีวิวสำเร็จแล้ว!';
            reviewStatus.className = 'status-message success';
            setTimeout(() => {
                reviewModal.close(); // <-- NEW WAY TO CLOSE
            }, 1500);
        } else {
            throw new Error(response.message);
        }
    })
    .catch(error => {
        reviewStatus.innerText = 'เกิดข้อผิดพลาด: ' + error.message;
        reviewStatus.className = 'status-message error';
    });
});
