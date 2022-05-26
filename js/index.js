let user = document.querySelector(".__drop");
let link = document.querySelector(".link");
let modal = document.querySelector(".wrap");
let dashboard = document.querySelector("body");
let close = document.querySelector(".__close");
let dropdownMenu = document.querySelector(".nav__dropdown-menu");

user.addEventListener("click", () => {
  user.nextElementSibling.classList.toggle("active");
  let labelIcon = user.lastElementChild;
  let icons = labelIcon.lastElementChild;
  icons.classList.toggle("rotate");
});

modal.style.display = "none";
link.addEventListener("click", () => {
  modal.style.display = "flex";
  modal.classList.add("fade-in");
  user.nextElementSibling.classList.toggle("active");
  let labelIcon = user.lastElementChild;
  let icons = labelIcon.lastElementChild;
  icons.classList.toggle("rotate");
  dashboard.style.overflow = "hidden";
});

close.addEventListener("click", () => {
  modal.style.display = "none";
  modal.classList.remove("fade-in");
  dashboard.style.overflow = "auto";
});

// listen for outside click
window.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.style.display = "none";
    dashboard.style.overflow = "auto";
  }
});

// window.addEventListener("click", (e) => {
//   if (e.target !== user) {
//     user.nextElementSibling.classList.remove("active");
//   }
// });

let copyButton = document.getElementById("button");
let inputValue = document.getElementById("input-value");

copyButton.addEventListener("click", function () {
  copyButton.innerHTML = "Copied";
  inputValue.select();
  inputValue.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(inputValue.value);
});
