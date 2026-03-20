document.addEventListener("DOMContentLoaded", () => {
    const botonSubir = document.getElementById("btn-subir-nuevo-video");
    const inputVideo = document.getElementById("input-video");
    const formulario = document.getElementById("form-subir-video");
    const feedback = document.getElementById("subida-feedback");

    if (!botonSubir || !inputVideo || !formulario || !feedback) {
        return;
    }

    botonSubir.addEventListener("click", () => {
        inputVideo.click();
    });

    inputVideo.addEventListener("change", async () => {
        if (!inputVideo.files || inputVideo.files.length === 0) {
            return;
        }

        const archivoVideo = inputVideo.files[0];

        feedback.classList.add("d-none");
        feedback.classList.remove("alert-danger", "alert-success");

        const formData = new FormData(formulario);

        try {
            botonSubir.disabled = true;
            botonSubir.textContent = "Subiendo...";

            const duracionSegundos = await obtenerDuracionSegundos(archivoVideo);
            formData.set("duracion_segundos", String(duracionSegundos));

            const response = await fetch("/usuario/api/cargar-video", {
                method: "POST",
                body: formData
            });

            const resultado = await response.json();

            if (!response.ok || !resultado.ok) {
                throw new Error(resultado.error || "No se pudo subir el video");
            }

            feedback.textContent = resultado.mensaje || "Video subido correctamente";
            feedback.classList.remove("d-none");
            feedback.classList.add("alert-success");

            setTimeout(() => {
                window.location.reload();
            }, 1200);
        } catch (error) {
            feedback.textContent = error.message || "Error interno al subir el video";
            feedback.classList.remove("d-none");
            feedback.classList.add("alert-danger");
        } finally {
            botonSubir.disabled = false;
            botonSubir.textContent = "Subir nuevo video";
            inputVideo.value = "";
        }
    });
});

function obtenerDuracionSegundos(archivoVideo) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        const objectUrl = URL.createObjectURL(archivoVideo);

        video.preload = "metadata";
        video.src = objectUrl;

        video.onloadedmetadata = () => {
            const duracion = Math.max(0, Math.round(video.duration || 0));
            URL.revokeObjectURL(objectUrl);
            resolve(duracion);
        };

        video.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("No se pudo leer la duración del video"));
        };
    });
}
