// -----------------------------------------------------------------
// ⬇️ THIS IS THE ONLY LINE THAT HAS CHANGED ⬇️
// -----------------------------------------------------------------
// We now point to our own proxy API file, not Google
const googleScriptURL = '/gas-proxy';
// -----------------------------------------------------------------

// This is the public URL for READING the CSV (this does not change)
const googleSheetURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTqqsedupK3z2iMcbU66Lo3xzuNH9RQWSVvyh6alsIgZ-cKAeGV0z1jl35-_JMzLspyjl7A26VHonp/pub?output=csv';

// Get references to all HTML elements
const mapElement = document.getElementById('map');
const statusElement = document.getElementById('status');
let map = null; // We will store the map object here
let userLocation = null; // Store user's lat/lon

// --- Review Modal Elements ---
const reviewModal = document.getElementById('review-modal');
const reviewForm = document.getElementById('review-form');
const reviewTitle = document.getElementById('review-title');
const reviewRestroomNameInput = document.getElementById('review-restroom-name');
const reviewStarsInput = document.getElementById('review-stars');
const reviewCommentInput = document.getElementById('review-comment');
const reviewStatus = document.getElementById('review-status');
const closeModalButton = document.querySelector('.close-modal');

// --- Add Restroom Form Elements ---
const addRestroomForm = document.getElementById('add-restroom-form');
const newRestroomNameInput = document.getElementById('new-restroom-name');
const addStatus = document.getElementById('add-status');


// =======================================================
// MAIN APP LOGIC (Reading Data)
// =======================================================

// Ask for the user's location
navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError);

/**
 * Called when we successfully get the user's location
 */
async function onLocationSuccess(position) {
    userLocation = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
    };

    statusElement.innerText = "กำลังค้นหาห้องน้ำจาก Google Sheet...";

    try {
        // We add a 'cache buster' (?t=...timestamp) to the URL 
        // to make sure we always get the freshest data
        const response = await fetch(googleSheetURL + '&t=' + new Date().getTime());
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const csvText = await response.text();
        const restrooms = parseCSV(csvText);

        if (restrooms.length === 0) {
             statusElement.innerText = 'ไม่พบข้อมูลห้องน้ำใน Google Sheet';
             return;
        }

        const nearest = findNearestRestroom(restrooms, userLocation.lat, userLocation.lon);
        statusElement.innerText = `พบห้องน้ำที่ใกล้ที่สุด: ${nearest.restroom.name}`;

        // Load the map with ALL restrooms, not just the nearest
        loadMap(userLocation.lat, userLocation.lon, restrooms);

    } catch (error) {
        console.error('Error fetching or parsing sheet:', error);
        statusElement.innerText = 'เกิดข้อผิดพลาดในการโหลดแผนที่ (Fetch error)';
    }
}

/**
 * Called if we cannot get the user's location
 */
function onLocationError(error) {
    console.error('Geolocation error:', error);
    statusElement.innerText = 'ไม่สามารถรับตำแหน่งของคุณได้ โปรดอนุญาตให้แชร์ตำแหน่ง';
}

/**
 * Draws the Leaflet map and adds markers for ALL restrooms
 */
function loadMap(userLat, userLon, restrooms) {
    map = L.map('map').setView([userLat, userLon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Add a marker for the user
    L.marker([userLat, userLon]).addTo(map)
        .bindPopup('<b>ตำแหน่งของคุณ</b>')
        .openPopup();

    // Loop through all restrooms and add a marker
    restrooms.forEach(restroom => {
        // Create the popup content with a "Review" button
        const popupContent = `
            <b>${restroom.name}</b>
            <br>
            <button class="review-button" data-name="${restroom.name}">เขียนรีวิว</button>
        `;
        
        L.marker([restroom.lat, restroom.lon]).addTo(map)
            .bindPopup(popupContent);
    });

    // This is a special listener that waits for a popup to open
    map.on('popupopen', function(e) {
        // Find the review button inside the opened popup
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
 * Loops through all restrooms and finds the closest one
 */
function findNearestRestroom(restrooms, userLat, userLon) {
    let nearestDistance = Infinity;
    let nearestRestroom = null;

    restrooms.forEach(restroom => {
        const distance = getDistance(userLat, userLon, restroom.lat, restroom.lon);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestRestroom = restroom;
        }
    });
    return { restroom: nearestRestroom, distance: nearestDistance };
}

/**
 * Parses the CSV text from Google Sheets
 */
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const dataLines = lines.slice(1); // Remove header
    return dataLines.map(line => {
        const values = line.split(',');
        if (values.length >= 3) {
            return {
                name: values[0].trim(),
                lat: parseFloat(values[1]),
                lon: parseFloat(values[2])
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
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}


// =======================================================
// NEW LOGIC (Writing Data)
// =You'll see the fetch() calls below now go to 'googleScriptURL',
// which is your new '/api/gas-proxy' file.
// =======================================================

// --- "Add New Restroom" Form ---
addRestroomForm.addEventListener('submit', function(e) {
    e.preventDefault(); // Stop the form from reloading the page
    
    const name = newRestroomNameInput.value;
    if (!name) {
        addStatus.innerText = 'กรุณาใส่ชื่อห้องน้ำ';
        addStatus.className = 'status-message error';
        return;
    }
    if (!userLocation) {
        addStatus.innerText = 'ไม่สามารถรับตำแหน่งของคุณได้';
        addStatus.className = 'status-message error';
        return;
    }

    addStatus.innerText = 'กำลังเพิ่ม...';
    addStatus.className = 'status-message';

    const data = {
        type: 'new_restroom',
        name: name,
        lat: userLocation.lat,
        lon: userLocation.lon
    };

    // Send the data to our '/api/gas-proxy'
    fetch(googleScriptURL, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(response => {
        if (response.status === 'success') {
            addStatus.innerText = 'เพิ่มห้องน้ำสำเร็จแล้ว! (รีเฟรชหน้าเพื่อดู)';
            addStatus.className = 'status-message success';
            newRestroomNameInput.value = ''; // Clear the input
            
            // Add marker to map immediately
             L.marker([userLocation.lat, userLocation.lon]).addTo(map)
                .bindPopup(`<b>${name}</b> (เพิ่งเพิ่ม)`);
        } else {
            throw new Error(response.message);
        }
    })
    .catch(error => {
        addStatus.innerText = 'เกิดข้อผิดพลาด: ' + error.message;
        addStatus.className = 'status-message error';
    });
});


// --- "Review Modal" Logic ---
function openReviewModal(restroomName) {
    reviewTitle.innerText = `เขียนรีวิวสำหรับ "${restroomName}"`;
    reviewRestroomNameInput.value = restroomName; // Set hidden input
    reviewModal.style.display = 'block'; // Show the modal
    reviewStatus.innerText = '';
    reviewForm.reset(); // Clear old values
}

closeModalButton.onclick = function() {
    reviewModal.style.display = 'none'; // Hide the modal
}
window.onclick = function(event) {
    if (event.target == reviewModal) {
        reviewModal.style.display = 'none'; // Hide if user clicks outside
    }
}

reviewForm.addEventListener('submit', function(e) {
    e.preventDefault();
    reviewStatus.innerText = 'กำลังส่งรีวิว...';
    reviewStatus.className = 'status-message';

    const data = {
        type: 'new_comment',
        restroomName: reviewRestroomNameInput.value,
        stars: reviewStarsInput.value,
        comment: reviewCommentInput.value
    };

    // Send the data to our '/api/gas-proxy'
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
            // Close modal after 1.5 seconds
            setTimeout(() => {
                reviewModal.style.display = 'none';
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

