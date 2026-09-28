setTimeout(() => {
  const status = document.getElementById("boot-status");
  if (status) {
    status.textContent = "The app could not finish loading. Check your connection, enable JavaScript and allow this site's storage, then reload. No saved workspace has been reset.";
    status.setAttribute("role", "alert");
  }
}, 15000);
