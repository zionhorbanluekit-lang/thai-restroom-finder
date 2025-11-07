// =======================================================
//  --- CONFIGURATION ---
// =======================================================
const googleScriptURL = '/api/gas-proxy'; // Vercel Proxy URL
const googleSheetURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTqqsedupK3z2iMcbU66Lo3xzuNH9RQWSVvyh6alsIgZ-cKAeGV0z1jl35-_JMzLspyjl7A26VHonp/pub?output=csv';

// =======================================================
//  --- GLOBAL VARIABLES ---
// =======================================================
let map = null;
let userLocation = null; // Stores the *initial* location for centering the map
let allRestrooms = []; 
let currentMarkers = []; 

// =======================================================
//  --- GET HTML ELEMENTS ---
// =======================================================
const statusElement = document.getElementById('status');
const reviewModal = document.getElementById('review-modal');
const reviewForm = document.getElementById('review-form');
const reviewTitle = document.getElementById('review-title');
const reviewRestroomNameInput = document.getElementById('review-restroom-name');
const reviewStarsInput = document.getElementById('review-stars');
const reviewCommentInput = document.getElementById('review-comment');
const reviewerNameInput = document.getElementById('reviewer-name');
const reviewStatus = document.getElementById('review-status');
const closeModalButton = document.querySelector('.close-modal');
const addRestroomForm = document.getElementById('add-restroom-form');
const newRestroomNameInput = document.getElementById('new-restroom-name');
const newPaperCheckbox = document.getElementById('new-paper');
const newSprayCheckbox = document.getElementById('new-spray');
const newConditionSelect = document.getElementById('new-condition');
const addStatus = document.getElementById('add-status');
const filterButton = document.getElementById('filter-button');
const filterPaper = document.getElementById('filter-paper');
const filterSpray = document.getElementById('filter-spray');
const filterCondition = document.getElementById('filter-condition');

// =======================================================
//  --- INITIALIZATION ---
// =======================================================
navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError);
filterButton.addEventListener('click', applyFilters);

closeModalButton.addEventListener('click', () => {
    reviewModal.close();
});
reviewModal.addEventListener('click', (e) => {
    if (e.target === reviewModal) {
        reviewModal.close();
    }
});

// =======================================================
//  --- MAIN MAP & DATA LOGIC ---
// =======================================================

