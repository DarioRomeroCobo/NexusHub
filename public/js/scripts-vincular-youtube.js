document.addEventListener("DOMContentLoaded", () => {
    const mensajeError = document.getElementById("mensajeError");

    if (!mensajeError) return; // Si no existe el div en este HTML, no hace nada

    // 1. Analizamos la URL del navegador actual
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");

    // 2. Si la URL tiene ?error=... mostramos el mensaje de error
    if (error) {
        mensajeError.classList.remove("d-none");

        // Limpiamos la URL visualmente para que no se quede el ?error=... en la barra de direcciones
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});