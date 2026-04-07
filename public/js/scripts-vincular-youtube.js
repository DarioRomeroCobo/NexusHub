document.addEventListener("DOMContentLoaded", () => {
    const feedback = document.getElementById("vincular-youtube-feedback");

    if (!feedback) return; // Si no existe el div en este HTML, no hace nada

    // 1. Analizamos la URL del navegador actual
    const urlParams = new URLSearchParams(window.location.search);
    const mensajeError = urlParams.get("error");

    // 2. Si la URL tiene ?error=... lo mostramos en pantalla
    if (mensajeError) {
        feedback.textContent = decodeURIComponent(mensajeError);
        feedback.classList.remove("d-none");
        feedback.classList.add("alert-danger");

        // (Opcional) Limpiamos la URL visualmente para que no se quede el ?error=... feo ahí arriba
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});