async function onLocationSuccess(position) {
    userLocation = { // Store the *initial* location
        lat: position.coords.latitude,
        lon: position.coords.longitude
    };
    statusElement.innerText = "กำลังโหลดแผนที่...";
    
    loadMap(userLocation.lat, userLocation.lon);

    statusElement.innerText = "กำลังดึงข้อมูลห้องน้ำ...";
    try {
        // (Fetch CSV data)
        const response = await fetch(googleSheetURL + '&t=' + new Date().getTime());
        if (!response.ok) throw new Error('Network response was not ok');
        const csvText = await response.text();
        allRestrooms = parseCSV(csvText);
        if (allRestrooms.length === 0) {
             statusElement.innerText = 'ไม่พบข้อมูลห้องน้ำใน Google Sheet';
             return;
        }
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

function loadMap(userLat, userLon) {
    map = L.map('map').setView([userLat, userLon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    L.marker([userLat, userLon]).addTo(map)
        .bindPopup('<b>ตำแหน่งของคุณ</b>')
        .openPopup();
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const dataLines = lines.slice(1);
    return dataLines.map(line => {
        const values = line.split(',');
        if (values.length >= 6) {
            return {
                name: values[0].trim(),
                lat: parseFloat(values[1]),
                lon: parseFloat(values[2]),
                hasPaper: values[3].trim(),
                hasSpray: values[4].trim(),
                condition: values[5].trim()
            };
        }
        return null;
    }).filter(restroom => restroom !== null && !isNaN(restroom.lat) && !isNaN(restroom.lon));
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// =======================================================
//  --- FILTERING LOGIC ---
// =======================================================

function clearAllMarkers() {
    currentMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    currentMarkers = [];
}

function drawRestroomMarkers(restroomsToDraw) {
    restroomsToDraw.forEach(restroom => {
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
        currentMarkers.push(marker);
    });
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

function applyFilters() {
    const wantPaper = filterPaper.checked;
    const wantSpray = filterSpray.checked;
    const wantCondition = filterCondition.value;
    statusElement.innerText = 'กำลังฟิลเตอร์...';
    const filteredRestrooms = allRestrooms.filter(restroom => {
        if (wantPaper && restroom.hasPaper !== 'Yes') return false;
        if (wantSpray && restroom.hasSpray !== 'Yes') return false;
        if (wantCondition !== 'any' && restroom.condition !== wantCondition) return false;
        return true;
    });
    clearAllMarkers();
    drawRestroomMarkers(filteredRestrooms);
    statusElement.innerText = `แสดงผล ${filteredRestrooms.length} จาก ${allRestrooms.length} แห่ง`;
}

// =======================================================
//  --- FORM SUBMISSION LOGIC (WITH LOCATION FIX) ---
// =======================================================

// --- "Add New Restroom" Form ---
addRestroomForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Get form data first
    const name = newRestroomNameInput.value;
    const hasPaper = newPaperCheckbox.checked ? 'Yes' : 'No';
    const hasSpray = newSprayCheckbox.checked ? 'Yes' : 'No';
    const condition = newConditionSelect.value;
    
    if (!name) {
        addStatus.innerText = 'กรุณาใส่ชื่อห้องน้ำ';
        addStatus.className = 'status-message error';
        return;
    }
    
    addStatus.innerText = 'กำลังค้นหาตำแหน่งปัจจุบันของคุณ...';
    addStatus.className = 'status-message';

    // 1. Get a FRESH, NEW location *right now*
    navigator.geolocation.getCurrentPosition(
        function(position) { // (A) If getting location is successful
            
            // 2. Use this new location
            const freshLat = position.coords.latitude;
            const freshLon = position.coords.longitude;

            addStatus.innerText = 'กำลังเพิ่ม...';

            const data = {
                type: 'new_restroom',
                name: name,
                lat: freshLat, // <-- Use the NEW location
                lon: freshLon, // <-- Use the NEW location
                hasPaper: hasPaper,
                hasSpray: hasSpray,
                condition: condition
            };

            // 3. Send data to the Vercel Proxy
            fetch(googleScriptURL, {
                method: 'POST',
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' }
            })
            .then(res => res.json())
            .then(response => {
                if (response.status === 'success') {
                    addStatus.innerText = 'เพิ่มห้องน้ำสำเร็จแล้ว!';
                    addStatus.className = 'status-message success';
                    addRestroomForm.reset();
                } else {
                    throw new Error(response.message);
                }
            })
            .catch(error => {
                addStatus.innerText = 'เกิดข้อผิดพลาด (Fetch): ' + error.message;
                addStatus.className = 'status-message error';
            });

        }, 
        function(error) { // (B) If getting location fails
            console.error('Error getting fresh location:', error);
            addStatus.innerText = 'เกิดข้อผิดพลาด: ไม่สามารถรับตำแหน่งปัจจุบันของคุณได้';
            addStatus.className = 'status-message error';
        }
    );
});


// --- "Review Modal" Logic (No changes here) ---
function openReviewModal(restroomName) {
    reviewTitle.innerText = `เขียนรีวิวสำหรับ "${restroomName}"`;
    reviewRestroomNameInput.value = restroomName;
    reviewStatus.innerText = '';
    reviewForm.reset();
    reviewModal.showModal();
}

reviewForm.addEventListener('submit', function(e) {
    e.preventDefault();
    reviewStatus.innerText = 'กำลังส่งรีวิว...';
    reviewStatus.className = 'status-message';
    const data = {
        type: 'new_comment',
        restroomName: reviewRestroomNameInput.value,
        stars: reviewStarsInput.value,
        comment: reviewCommentInput.value,
        reviewerName: reviewerNameInput.value
    };
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
                reviewModal.close();
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
