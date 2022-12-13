function showIcon(){
    const input = document.querySelector(".form_inputfield").value;
    const clearIcon = document.querySelector(".clear-icon");

    if (input.length <= 0) clearIcon.classList.remove("active");
    else clearIcon.classList.add("active");

    clearIcon.addEventListener("click", () => {
        document.querySelector(".form_inputfield").value = "";
        clearIcon.classList.remove("active");
    });

}


function showNavCollapsedIcon(){
    const input = document.querySelector(".form_inputfield").value;
    const clearIcon = document.querySelector(".clear-icon");

    if (input.length <= 0) clearIcon.classList.remove("active-nav-collapse");
    else clearIcon.classList.add("active-nav-collapse");

    clearIcon.addEventListener("click", () => {
        document.querySelector(".form_inputfield").value = "";
        clearIcon.classList.remove("active-nav-collapse");
    });
}
