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

// Initialize location - set Karnataka as default
async function initializeLocation() {
  const stateSelect = document.getElementById('stateSelect');
  const citySelect = document.getElementById('citySelect');
  
  // Check if there's already a selected state from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const selectedState = urlParams.get('state');
  const selectedCity = urlParams.get('city');
  
  if (selectedState) {
    userLocation.state = selectedState;
  } else {
    // Set Karnataka as default state
    userLocation.state = 'Karnataka';
    
    // Set the state in the dropdown
    if (stateSelect) {
      Array.from(stateSelect.options).forEach((option) => {
        if (option.text === 'Karnataka') {
          option.selected = true;
        }
      });
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

// Location functions removed - using Karnataka as default

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
