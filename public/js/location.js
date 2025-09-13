window.addEventListener("DOMContentLoaded", () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
      );
      const data = await res.json();
      const state = data.address.state || data.address.region;
      const stateSelect = document.querySelector("select[name='state']");
      if (stateSelect) {
        Array.from(stateSelect.options).forEach((option) => {
          if (option.text === state) option.selected = true;
        });
      }
    });
  }
});
