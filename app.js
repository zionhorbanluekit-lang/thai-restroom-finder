// =======================================================
//  --- CONFIGURATION ---
// =======================================================
const googleScriptURL = '/api/gas-proxy';
const locationSheetURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTqqsedupK3z2iMcbU66Lo3xzuNH9RQWSVvyh6alsIgZ-cKAeGV0z1jl35-_JMzLspyjl7A26VHonp/pub?output=csv';
const commentSheetURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTqqsedupK3z2iMcbU66Lo3xzuNH9RQWSVvyh6alsIgZ-cKAeGV0z1jl35-_JMzLspyjl7A26VHonp/pub?gid=714346684&single=true&output=csv';


// =======================================================
//  --- GLOBAL VARIABLES ---
// =======================================================
let map = null;
let userLocation = null;
let allRestrooms = []; 
let allComments = [];
let currentMarkers = []; 
let userMarker = null; // ⬅️ NEW: We will store the "Your Location" marker here
const restroomIcon = L.icon({
    iconUrl: 'pin.svg',
    iconSize:     [38, 38],
    iconAnchor:   [19, 38],
    popupAnchor:  [0, -38]
});

// =======================================================
//  --- RUN CODE AFTER HTML IS LOADED ---
// =======================================================
document.addEventListener('DOMContentLoaded', () => {

    // =======================================================
    //  --- GET HTML ELEMENTS ---
    // =======================================================
    const statusElement = document.getElementById('status');
    const reviewModal = document.getElementById('review-modal');
    const reviewForm = document.getElementById('review-form');
    // ... (all your other getElementById variables) ...
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
    const newCrowdSelect = document.getElementById('new-crowd');
    const addStatus = document.getElementById('add-status');
    const filterButton = document.getElementById('filter-button');
    const filterPaper = document.getElementById('filter-paper');
    const filterSpray = document.getElementById('filter-spray');
    const filterCondition = document.getElementById('filter-condition');
    const filterCrowd = document.getElementById('filter-crowd');
    const filterToggleButton = document.getElementById('filter-toggle-button');
    const filterSection = document.getElementById('filter-section');
    const filterDistance = document.getElementById('filter-distance');
    const distanceValue = document.getElementById('distance-value');
    const refreshButton = document.getElementById('refresh-button');

    // =======================================================
    //  --- INITIALIZATION ---
    // =======================================================
    navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError);
    filterButton.addEventListener('click', applyFilters);

    filterToggleButton.addEventListener('click', () => {
        filterSection.classList.toggle('is-visible');
    });

    closeModalButton.addEventListener('click', () => {
        reviewModal.close();
    });
    reviewModal.addEventListener('click', (e) => {
        if (e.target === reviewModal) {
            reviewModal.close();
        }
    });

    // --- ⬇️ UPDATED: Refresh Button Logic ⬇️ ---
    // This button will now update your location AND refresh the data.
    refreshButton.addEventListener('click', async () => {
        const statusElement = document.getElementById('status');
        statusElement.innerText = "กำลังอัปเดตตำแหน่ง..."; // New text
        refreshButton.classList.add('is-loading');
        refreshButton.disabled = true;

        try {
            // 1. Get a new, fresh GPS position
            const newPosition = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject);
            });

            // 2. Update the global location variable
            userLocation = {
                lat: newPosition.coords.latitude,
                lon: newPosition.coords.longitude
            };

            // 3. Move the user's marker and re-center the map
            updateUserMarker(userLocation.lat, userLocation.lon);
            map.setView([userLocation.lat, userLocation.lon], 15);
            
            // 4. Re-fetch all data (which will re-calculate distances)
            await fetchData();

            statusElement.innerText = "อัปเดตตำแหน่งและข้อมูลแล้ว!"; // New success message

        } catch (error) {
            console.error('Refresh error:', error);
            statusElement.innerText = "ไม่สามารถอัปเดตตำแหน่งได้";
        } finally {
            refreshButton.classList.remove('is-loading');
            refreshButton.disabled = false;
        }
    });
    // --- ⬆️ END OF UPDATED LOGIC ⬆️ ---

    filterDistance.addEventListener('input', () => {
        distanceValue.innerText = filterDistance.value;
    });
    
    addRestroomForm.addEventListener('submit', handleAddRestroom);
    reviewForm.addEventListener('submit', handleReviewSubmit);
});
// =======================================================
// ⬆️ End of the DOMContentLoaded wrapper ⬆️
// =======================================================


// =======================================================
//  --- ALL FUNCTIONS (Defined globally) ---
// =======================================================

