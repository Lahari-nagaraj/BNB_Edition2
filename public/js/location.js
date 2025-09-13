// Global variables for location handling
let userLocation = {
  state: '',
  city: ''
};

// Initialize location functionality
window.addEventListener("DOMContentLoaded", () => {
  initializeLocation();
  setupEventListeners();
});

// Initialize location - get user's location and set default state
async function initializeLocation() {
  const stateSelect = document.getElementById('stateSelect');
  const citySelect = document.getElementById('citySelect');
  
  // Check if there's already a selected state from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const selectedState = urlParams.get('state');
  const selectedCity = urlParams.get('city');
  
  if (selectedState) {
    userLocation.state = selectedState;
    // If no state is selected and we can get location, try to detect it
  } else if (navigator.geolocation) {
    try {
      const position = await getCurrentPosition();
      const location = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      
      if (location.state) {
        userLocation.state = location.state;
        userLocation.city = location.city || '';
        
        // Set the state in the dropdown
        if (stateSelect) {
          Array.from(stateSelect.options).forEach((option) => {
            if (option.text === location.state) {
              option.selected = true;
            }
          });
        }
        
        // If we have a city, set it too
        if (location.city && citySelect) {
          Array.from(citySelect.options).forEach((option) => {
            if (option.text === location.city) {
              option.selected = true;
            }
          });
        }
        
        // Don't auto-submit - let user choose to search
        console.log('Location detected:', location.state, location.city);
      }
    } catch (error) {
      console.log('Location detection failed:', error);
      // If location detection fails, show all projects by default
    }
  }
}

// Setup event listeners for state/city changes
function setupEventListeners() {
  const stateSelect = document.getElementById('stateSelect');
  const citySelect = document.getElementById('citySelect');
  const searchInput = document.getElementById('searchInput');
  
  // Handle state change
  if (stateSelect) {
    stateSelect.addEventListener('change', function() {
      userLocation.state = this.value;
      // Clear city when state changes
      if (citySelect) {
        citySelect.value = '';
        userLocation.city = '';
      }
      // Don't auto-submit - let user manually search
    });
  }
  
  // Handle city change
  if (citySelect) {
    citySelect.addEventListener('change', function() {
      userLocation.city = this.value;
      // Don't auto-submit - let user manually search
    });
  }
  
  // Handle search input with debouncing
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', function() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        // Auto-submit after 2 seconds of no typing
        document.getElementById('searchForm').submit();
      }, 2000);
    });
  }
}

// Get current position with promise
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000 // 5 minutes
    });
  });
}

// Reverse geocode coordinates to get location
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`
    );
    const data = await res.json();
    
    return {
      state: data.address?.state || data.address?.region || '',
      city: data.address?.city || data.address?.town || data.address?.village || ''
    };
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
    return { state: '', city: '' };
  }
}

// Clear all filters function
function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('stateSelect').value = '';
  document.getElementById('citySelect').value = '';
  document.querySelector('select[name="department"]').value = '';
  document.querySelector('select[name="status"]').value = '';
  
  userLocation.state = '';
  userLocation.city = '';
  
  // Redirect to home page without any filters
  window.location.href = '/';
}