async function fetchData() {
    const statusElement = document.getElementById('status');
    
    try {
        // (1) Fetch Locations
        const response = await fetch(locationSheetURL + '&t=' + new Date().getTime());
        if (!response.ok) throw new Error(`Location Sheet Error: ${response.status} ${response.statusText}`);
        const csvText = await response.text();
        allRestrooms = parseLocationCSV(csvText);

        if (allRestrooms.length === 0) {
             statusElement.innerText = 'ไม่พบข้อมูลห้องน้ำใน Google Sheet';
        }

        // (2) Fetch all Comments
        const commentResponse = await fetch(commentSheetURL + '&t=' + new Date().getTime());
        if (!commentResponse.ok) throw new Error(`Comment Sheet Error: ${commentResponse.status} ${commentResponse.statusText}`);
        const commentCsvText = await commentResponse.text();
        allComments = parseCommentCSV(commentCsvText);

        // (3) Draw markers
        applyFilters(); // Apply current filters to the new data
        statusElement.innerText = `พบ ${allRestrooms.length} ห้องน้ำ และ ${allComments.length} รีวิว. (อัปเดตแล้ว)`;

    } catch (error) {
        console.error('Error fetching or parsing sheet:', error);
        statusElement.innerText = `เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}`;
        throw error;
    }
}


async function onLocationSuccess(position) {
    userLocation = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
    };
    const statusElement = document.getElementById('status');
    statusElement.innerText = "กำลังโหลดแผนที่...";
    
    loadMap(userLocation.lat, userLocation.lon); // Load map
    updateUserMarker(userLocation.lat, userLocation.lon); // Add user marker

    await fetchData(); // Fetch data
}

function onLocationError(error) {
    console.error('Geolocation error:', error);
    const statusElement = document.getElementById('status');
    statusElement.innerText = 'ไม่สามารถรับตำแหน่งของคุณได้ โปรดอนุญาตให้แชร์ตำแหน่ง';
}

// --- ⬇️ UPDATED: loadMap ⬇️ ---
// This function now ONLY creates the map. The marker is handled separately.
function loadMap(userLat, userLon) {
    if (map) {
        map.remove();
    }
    map = L.map('map').setView([userLat, userLon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
}
// --- ⬆️ END OF UPDATED FUNCTION ⬆️ ---

// --- ⬇️ NEW: This function moves the "Your Location" circle ⬇️ ---
function updateUserMarker(lat, lon) {
    // Remove the old marker if it exists
    if (userMarker) {
        map.removeLayer(userMarker);
    }
    
    // Add the new circle marker
    userMarker = L.circleMarker([lat, lon], {
        radius: 10,
        color: '#007bff',
        fillColor: '#007bff',
        fillOpacity: 0.8
    }).addTo(map)
        .bindPopup('<b>ตำแหน่งของคุณ</b>')
        .openPopup();
}
// --- ⬆️ END OF NEW FUNCTION ⬆️ ---

function parseLocationCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const dataLines = lines.slice(1);
    return dataLines.map(line => {
        const values = line.split(',');
        if (values.length >= 7) {
            return {
                name: values[0].trim(),
                lat: parseFloat(values[1]),
                lon: parseFloat(values[2]),
                hasPaper: values[3].trim(),
                hasSpray: values[4].trim(),
                condition: values[5].trim(),
                crowdLevel: values[6].trim()
            };
        }
        return null;
    }).filter(restroom => restroom !== null && !isNaN(restroom.lat) && !isNaN(restroom.lon));
}

function parseCommentCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const dataLines = lines.slice(1);
    return dataLines.map(line => {
        const values = line.split(',');
        if (values.length >= 4) {
            return {
                restroomName: values[0].trim(),
                stars: values[1].trim(),
                comment: values[2].trim(),
                reviewerName: values[3].trim()
            };
        }
        return null;
    }).filter(comment => comment !== null);
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

function formatDistance(km) {
    if (km < 1) {
        const meters = Math.round(km * 1000);
        return `${meters} ม.`;
    } else {
        const distKm = km.toFixed(1);
        return `${distKm} กม.`;
    }
}

function translateSpec(value) {
    const translations = {
        "Excellent": "ยอดเยี่ยม (Excellent)",
        "Well": "ดี (Well)",
        "Bad": "แย่ (Bad)",
        "Not Crowded": "ไม่แออัด (Not Crowded)",
        "Normal": "ปกติ (Normal)",
        "Very Crowded": "แออัดมาก (Very Crowded)",
        "Yes": "มี (Yes)",
        "No": "ไม่มี (No)",
        "N/A": "N/A"
    };
    return translations[value] || value;
}

function clearAllMarkers() {
    currentMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    currentMarkers = [];
}

function drawRestroomMarkers(restroomsToDraw) {
    if (!userLocation) return; 

    restroomsToDraw.forEach(restroom => {
        const distance = getDistance(userLocation.lat, userLocation.lon, restroom.lat, restroom.lon);
        const distanceStr = formatDistance(distance);
        
        const matchingReviews = allComments.filter(c => c.restroomName === restroom.name);
        let scoreHtml = '<em>ยังไม่มีรีวิว</em>';
        
        if (matchingReviews.length > 0) {
            const totalScore = matchingReviews.reduce((acc, review) => acc + parseFloat(review.stars), 0);
            const averageScore = totalScore / matchingReviews.length;
            const roundedStars = Math.round(averageScore);
            
            scoreHtml = `
                <div class="popup-score">
                    ${'⭐'.repeat(roundedStars)} 
                    <strong>${averageScore.toFixed(1)}</strong> 
                    (${matchingReviews.length} รีวิว)
                </div>
            `;
        }

        const conditionStr = translateSpec(restroom.condition || 'N/A');
        const crowdStr = translateSpec(restroom.crowdLevel || 'N/A');
        const paperStr = translateSpec(restroom.hasPaper || 'N/A');
        const sprayStr = translateSpec(restroom.hasSpray || 'N/A');

        const popupContent = `
            <b>${restroom.name}</b><br>
            ${scoreHtml}
            <big>📍 ${distanceStr} จากตำแหน่งของคุณ</big><br>
            <small>
                <b>สภาพ (Condition):</b> ${conditionStr}<br>
                <b>ความหนาแน่น (Crowd):</b> ${crowdStr}<br>
                <b>ทิชชู่ (Paper):</b> ${paperStr}<br>
                <b>สายฉีด (Spray):</b> ${sprayStr}
            </small><br>
            <button class="review-button" data-name="${restroom.name}">เขียนรีวิว</button>
            <button class="view-reviews-button" data-name="${restroom.name}">ดูรีวิวทั้งหมด</button>
            <div class="reviews-container"></div>
        `;
        
        const marker = L.marker([restroom.lat, restroom.lon], { icon: restroomIcon })
            .addTo(map)
            .bindPopup(popupContent);
        
        currentMarkers.push(marker);
    });

    map.on('popupopen', function(e) {
        const popup = e.popup._container; 
        const reviewButton = popup.querySelector('.review-button');
        if (reviewButton) {
            reviewButton.onclick = function() {
                const restroomName = this.getAttribute('data-name');
                openReviewModal(restroomName);
            };
        }
        const viewReviewsButton = popup.querySelector('.view-reviews-button');
        if (viewReviewsButton) {
            viewReviewsButton.onclick = function() {
                const restroomName = this.getAttribute('data-name');
                showReviews(restroomName, popup, this);
            };
        }
    });
}

function showReviews(restroomName, popup, button) {
    const container = popup.querySelector('.reviews-container');
    container.innerHTML = '<em>กำลังโหลดรีวิว...</em>';
    const matchingReviews = allComments.filter(c => c.restroomName === restroomName);
    if (matchingReviews.length === 0) {
        container.innerHTML = '<em>ยังไม่มีรีวิวสำหรับที่นี่</em>';
    } else {
        let html = '';
        matchingReviews.forEach(review => {
            html += `
                <div class="review-item">
                    <strong>${'⭐'.repeat(review.stars)} (${review.stars})</strong>
                    <p>"${review.comment}"</p>
                    <small>- ${review.reviewerName || 'Anonymous'}</small>
                </div>
            `;
        });
        container.innerHTML = html;
    }
    button.style.display = 'none';
}

function applyFilters() {
    if (!userLocation) return; 

    const filterPaper = document.getElementById('filter-paper');
    const filterSpray = document.getElementById('filter-spray');
    const filterCondition = document.getElementById('filter-condition');
    const filterCrowd = document.getElementById('filter-crowd');
    const statusElement = document.getElementById('status');
    const filterDistance = document.getElementById('filter-distance');
    const maxDistance = parseFloat(filterDistance.value);

    const wantPaper = filterPaper.checked;
    const wantSpray = filterSpray.checked;
    const wantCondition = filterCondition.value;
    const wantCrowd = filterCrowd.value;

    statusElement.innerText = 'กำลังฟิลเตอร์...';
    
    const filteredRestrooms = allRestrooms.filter(restroom => {
        const distance = getDistance(userLocation.lat, userLocation.lon, restroom.lat, restroom.lon);
        if (distance > maxDistance) {
            return false;
        }

        if (wantPaper && restroom.hasPaper !== 'Yes') return false;
        if (wantSpray && restroom.hasSpray !== 'Yes') return false;
        if (wantCondition !== 'any' && restroom.condition !== wantCondition) return false;
        if (wantCrowd !== 'any' && restroom.crowdLevel !== wantCrowd) return false;
        return true;
    });
    
    clearAllMarkers();
    drawRestroomMarkers(filteredRestrooms);
    statusElement.innerText = `แสดงผล ${filteredRestrooms.length} จาก ${allRestrooms.length} แห่ง (ในระยะ ${maxDistance} กม.)`;
}

function handleAddRestroom(e) {
    e.preventDefault();
    const newRestroomNameInput = document.getElementById('new-restroom-name');
    const newPaperCheckbox = document.getElementById('new-paper');
    const newSprayCheckbox = document.getElementById('new-spray');
    const newConditionSelect = document.getElementById('new-condition');
    const newCrowdSelect = document.getElementById('new-crowd');
    const addStatus = document.getElementById('add-status');

    const name = newRestroomNameInput.value;
    const hasPaper = newPaperCheckbox.checked ? 'Yes' : 'No';
    const hasSpray = newSprayCheckbox.checked ? 'Yes' : 'No';
    const condition = newConditionSelect.value;
    const crowdLevel = newCrowdSelect.value;

    if (!name) {
        addStatus.innerText = 'กรุณาใส่ชื่อห้องน้ำ';
        addStatus.className = 'status-message error';
        return;
    }
    if (!condition || !crowdLevel) {
        addStatus.innerText = 'กรุณาเลือกสภาพและความหนาแน่น';
        addStatus.className = 'status-message error';
        return;
    }
    
    addStatus.innerText = 'กำลังค้นหาตำแหน่งปัจจุบันของคุณ...';
    addStatus.className = 'status-message';
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const freshLat = position.coords.latitude;
            const freshLon = position.coords.longitude;
            addStatus.innerText = 'กำลังเพิ่ม...';
            const data = {
                type: 'new_restroom',
                name: name,
                lat: freshLat,
                lon: freshLon,
                hasPaper: hasPaper,
                hasSpray: hasSpray,
                condition: condition,
                crowdLevel: crowdLevel
            };
            fetch(googleScriptURL, {
                method: 'POST',
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' }
            })
            .then(res => res.json())
            .then(response => {
                if (response.status === 'success') {
                    addStatus.innerText = 'เพิ่มห้องน้ำสำเร็จแล้ว! กำลังรีเฟรช...';
                    addStatus.className = 'status-message success';
                    document.getElementById('add-restroom-form').reset();
                    
                    fetchData(); 
                    
                } else {
                    throw new Error(response.message);
                }
            })
            .catch(error => {
                addStatus.innerText = 'เกิดข้อผิดพลาด (Fetch): ' + error.message;
                addStatus.className = 'status-message error';
            });
        }, 
        function(error) {
            console.error('Error getting fresh location:', error);
            addStatus.innerText = 'เกิดข้อผิดพลาด: ไม่สามารถรับตำแหน่งปัจจุบันของคุณได้';
            addStatus.className = 'status-message error';
        }
    );
}

function openReviewModal(restroomName) {
    const reviewModal = document.getElementById('review-modal');
    const reviewTitle = document.getElementById('review-title');
    const reviewRestroomNameInput = document.getElementById('review-restroom-name');
    const reviewStatus = document.getElementById('review-status');
    const reviewForm = document.getElementById('review-form');

    reviewTitle.innerText = `เขียนรีวิวสำหรับ "${restroomName}"`;
    reviewRestroomNameInput.value = restroomName;
    reviewStatus.innerText = '';
    reviewForm.reset();
    reviewModal.showModal();
}

function handleReviewSubmit(e) {
    e.preventDefault();
    const reviewStatus = document.getElementById('review-status');
    const reviewRestroomNameInput = document.getElementById('review-restroom-name');
    const reviewStarsInput = document.getElementById('review-stars');
    const reviewCommentInput = document.getElementById('review-comment');
    const reviewerNameInput = document.getElementById('reviewer-name');
    const reviewModal = document.getElementById('review-modal');

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
                fetchData();
            }, 1500);
        } else {
            throw new Error(response.message);
        }
    })
    .catch(error => {
        reviewStatus.innerText = 'เกิดข้อผิดพลาด: ' + error.message;
        reviewStatus.className = 'status-message error';
    });
}
